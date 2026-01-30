// src/lib/tax/payroll/payroll2025.ts
import "server-only";

import type { NormalizedIntake2025 } from "../../../contracts/intake";

/**
 * 2025 Social Security wage base
 */
const SS_WAGE_BASE_2025 = 176100;

/**
 * Social Security tax rate (employee + employer)
 */
const SS_RATE = 0.124; // 12.4%

/**
 * Medicare tax rate (employee + employer)
 */
const MEDICARE_RATE = 0.029; // 2.9%

/**
 * Additional Medicare tax rate
 */
const ADDITIONAL_MEDICARE_RATE = 0.009; // 0.9%

/**
 * Self-employment earnings factor (92.35% of net profit)
 */
const SE_EARNINGS_FACTOR = 0.9235;

/**
 * Additional Medicare tax thresholds by filing status
 */
const ADDITIONAL_MEDICARE_THRESHOLDS: Record<
  NormalizedIntake2025["personal"]["filing_status"],
  number
> = {
  SINGLE: 200000,
  MARRIED_FILING_JOINTLY: 250000,
  MARRIED_FILING_SEPARATELY: 125000,
  HEAD_OF_HOUSEHOLD: 200000,
};

export interface PayrollTaxResult {
  payrollTaxTotal: number;
  components: {
    selfEmploymentTax?: number;
    ficaTaxOnWages?: number;
    additionalMedicareTax?: number;
    ssWageBaseUsed?: number;
  };
  adjustments: {
    halfSelfEmploymentTaxDeduction?: number;
  };
}

/**
 * Compute payroll taxes for tax year 2025.
 * 
 * Handles:
 * - Self-employment tax for SOLE_PROP, PARTNERSHIP, LLC
 * - FICA tax on W-2 wages (if any)
 * - Additional Medicare tax on high earners
 * 
 * @param intake Normalized intake data
 * @param context Context including tax year and optional baseline taxable income
 */
export function computePayrollTaxes2025(
  intake: NormalizedIntake2025,
  context: { taxYear: 2025; baselineTaxableIncome?: number },
): PayrollTaxResult {
  const w2Wages = Math.max(0, intake.personal.income_excl_business ?? 0);
  const biz = intake.business;
  const netProfit = biz.has_business ? Math.max(0, biz.net_profit ?? 0) : 0;
  const entityType = biz.entity_type;

  // Determine self-employment income base
  let seIncomeBase = 0;
  if (
    biz.has_business &&
    (entityType === "SOLE_PROP" || entityType === "PARTNERSHIP" || entityType === "LLC")
  ) {
    // Self-employment earnings = 92.35% of net profit
    seIncomeBase = netProfit * SE_EARNINGS_FACTOR;
  }

  // Calculate Social Security tax
  const ssWageBaseUsed = Math.min(w2Wages, SS_WAGE_BASE_2025);
  const ssRemainingBase = Math.max(0, SS_WAGE_BASE_2025 - ssWageBaseUsed);
  const ssSeBase = Math.min(seIncomeBase, ssRemainingBase);
  const ssTaxOnWages = ssWageBaseUsed * SS_RATE;
  const ssTaxOnSe = ssSeBase * SS_RATE;

  // Calculate Medicare tax (no cap)
  const medicareTaxOnWages = w2Wages * MEDICARE_RATE;
  const medicareTaxOnSe = seIncomeBase * MEDICARE_RATE;

  // Calculate Additional Medicare tax
  const filingStatus = intake.personal.filing_status;
  const threshold = ADDITIONAL_MEDICARE_THRESHOLDS[filingStatus];
  const totalWagesAndSe = w2Wages + seIncomeBase;
  const excessOverThreshold = Math.max(0, totalWagesAndSe - threshold);
  const additionalMedicareTax = excessOverThreshold * ADDITIONAL_MEDICARE_RATE;

  // Self-employment tax = SS + Medicare on SE income
  const selfEmploymentTax = ssTaxOnSe + medicareTaxOnSe;

  // FICA tax on wages = SS + Medicare on W-2 wages
  const ficaTaxOnWages = ssTaxOnWages + medicareTaxOnWages;

  // Total payroll tax
  const payrollTaxTotal =
    selfEmploymentTax + ficaTaxOnWages + additionalMedicareTax;

  // Half of self-employment tax is deductible (above-the-line adjustment)
  const halfSelfEmploymentTaxDeduction = selfEmploymentTax > 0 ? selfEmploymentTax * 0.5 : undefined;

  const components: PayrollTaxResult["components"] = {};
  if (selfEmploymentTax > 0) {
    components.selfEmploymentTax = Math.round(selfEmploymentTax * 100) / 100;
  }
  if (ficaTaxOnWages > 0) {
    components.ficaTaxOnWages = Math.round(ficaTaxOnWages * 100) / 100;
  }
  if (additionalMedicareTax > 0) {
    components.additionalMedicareTax = Math.round(additionalMedicareTax * 100) / 100;
  }
  if (ssWageBaseUsed > 0) {
    components.ssWageBaseUsed = Math.round(ssWageBaseUsed * 100) / 100;
  }

  const adjustments: PayrollTaxResult["adjustments"] = {};
  if (halfSelfEmploymentTaxDeduction) {
    adjustments.halfSelfEmploymentTaxDeduction = Math.round(halfSelfEmploymentTaxDeduction * 100) / 100;
  }

  return {
    payrollTaxTotal: Math.round(payrollTaxTotal * 100) / 100, // Round to cents
    components,
    adjustments,
  };
}
