// src/lib/tax/baselineEngine.ts
import "server-only";

import type { NormalizedIntake2025 } from "../../contracts/intake";
import type { BaselineTaxTotals } from "../../contracts/baseline";

/**
 * Baseline tax engine (v0 placeholder) — deterministic estimate.
 *
 * Purpose: unblock end-to-end flow (intake -> analyze -> impact -> email).
 * Replace with full Thread 2 baseline engine later.
 *
 * Contract output: BaselineTaxTotals
 * Expected downstream fields (used by impact engine): federalTax, stateTax, totalTax, taxableIncome
 */
export async function runBaselineTaxEngine(intake: NormalizedIntake2025): Promise<BaselineTaxTotals> {
  const incomeW2 = numberOr0(intake.personal.income_excl_business);

  const biz = intake.business;
  const bizProfit = biz.has_business ? numberOr0(biz.net_profit) : 0;

  const k401Ytd = numberOr0(intake.retirement.k401_employee_contrib_ytd);

  // Very rough taxable income proxy
  const gross = Math.max(0, incomeW2 + bizProfit);
  const taxableIncome = Math.max(0, gross - k401Ytd);

  // Simple federal estimate: blended effective rate by income band (placeholder)
  const fedRate = estimateFederalEffectiveRate(taxableIncome, intake.personal.filing_status);
  const federalTax = Math.max(0, taxableIncome * fedRate);

  // Simple state estimate: a few known zero-income-tax states; otherwise flat placeholder rate
  const stateRate = estimateStateEffectiveRate(intake.personal.state);
  const stateTax = Math.max(0, taxableIncome * stateRate);

  const totalTax = Math.max(0, federalTax + stateTax);

  // Return shape expected by downstream engines
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

/**
 * Placeholder effective federal rate curve.
 * This is NOT a bracket calculator — it's just a stable approximation for demo flow.
 */
function estimateFederalEffectiveRate(taxableIncome: number, filingStatus: string): number {
  // Tiny adjustment by filing status (purely heuristic)
  const statusAdj =
    filingStatus === "MARRIED_FILING_JOINTLY" ? -0.01 :
    filingStatus === "HEAD_OF_HOUSEHOLD" ? -0.005 :
    filingStatus === "MARRIED_FILING_SEPARATELY" ? 0.005 :
    0;

  // Piecewise effective rate (very rough)
  let base =
    taxableIncome <= 50_000 ? 0.08 :
    taxableIncome <= 100_000 ? 0.11 :
    taxableIncome <= 200_000 ? 0.16 :
    taxableIncome <= 400_000 ? 0.20 :
    taxableIncome <= 1_000_000 ? 0.26 :
    0.30;

  base += statusAdj;

  // Clamp to sane bounds
  return clamp(base, 0.05, 0.37);
}

/**
 * Placeholder state effective rate:
 * - 0% for a few states with no wage income tax
 * - otherwise a flat estimate (can be refined later)
 */
function estimateStateEffectiveRate(state: string): number {
  const noIncomeTaxStates = new Set([
    "AK", "FL", "NV", "SD", "TN", "TX", "WA", "WY",
  ]);

  if (noIncomeTaxStates.has(state)) return 0;

  // New Hampshire only taxes interest/dividends (wage income tax effectively 0)
  if (state === "NH") return 0;

  // Default flat placeholder
  // (Later: replace with your hybrid_300k model or full brackets)
  return 0.05;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
