// src/lib/strategies/impactEngine.ts

import type {
  BaselineTaxTotals,
  ImpactAssumption,
  ImpactEngineInput,
  ImpactEngineOutput,
  Range3,
  RevisedTaxTotals,
  StrategyId,
  StrategyImpactEstimate,
} from "./impactTypes";
import {
  buildImpactEstimateForStrategy,
  clampTaxLiabilityDeltaToBaseline,
  clampTaxableIncomeDeltaToBaseline,
} from "./impactModels";
import { STRATEGY_CATALOG } from "./strategyCatalog";

type ImpactFlag = NonNullable<StrategyImpactEstimate["flags"]>[number];

function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
}

function makeZeroRange(): Range3 {
  return { low: 0, base: 0, high: 0 };
}
function addRange(a: Range3, b: Range3): Range3 {
  return { low: a.low + b.low, base: a.base + b.base, high: a.high + b.high };
}

function withFlags(
  impact: StrategyImpactEstimate,
  flags: ReadonlyArray<ImpactFlag>,
): StrategyImpactEstimate {
  return {
    ...impact,
    flags: flags as NonNullable<StrategyImpactEstimate["flags"]>,
  };
}

function isEligibleToApplyImpact(
  status: StrategyImpactEstimate["status"],
  applyPotential: boolean,
): boolean {
  if (status === "ELIGIBLE") return true;
  if (status === "POTENTIAL") return applyPotential;
  return false;
}

function incomeGateSatisfied(strategyId: StrategyId, baselineTaxableIncome: number): boolean {
  const meta = STRATEGY_CATALOG[strategyId];
  const min = meta?.minBaselineTaxableIncome;
  if (!min) return true;
  return baselineTaxableIncome >= min;
}

function applyBaseTaxLiabilityDelta(totals: BaselineTaxTotals, baseDelta: number): BaselineTaxTotals {
  const totalBefore = Math.max(0, totals.totalTax);
  const federalBefore = Math.max(0, totals.federalTax);
  const stateBefore = Math.max(0, totals.stateTax);

  const cappedDelta = Math.min(0, Math.max(baseDelta, -totalBefore));

  if (totalBefore <= 0) {
    return { ...totals, federalTax: 0, stateTax: 0, totalTax: 0 };
  }

  const federalShare = totalBefore > 0 ? federalBefore / totalBefore : 0;
  const stateShare = totalBefore > 0 ? stateBefore / totalBefore : 0;

  const federalAfter = Math.max(0, federalBefore + cappedDelta * federalShare);
  const stateAfter = Math.max(0, stateBefore + cappedDelta * stateShare);

  return {
    ...totals,
    federalTax: federalAfter,
    stateTax: stateAfter,
    totalTax: Math.max(0, federalAfter + stateAfter),
  };
}

function applyBaseTaxableIncomeDelta(totals: BaselineTaxTotals, baseDelta: number): BaselineTaxTotals {
  const taxableBefore = Math.max(0, totals.taxableIncome);
  const cappedDelta = Math.min(0, Math.max(baseDelta, -taxableBefore));
  return { ...totals, taxableIncome: taxableBefore + cappedDelta };
}

function sortByDisplayOrder(ids: StrategyId[]): StrategyId[] {
  return ids.sort((a, b) => {
    const da = STRATEGY_CATALOG[a]?.displayOrder ?? 9999;
    const db = STRATEGY_CATALOG[b]?.displayOrder ?? 9999;
    return da - db || a.localeCompare(b);
  });
}

