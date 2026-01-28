// /src/lib/tax/federal.ts
// 2025 Federal baseline engine (deterministic; no strategy/UI; no external deps)

/**
 * Sources for 2025 inflation-adjusted parameters:
 * - Ordinary income tax brackets: IRS Rev. Proc. 2024-40 (as summarized by Tax Foundation)
 * - Long-term capital gains/QD thresholds: widely published summaries (e.g., Forbes Advisor)
 *
 * Notes:
 * - This module computes regular income tax + simplified (nonrefundable) Child Tax Credit (CTC).
 * - Standard deduction only (no itemizing).
 * - No AMT, NIIT, SE tax, ACA credits, EITC, other credits, penalties, or payments.
 * - Preferential rates supported for Qualified Dividends + Net Long-Term Capital Gain via stacking method.
 */

export type FilingStatus2025 = "single" | "mfj" | "mfs" | "hoh" | "qw";

/** Money helpers (keep deterministic; avoid floating drift via consistent rounding). */
function roundToCents(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
}

type Bracket = { upTo: number; rate: number }; // upTo is inclusive upper bound for the bracket
type BracketsByStatus = Record<FilingStatus2025, Bracket[]>;

/**
 * 2025 ordinary income brackets (taxable income after deductions).
 * Rates: 10%, 12%, 22%, 24%, 32%, 35%, 37%.
 */
