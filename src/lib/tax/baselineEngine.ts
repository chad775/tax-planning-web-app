// src/lib/tax/baselineEngine.ts
import "server-only";

import type { NormalizedIntake2025 } from "../../contracts/intake";
import type { BaselineTaxTotals } from "../../contracts/baseline";

import type { FilingStatus2025 } from "./federal";
import { computeFederalBaseline2025 } from "./federal";

import type { StateFilingStatus2025 } from "./stateTables";
import { computeStateIncomeTaxFromString2025 } from "./state";

/**
 * Baseline tax engine (2025) — deterministic estimate using:
 * - Federal ordinary income brackets + standard deduction + simplified nonrefundable CTC
 * - State tax via state.ts (hybrid_300k / flat / none, depending on tables)
 *
 * Notes:
 * - Uses a simplified "AGI proxy" based on intake fields (Stage-1 scope).
 * - Treats all income as ordinary (no LTCG/QD modeling yet).
 */
export async function runBaselineTaxEngine(intake: NormalizedIntake2025): Promise<BaselineTaxTotals> {
  const incomeW2 = numberOr0(intake.personal.income_excl_business);

  const biz = intake.business;
  const bizProfit = biz.has_business ? numberOr0(biz.net_profit) : 0;

  const k401Ytd = numberOr0(intake.retirement.k401_employee_contrib_ytd);

  // Stage-1 simplification: AGI proxy = W2 + business profit - employee 401(k) deferrals (YTD)
  const agiProxy = Math.max(0, incomeW2 + bizProfit - k401Ytd);

  const fedStatus = toFederalStatus(intake.personal.filing_status);
  const stStatus = toStateStatus(intake.personal.filing_status);

  // Stage-1 simplification: treat all taxable income as ordinary (no preferential split)
  const fed = computeFederalBaseline2025({
    filingStatus: fedStatus,
    agi: agiProxy,
    taxableOrdinaryIncomeAfterDeduction: 0, // will be set below
    taxablePreferentialIncomeAfterDeduction: 0,
    qualifyingChildrenUnder17: Math.max(0, Math.floor(numberOr0(intake.personal.children_0_17))),
  });

  // IMPORTANT: computeFederalBaseline2025 computes taxableIncome via SD,
  // but it expects the caller to supply the taxable split.
  // For now, we treat ALL taxable income as ordinary.
  const fed2 = computeFederalBaseline2025({
    filingStatus: fedStatus,
    agi: agiProxy,
    taxableOrdinaryIncomeAfterDeduction: fed.taxableIncome,
    taxablePreferentialIncomeAfterDeduction: 0,
    qualifyingChildrenUnder17: Math.max(0, Math.floor(numberOr0(intake.personal.children_0_17))),
  });

  const taxableIncome = Math.max(0, fed2.taxableIncome);

  const st = computeStateIncomeTaxFromString2025({
    taxYear: 2025,
    state: intake.personal.state,
    filingStatus: stStatus,
    taxableBase: taxableIncome, // proxy; ok for now
  });

  const federalTax = Math.max(0, roundToCents(fed2.incomeTaxAfterCTC));
  const stateTax = Math.max(0, roundToCents(st.stateIncomeTax));
  const totalTax = Math.max(0, roundToCents(federalTax + stateTax));

  const out: BaselineTaxTotals = {
    federalTax,
    stateTax,
    totalTax,
    taxableIncome,
  } as BaselineTaxTotals;

  return out;
}

/* ---------------- helpers ---------------- */

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function roundToCents(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function toFederalStatus(
  s: NormalizedIntake2025["personal"]["filing_status"],
): FilingStatus2025 {
  switch (s) {
    case "SINGLE":
      return "single";
    case "MARRIED_FILING_JOINTLY":
      return "mfj";
    case "MARRIED_FILING_SEPARATELY":
      return "mfs";
    case "HEAD_OF_HOUSEHOLD":
      return "hoh";
    default:
      return "single";
  }
}

function toStateStatus(
  s: NormalizedIntake2025["personal"]["filing_status"],
): StateFilingStatus2025 {
  // Most states follow the same filing status buckets for our simplified model.
  // If your stateTables uses different enums, adjust this mapping once here.
  switch (s) {
    case "SINGLE":
      return "single" as StateFilingStatus2025;
    case "MARRIED_FILING_JOINTLY":
      return "mfj" as StateFilingStatus2025;
    case "MARRIED_FILING_SEPARATELY":
      return "mfs" as StateFilingStatus2025;
    case "HEAD_OF_HOUSEHOLD":
      return "hoh" as StateFilingStatus2025;
    default:
      return "single" as StateFilingStatus2025;
  }
}
