// src/lib/tax/baselineEngine.ts
import "server-only";

import type { NormalizedIntake2025 } from "../../contracts/intake";
import type { BaselineTaxTotals } from "../../contracts/baseline";

import { computeTaxableIncome2025, computeFederalBaseline2025 } from "./federal";
import { computeStateIncomeTax2025 } from "./state";
import type { StateFilingStatus2025 } from "./stateTables";

/**
 * Baseline tax engine (2025-ish) — deterministic estimate using:
 * - Standard deduction (via computeTaxableIncome2025)
 * - 2025 ordinary brackets (via computeFederalBaseline2025)
 * - SIMPLE nonrefundable Child Tax Credit ($2,000 per child under 17)
 * - State engine (via computeStateIncomeTax2025)
 *
 * NOTE: We apply CTC here defensively in case the federal helper returns "before credits".
 * This keeps baseline stable and avoids silent mismatches.
 */
export async function runBaselineTaxEngine(intake: NormalizedIntake2025): Promise<BaselineTaxTotals> {
  const incomeW2 = numberOr0(intake.personal.income_excl_business);

  const biz = intake.business;
  const bizProfit = biz.has_business ? numberOr0(biz.net_profit) : 0;

  const k401Ytd = numberOr0(intake.retirement.k401_employee_contrib_ytd);

  // Simple AGI proxy for v1: wages + business profit - employee 401(k) contribs
  const agi = roundToCents(clampMin0(incomeW2 + bizProfit - k401Ytd));

  const fedStatus = toFederalStatus(intake.personal.filing_status);
  const stateStatus = toStateStatus(intake.personal.filing_status);

  // Taxable income via standard deduction
  const { taxableIncome } = computeTaxableIncome2025({
    filingStatus: fedStatus,
    agi,
  });

  // Federal (ordinary only)
  const fedAny: any = computeFederalBaseline2025({
    filingStatus: fedStatus,
    agi,
    taxableOrdinaryIncomeAfterDeduction: taxableIncome,
    taxablePreferentialIncomeAfterDeduction: 0,
    // still pass this through (harmless if federal ignores it)
    qualifyingChildrenUnder17: Math.max(0, Math.floor(numberOr0(intake.personal.children_0_17))),
  });

  // Defensive: pick *some* numeric tax field from fed helper
  const fedTaxRaw =
    firstNumber(
      fedAny?.incomeTaxAfterCTC,
      fedAny?.incomeTax, // common
      fedAny?.federalTax, // sometimes used
      fedAny?.totalTax, // sometimes used
      fedAny?.tax, // sometimes used
    ) ?? 0;

  // SIMPLE nonrefundable CTC applied here (baseline simplification)
  const kidsU17 = Math.max(0, Math.floor(numberOr0(intake.personal.children_0_17)));
  const ctc = 2000 * kidsU17;

  const federalTax = roundToCents(clampMin0(fedTaxRaw - Math.min(ctc, fedTaxRaw)));

  // State (Stage-1 simplification: use federal taxable income as taxableBase proxy)
  const stAny: any = computeStateIncomeTax2025({
    taxYear: 2025,
    state: intake.personal.state,
    filingStatus: stateStatus,
    taxableBase: taxableIncome,
  });

  const stateTax = roundToCents(
    clampMin0(firstNumber(stAny?.stateIncomeTax, stAny?.tax, stAny?.stateTax) ?? 0),
  );

  const totalTax = roundToCents(clampMin0(federalTax + stateTax));

  return {
    federalTax,
    stateTax,
    totalTax,
    taxableIncome: roundToCents(taxableIncome),
  } as BaselineTaxTotals;
}

/* ---------------- helpers ---------------- */

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function firstNumber(...vals: any[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
}

function roundToCents(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Contracts intake filing_status:
 * "SINGLE" | "MARRIED_FILING_JOINTLY" | "MARRIED_FILING_SEPARATELY" | "HEAD_OF_HOUSEHOLD"
 *
 * federal.ts expects:
 * "single" | "mfj" | "mfs" | "hoh" | "qw"
 */
function toFederalStatus(status: NormalizedIntake2025["personal"]["filing_status"]) {
  switch (status) {
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

/**
 * If your StateFilingStatus2025 differs from the contract enum,
 * THIS is the only place you should change it.
 */
function toStateStatus(
  status: NormalizedIntake2025["personal"]["filing_status"],
): StateFilingStatus2025 {
  return status as unknown as StateFilingStatus2025;
}
