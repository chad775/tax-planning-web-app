// src/lib/tax/baselineEngine.ts
import "server-only";

import type { NormalizedIntake2025 } from "../../contracts/intake";
import type { BaselineTaxTotals } from "../../contracts/baseline";

import {
  computeTaxableIncome2025,
  computeFederalBaseline2025,
  type FilingStatus2025 as FederalFilingStatus2025,
} from "./federal";

import { computeStateIncomeTax2025 } from "./state";
import type { StateFilingStatus2025 } from "./stateTables";

/**
 * Baseline tax engine (2025) — deterministic estimate using:
 * - Standard deduction
 * - 2025 ordinary brackets (no AMT/NIIT/SE/etc.)
 * - Simplified nonrefundable Child Tax Credit
 * - State engine (hybrid/flat/none via stateTables)
 *
 * Contract output: BaselineTaxTotals
 * Downstream fields used by impact engine: federalTax, stateTax, totalTax, taxableIncome
 */
export async function runBaselineTaxEngine(intake: NormalizedIntake2025): Promise<BaselineTaxTotals> {
  const incomeW2 = numberOr0(intake.personal.income_excl_business);

  const biz = intake.business;
  const bizProfit = biz.has_business ? numberOr0(biz.net_profit) : 0;

  const k401Ytd = numberOr0(intake.retirement.k401_employee_contrib_ytd);

  // AGI proxy for v1: wages + business profit - employee 401(k) contribs
  const agi = roundToCents(clampMin0(incomeW2 + bizProfit - k401Ytd));

  // Filing status mapping (contracts use uppercase enums; federal.ts uses lowercase)
  const fedStatus = toFederalStatus(intake.personal.filing_status);
  const stateStatus = toStateStatus(intake.personal.filing_status);

  // Taxable income via standard deduction (federal)
  const { taxableIncome } = computeTaxableIncome2025({
    filingStatus: fedStatus,
    agi,
  });

  // Federal (ordinary only, no preferential income in current intake)
  const fed = computeFederalBaseline2025({
    filingStatus: fedStatus,
    agi,
    taxableOrdinaryIncomeAfterDeduction: taxableIncome,
    taxablePreferentialIncomeAfterDeduction: 0,
    qualifyingChildrenUnder17: Math.max(0, Math.floor(numberOr0(intake.personal.children_0_17))),
  });

  // State (Stage 1 simplification: use federal taxable income as taxableBase proxy)
  const st = computeStateIncomeTax2025({
    taxYear: 2025,
    state: intake.personal.state, // already StateCode in your contract schema
    filingStatus: stateStatus,
    taxableBase: taxableIncome,
  });

  const federalTax = roundToCents(clampMin0(fed.incomeTaxAfterCTC));
  const stateTax = roundToCents(clampMin0(st.stateIncomeTax));
  const totalTax = roundToCents(clampMin0(federalTax + stateTax));

  const out: BaselineTaxTotals = {
    federalTax,
    stateTax,
    totalTax,
    taxableIncome: roundToCents(taxableIncome),
  } as BaselineTaxTotals;

  return out;
}

/* ---------------- helpers ---------------- */

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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
function toFederalStatus(status: NormalizedIntake2025["personal"]["filing_status"]): FederalFilingStatus2025 {
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
      // defensive fallback
      return "single";
  }
}

/**
 * stateTables uses StateFilingStatus2025.
 * In your project it appears to align with the contract enum (uppercase strings).
 * If your stateTables differs, adjust here (this is the only mapping point).
 */
function toStateStatus(status: NormalizedIntake2025["personal"]["filing_status"]): StateFilingStatus2025 {
  // Most likely: StateFilingStatus2025 is the same uppercase enum.
  // If not, change this switch to match your stateTables definition.
  return status as unknown as StateFilingStatus2025;
}
