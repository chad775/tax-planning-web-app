// /src/lib/tax/state.ts
/**
 * 2025 State income tax engine (deterministic; no UI; no strategy logic).
 *
 * Hybrid estimate method for bracketed states:
 * - If taxableBase <= 300k: taxableBase * rateAt300k
 * - If taxableBase > 300k: 300k * rateAt300k + (taxableBase - 300k) * topRate
 *
 * Output includes explicit "estimate" language for hybrid states.
 */

import {
  STATE_RATES_2025,
  STATE_TAX_ESTIMATE_DISCLOSURE_2025,
  type StateCode,
  type StateFilingStatus2025,
  type StateRateStructure,
  asStateCode,
} from "./stateTables";

/** Minimal inputs required for state baseline per Stage 1 scope. */
export type StateTaxInput2025 = {
  taxYear: 2025;
  state: StateCode;
  filingStatus: StateFilingStatus2025;

  /**
   * Taxable base for state tax.
   * Stage 1 does not define a state-specific base, so the caller chooses the simplification
   * (e.g., federal taxable income or AGI approximation).
   */
  taxableBase: number;
};

export type StateTaxOutput2025 = {
  state: StateCode;
  filingStatus: StateFilingStatus2025;
  taxableBase: number;
  stateIncomeTax: number;
  method: "none" | "flat" | "hybrid_300k_estimate";
  notes?: string[];
};

function roundToCents(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
}

export function computeStateIncomeTax2025(input: StateTaxInput2025): StateTaxOutput2025 {
  if (input.taxYear !== 2025) {
    throw new Error(`Unsupported taxYear ${input.taxYear}. This engine supports 2025 only.`);
  }

  const base = roundToCents(clampMin0(Number(input.taxableBase) || 0));
  const spec: StateRateStructure = STATE_RATES_2025[input.state];

  if (spec.kind === "none") {
    const notes = spec.note ? [spec.note] : null;

    return {
      state: input.state,
      filingStatus: input.filingStatus,
      taxableBase: base,
      stateIncomeTax: 0,
      method: "none",
      ...(notes ? { notes } : {}),
    };
  }

  if (spec.kind === "flat") {
    const tax = roundToCents(base * spec.rate);
    const notesArr: string[] = [];
    if (spec.note) notesArr.push(spec.note);

    return {
      state: input.state,
      filingStatus: input.filingStatus,
      taxableBase: base,
      stateIncomeTax: tax,
      method: "flat",
      ...(notesArr.length ? { notes: notesArr } : {}),
    };
  }

  // Hybrid estimate for bracket states
  const T = spec.threshold; // 300,000
  const rAt = spec.rateAt300k[input.filingStatus];
  const rTop = spec.topRate[input.filingStatus];

  const tax = base <= T ? base * rAt : T * rAt + (base - T) * rTop;

  const notes: string[] = [STATE_TAX_ESTIMATE_DISCLOSURE_2025];
  if (spec.note) notes.push(spec.note);

  return {
    state: input.state,
    filingStatus: input.filingStatus,
    taxableBase: base,
    stateIncomeTax: roundToCents(tax),
    method: "hybrid_300k_estimate",
    notes,
  };
}

export function computeStateIncomeTaxFromString2025(params: {
  taxYear: 2025;
  state: string;
  filingStatus: StateFilingStatus2025;
  taxableBase: number;
}): StateTaxOutput2025 {
  const code = asStateCode(params.state);
  if (!code) {
    throw new Error(`Invalid state code "${params.state}". Expected 2-letter USPS code or DC.`);
  }
  return computeStateIncomeTax2025({
    taxYear: params.taxYear,
    state: code,
    filingStatus: params.filingStatus,
    taxableBase: params.taxableBase,
  });
}