function applyStrategies(params: {
  intake: ImpactEngineInput["intake"];
  baseline: BaselineTaxTotals;
  strategyEvaluations: ImpactEngineInput["strategyEvaluations"];
  applyPotential: boolean;
  strategyIdsToApply: ReadonlyArray<StrategyId>;
}): { impacts: StrategyImpactEstimate[]; revisedTotals: RevisedTaxTotals } {
  const { intake, baseline, strategyEvaluations, applyPotential, strategyIdsToApply } = params;

  const impactsUnordered: StrategyImpactEstimate[] = strategyEvaluations.map((ev) =>
    buildImpactEstimateForStrategy({
      strategyId: ev.strategyId,
      status: ev.status,
      intake,
      baseline,
    }),
  );

  const impactsById = new Map<StrategyId, StrategyImpactEstimate>(
    impactsUnordered.map((i) => [i.strategyId, i]),
  );

  let revised: BaselineTaxTotals = {
    federalTax: Math.max(0, baseline.federalTax),
    stateTax: Math.max(0, baseline.stateTax),
    totalTax: Math.max(0, baseline.totalTax),
    taxableIncome: Math.max(0, baseline.taxableIncome),
  };

  let totalTaxableIncomeDelta: Range3 = makeZeroRange();
  let totalTaxDelta: Range3 = makeZeroRange();

  const applySet = new Set(strategyIdsToApply);

  for (const ev of strategyEvaluations) {
    const strategyId = ev.strategyId;
    const impact = impactsById.get(strategyId);
    if (!impact) continue;

    const flags = new Set<ImpactFlag>((impact.flags ?? []) as ReadonlyArray<ImpactFlag>);

    // If it's not in the apply set, mark as not applied (but keep eligibility in the payload)
    if (!applySet.has(strategyId)) {
      flags.add("NOT_APPLIED_POTENTIAL");
      impactsById.set(strategyId, withFlags(impact, Array.from(flags)));
      continue;
    }

    if (!isEligibleToApplyImpact(impact.status, applyPotential)) {
      flags.add(impact.status === "POTENTIAL" ? "NOT_APPLIED_POTENTIAL" : "NOT_APPLIED_NOT_ELIGIBLE");
      impactsById.set(strategyId, withFlags(impact, Array.from(flags)));
      continue;
    }

    if (!incomeGateSatisfied(strategyId, baseline.taxableIncome)) {
      flags.add("NOT_APPLIED_POTENTIAL");

      const meta = STRATEGY_CATALOG[strategyId];
      let assumptions: ReadonlyArray<ImpactAssumption> = impact.assumptions;

      if (meta?.minBaselineTaxableIncome) {
        assumptions = [
          ...assumptions,
          {
            id: "INCOME_GATE_NOT_MET",
            category: "CAP",
            value: meta.minBaselineTaxableIncome,
          },
        ];
      }

      impactsById.set(
        strategyId,
        withFlags({ ...impact, needsConfirmation: true, assumptions }, Array.from(flags)),
      );
      continue;
    }

    // taxable income deltas
    if (impact.taxableIncomeDelta) {
      const clamped = clampTaxableIncomeDeltaToBaseline(revised.taxableIncome, impact.taxableIncomeDelta);

      totalTaxableIncomeDelta = addRange(totalTaxableIncomeDelta, clamped);
      revised = applyBaseTaxableIncomeDelta(revised, clamped.base);

      if (
        clamped.low !== impact.taxableIncomeDelta.low ||
        clamped.base !== impact.taxableIncomeDelta.base ||
        clamped.high !== impact.taxableIncomeDelta.high
      ) {
        flags.add("CAPPED_BY_TAXABLE_INCOME");
      }

      impactsById.set(strategyId, withFlags({ ...impact, taxableIncomeDelta: clamped }, Array.from(flags)));
    }

    const afterIncome = impactsById.get(strategyId)!;

    // tax liability deltas
    if (afterIncome.taxLiabilityDelta) {
      const clamped = clampTaxLiabilityDeltaToBaseline(revised.totalTax, afterIncome.taxLiabilityDelta);

      totalTaxDelta = addRange(totalTaxDelta, clamped);
      revised = applyBaseTaxLiabilityDelta(revised, clamped.base);

      if (
        clamped.low !== afterIncome.taxLiabilityDelta.low ||
        clamped.base !== afterIncome.taxLiabilityDelta.base ||
        clamped.high !== afterIncome.taxLiabilityDelta.high
      ) {
        flags.add("CAPPED_BY_TAX_LIABILITY");
      }

      impactsById.set(strategyId, withFlags({ ...afterIncome, taxLiabilityDelta: clamped }, Array.from(flags)));
    }

    const finalImpact = impactsById.get(strategyId)!;
    const finalFlags = new Set<ImpactFlag>((finalImpact.flags ?? []) as ReadonlyArray<ImpactFlag>);
    finalFlags.add("APPLIED");
    impactsById.set(strategyId, withFlags(finalImpact, Array.from(finalFlags)));
  }

  const impacts = strategyEvaluations
    .map((e) => impactsById.get(e.strategyId))
    .filter((x): x is StrategyImpactEstimate => Boolean(x));

  return {
    impacts,
    revisedTotals: {
      baseline,
      revised,
      totalTaxDelta,
      totalTaxableIncomeDelta,
    },
  };
}

