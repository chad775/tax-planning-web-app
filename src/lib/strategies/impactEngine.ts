// /src/lib/strategies/impactEngine.ts

import type {
  BaselineTaxTotals,
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
 * Levels are informational; application is strictly sequential in this flattened order.
 *
 * Update (per user):
 * - Move CASH_BALANCE_PLAN to Level 3
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
 * Income gates (using baseline.taxableIncome as the deterministic proxy).
 * If gate is not satisfied, the impact is returned but not applied.
 */
const INCOME_GATES: Readonly<Record<StrategyId, { minTaxableIncome: number }>> = {
  RTU_PROGRAM: { minTaxableIncome: 350_000 },
  LEVERAGED_CHARITABLE: { minTaxableIncome: 833_000 },
  FILM_CREDIT: { minTaxableIncome: 500_000 },
} as const;

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

/**
 * Apply a BASE tax-liability delta to federal/state/total in a deterministic way:
 * - reduce total tax by delta (delta is negative for a reduction)
 * - allocate reduction proportionally across federal/state shares
 */
function applyBaseTaxLiabilityDelta(totals: BaselineTaxTotals, baseDelta: number): BaselineTaxTotals {
  const totalBefore = Math.max(0, totals.totalTax);
  const federalBefore = Math.max(0, totals.federalTax);
  const stateBefore = Math.max(0, totals.stateTax);

  // Clamp baseDelta so total cannot go below 0 (delta expected <= 0).
  const cappedDelta = Math.min(0, Math.max(baseDelta, -totalBefore));
  const totalAfter = totalBefore + cappedDelta;

  if (totalBefore <= 0) {
    return { ...totals, federalTax: 0, stateTax: 0, totalTax: 0 };
  }

  const federalShare = federalBefore / totalBefore;
  const stateShare = stateBefore / totalBefore;

  const federalAfter = Math.max(0, federalBefore + cappedDelta * federalShare);
  const stateAfter = Math.max(0, stateBefore + cappedDelta * stateShare);

  // Recompute total as sum to avoid tiny floating drift.
  const totalRecomputed = Math.max(0, federalAfter + stateAfter);

  return {
    ...totals,
    federalTax: federalAfter,
    stateTax: stateAfter,
    totalTax: totalRecomputed,
  };
}

function applyBaseTaxableIncomeDelta(totals: BaselineTaxTotals, baseDelta: number): BaselineTaxTotals {
  const taxableBefore = Math.max(0, totals.taxableIncome);
  // Clamp baseDelta so taxable income cannot go below 0 (delta expected <= 0).
  const cappedDelta = Math.min(0, Math.max(baseDelta, -taxableBefore));
  const taxableAfter = taxableBefore + cappedDelta;
  return { ...totals, taxableIncome: taxableAfter };
}

/**
 * Ensures a deterministic, total ordering:
 * - first: known IMPACT_ORDER
 * - then: any remaining strategies sorted lexicographically
 */
function buildOrderedStrategyIds(allStrategyIds: ReadonlyArray<StrategyId>): ReadonlyArray<StrategyId> {
  const set = new Set(allStrategyIds);
  const ordered: StrategyId[] = [];

  for (const id of IMPACT_ORDER) {
    if (set.has(id)) ordered.push(id);
    set.delete(id);
  }

  const rest = Array.from(set).sort((a, b) => a.localeCompare(b));
  return ordered.concat(rest);
}

/**
 * Sorting helper for display:
 * Level 3 strategies only, in ascending order of estimated impact.
 *
 * Deterministic scoring rule:
 * - Prefer |taxLiabilityDelta.base| if present (true tax impact),
 * - else use |taxableIncomeDelta.base| as a proxy.
 *
 * This does NOT affect application order. It's purely for consumer display.
 */
export function sortLevel3ForDisplay(
  impacts: ReadonlyArray<StrategyImpactEstimate>,
): StrategyImpactEstimate[] {
  const level3 = new Set<StrategyId>(
    (IMPACT_LEVELS.find((l) => l.level === 3)?.strategies ?? []) as ReadonlyArray<StrategyId>,
  );

  const score = (i: StrategyImpactEstimate): number => {
    const tax = i.taxLiabilityDelta?.base ?? 0;
    const ti = i.taxableIncomeDelta?.base ?? 0;
    const chosen = tax !== 0 ? tax : ti;
    return Math.abs(chosen);
  };

  return impacts
    .filter((i) => level3.has(i.strategyId))
    .slice()
    .sort((a, b) => score(a) - score(b));
}

/**
 * Main deterministic impact engine (Thread 4).
 */
export function runImpactEngine(input: ImpactEngineInput): ImpactEngineOutput {
  const { intake, baseline, strategyEvaluations, applyPotential } = input;

  // Build per-strategy estimates (returned regardless of whether applied).
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

  // Determine application order over the evaluated strategies.
  const orderedStrategyIds = buildOrderedStrategyIds(strategyEvaluations.map((e) => e.strategyId));

  // Running totals (BASE scenario only for revised totals).
  let revised: BaselineTaxTotals = {
    federalTax: Math.max(0, baseline.federalTax),
    stateTax: Math.max(0, baseline.stateTax),
    totalTax: Math.max(0, baseline.totalTax),
    taxableIncome: Math.max(0, baseline.taxableIncome),
  };

  // Aggregate deltas (low/base/high) across APPLIED strategies.
  let totalTaxableIncomeDelta: Range3 = makeZeroRange();
  let totalTaxDelta: Range3 = makeZeroRange();

  // Track applied flags directly on returned estimates.
  for (const strategyId of orderedStrategyIds) {
    const impact = impactsById.get(strategyId);
    if (!impact) continue;

    const flags = new Set(impact.flags ?? []);

    const canApplyByStatus = isEligibleToApplyImpact(impact.status, applyPotential);
    if (!canApplyByStatus) {
      flags.add(impact.status === "POTENTIAL" ? "NOT_APPLIED_POTENTIAL" : "NOT_APPLIED_NOT_ELIGIBLE");
      impactsById.set(strategyId, {
        ...impact,
        flags: Array.from(flags) as StrategyImpactEstimate["flags"],
      });
      continue;
    }

    const gateOk = incomeGateSatisfied(strategyId, baseline.taxableIncome);
    if (!gateOk) {
      // Deterministic: return estimate but do not apply.
      flags.add("NOT_APPLIED_POTENTIAL"); // existing bucket; finer-grained reason is in assumptions
      impactsById.set(strategyId, {
        ...impact,
        needsConfirmation: true,
        assumptions: [
          ...impact.assumptions,
          {
            id: "INCOME_GATE_NOT_MET",
            category: "CAP",
            value: INCOME_GATES[strategyId]?.minTaxableIncome,
          },
        ],
        flags: Array.from(flags) as StrategyImpactEstimate["flags"],
      });
      continue;
    }

    // Apply taxable-income delta range sequentially, clamped to *current* revised taxable income.
    if (impact.taxableIncomeDelta) {
      const clamped = clampTaxableIncomeDeltaToBaseline(revised.taxableIncome, impact.taxableIncomeDelta);
      totalTaxableIncomeDelta = addRange(totalTaxableIncomeDelta, clamped);

      // Apply BASE scenario to revised totals
      revised = applyBaseTaxableIncomeDelta(revised, clamped.base);

      if (
        clamped.low !== impact.taxableIncomeDelta.low ||
        clamped.base !== impact.taxableIncomeDelta.base ||
        clamped.high !== impact.taxableIncomeDelta.high
      ) {
        flags.add("CAPPED_BY_TAXABLE_INCOME");
      }

      // Persist clamped estimate (so output reflects sequential clamping reality)
      impactsById.set(strategyId, {
        ...impact,
        taxableIncomeDelta: clamped,
        flags: Array.from(flags) as StrategyImpactEstimate["flags"],
      });
    }

    // Apply tax-liability delta range sequentially, clamped to *current* revised total tax.
    const impactAfterIncome = impactsById.get(strategyId) ?? impact;
    if (impactAfterIncome.taxLiabilityDelta) {
      const clamped = clampTaxLiabilityDeltaToBaseline(revised.totalTax, impactAfterIncome.taxLiabilityDelta);
      totalTaxDelta = addRange(totalTaxDelta, clamped);

      revised = applyBaseTaxLiabilityDelta(revised, clamped.base);

      if (
        clamped.low !== impactAfterIncome.taxLiabilityDelta.low ||
        clamped.base !== impactAfterIncome.taxLiabilityDelta.base ||
        clamped.high !== impactAfterIncome.taxLiabilityDelta.high
      ) {
        flags.add("CAPPED_BY_TAX_LIABILITY");
      }

      impactsById.set(strategyId, {
        ...impactAfterIncome,
        taxLiabilityDelta: clamped,
        flags: Array.from(flags) as StrategyImpactEstimate["flags"],
      });
    }

    // Mark applied.
    const finalImpact = impactsById.get(strategyId);
    if (finalImpact) {
      const finalFlags = new Set(finalImpact.flags ?? []);
      finalFlags.add("APPLIED");
      impactsById.set(strategyId, {
        ...finalImpact,
        flags: Array.from(finalFlags) as StrategyImpactEstimate["flags"],
      });
    }
  }

  // Return impacts in original evaluator order (deterministic and stable for UI).
  const impacts: StrategyImpactEstimate[] = strategyEvaluations
    .map((e) => impactsById.get(e.strategyId))
    .filter((x): x is StrategyImpactEstimate => Boolean(x));

  const revisedTotals: RevisedTaxTotals = {
    baseline,
    revised: {
      federalTax: Math.max(0, revised.federalTax),
      stateTax: Math.max(0, revised.stateTax),
      totalTax: Math.max(0, revised.totalTax),
      taxableIncome: Math.max(0, revised.taxableIncome),
    },
    totalTaxDelta,
    totalTaxableIncomeDelta,
  };

  const output: ImpactEngineOutput = {
    impacts,
    revisedTotals,
  };

  return output;
}
