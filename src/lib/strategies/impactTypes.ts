// /src/lib/strategies/impactTypes.ts

/**
 * Thread 4 — Strategy Impact Models (Types)
 *
 * Deterministic math-only impact estimation types.
 * - No eligibility logic here (Thread 3 owns that).
 * - Impacts are estimates expressed as low/base/high ranges.
 * - Impacts are returned as structured JSON (no prose).
 */

import type { StrategyId } from "@/contracts/strategyIds";

/** Canonical filing statuses supported by the normalized intake schema (tax year 2025). */
export type FilingStatus =
  | "SINGLE"
  | "MARRIED_FILING_JOINTLY"
  | "MARRIED_FILING_SEPARATELY"
  | "HEAD_OF_HOUSEHOLD";

/** Two-letter state or DC abbreviation (normalized). */
export type USStateAbbrev =
  | "AL"
  | "AK"
  | "AZ"
  | "AR"
  | "CA"
  | "CO"
  | "CT"
  | "DE"
  | "DC"
  | "FL"
  | "GA"
  | "HI"
  | "ID"
  | "IL"
  | "IN"
  | "IA"
  | "KS"
  | "KY"
  | "LA"
  | "ME"
  | "MD"
  | "MA"
  | "MI"
  | "MN"
  | "MS"
  | "MO"
  | "MT"
  | "NE"
  | "NV"
  | "NH"
  | "NJ"
  | "NM"
  | "NY"
  | "NC"
  | "ND"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VT"
  | "VA"
  | "WA"
  | "WV"
  | "WI"
  | "WY";

/** Business entity types allowed by the normalized intake schema. */
export type EntityType =
  | "SOLE_PROP"
  | "S_CORP"
  | "C_CORP"
  | "PARTNERSHIP"
  | "LLC"
  | "UNKNOWN";

/** Strategy evaluation status from Thread 3. */
export type StrategyEvaluationStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "POTENTIAL";

/** A strategy identifier (imported from contracts - canonical source of truth). */
export type { StrategyId };

/** Standard low/base/high estimate triple. */
export interface Range3 {
  low: number;
  base: number;
  high: number;
}

/**
 * Strategy impact model kinds (v1).
 * - deduction_range: reduces taxable income
 * - credit_range: reduces tax liability
 * - deferral_range: reduces current-year taxable income estimate
 * - unknown_range: placeholder; forces needs-confirmation and minimal estimate
 */
export type ImpactModelKind =
  | "deduction_range"
  | "credit_range"
  | "deferral_range"
  | "unknown_range";

/**
 * Baseline 2025 engine outputs required for impact application.
 * This type intentionally stays minimal and does not define how the baseline is computed.
 */
export interface BaselineTaxTotals {
  /** Federal tax liability for the year (>= 0). */
  federalTax: number;
  /** State tax liability for the year (>= 0). */
  stateTax: number;
  /** Total tax liability for the year (>= 0). */
  totalTax: number;

  /**
   * Taxable income concept used for strategy impacts.
   * This should align with how your baseline engine defines the taxable-income base
   * (e.g., after above-the-line adjustments and standard/itemized deduction as applicable).
   */
  taxableIncome: number;
}

/**
 * Normalized intake payload (locked for tax year 2025).
 * Do not add new inputs in Thread 4; keep this aligned to the locked schema.
 */
export interface NormalizedIntake2025 {
  personal: {
    filing_status: FilingStatus;
    children_0_17: number;
    income_excl_business: number;
    state: USStateAbbrev;
  };
  business: {
    has_business: boolean;
    entity_type: EntityType;
    employees_count: number;
    net_profit: number;
  };
  retirement: {
    k401_employee_contrib_ytd: number;
  };
  /** Strategy ids already in use by the client (may reduce incremental impact). */
  strategies_in_use: StrategyId[];
}

/**
 * Thread 3 evaluation results input (shape expected by the impact engine).
 * Keep broad enough to accept the evaluator’s output without `any`.
 */
export interface StrategyEvaluationResult {
  strategyId: StrategyId;
  status: StrategyEvaluationStatus;

  /**
   * Deterministic, structured reasons from Thread 3.
   * Implementations may use multiple reason codes/messages.
   */
  reasons: ReadonlyArray<{
    code: string;
    message: string;
    /** Optional path-like pointer to the field involved. */
    field?: string;
  }>;

