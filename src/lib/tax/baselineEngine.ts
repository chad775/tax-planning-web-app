// src/lib/tax/baselineEngine.ts
import "server-only";

import type { NormalizedIntake2025 } from "../../contracts/intake";
import type { BaselineTaxTotals } from "../../contracts/baseline";

import { computeTaxableIncome2025, computeFederalBaseline2025 } from "./federal";
import { computeStateIncomeTax2025 } from "./state";
import type { StateFilingStatus2025 } from "./stateTables";
import { computePayrollTaxes2025 } from "./payroll/payroll2025";

/**
 * Baseline tax engine (2025) — deterministic estimate using:
 * - AGI proxy: wages + business profit - employee 401(k)
 * - Standard deduction (computeTaxableIncome2025)
 * - 2025 ordinary brackets + simplified nonrefundable CTC w/ phaseout (computeFederalBaseline2025)
 * - State engine (computeStateIncomeTax2025), using federal taxable income as taxable base proxy
 */
export async function runBaselineTaxEngine(intake: NormalizedIntake2025): Promise<BaselineTaxTotals> {
  const incomeW2 = numberOr0(intake.personal.income_excl_business);

  const biz = intake.business;
  const bizProfit = biz.has_business ? numberOr0(biz.net_profit) : 0;

  const k401Ytd = numberOr0(intake.retirement.k401_employee_contrib_ytd);

  // AGI proxy for v1: wages + business profit - employee 401(k) contribs
  const agi = roundToCents(clampMin0(incomeW2 + bizProfit - k401Ytd));

  const fedStatus = toFederalStatus(intake.personal.filing_status);
  const stateStatus = toStateStatus(intake.personal.filing_status);

  const kidsU17 = Math.max(0, Math.floor(numberOr0(intake.personal.children_0_17)));

  // Taxable income via standard deduction
  const { taxableIncome } = computeTaxableIncome2025({
    filingStatus: fedStatus,
    agi,
  });

  // Federal (ordinary only) + simplified CTC w/ phaseout (nonrefundable)
  const fed = computeFederalBaseline2025({
    filingStatus: fedStatus,
    agi,
    taxableOrdinaryIncomeAfterDeduction: taxableIncome,
    taxablePreferentialIncomeAfterDeduction: 0,
    qualifyingChildrenUnder17: kidsU17,
  });

  // IMPORTANT: computeFederalBaseline2025 already applies the (nonrefundable) CTC.
  const federalTax = roundToCents(clampMin0(fed.incomeTaxAfterCTC));

  // State (use federal taxable income as taxableBase proxy)
  const stAny: any = computeStateIncomeTax2025({
    taxYear: 2025,
    state: intake.personal.state,
    filingStatus: stateStatus,
    taxableBase: taxableIncome,
  });

  const stateTax = roundToCents(
    clampMin0(firstNumber(stAny?.stateIncomeTax, stAny?.tax, stAny?.stateTax) ?? 0),
  );

  // Compute payroll taxes
  const payrollResult = computePayrollTaxes2025(intake, { taxYear: 2025, baselineTaxableIncome: taxableIncome });
  const payrollTax = roundToCents(clampMin0(payrollResult.payrollTaxTotal));

  const totalTax = roundToCents(clampMin0(federalTax + stateTax + payrollTax));

  return {
    federalTax,
    stateTax,
    payrollTax,
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

/** Map intake filing_status (e.g. SINGLE) to state engine keys (e.g. single). */
export function toStateStatus(
  status: NormalizedIntake2025["personal"]["filing_status"],
): StateFilingStatus2025 {
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
