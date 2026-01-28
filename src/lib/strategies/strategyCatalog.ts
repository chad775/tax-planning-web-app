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
  displayOrder: number;
};

export const STRATEGY_CATALOG: Record<StrategyId, StrategyMeta> = {
  augusta_loophole: {
    id: "augusta_loophole",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "Augusta Rule",
    displayOrder: 10,
  },
  medical_reimbursement: {
    id: "medical_reimbursement",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "Medical Reimbursement Plan",
    displayOrder: 20,
  },
  k401: {
    id: "k401",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "401(k) Employee Deferral",
    displayOrder: 30,
  },

  hiring_children: {
    id: "hiring_children",
    tier: 2,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    // choose your threshold
    minBaselineTaxableIncome: 250_000,
    uiLabel: "Hiring Children",
    displayOrder: 40,
  },
  cash_balance_plan: {
    id: "cash_balance_plan",
    tier: 2,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    minBaselineTaxableIncome: 300_000,
    uiLabel: "Cash Balance Plan",
    displayOrder: 50,
  },

  // Tier 3: solo what-if
  short_term_rental: {
    id: "short_term_rental",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    uiLabel: "Short-Term Rental + Cost Segregation",
    displayOrder: 80,
  },
  leveraged_charitable: {
    id: "leveraged_charitable",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 833_000,
    uiLabel: "Leveraged Charitable",
    displayOrder: 90,
  },
  rtu_program: {
    id: "rtu_program",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 350_000,
    uiLabel: "RTU Program",
    displayOrder: 95,
  },
  film_credits: {
    id: "film_credits",
    tier: 3,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 500_000,
    uiLabel: "Film Credits",
    displayOrder: 100,
  },
};