const ORDINARY_BRACKETS_2025: BracketsByStatus = {
  single: [
    { upTo: 11_925, rate: 0.10 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23_850, rate: 0.10 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  mfs: [
    { upTo: 11_925, rate: 0.10 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 375_800, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17_000, rate: 0.10 },
    { upTo: 64_850, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_500, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  // Qualifying widow(er) uses MFJ brackets
  qw: [
    { upTo: 23_850, rate: 0.10 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
};

/**
 * 2025 standard deduction (baseline).
 * (No additional age/blind amounts; implement elsewhere if needed.)
 */
const STANDARD_DEDUCTION_2025: Record<FilingStatus2025, number> = {
  single: 15_000,
  mfj: 30_000,
  mfs: 15_000,
  hoh: 22_500,
  qw: 30_000,
};

/**
 * 2025 long-term capital gains / qualified dividend thresholds (taxable income thresholds).
 * 0% up to thresh0; 15% up to thresh15; 20% above thresh15.
 */
const LTCG_THRESHOLDS_2025: Record<FilingStatus2025, { zeroUpTo: number; fifteenUpTo: number }> = {
  single: { zeroUpTo: 48_350, fifteenUpTo: 533_400 },
  mfj: { zeroUpTo: 96_700, fifteenUpTo: 600_050 },
  mfs: { zeroUpTo: 48_350, fifteenUpTo: 300_000 },
  hoh: { zeroUpTo: 64_750, fifteenUpTo: 566_700 },
  qw: { zeroUpTo: 96_700, fifteenUpTo: 600_050 }, // same as MFJ
};

/** Simplified CTC (maximum credit; phaseout; nonrefundable application only). */
const CTC_MAX_PER_CHILD_2025 = 2_000;
const CTC_PHASEOUT_START_2025: Record<FilingStatus2025, number> = {
  single: 200_000,
  hoh: 200_000,
  mfs: 200_000,
  mfj: 400_000,
  qw: 400_000,
};
const CTC_PHASEOUT_REDUCTION_PER_1000 = 50;

/**
 * Compute tax on a taxable amount using a bracket table.
 * @param taxable Taxable income for the bracket schedule (>= 0).
 */
export function computeBracketTax(taxable: number, brackets: Bracket[]): number {
  const x = clampMin0(taxable);

  let tax = 0;
  let prevUpper = 0;

  for (const b of brackets) {
    const upper = b.upTo;
    if (x <= prevUpper) break;

    const amtInBracket = Math.min(x, upper) - prevUpper;
    tax += amtInBracket * b.rate;
    prevUpper = upper;
  }

  return roundToCents(tax);
}

export function getStandardDeduction2025(status: FilingStatus2025): number {
  return STANDARD_DEDUCTION_2025[status];
}

export function computeTaxableIncome2025(params: {
  filingStatus: FilingStatus2025;
  agi: number;
}): { standardDeduction: number; taxableIncome: number } {
  const sd = getStandardDeduction2025(params.filingStatus);
  const taxableIncome = clampMin0(params.agi - sd);
  return { standardDeduction: sd, taxableIncome: roundToCents(taxableIncome) };
}

/**
 * Preferential rate tax for Qualified Dividends + Net Long-Term Capital Gain (QD/LTCG)
 * using a simplified stacking approach:
 * - Ordinary taxable income is taxed at ordinary rates.
 * - Preferential income is taxed at 0/15/20 based on total taxable income thresholds.
 *
 * Inputs should already be after deductions (i.e., "taxable" amounts).
 */
export function computeFederalIncomeTax2025(params: {
  filingStatus: FilingStatus2025;

  /** Taxable ordinary income (after deductions). Must exclude QD and net LTCG. */
  taxableOrdinaryIncome: number;

  /** Taxable preferential income: qualified dividends + net long-term capital gain (after deductions). */
  taxablePreferentialIncome: number;
}): {
  ordinaryTax: number;
  preferentialTax: number;
  totalIncomeTaxBeforeCredits: number;
} {
  const status = params.filingStatus;
  const ordinary = clampMin0(params.taxableOrdinaryIncome);
  const pref = clampMin0(params.taxablePreferentialIncome);

  const ordinaryTax = computeBracketTax(ordinary, ORDINARY_BRACKETS_2025[status]);

  const thresholds = LTCG_THRESHOLDS_2025[status];
  const totalTaxable = ordinary + pref;

  const zeroBandCapRemaining = clampMin0(thresholds.zeroUpTo - ordinary);
  const amtAt0 = Math.min(pref, zeroBandCapRemaining);

  const fifteenBandCapRemaining = clampMin0(thresholds.fifteenUpTo - Math.max(ordinary, thresholds.zeroUpTo));
  const amtAt15 = Math.min(clampMin0(pref - amtAt0), fifteenBandCapRemaining);

  const amtAt20 = clampMin0(pref - amtAt0 - amtAt15);

  const prefAllocated = amtAt0 + amtAt15 + amtAt20;
  const prefCapped = prefAllocated > pref ? pref : prefAllocated;

  const preferentialTax = roundToCents(amtAt0 * 0 + amtAt15 * 0.15 + amtAt20 * 0.20);

  const totalIncomeTaxBeforeCredits = roundToCents(ordinaryTax + preferentialTax);

  void totalTaxable;
  void prefCapped;

  return { ordinaryTax, preferentialTax, totalIncomeTaxBeforeCredits };
}

/**
 * Simplified Child Tax Credit (CTC) computation (maximum credit and phaseout).
 * This returns the "available" CTC before nonrefundable limitation.
 */
export function computeSimplifiedCTCAvailable2025(params: {
  filingStatus: FilingStatus2025;
  /** Use AGI as proxy for MAGI unless you maintain MAGI separately. */
  agi: number;
  qualifyingChildrenUnder17: number;
}): number {
  const kids = Math.max(0, Math.floor(params.qualifyingChildrenUnder17));
  const maxCredit = kids * CTC_MAX_PER_CHILD_2025;

  const phaseoutStart = CTC_PHASEOUT_START_2025[params.filingStatus];
  const over = params.agi - phaseoutStart;

  if (over <= 0) return maxCredit;

  const increments = Math.ceil(over / 1_000);
  const reduction = increments * CTC_PHASEOUT_REDUCTION_PER_1000;

  return clampMin0(maxCredit - reduction);
}

/**
 * Apply simplified (nonrefundable) CTC against regular income tax.
 */
export function applyNonrefundableCTC(params: {
  incomeTaxBeforeCredits: number;
  ctcAvailable: number;
}): { ctcUsedNonrefundable: number; incomeTaxAfterCTC: number; ctcUnused: number } {
  const tax = clampMin0(params.incomeTaxBeforeCredits);
  const credit = clampMin0(params.ctcAvailable);

  const used = Math.min(tax, credit);
  const after = tax - used;
  const unused = credit - used;

  return {
    ctcUsedNonrefundable: roundToCents(used),
    incomeTaxAfterCTC: roundToCents(after),
    ctcUnused: roundToCents(unused),
  };
}

/**
 * Convenience: Full baseline federal computation from AGI and taxable splits.
 * - Computes taxable income via standard deduction
 * - Taxes ordinary vs preferential
 * - Applies simplified nonrefundable CTC
 *
 * Caller responsibilities:
 * - Ensure taxableOrdinaryIncome + taxablePreferentialIncome == taxableIncome (or close).
 * - Ensure AGI is correct and consistent with taxable components.
 */
export function computeFederalBaseline2025(params: {
  filingStatus: FilingStatus2025;
  agi: number;

  /** Components BEFORE deduction; used only for caller convenience if you prefer. */
  taxableOrdinaryIncomeAfterDeduction: number;
  taxablePreferentialIncomeAfterDeduction: number;

  qualifyingChildrenUnder17: number;
}): {
  standardDeduction: number;
  taxableIncome: number;

  ordinaryTax: number;
  preferentialTax: number;
  incomeTaxBeforeCredits: number;

  ctcAvailable: number;
  ctcUsedNonrefundable: number;
  incomeTaxAfterCTC: number;
  ctcUnused: number;
} {
  const { standardDeduction, taxableIncome } = computeTaxableIncome2025({
    filingStatus: params.filingStatus,
    agi: params.agi,
  });

  const taxes = computeFederalIncomeTax2025({
    filingStatus: params.filingStatus,
    taxableOrdinaryIncome: params.taxableOrdinaryIncomeAfterDeduction,
    taxablePreferentialIncome: params.taxablePreferentialIncomeAfterDeduction,
  });

  const ctcAvailable = computeSimplifiedCTCAvailable2025({
    filingStatus: params.filingStatus,
    agi: params.agi,
    qualifyingChildrenUnder17: params.qualifyingChildrenUnder17,
  });

  const ctcApplied = applyNonrefundableCTC({
    incomeTaxBeforeCredits: taxes.totalIncomeTaxBeforeCredits,
    ctcAvailable,
  });

  return {
    standardDeduction,
    taxableIncome,

    ordinaryTax: taxes.ordinaryTax,
    preferentialTax: taxes.preferentialTax,
    incomeTaxBeforeCredits: taxes.totalIncomeTaxBeforeCredits,

    ctcAvailable: roundToCents(ctcAvailable),
    ctcUsedNonrefundable: ctcApplied.ctcUsedNonrefundable,
    incomeTaxAfterCTC: ctcApplied.incomeTaxAfterCTC,
    ctcUnused: ctcApplied.ctcUnused,
  };
}

/**
 * NEW: Simplified federal tax from taxable income (ordinary only).
 * Used to re-tax revised totals when we only have taxable income deltas.
 */
export function computeFederalTaxFromTaxableIncome2025(params: {
  filingStatus: FilingStatus2025;
  taxableIncome: number;
}): number {
  const ordinary = clampMin0(params.taxableIncome);
  return computeBracketTax(ordinary, ORDINARY_BRACKETS_2025[params.filingStatus]);
}
