// src/lib/results/recomputeRevisedTotalsFromTaxableIncome.ts

import type { FilingStatus2025 } from "@/lib/tax/federal";
import {
  computeFederalBaseline2025,
  getStandardDeduction2025,
} from "@/lib/tax/federal";
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

  // ✅ NEW: needed for CTC phaseout
  qualifyingChildrenUnder17: number;

  /**
   * Optional override if you later compute true AGI elsewhere.
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

  // ✅ Derive an AGI proxy so CTC phaseout can be applied on revised scenarios too.
  // Assumption: taxableIncome ~= AGI - standardDeduction (standard deduction only baseline)
  const baselineAgi = typeof baselineAgiOverride === "number"
    ? baselineAgiOverride
    : clampMin0(baseline.taxableIncome + sd);

  // Apply the same delta to AGI as taxable income delta (approximation).
  const revisedAgi: Range = {
    low: clampMin0(baselineAgi + totalTaxableIncomeDelta.low),
    base: clampMin0(baselineAgi + totalTaxableIncomeDelta.base),
    high: clampMin0(baselineAgi + totalTaxableIncomeDelta.high),
  };

  function totalsForAgi(agi: number): Totals {
    // Compute taxable from AGI with standard deduction
    const taxableIncome = clampMin0(agi - sd);

    // Federal: ordinary-only baseline + CTC (phaseout + nonrefundable limit)
    const fed = computeFederalBaseline2025({
      filingStatus: fedStatus,
      agi,
      taxableOrdinaryIncomeAfterDeduction: taxableIncome,
      taxablePreferentialIncomeAfterDeduction: 0,
      qualifyingChildrenUnder17,
    });

    const federalTax = fed.incomeTaxAfterCTC;

    // State: still based on taxable base (no CTC here)
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
    low: totalsForAgi(revisedAgi.low),
    base: totalsForAgi(revisedAgi.base),
    high: totalsForAgi(revisedAgi.high),
  };

  const totalTaxDelta: Range = {
    low: baseline.totalTax - revisedRange.low.totalTax,
    base: baseline.totalTax - revisedRange.base.totalTax,
    high: baseline.totalTax - revisedRange.high.totalTax,
  };

  return {
    baseline,
    revised: revisedRange.base,
    revisedRange,
    totalTaxDelta,
    totalTaxableIncomeDelta,
  };
}
