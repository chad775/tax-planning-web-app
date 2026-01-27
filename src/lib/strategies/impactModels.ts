// src/lib/strategies/impactModels.ts

import type {
  BaselineTaxTotals,
  ImpactAssumption,
  ImpactModelKind,
  NormalizedIntake2025,
  Range3,
  StrategyId,
  StrategyImpactEstimate,
  StrategyEvaluationStatus,
} from "./impactTypes";

/**
 * Deterministic impact models registry (v1).
 * - NO eligibility logic (Thread 3 owns that).
 * - Conservative ranges only.
 * - Uses ONLY locked inputs (intake + baseline totals).
 * - Deltas: negative numbers reduce taxable income / tax liability.
 */

export interface ImpactModelContext {
  intake: NormalizedIntake2025;
  baseline: BaselineTaxTotals;
  /** Whether the strategy is already marked as in use by the client. */
  alreadyInUse: boolean;
}

export interface ImpactModel {
  readonly kind: ImpactModelKind;

  /**
   * Produce a conservative impact estimate.
   * Note: status is supplied by caller (Thread 3 result) and should be passed through unchanged.
   */
  estimate: (ctx: ImpactModelContext) => Omit<StrategyImpactEstimate, "strategyId" | "status">;
}

/* ----------------------------- shared helpers ----------------------------- */

type ImpactFlag = NonNullable<StrategyImpactEstimate["flags"]>[number];

export function makeRange3(low: number, base: number, high: number): Range3 {
  const lo = Math.min(low, base, high);
  const hi = Math.max(low, base, high);
  const mid = Math.min(Math.max(base, lo), hi);
  return { low: lo, base: mid, high: hi };
}

/**
 * Clamp a taxable-income delta range so it cannot reduce taxable income below 0.
 * taxableIncomeDelta is expected to be <= 0 for reductions; we clamp by baseline taxable income.
 */
export function clampTaxableIncomeDeltaToBaseline(
  baselineTaxableIncome: number,
  delta: Range3,
): Range3 {
  const cap = Math.max(0, baselineTaxableIncome);
  const clampOne = (v: number) => Math.min(0, Math.max(v, -cap));
  return makeRange3(clampOne(delta.low), clampOne(delta.base), clampOne(delta.high));
}

/**
 * Clamp a tax-liability delta range so it cannot reduce tax liability below 0.
 * taxLiabilityDelta is expected to be <= 0 for reductions; we clamp by baseline total tax.
 */
export function clampTaxLiabilityDeltaToBaseline(baselineTotalTax: number, delta: Range3): Range3 {
  const cap = Math.max(0, baselineTotalTax);
  const clampOne = (v: number) => Math.min(0, Math.max(v, -cap));
  return makeRange3(clampOne(delta.low), clampOne(delta.base), clampOne(delta.high));
}

/**
 * Cap a positive annual amount by a percentage of a proxy for AGI.
 * We use baseline.taxableIncome as the deterministic proxy per Thread 4 constraints.
 */
function capAmountByPctOfAgiProxy(args: { amount: number; agiProxy: number; pct: number }): number {
  const agi = Math.max(0, args.agiProxy);
  const cap = Math.max(0, agi * Math.max(0, args.pct));
  return Math.max(0, Math.min(args.amount, cap));
}

function withAlreadyInUseFlag(
  estimate: Omit<StrategyImpactEstimate, "strategyId" | "status">,
  alreadyInUse: boolean,
): Omit<StrategyImpactEstimate, "strategyId" | "status"> {
  if (!alreadyInUse) return estimate;

  // Conservative: if already in use, default to zero incremental impact.
  const flags: ImpactFlag[] = [...(estimate.flags ?? []), "ALREADY_IN_USE"];

  const base: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
    ...estimate,
    flags,
    assumptions: [
      ...estimate.assumptions,
      {
        id: "ALREADY_IN_USE_ZERO_INCREMENT",
        category: "INTERACTION",
        value: true,
      },
    ],
  };

  const withIncome = estimate.taxableIncomeDelta
    ? { ...base, taxableIncomeDelta: makeRange3(0, 0, 0) }
    : base;

  const withTax = estimate.taxLiabilityDelta
    ? { ...withIncome, taxLiabilityDelta: makeRange3(0, 0, 0) }
    : withIncome;

  return withTax;
}

