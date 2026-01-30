// src/lib/results/recomputeRevisedTotalsFromTaxableIncome.ts

import type { FilingStatus2025 } from "@/lib/tax/federal";
import { computeFederalBaseline2025, getStandardDeduction2025 } from "@/lib/tax/federal";
import { computeStateIncomeTaxFromString2025 } from "@/lib/tax/state";
import type { StateFilingStatus2025 } from "@/lib/tax/stateTables";
import { computePayrollTaxes2025 } from "@/lib/tax/payroll/payroll2025";
import type { NormalizedIntake2025 } from "@/contracts/intake";

type Money = number;

export type Totals = {
  federalTax: Money;
  stateTax: Money;
  payrollTax: Money;
  totalTax: Money;
  taxableIncome: Money;
};

export type Range = { low: number; base: number; high: number };

function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
}

function roundToCents(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// Intake uses uppercase enums; tax engines use lowercase.
const FED_STATUS_MAP: Record<
  "SINGLE" | "MARRIED_FILING_JOINTLY" | "MARRIED_FILING_SEPARATELY" | "HEAD_OF_HOUSEHOLD",
  FilingStatus2025
> = {
  SINGLE: "single",
  MARRIED_FILING_JOINTLY: "mfj",
  MARRIED_FILING_SEPARATELY: "mfs",
  HEAD_OF_HOUSEHOLD: "hoh",
};

// If your StateFilingStatus2025 differs, adjust this mapping accordingly.
const STATE_STATUS_MAP: Record<
  "SINGLE" | "MARRIED_FILING_JOINTLY" | "MARRIED_FILING_SEPARATELY" | "HEAD_OF_HOUSEHOLD",
  StateFilingStatus2025
> = {
  SINGLE: "single" as StateFilingStatus2025,
  MARRIED_FILING_JOINTLY: "mfj" as StateFilingStatus2025,
  MARRIED_FILING_SEPARATELY: "mfs" as StateFilingStatus2025,
  HEAD_OF_HOUSEHOLD: "hoh" as StateFilingStatus2025,
};

export function recomputeRevisedTotalsFromTaxableIncome(params: {
  baseline: Totals;
  filingStatus:
    | "SINGLE"
    | "MARRIED_FILING_JOINTLY"
    | "MARRIED_FILING_SEPARATELY"
    | "HEAD_OF_HOUSEHOLD";
  state: string; // e.g. "CO"
  totalTaxableIncomeDelta: Range;

  // Needed for CTC phaseout
  qualifyingChildrenUnder17: number;

  /**
   * Optional override if you compute true AGI elsewhere.
   * If not provided, we derive an AGI proxy as:
   * baselineAgi ~= baseline.taxableIncome + standardDeduction(2025)
   */
  baselineAgiOverride?: number;
}) {
  const {
    baseline,
    filingStatus,
    state,
    totalTaxableIncomeDelta,
    qualifyingChildrenUnder17,
    baselineAgiOverride,
  } = params;

  const fedStatus = FED_STATUS_MAP[filingStatus];
  const stStatus = STATE_STATUS_MAP[filingStatus];

  const sd = getStandardDeduction2025(fedStatus);

  // Normalize kids
  const kidsU17 = Math.max(0, Math.floor(qualifyingChildrenUnder17 ?? 0));

  // Derive AGI proxy so CTC phaseout can be applied on revised scenarios too.
  // Assumption: taxableIncome ~= AGI - standardDeduction (standard deduction only baseline)
  const baselineAgi =
    typeof baselineAgiOverride === "number" && Number.isFinite(baselineAgiOverride)
      ? clampMin0(baselineAgiOverride)
      : clampMin0(baseline.taxableIncome + sd);

  // Approx: apply same delta to AGI as taxable income delta
  const revisedAgi: Range = {
    low: clampMin0(baselineAgi + totalTaxableIncomeDelta.low),
    base: clampMin0(baselineAgi + totalTaxableIncomeDelta.base),
    high: clampMin0(baselineAgi + totalTaxableIncomeDelta.high),
  };

  function totalsForAgi(agi: number): Totals {
    const taxableIncome = clampMin0(agi - sd);

    const fed = computeFederalBaseline2025({
      filingStatus: fedStatus,
      agi,
      taxableOrdinaryIncomeAfterDeduction: taxableIncome,
      taxablePreferentialIncomeAfterDeduction: 0,
      qualifyingChildrenUnder17: kidsU17,
    });

    const federalTax = roundToCents(clampMin0(fed.incomeTaxAfterCTC));

    const stateOut = computeStateIncomeTaxFromString2025({
      taxYear: 2025,
      state,
      filingStatus: stStatus,
      taxableBase: taxableIncome,
    });

    const stateTax = roundToCents(clampMin0(stateOut.stateIncomeTax));
    
    // Payroll tax remains the same as baseline (unless s_corp_conversion is applied, which is handled via payrollTaxDelta)
    const payrollTax = baseline.payrollTax ?? 0;
    const totalTax = roundToCents(clampMin0(federalTax + stateTax + payrollTax));

    return {
      federalTax,
      stateTax,
      payrollTax,
      totalTax,
      taxableIncome: roundToCents(taxableIncome),
    };
  }

  const revisedRange = {
    low: totalsForAgi(revisedAgi.low),
    base: totalsForAgi(revisedAgi.base),
    high: totalsForAgi(revisedAgi.high),
  };

  const totalTaxDelta: Range = {
    low: roundToCents(baseline.totalTax - revisedRange.low.totalTax),
    base: roundToCents(baseline.totalTax - revisedRange.base.totalTax),
    high: roundToCents(baseline.totalTax - revisedRange.high.totalTax),
  };

  return {
    baseline,
    revised: revisedRange.base,
    revisedRange,
    totalTaxDelta,
    totalTaxableIncomeDelta,
  };
}
