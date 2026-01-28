// src/lib/results/recomputeRevisedTotalsFromTaxableIncome.ts

import type { FilingStatus2025 } from "@/lib/tax/federal";
import { computeFederalTaxFromTaxableIncome2025 } from "@/lib/tax/federal";
import { computeStateIncomeTaxFromString2025 } from "@/lib/tax/state";
import type { StateFilingStatus2025 } from "@/lib/tax/stateTables";

type Money = number;

export type Totals = {
  federalTax: Money;
  stateTax: Money;
  totalTax: Money;
  taxableIncome: Money;
};

export type Range = { low: number; base: number; high: number };

function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
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
}) {
  const { baseline, filingStatus, state, totalTaxableIncomeDelta } = params;

  const revisedTaxableIncome: Range = {
    low: clampMin0(baseline.taxableIncome + totalTaxableIncomeDelta.low),
    base: clampMin0(baseline.taxableIncome + totalTaxableIncomeDelta.base),
    high: clampMin0(baseline.taxableIncome + totalTaxableIncomeDelta.high),
  };

  const fedStatus = FED_STATUS_MAP[filingStatus];
  const stStatus = STATE_STATUS_MAP[filingStatus];

  function totalsForTaxableIncome(taxableIncome: number): Totals {
    const federalTax = computeFederalTaxFromTaxableIncome2025({
      filingStatus: fedStatus,
      taxableIncome,
    });

    const stateOut = computeStateIncomeTaxFromString2025({
      taxYear: 2025,
      state,
      filingStatus: stStatus,
      taxableBase: taxableIncome,
    });

    const stateTax = stateOut.stateIncomeTax;
    const totalTax = federalTax + stateTax;

    return { federalTax, stateTax, totalTax, taxableIncome };
  }

  const revisedRange = {
    low: totalsForTaxableIncome(revisedTaxableIncome.low),
    base: totalsForTaxableIncome(revisedTaxableIncome.base),
    high: totalsForTaxableIncome(revisedTaxableIncome.high),
  };

  const totalTaxDelta: Range = {
    low: baseline.totalTax - revisedRange.low.totalTax,
    base: baseline.totalTax - revisedRange.base.totalTax,
    high: baseline.totalTax - revisedRange.high.totalTax,
  };

  // Shape matches what your UI already reads: revisedTotals.revised
  return {
    baseline,
    revised: revisedRange.base,
    revisedRange,
    totalTaxDelta,
    totalTaxableIncomeDelta,
  };
}
