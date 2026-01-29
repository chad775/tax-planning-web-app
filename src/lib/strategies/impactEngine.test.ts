// src/lib/strategies/impactEngine.test.ts
//
// Simple deterministic test harness (no test framework required).
// Run with: `ts-node` (or your Next.js/TS runner) as appropriate.
// This file throws on failures to make CI-friendly checks possible.

import { runImpactEngine } from "./impactEngine";
import type {
  ImpactEngineInput,
  NormalizedIntake2025,
  StrategyEvaluationResult,
} from "./impactTypes";
import type { StrategyId } from "@/contracts/strategyIds";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function approxEqual(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) <= tolerance;
}

function buildBaseIntake(args: {
  taxableState?: NormalizedIntake2025["personal"]["state"];
  filingStatus?: NormalizedIntake2025["personal"]["filing_status"];
  kids?: number;
  hasBiz?: boolean;
  k401ytd?: number;
  strategiesInUse?: StrategyId[];
}): NormalizedIntake2025 {
  return {
    personal: {
      filing_status: args.filingStatus ?? "MARRIED_FILING_JOINTLY",
      children_0_17: args.kids ?? 2,
      income_excl_business: 0,
      state: args.taxableState ?? "CO",
    },
    business: {
      has_business: args.hasBiz ?? true,
      entity_type: "S_CORP",
      employees_count: 2,
      net_profit: 0,
    },
    retirement: {
      k401_employee_contrib_ytd: args.k401ytd ?? 0,
    },
    strategies_in_use: (args.strategiesInUse ?? []) as StrategyId[],
  };
}

function buildEvaluations(
  statusById: Record<string, "ELIGIBLE" | "POTENTIAL" | "NOT_ELIGIBLE">,
): StrategyEvaluationResult[] {
  return Object.entries(statusById).map(([strategyId, status]) => {
    const missingFields = status === "POTENTIAL" ? (["(placeholder)"] as const) : undefined;

    // exactOptionalPropertyTypes: do NOT set missingFields: undefined.
    const base: StrategyEvaluationResult = {
      strategyId: strategyId as StrategyId,
      status,
      reasons: [],
      ...(missingFields ? { missingFields: missingFields as unknown as readonly string[] } : {}),
    };

    return base;
  });
}

/**
 * Utility: sum applied taxable income deltas BASE only (for debugging/validation).
 */
function sumAppliedTaxableIncomeBase(impacts: ReturnType<typeof runImpactEngine>["impacts"]): number {
  return impacts
    .filter((i) => (i.flags ?? []).includes("APPLIED"))
    .map((i) => i.taxableIncomeDelta?.base ?? 0)
    .reduce((a, b) => a + b, 0);
}

function runScenario(name: string, input: ImpactEngineInput): void {
  // eslint-disable-next-line no-console
  console.log(`\n=== Scenario: ${name} ===`);
  const out = runImpactEngine(input);

  // eslint-disable-next-line no-console
  console.log("Baseline taxable income:", out.revisedTotals.baseline.taxableIncome);
  // eslint-disable-next-line no-console
  console.log("Revised taxable income:", out.revisedTotals.revised.taxableIncome);
  // eslint-disable-next-line no-console
  console.log("Applied taxable delta (base):", sumAppliedTaxableIncomeBase(out.impacts));

  // Guardrails (hard requirements)
  assert(out.revisedTotals.revised.taxableIncome >= 0, "Revised taxableIncome must be >= 0");
  assert(out.revisedTotals.revised.totalTax >= 0, "Revised totalTax must be >= 0");
}

