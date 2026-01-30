// src/lib/strategies/strategyCatalog.ts
import type { StrategyId } from "./impactTypes";

export type StrategyTier = 1 | 2 | 3;
export type CombineMode = "stack" | "solo";

export type StrategyMeta = {
  id: StrategyId;
  tier: StrategyTier;
  autoApplyWhenEligible: boolean; // tier 1 true; tier 2 true (if gate met); tier 3 false
  combineMode: CombineMode; // tier 3 = "solo"
  minBaselineTaxableIncome?: number; // income gate (tier 2 or 3 if you want)
  uiLabel: string;
  uiSummary: string; // Plain English 1-2 sentence summary for prospects
  displayOrder: number;
};

// TODO: Review and refine uiSummary text for all strategies below
export const STRATEGY_CATALOG: Record<StrategyId, StrategyMeta> = {
  augusta_loophole: {
    id: "augusta_loophole",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "Augusta Rule",
    uiSummary: "Rent your home to your business for legitimate business use, allowing you to deduct rental expenses and reduce taxable income.",
    displayOrder: 10,
  },
  medical_reimbursement: {
    id: "medical_reimbursement",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "Medical Reimbursement Plan",
    uiSummary: "Set up a plan where your business reimburses you for medical expenses, reducing your taxable income while covering healthcare costs.",
    displayOrder: 20,
  },
  k401: {
    id: "k401",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "401(k) Employee Deferral",
    uiSummary: "Contribute pre-tax money to your 401(k) retirement plan, reducing your taxable income now while saving for retirement.",
    displayOrder: 30,
  },

  hiring_children: {
    id: "hiring_children",
    tier: 2,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    minBaselineTaxableIncome: 250_000,
    uiLabel: "Hiring Children",
    uiSummary: "Hire your children to work in your business, shifting income to lower tax brackets while teaching them valuable work skills.",
    displayOrder: 40,
  },
  cash_balance_plan: {
    id: "cash_balance_plan",
    tier: 2,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    minBaselineTaxableIncome: 300_000,
    uiLabel: "Cash Balance Plan",
    uiSummary: "Set up a retirement plan that allows larger contributions than a 401(k), reducing taxable income significantly for business owners.",
    displayOrder: 50,
  },

  // Tier 3: solo what-if
  short_term_rental: {
    id: "short_term_rental",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    uiLabel: "Short-Term Rental + Cost Segregation",
    uiSummary: "Use cost segregation on rental property to accelerate depreciation deductions, reducing taxable income in early years.",
    displayOrder: 80,
  },
  leveraged_charitable: {
    id: "leveraged_charitable",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 833_000,
    uiLabel: "Leveraged Charitable",
    uiSummary: "Use charitable giving strategies that provide tax benefits while supporting causes you care about.",
    displayOrder: 90,
  },
  rtu_program: {
    id: "rtu_program",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 350_000,
    uiLabel: "RTU Program",
    uiSummary: "Qualify as a real estate professional to unlock additional tax benefits from rental property activities.",
    displayOrder: 95,
  },
  film_credits: {
    id: "film_credits",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 500_000,
    uiLabel: "Film Credits",
    uiSummary: "Invest in film production to access state tax credits that can reduce your overall tax liability.",
    displayOrder: 100,
  },
  s_corp_conversion: {
    id: "s_corp_conversion",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    uiLabel: "S-Corp Conversion",
    uiSummary: "Convert your business to an S-Corporation to reduce self-employment taxes by paying yourself a reasonable salary and taking the rest as distributions.",
    displayOrder: 85,
  },
};
