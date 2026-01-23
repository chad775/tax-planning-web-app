// /src/contracts/baseline.ts
/**
 * Baseline tax engine contract (Thread 2) - LOCKED
 * 
 * Input/output types for baseline tax calculations.
 * Matches BaselineTaxTotals from src/lib/strategies/impactTypes.ts
 */

/**
 * Baseline 2025 engine outputs required for impact application.
 * This type intentionally stays minimal and does not define how the baseline is computed.
 * 
 * Matches BaselineTaxTotals from impactTypes.ts
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
 * Input to baseline engine (normalized intake).
 * The baseline engine accepts NormalizedIntake2025 from contracts/intake.ts
 */
export type BaselineEngineInput = import("./intake").NormalizedIntake2025;