function main(): void {
  /**
   * Note: This harness focuses on:
   * - ordering + sequential clamping (taxable income can't go below 0)
   * - income gates for RTU / Leveraged / Film
   * - applyPotential behavior
   *
   * We do NOT assert exact tax deltas because v1 models are mostly taxable-income deltas.
   */

  const ALL_STRATEGIES = [
    "augusta_loophole",
    "hiring_children",
    "medical_reimbursement",
    "k401",
    "cash_balance_plan",
    "short_term_rental",
    "rtu_program",
    "leveraged_charitable",
    "film_credits",
  ] as const;

  // ------------------------------
  // Scenario 1: $250k taxable income
  // - Should NOT apply RTU/Leveraged/Film due to income gates.
  // ------------------------------
  {
    const intake = buildBaseIntake({ kids: 2, hasBiz: true, k401ytd: 0 });
    const evaluations = buildEvaluations(
      Object.fromEntries(ALL_STRATEGIES.map((id) => [id, "ELIGIBLE"])) as Record<string, "ELIGIBLE">,
    );

    const out = runImpactEngine({
      intake,
      baseline: {
        taxableIncome: 250_000,
        federalTax: 60_000,
        stateTax: 15_000,
        totalTax: 75_000,
      },
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    runScenario("250k taxable income (income gates block Level 3)", {
      intake,
      baseline: out.revisedTotals.baseline,
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    const byId = new Map(out.impacts.map((i) => [i.strategyId, i]));

    assert((byId.get("rtu_program")?.flags ?? []).includes("APPLIED") === false, "RTU must not be applied below 350k");
    assert(
      (byId.get("leveraged_charitable")?.flags ?? []).includes("APPLIED") === false,
      "Leveraged must not be applied below 833k",
    );
    assert((byId.get("film_credits")?.flags ?? []).includes("APPLIED") === false, "Film must not be applied below 500k");

    assert(out.revisedTotals.revised.taxableIncome >= 0, "Taxable income must stay >= 0");
  }

  // ------------------------------
  // Scenario 2: $750k taxable income
  // - RTU applies (>= 350k)
  // - Film applies (>= 500k)
  // - Leveraged does NOT apply (< 833k)
  // ------------------------------
  {
    const intake = buildBaseIntake({ kids: 3, hasBiz: true, k401ytd: 5_000 });
    const evaluations = buildEvaluations(
      Object.fromEntries(ALL_STRATEGIES.map((id) => [id, "ELIGIBLE"])) as Record<string, "ELIGIBLE">,
    );

    const out = runImpactEngine({
      intake,
      baseline: {
        taxableIncome: 750_000,
        federalTax: 240_000,
        stateTax: 60_000,
        totalTax: 300_000,
      },
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    runScenario("750k taxable income (RTU+Film apply; Leveraged blocked)", {
      intake,
      baseline: out.revisedTotals.baseline,
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    const byId = new Map(out.impacts.map((i) => [i.strategyId, i]));

    assert((byId.get("rtu_program")?.flags ?? []).includes("APPLIED"), "RTU should apply at 750k");
    assert((byId.get("film_credits")?.flags ?? []).includes("APPLIED"), "Film should apply at 750k");
    assert(
      (byId.get("leveraged_charitable")?.flags ?? []).includes("APPLIED") === false,
      "Leveraged must not apply below 833k",
    );
  }

  // ------------------------------
  // Scenario 3: $1.5M taxable income
  // - All income gates satisfied; all ELIGIBLE should apply (subject to clamping).
  // - We also verify sequential clamping keeps taxable income >= 0.
  // ------------------------------
  {
    const intake = buildBaseIntake({ kids: 2, hasBiz: true, k401ytd: 0 });
    const evaluations = buildEvaluations(
      Object.fromEntries(ALL_STRATEGIES.map((id) => [id, "ELIGIBLE"])) as Record<string, "ELIGIBLE">,
    );

    const out = runImpactEngine({
      intake,
      baseline: {
        taxableIncome: 1_500_000,
        federalTax: 520_000,
        stateTax: 120_000,
        totalTax: 640_000,
      },
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    runScenario("1.5M taxable income (all income gates satisfied)", {
      intake,
      baseline: out.revisedTotals.baseline,
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    const byId = new Map(out.impacts.map((i) => [i.strategyId, i]));
    for (const id of ALL_STRATEGIES) {
      assert((byId.get(id)?.flags ?? []).includes("APPLIED"), `${id} should be applied at 1.5M (ELIGIBLE)`);
    }
    assert(out.revisedTotals.revised.taxableIncome >= 0, "Taxable income must stay >= 0");
  }

  // ------------------------------
  // Scenario 4: applyPotential=false vs true
  // - POTENTIAL impacts should NOT apply unless applyPotential=true.
  // ------------------------------
  {
    const intake = buildBaseIntake({ kids: 1, hasBiz: true, k401ytd: 0 });
    const evaluations: StrategyEvaluationResult[] = [
      { strategyId: "augusta_loophole", status: "ELIGIBLE", reasons: [] },
      { strategyId: "k401", status: "POTENTIAL", reasons: [], missingFields: ["retirement.k401_employee_contrib_ytd"] },
    ];

    const baseline = {
      taxableIncome: 400_000,
      federalTax: 120_000,
      stateTax: 30_000,
      totalTax: 150_000,
    };

    const outNoApply = runImpactEngine({
      intake,
      baseline,
      strategyEvaluations: evaluations,
      applyPotential: false,
    });

    const outApply = runImpactEngine({
      intake,
      baseline,
      strategyEvaluations: evaluations,
      applyPotential: true,
    });

    const byIdNo = new Map(outNoApply.impacts.map((i) => [i.strategyId, i]));
    const byIdYes = new Map(outApply.impacts.map((i) => [i.strategyId, i]));

    assert(
      (byIdNo.get("k401")?.flags ?? []).includes("APPLIED") === false,
      "k401 POTENTIAL must not apply when applyPotential=false",
    );
    assert((byIdYes.get("k401")?.flags ?? []).includes("APPLIED"), "k401 POTENTIAL should apply when applyPotential=true");

    const tiNo = outNoApply.revisedTotals.revised.taxableIncome;
    const tiYes = outApply.revisedTotals.revised.taxableIncome;
    assert(tiYes <= tiNo || approxEqual(tiYes, tiNo), "Applying potential should not increase taxable income");
  }

  // eslint-disable-next-line no-console
  console.log("\nAll impact engine harness checks passed.");
}

main();