/**
 * NEW: bucket-aware impact engine
 * - Core = Tier 1 + Tier 2 (if eligible+gate)
 * - What-if = each Tier 3 solo on top of core
 */
export function runImpactEngine(input: ImpactEngineInput): ImpactEngineOutput & {
  core: { impacts: StrategyImpactEstimate[]; revisedTotals: RevisedTaxTotals; appliedStrategyIds: StrategyId[] };
  whatIf: Record<
    StrategyId,
    { impacts: StrategyImpactEstimate[]; revisedTotals: RevisedTaxTotals; deltaFromCore: Range3 }
  >;
} {
  const { intake, baseline, strategyEvaluations, applyPotential } = input;

  const allIds = strategyEvaluations.map((e) => e.strategyId);

  const tier1 = allIds.filter((id) => STRATEGY_CATALOG[id]?.tier === 1);
  const tier2 = allIds.filter((id) => STRATEGY_CATALOG[id]?.tier === 2);
  const tier3 = allIds.filter((id) => STRATEGY_CATALOG[id]?.tier === 3);

  // Core apply set = tier1 + tier2 (auto-apply candidates)
  const coreApply = sortByDisplayOrder(
    [...tier1, ...tier2].filter((id) => STRATEGY_CATALOG[id]?.autoApplyWhenEligible),
  );

  const core = applyStrategies({
    intake,
    baseline,
    strategyEvaluations,
    applyPotential,
    strategyIdsToApply: coreApply,
  });

  // What-if: each tier3 strategy solo on top of core
  const whatIf: Record<
    StrategyId,
    { impacts: StrategyImpactEstimate[]; revisedTotals: RevisedTaxTotals; deltaFromCore: Range3 }
  > = {} as any;

  for (const id of sortByDisplayOrder([...tier3])) {
    // apply = core + this one
    const soloRun = applyStrategies({
      intake,
      baseline,
      strategyEvaluations,
      applyPotential,
      strategyIdsToApply: [...coreApply, id],
    });

    const deltaFromCore: Range3 = {
      low: core.revisedTotals.totalTaxDelta.low - soloRun.revisedTotals.totalTaxDelta.low,
      base: core.revisedTotals.totalTaxDelta.base - soloRun.revisedTotals.totalTaxDelta.base,
      high: core.revisedTotals.totalTaxDelta.high - soloRun.revisedTotals.totalTaxDelta.high,
    };

    whatIf[id] = {
      impacts: soloRun.impacts,
      revisedTotals: soloRun.revisedTotals,
      deltaFromCore,
    };
  }

  // Back-compat: keep original fields
  // For "impacts" return the core impacts (what the UI currently expects)
  // For revisedTotals return the core revised totals (your "after strategies" number)
  return {
    impacts: core.impacts,
    revisedTotals: core.revisedTotals,
    core: {
      impacts: core.impacts,
      revisedTotals: core.revisedTotals,
      appliedStrategyIds: coreApply,
    },
    whatIf,
  };
}