  /**
   * For POTENTIAL: which fields were missing / required to confirm eligibility.
   * This is a convenience for the impact engine to request tighter inputs.
   */
  missingFields?: ReadonlyArray<string>;
}

/**
 * Machine-readable assumption metadata attached to an impact estimate.
 * This is intended for auditability and future tuning (without prose parsing).
 */
export interface ImpactAssumption {
  /** Stable identifier for the assumption, e.g., "DEFAULT_SAFE_CAP" */
  id: string;
  /** Category, e.g., "CAP", "DEFAULT", "INTERACTION", "CONSERVATISM" */
  category: "CAP" | "DEFAULT" | "INTERACTION" | "CONSERVATISM" | "DATA_GAP";
  /** Numeric or string value used by the model (if applicable). */
  value?: number | string | boolean;
  /** Optional field pointers the assumption relates to. */
  relatedFields?: ReadonlyArray<string>;
}

/**
 * Impact estimate output per strategy.
 * Deltas follow these conventions:
 * - taxableIncomeDelta: negative means taxable income decreases (good for deductions/deferrals)
 * - taxLiabilityDelta: negative means tax liability decreases (good for credits)
 */
export interface StrategyImpactEstimate {
  strategyId: StrategyId;

  /** The status from Thread 3 carried through for downstream logic. */
  status: StrategyEvaluationStatus;

  /** Impact model used for estimation. */
  model: ImpactModelKind;

  /**
   * Estimated delta to taxable income (low/base/high).
   * Present for deduction_range and deferral_range (and may be present for unknown_range as minimal estimate).
   */
  taxableIncomeDelta?: Range3;

  /**
   * Estimated delta to tax liability (low/base/high).
   * Present for credit_range (and may be present for unknown_range as minimal estimate).
   */
  taxLiabilityDelta?: Range3;

  /**
   * True if the strategy has insufficient data and should not be treated as reliable.
   * For model=unknown_range this should always be true.
   */
  needsConfirmation: boolean;

  /** Machine-readable assumptions used to compute the estimate. */
  assumptions: ReadonlyArray<ImpactAssumption>;

  /**
   * Additional inputs that would tighten the estimate.
   * These must be references to existing intake fields only (Thread 4 cannot add new inputs).
   */
  inputsToTighten?: ReadonlyArray<string>;

  /**
   * Notes for programmatic consumers only (not prose for the user).
   * Use codes that can be mapped to user-facing strings in UI (Thread 5+).
   */
  flags?: ReadonlyArray<
    | "ALREADY_IN_USE"
    | "CAPPED_BY_TAXABLE_INCOME"
    | "CAPPED_BY_TAX_LIABILITY"
    | "NOT_APPLIED_NOT_ELIGIBLE"
    | "NOT_APPLIED_POTENTIAL"
    | "APPLIED"
  >;
}

/** Summary of revised totals after applying eligible impacts (and optionally potential). */
export interface RevisedTaxTotals {
  /** Baseline totals from the 2025 engine. */
  baseline: BaselineTaxTotals;

  /**
   * Revised totals after impact application.
   * Guardrails:
   * - never below zero
   * - deductions cannot exceed taxable income
   * - credits cannot exceed tax liability (federal/state/total as implemented)
   */
  revised: BaselineTaxTotals;

  /** Aggregate delta across all applied strategies (low/base/high where applicable). */
  totalTaxDelta: Range3;

  /** Aggregate taxable income delta across applied strategies (low/base/high where applicable). */
  totalTaxableIncomeDelta: Range3;
}

/** Input to the impact engine. */
export interface ImpactEngineInput {
  intake: NormalizedIntake2025;
  baseline: BaselineTaxTotals;
  strategyEvaluations: ReadonlyArray<StrategyEvaluationResult>;
  /**
   * If true, impacts for POTENTIAL strategies may be applied to revised totals.
   * If false, POTENTIAL impacts are returned but not applied.
   */
  applyPotential: boolean;
}

/** Output of the impact engine (structured JSON). */
export interface ImpactEngineOutput {
  /** Per-strategy impact estimates, one per evaluation result. */
  impacts: ReadonlyArray<StrategyImpactEstimate>;

  /** Revised totals after applying impacts under the applyPotential rules. */
  revisedTotals: RevisedTaxTotals;
}