/* ----------------------------- model: unknown ----------------------------- */

export function createUnknownRangeModel(reasonCode: string): ImpactModel {
  return {
    kind: "unknown_range",
    estimate: (_ctx: ImpactModelContext) => {
      const assumptions: ImpactAssumption[] = [
        { id: "UNKNOWN_RANGE_MINIMAL_IMPACT", category: "CONSERVATISM", value: true },
        { id: "DATA_GAP", category: "DATA_GAP", value: reasonCode },
      ];
      return {
        model: "unknown_range",
        needsConfirmation: true,
        assumptions,
        taxableIncomeDelta: makeRange3(0, 0, 0),
        taxLiabilityDelta: makeRange3(0, 0, 0),
        inputsToTighten: [],
        flags: [],
      };
    },
  };
}

/* ------------------------------ model: 401k ------------------------------- */

/**
 * IRS 402(g)(1) elective deferral limit for 2025: $23,500.
 * Note: catch-up limits require age, which is not available in the locked intake schema.
 */
const EMPLOYEE_401K_DEFERRAL_LIMIT_2025 = 23_500;

export const k401EmployeeDeferralModel: ImpactModel = {
  kind: "deferral_range",
  estimate: (ctx: ImpactModelContext) => {
    const ytd = Math.max(0, ctx.intake.retirement.k401_employee_contrib_ytd);
    const room = Math.max(0, EMPLOYEE_401K_DEFERRAL_LIMIT_2025 - ytd);

    // Conservative uptake: low 0, base 50% of remaining room, high 100% of remaining room.
    const rawDelta = makeRange3(0, -0.5 * room, -room);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "401K_EMPLOYEE_LIMIT_2025", category: "CAP", value: EMPLOYEE_401K_DEFERRAL_LIMIT_2025 },
      { id: "NO_CATCHUP_ASSUMED", category: "DATA_GAP", value: true },
      { id: "CONSERVATIVE_PARTIAL_UPTAKE", category: "CONSERVATISM", value: 0.5 },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deferral_range",
      needsConfirmation: false,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* ----------------------------- model: augusta ------------------------------ */

export const augustaModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const dailyRate = 950;
    const baseDays = 10;
    const maxDays = 14;

    const low = 0;
    const base = baseDays * dailyRate;
    const high = maxDays * dailyRate;

    const rawDelta = makeRange3(-low, -base, -high);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "AUGUSTA_DAILY_RATE", category: "DEFAULT", value: dailyRate },
      { id: "AUGUSTA_BASE_DAYS", category: "DEFAULT", value: baseDays },
      { id: "AUGUSTA_MAX_DAYS", category: "CAP", value: maxDays },
      { id: "CONSERVATIVE_DAYS_RANGE", category: "CONSERVATISM", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: false,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* -------------------------- model: medical reimb --------------------------- */

export const medicalReimbursementModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const lowAnnual = 1_500 * 12;
    const baseAnnual = 2_000 * 12;
    const highAnnual = 2_500 * 12;

    const rawDelta = makeRange3(-lowAnnual, -baseAnnual, -highAnnual);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "MED_REIMB_MONTHLY_LOW", category: "DEFAULT", value: 1_500 },
      { id: "MED_REIMB_MONTHLY_BASE", category: "DEFAULT", value: 2_000 },
      { id: "MED_REIMB_MONTHLY_HIGH", category: "DEFAULT", value: 2_500 },
      { id: "REQUIRES_PLAN_AND_SUBSTANTIATION", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* ------------------------- model: cash balance plan ------------------------ */

export const cashBalancePlanModel: ImpactModel = {
  kind: "deferral_range",
  estimate: (ctx: ImpactModelContext) => {
    const low = 50_000;
    const base = 100_000;
    const high = 150_000;

    const rawDelta = makeRange3(-low, -base, -high);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "CASH_BALANCE_CONTRIB_LOW", category: "DEFAULT", value: low },
      { id: "CASH_BALANCE_CONTRIB_BASE", category: "DEFAULT", value: base },
      { id: "CASH_BALANCE_CONTRIB_HIGH", category: "DEFAULT", value: high },
      { id: "REQUIRES_PLAN_DESIGN", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deferral_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* -------------------------- model: hiring children ------------------------- */

export const hiringChildrenModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const kids = Math.max(0, ctx.intake.personal.children_0_17);
    const hasBiz = ctx.intake.business.has_business;

    if (!hasBiz || kids === 0) {
      return {
        model: "deduction_range",
        needsConfirmation: true,
        taxableIncomeDelta: makeRange3(0, 0, 0),
        assumptions: [
          { id: "NO_CHILDREN_OR_NO_BUSINESS", category: "DATA_GAP", value: true },
          { id: "CONSERVATIVE_ZERO", category: "CONSERVATISM", value: true },
        ],
        inputsToTighten: [],
        flags: [],
      };
    }

    const perChildLow = 1_000;
    const perChildBase = 6_000;
    const perChildHigh = 15_000;

    const rawDelta = makeRange3(-perChildLow * kids, -perChildBase * kids, -perChildHigh * kids);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      {
        id: "HIRING_CHILDREN_RANGE_PER_CHILD",
        category: "DEFAULT",
        value: `${perChildLow}/${perChildBase}/${perChildHigh}`,
      },
      { id: "NEEDS_WAGE_AND_SUBSTANTIATION", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* ------------------------ model: leveraged charity ------------------------- */

export const leveragedCharitableModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const investmentMin = 50_000;
    const multiplier = 5;
    const rawDeduction = investmentMin * multiplier;

    const low = 0;
    const base = capAmountByPctOfAgiProxy({
      amount: rawDeduction,
      agiProxy: ctx.baseline.taxableIncome,
      pct: 0.30,
    });
    const high = base;

    const rawDelta = makeRange3(-low, -base, -high);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "LEVERAGED_CHARITABLE_INVESTMENT_MIN", category: "DEFAULT", value: investmentMin },
      { id: "LEVERAGED_CHARITABLE_MULTIPLIER", category: "DEFAULT", value: multiplier },
      { id: "LEVERAGED_CHARITABLE_AGI_CAP_PCT", category: "CAP", value: 0.30 },
      { id: "REQUIRES_COST_BENEFIT_REVIEW", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* -------------------------- model: short-term rental ----------------------- */

export const shortTermRentalModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const purchasePrice = 1_000_000;
    const lowPct = 0.18;
    const basePct = 0.22;
    const highPct = 0.26;

    const low = Math.round(purchasePrice * lowPct);
    const base = Math.round(purchasePrice * basePct);
    const high = Math.round(purchasePrice * highPct);

    const rawDelta = makeRange3(-low, -base, -high);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "STR_PURCHASE_PRICE", category: "DEFAULT", value: purchasePrice },
      { id: "STR_COSTSEG_PCT_LOW", category: "DEFAULT", value: lowPct },
      { id: "STR_COSTSEG_PCT_BASE", category: "DEFAULT", value: basePct },
      { id: "STR_COSTSEG_PCT_HIGH", category: "DEFAULT", value: highPct },
      { id: "REQUIRES_PROPERTY_AND_PARTICIPATION_FACTS", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* ------------------------------- model: RTU ------------------------------- */

export const rtuProgramModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const investment = 50_000;
    const deduction = 350_000;

    const low = 0;
    const base = capAmountByPctOfAgiProxy({
      amount: deduction,
      agiProxy: ctx.baseline.taxableIncome,
      pct: 1.0,
    });
    const high = base;

    const rawDelta = makeRange3(-low, -base, -high);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "RTU_INVESTMENT", category: "DEFAULT", value: investment },
      { id: "RTU_DEDUCTION", category: "DEFAULT", value: deduction },
      { id: "RTU_AGI_CAP_PCT", category: "CAP", value: 1.0 },
      { id: "REQUIRES_COST_BENEFIT_REVIEW", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* ------------------------------ model: film ------------------------------- */

export const filmCreditsModel: ImpactModel = {
  kind: "deduction_range",
  estimate: (ctx: ImpactModelContext) => {
    const investment = 100_000;
    const lowMult = 4.5;
    const baseMult = 5.0;
    const highMult = 5.2;

    const rawLow = investment * lowMult;
    const rawBase = investment * baseMult;
    const rawHigh = investment * highMult;

    const low = capAmountByPctOfAgiProxy({ amount: rawLow, agiProxy: ctx.baseline.taxableIncome, pct: 1.0 });
    const base = capAmountByPctOfAgiProxy({ amount: rawBase, agiProxy: ctx.baseline.taxableIncome, pct: 1.0 });
    const high = capAmountByPctOfAgiProxy({ amount: rawHigh, agiProxy: ctx.baseline.taxableIncome, pct: 1.0 });

    const rawDelta = makeRange3(-low, -base, -high);
    const cappedDelta = clampTaxableIncomeDeltaToBaseline(ctx.baseline.taxableIncome, rawDelta);

    const assumptions: ImpactAssumption[] = [
      { id: "FILM_INVESTMENT_MIN", category: "DEFAULT", value: investment },
      { id: "FILM_MULT_LOW", category: "DEFAULT", value: lowMult },
      { id: "FILM_MULT_BASE", category: "DEFAULT", value: baseMult },
      { id: "FILM_MULT_HIGH", category: "DEFAULT", value: highMult },
      { id: "FILM_AGI_CAP_PCT", category: "CAP", value: 1.0 },
      { id: "REQUIRES_PROGRAM_SPECIFICS", category: "DATA_GAP", value: true },
      { id: "REQUIRES_COST_BENEFIT_REVIEW", category: "DATA_GAP", value: true },
    ];

    const flags: ImpactFlag[] = [];
    if (
      cappedDelta.low !== rawDelta.low ||
      cappedDelta.base !== rawDelta.base ||
      cappedDelta.high !== rawDelta.high
    ) {
      flags.push("CAPPED_BY_TAXABLE_INCOME");
      assumptions.push({
        id: "CAPPED_BY_BASELINE_TAXABLE_INCOME",
        category: "CAP",
        value: ctx.baseline.taxableIncome,
      });
    }

    const estimate: Omit<StrategyImpactEstimate, "strategyId" | "status"> = {
      model: "deduction_range",
      needsConfirmation: true,
      taxableIncomeDelta: cappedDelta,
      assumptions,
      inputsToTighten: [],
      flags,
    };

    return withAlreadyInUseFlag(estimate, ctx.alreadyInUse);
  },
};

/* --------------------------- registry + resolver --------------------------- */
/**
 * ✅ CRITICAL FIX:
 * StrategyId is the LOCKED union of snake_case ids:
 * augusta_loophole, medical_reimbursement, hiring_children, cash_balance_plan,
 * k401, leveraged_charitable, short_term_rental, rtu_program, film_credits
 *
 * The old REGISTRY keys (AUGUSTA, "401K", FILM_CREDIT...) will never match,
 * causing UNMAPPED_STRATEGY_ID for everything.
 */
const REGISTRY: Readonly<Record<StrategyId, ImpactModel>> = {
  augusta_loophole: augustaModel,
  medical_reimbursement: medicalReimbursementModel,
  hiring_children: hiringChildrenModel,
  cash_balance_plan: cashBalancePlanModel,
  k401: k401EmployeeDeferralModel,
  leveraged_charitable: leveragedCharitableModel,
  short_term_rental: shortTermRentalModel,
  rtu_program: rtuProgramModel,
  film_credits: filmCreditsModel,
} as const;

export function getImpactModel(strategyId: StrategyId): ImpactModel {
  return REGISTRY[strategyId] ?? createUnknownRangeModel("UNMAPPED_STRATEGY_ID");
}

export function buildImpactEstimateForStrategy(args: {
  strategyId: StrategyId;
  status: StrategyEvaluationStatus;
  intake: NormalizedIntake2025;
  baseline: BaselineTaxTotals;
}): StrategyImpactEstimate {
  const { strategyId, status, intake, baseline } = args;
  const alreadyInUse = intake.strategies_in_use.includes(strategyId);
  const model = getImpactModel(strategyId);

  const estimated = model.estimate({ intake, baseline, alreadyInUse });

  return {
    strategyId,
    status,
    ...estimated,
  };
}
