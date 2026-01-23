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

/**
 * Impact application order (deterministic).
 */
export const IMPACT_LEVELS = [
  {
    level: 1,
    description: "Easy tax-free cashflow from business",
    strategies: ["AUGUSTA", "HIRING_CHILDREN", "MEDICAL_REIMBURSEMENT"] as const,
  },
  {
    level: 2,
    description: "Familiar capacity-based strategies",
    strategies: ["401K", "SHORT_TERM_RENTAL"] as const,
  },
  {
    level: 3,
    description: "High-end complex strategies",
    strategies: ["CASH_BALANCE_PLAN", "RTU_PROGRAM", "LEVERAGED_CHARITABLE", "FILM_CREDIT"] as const,
  },
] as const;

export const IMPACT_ORDER: ReadonlyArray<StrategyId> = IMPACT_LEVELS.flatMap((l) =>
  Array.from(l.strategies),
);

/**
 * Income gates (baseline.taxableIncome proxy).
 */
const INCOME_GATES: Readonly<Record<StrategyId, { minTaxableIncome: number }>> = {
  RTU_PROGRAM: { minTaxableIncome: 350_000 },
  LEVERAGED_CHARITABLE: { minTaxableIncome: 833_000 },
  FILM_CREDIT: { minTaxableIncome: 500_000 },
} as const;

type ImpactFlag = NonNullable<StrategyImpactEstimate["flags"]>[number];

/**
 * Ensure flags are always present (required under exactOptionalPropertyTypes)
 */
function withFlags(
  impact: StrategyImpactEstimate,
  flags: ReadonlyArray<ImpactFlag>,
): StrategyImpactEstimate {
  return {
    ...impact,
    flags: flags as NonNullable<StrategyImpactEstimate["flags"]>,
  };
}

function makeZeroRange(): Range3 {
  return { low: 0, base: 0, high: 0 };
}

function addRange(a: Range3, b: Range3): Range3 {
  return { low: a.low + b.low, base: a.base + b.base, high: a.high + b.high };
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
  const gate = INCOME_GATES[strategyId];
  if (!gate) return true;
  return baselineTaxableIncome >= gate.minTaxableIncome;
}

function applyBaseTaxLiabilityDelta(totals: BaselineTaxTotals, baseDelta: number): BaselineTaxTotals {
  const totalBefore = Math.max(0, totals.totalTax);
  const federalBefore = Math.max(0, totals.federalTax);
  const stateBefore = Math.max(0, totals.stateTax);

  const cappedDelta = Math.min(0, Math.max(baseDelta, -totalBefore));

  if (totalBefore <= 0) {
    return { ...totals, federalTax: 0, stateTax: 0, totalTax: 0 };
  }

  const federalShare = federalBefore / totalBefore;
  const stateShare = stateBefore / totalBefore;

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

function buildOrderedStrategyIds(allStrategyIds: ReadonlyArray<StrategyId>): ReadonlyArray<StrategyId> {
  const set = new Set(allStrategyIds);
  const ordered: StrategyId[] = [];

  for (const id of IMPACT_ORDER) {
    if (set.has(id)) ordered.push(id);
    set.delete(id);
  }

  return ordered.concat(Array.from(set).sort((a, b) => a.localeCompare(b)));
}

/**
 * Main deterministic impact engine
 */
export function runImpactEngine(input: ImpactEngineInput): ImpactEngineOutput {
  const { intake, baseline, strategyEvaluations, applyPotential } = input;

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

  const orderedStrategyIds = buildOrderedStrategyIds(strategyEvaluations.map((e) => e.strategyId));

  let revised: BaselineTaxTotals = {
    federalTax: Math.max(0, baseline.federalTax),
    stateTax: Math.max(0, baseline.stateTax),
    totalTax: Math.max(0, baseline.totalTax),
    taxableIncome: Math.max(0, baseline.taxableIncome),
  };

  let totalTaxableIncomeDelta: Range3 = makeZeroRange();
  let totalTaxDelta: Range3 = makeZeroRange();

  for (const strategyId of orderedStrategyIds) {
    const impact = impactsById.get(strategyId);
    if (!impact) continue;

    const flags = new Set<ImpactFlag>((impact.flags ?? []) as ReadonlyArray<ImpactFlag>);

    if (!isEligibleToApplyImpact(impact.status, applyPotential)) {
      flags.add(impact.status === "POTENTIAL" ? "NOT_APPLIED_POTENTIAL" : "NOT_APPLIED_NOT_ELIGIBLE");
      impactsById.set(strategyId, withFlags(impact, Array.from(flags)));
      continue;
    }

    if (!incomeGateSatisfied(strategyId, baseline.taxableIncome)) {
      flags.add("NOT_APPLIED_POTENTIAL");

      // Build assumptions deterministically and with correct literal typing.
      const gate = INCOME_GATES[strategyId];
      let assumptions: ReadonlyArray<ImpactAssumption> = impact.assumptions;

      if (gate) {
        const incomeGateAssumption: ImpactAssumption = {
          id: "INCOME_GATE_NOT_MET",
          category: "CAP",
          value: gate.minTaxableIncome,
        };
        assumptions = [...impact.assumptions, incomeGateAssumption];
      }

      impactsById.set(
        strategyId,
        withFlags(
          {
            ...impact,
            needsConfirmation: true,
            assumptions,
          },
          Array.from(flags),
        ),
      );
      continue;
    }

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

      impactsById.set(
        strategyId,
        withFlags(
          {
            ...impact,
            taxableIncomeDelta: clamped,
          },
          Array.from(flags),
        ),
      );
    }

    const afterIncome = impactsById.get(strategyId)!;

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

      impactsById.set(
        strategyId,
        withFlags(
          {
            ...afterIncome,
            taxLiabilityDelta: clamped,
          },
          Array.from(flags),
        ),
      );
    }

    const finalImpact = impactsById.get(strategyId)!;
    const finalFlags = new Set<ImpactFlag>((finalImpact.flags ?? []) as ReadonlyArray<ImpactFlag>);
    finalFlags.add("APPLIED");
    impactsById.set(strategyId, withFlags(finalImpact, Array.from(finalFlags)));
  }

  const impacts = strategyEvaluations
    .map((e) => impactsById.get(e.strategyId))
    .filter((x): x is StrategyImpactEstimate => Boolean(x));

  const revisedTotals: RevisedTaxTotals = {
    baseline,
    revised,
    totalTaxDelta,
    totalTaxableIncomeDelta,
  };

  return { impacts, revisedTotals };
}
