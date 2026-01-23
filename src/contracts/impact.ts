// /src/contracts/impact.ts
/**
 * Impact engine contract (Thread 4) - LOCKED
 * 
 * Input/output types for runImpactEngine function.
 * All types match src/lib/strategies/impactTypes.ts
 */

import type { BaselineTaxTotals } from "./baseline";
import type { NormalizedIntake2025 } from "./intake";
import type { StrategyId } from "./strategyIds";

/**
 * Strategy evaluation status from Thread 3.
 */
export type StrategyEvaluationStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "POTENTIAL";

/**
 * Standard low/base/high estimate triple.
 */
export interface Range3 {
  low: number;
  base: number;
  high: number;
}

/**
 * Strategy impact model kinds (v1).
 */
export type ImpactModelKind =
  | "deduction_range"
  | "credit_range"
  | "deferral_range"
  | "unknown_range";

/**
 * Machine-readable assumption metadata attached to an impact estimate.
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

/**
 * Thread 3 evaluation results input (shape expected by the impact engine).
 * Keep broad enough to accept the evaluator's output without `any`.
 * 
 * NOTE: This is different from EvaluatorStrategyEvaluationResult (the evaluator's output).
 * This is the transformed shape that the impact engine expects.
 */
export interface ImpactStrategyEvaluationResult {
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
 * Summary of revised totals after applying eligible impacts (and optionally potential).
 */
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

/**
 * Input to the impact engine.
 */
export interface ImpactEngineInput {
  intake: NormalizedIntake2025;
  baseline: BaselineTaxTotals;
  strategyEvaluations: ReadonlyArray<ImpactStrategyEvaluationResult>;
  /**
   * If true, impacts for POTENTIAL strategies may be applied to revised totals.
   * If false, POTENTIAL impacts are returned but not applied.
   */
  applyPotential: boolean;
}

/**
 * Output of the impact engine (structured JSON).
 */
export interface ImpactEngineOutput {
  /** Per-strategy impact estimates, one per evaluation result. */
  impacts: ReadonlyArray<StrategyImpactEstimate>;

  /** Revised totals after applying impacts under the applyPotential rules. */
  revisedTotals: RevisedTaxTotals;
}
