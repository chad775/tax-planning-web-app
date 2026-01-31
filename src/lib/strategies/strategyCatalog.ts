// src/lib/strategies/strategyCatalog.ts
import type { StrategyId } from "./impactTypes";

export type StrategyTier = 1 | 2;
export type CombineMode = "stack" | "solo";

export type StrategyMeta = {
  id: StrategyId;
  tier: StrategyTier;
  autoApplyWhenEligible: boolean; // tier 1 true; tier 2 false (what-if only)
  combineMode: CombineMode; // tier 1 = "stack"; tier 2 = "solo"
  minBaselineTaxableIncome?: number; // income gate (for tier 2 what-if strategies)
  uiLabel: string;
  uiSummary: string; // Plain English 1-2 sentence summary for prospects (deprecated, use uiDescription)
  // Structured client-facing description
  uiDescription?: {
    heading: string; // "{Strategy Name} — {Advisor framing sentence}"
    whatThisStrategyIs: string;
    howItLowersTaxes: string;
    whoThisUsuallyWorksBestFor: string;
    whyThisMayNeedConfirmationOrPlanning: string;
    typicalEffortOrCostToImplement: string;
  };
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
    uiDescription: {
      heading: "Augusta Rule (Home Rental to Your Business) — We're shifting some business profit to you personally in a way the tax rules allow—without adding personal tax.",
      whatThisStrategyIs: "This strategy allows you to rent your personal home to your business for meetings or planning sessions. Your business pays you rent, but you don't report that rent as personal income when done correctly.",
      howItLowersTaxes: "Your business deducts the rent as a business expense, which lowers business income. At the same time, you receive the money personally without it being taxed.",
      whoThisUsuallyWorksBestFor: "Business owners who own a home and regularly hold meetings, planning days, or retreats.",
      whyThisMayNeedConfirmationOrPlanning: "The rent must be reasonable, the meetings must be real, and documentation matters. This only works for a limited number of days per year.",
      typicalEffortOrCostToImplement: "Low. Mostly planning, documentation, and guidance from your CPA.",
    },
    displayOrder: 10,
  },
  medical_reimbursement: {
    id: "medical_reimbursement",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "Medical Reimbursement Plan",
    uiSummary: "Set up a plan where your business reimburses you for medical expenses, reducing your taxable income while covering healthcare costs.",
    uiDescription: {
      heading: "Medical Expense Reimbursement Plan — We're turning personal medical costs into a business deduction.",
      whatThisStrategyIs: "This is a business-sponsored plan that allows your company to reimburse medical expenses for you and your family. The reimbursements are tied to your role as a business owner or employee.",
      howItLowersTaxes: "Your business deducts the medical expenses, reducing taxable income. You receive the benefit without treating it as taxable pay.",
      whoThisUsuallyWorksBestFor: "Business owners with consistent medical, dental, or prescription expenses.",
      whyThisMayNeedConfirmationOrPlanning: "The plan must be set up correctly and follow specific rules. Not all business structures qualify.",
      typicalEffortOrCostToImplement: "Moderate. Requires plan setup and ongoing administration.",
    },
    displayOrder: 20,
  },
  k401: {
    id: "k401",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "401(k) Employee Deferral",
    uiSummary: "Contribute pre-tax money to your 401(k) retirement plan, reducing your taxable income now while saving for retirement.",
    uiDescription: {
      heading: "Solo / Employee 401(k) Contributions — This lets you shelter income from taxes while keeping the money for yourself long term.",
      whatThisStrategyIs: "This is a retirement plan for business owners that allows both employee-style and business-style contributions. It's designed for small businesses with few or no employees.",
      howItLowersTaxes: "Money you contribute reduces taxable income today while building long-term retirement savings.",
      whoThisUsuallyWorksBestFor: "Self-employed individuals or business owners with strong cash flow and no full-time employees.",
      whyThisMayNeedConfirmationOrPlanning: "Contribution limits depend on income and business structure. Timing and setup matter.",
      typicalEffortOrCostToImplement: "Low to moderate. Setup is straightforward, ongoing costs are usually minimal.",
    },
    displayOrder: 30,
  },

  hiring_children: {
    id: "hiring_children",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "Hiring Children",
    uiSummary: "Hire your children to work in your business, shifting income to lower tax brackets while teaching them valuable work skills.",
    uiDescription: {
      heading: "Hiring Your Children — This lets you move income from a high tax bracket to a much lower one—inside your own family.",
      whatThisStrategyIs: "Your business hires your children to perform legitimate work, such as admin help, cleaning, marketing, or tech support. They are paid a reasonable wage for their age and role.",
      howItLowersTaxes: "Your business deducts the wages, lowering taxable income. Your child often pays little to no tax on the income due to standard deductions.",
      whoThisUsuallyWorksBestFor: "Business owners with children who can reasonably perform real work for the business.",
      whyThisMayNeedConfirmationOrPlanning: "The work must be legitimate, pay must be reasonable, and payroll needs to be set up correctly.",
      typicalEffortOrCostToImplement: "Low to moderate. Payroll setup and basic recordkeeping.",
    },
    displayOrder: 40,
  },
  cash_balance_plan: {
    id: "cash_balance_plan",
    tier: 2,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    uiLabel: "Cash Balance Plan",
    uiSummary: "Set up a retirement plan that allows larger contributions than a 401(k), reducing taxable income significantly for business owners.",
    uiDescription: {
      heading: "Cash Balance Pension Plan — This is one of the strongest tools we have when income is high and consistent.",
      whatThisStrategyIs: "This is a powerful retirement plan that allows much larger contributions than a 401(k). It's often paired with a 401(k) for maximum impact.",
      howItLowersTaxes: "Large contributions significantly reduce taxable income while building retirement assets.",
      whoThisUsuallyWorksBestFor: "High-income business owners with stable profits who want to save aggressively for retirement.",
      whyThisMayNeedConfirmationOrPlanning: "These plans require long-term commitment, steady income, and professional administration.",
      typicalEffortOrCostToImplement: "High. Actuarial setup and annual administration are required.",
    },
    displayOrder: 50,
  },
  short_term_rental: {
    id: "short_term_rental",
    tier: 2,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    uiLabel: "Short-Term Rental + Cost Segregation",
    uiSummary: "Use cost segregation on rental property to accelerate depreciation deductions, reducing taxable income in early years.",
    uiDescription: {
      heading: "Short-Term Rental Cost Segregation — This front-loads deductions on real estate to offset high income years.",
      whatThisStrategyIs: "This involves purchasing or owning a short-term rental property and accelerating deductions tied to the property's components.",
      howItLowersTaxes: "A large portion of the property's value may be deducted sooner, reducing taxable income early on.",
      whoThisUsuallyWorksBestFor: "High-income taxpayers who own or plan to own short-term rental property and actively participate.",
      whyThisMayNeedConfirmationOrPlanning: "Participation rules, rental activity, and timing are critical for eligibility.",
      typicalEffortOrCostToImplement: "Moderate to high. Engineering studies and tax planning are required.",
    },
    displayOrder: 80,
  },
  leveraged_charitable: {
    id: "leveraged_charitable",
    tier: 2,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 833_000,
    uiLabel: "Leveraged Charitable",
    uiSummary: "Use charitable giving strategies that provide tax benefits while supporting causes you care about.",
    uiDescription: {
      heading: "Leveraged Charitable Giving — This amplifies the tax impact of charitable dollars—but only makes sense if giving is already a goal.",
      whatThisStrategyIs: "This approach combines charitable intent with structured giving strategies that increase the tax impact of each dollar donated.",
      howItLowersTaxes: "You may receive a larger tax benefit upfront while spreading out the actual cash commitment over time.",
      whoThisUsuallyWorksBestFor: "High-income individuals who are already charitably inclined.",
      whyThisMayNeedConfirmationOrPlanning: "These strategies are complex, scrutinized, and must be structured carefully.",
      typicalEffortOrCostToImplement: "High. Legal, tax, and administrative coordination is required.",
    },
    displayOrder: 90,
  },
  rtu_program: {
    id: "rtu_program",
    tier: 2,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 350_000,
    uiLabel: "RTU Program",
    uiSummary: "Qualify as a real estate professional to unlock additional tax benefits from rental property activities.",
    uiDescription: {
      heading: "RTU Program (Right-to-Use Software Investment) — This is a high-impact strategy that pairs a large upfront deduction with an income-producing asset—but it's not for everyone.",
      whatThisStrategyIs: "This is an investment in business-use software where you acquire usage rights and lease those rights back for ongoing income. The structure combines business ownership, financing, and software use.",
      howItLowersTaxes: "A large portion of the investment may be deductible upfront, reducing taxable income, while the software generates ongoing payments over time.",
      whoThisUsuallyWorksBestFor: "High-income individuals who can absorb large deductions and are comfortable with structured investments.",
      whyThisMayNeedConfirmationOrPlanning: "These programs are complex, require proper participation and documentation, and should be reviewed carefully before investing.",
      typicalEffortOrCostToImplement: "High. Significant upfront investment and professional review required.",
    },
    displayOrder: 95,
  },
  film_credits: {
    id: "film_credits",
    tier: 2,
    autoApplyWhenEligible: false,
    combineMode: "solo",
    minBaselineTaxableIncome: 500_000,
    uiLabel: "Film Equity",
    uiSummary: "Invest in film production to access state tax credits that can reduce your overall tax liability.",
    uiDescription: {
      heading: "Film Tax Credit Programs — This reduces taxes dollar-for-dollar, but it requires the right project and careful timing.",
      whatThisStrategyIs: "This involves investing in film or media productions that qualify for state tax credits.",
      howItLowersTaxes: "Credits reduce taxes owed directly, rather than just lowering taxable income.",
      whoThisUsuallyWorksBestFor: "High-income taxpayers with state tax exposure and tolerance for investment risk.",
      whyThisMayNeedConfirmationOrPlanning: "Availability depends on state rules, project timing, and funding structure.",
      typicalEffortOrCostToImplement: "High. Legal review, project vetting, and timing coordination required.",
    },
    displayOrder: 100,
  },
  s_corp_conversion: {
    id: "s_corp_conversion",
    tier: 1,
    autoApplyWhenEligible: true,
    combineMode: "stack",
    uiLabel: "S-Corp Conversion",
    uiSummary: "Convert your business to an S-Corporation to reduce self-employment taxes by paying yourself a reasonable salary and taking the rest as distributions.",
    uiDescription: {
      heading: "S-Corporation Conversion — We're changing how your income is classified so less of it gets hit with payroll taxes.",
      whatThisStrategyIs: "This involves changing how your business is taxed so part of your income is paid as salary and part as distributions.",
      howItLowersTaxes: "Only the salary portion is subject to certain payroll taxes, which can reduce overall tax owed.",
      whoThisUsuallyWorksBestFor: "Business owners with consistent profits, typically above a certain income threshold.",
      whyThisMayNeedConfirmationOrPlanning: "Salary must be reasonable, and not every business qualifies or benefits equally.",
      typicalEffortOrCostToImplement: "Moderate. Requires entity setup, payroll, and ongoing compliance.",
    },
    displayOrder: 60,
  },
};
