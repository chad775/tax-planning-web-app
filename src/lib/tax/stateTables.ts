// /src/lib/tax/stateTables.ts
/**
 * 2025 State individual income tax metadata (no local taxes).
 *
 * HYBRID ESTIMATE MODEL (for high-income focus):
 * - For bracketed/progressive states, we store:
 *   - rateAt300k: assumed marginal rate at $300,000 taxable base
 *   - topRate: top marginal rate
 * - Deterministic computation (implemented in state.ts):
 *   - if base <= 300k: base * rateAt300k
 *   - else: 300k*rateAt300k + (base-300k)*topRate
 *
 * DISCLOSURE:
 * - This is an ESTIMATE for progressive states (not a full bracket computation).
 * - It does not model state-specific taxable income definitions, deductions, exemptions, credits,
 *   recapture, special surcharges, or local taxes.
 *
 * DATA POLICY (current stage):
 * - For progressive states, default to rateAt300k = topRate as a conservative estimate unless/until
 *   you choose to refine specific states by filing status.
 */

export type StateCode =
  | "AL"
  | "AK"
  | "AZ"
  | "AR"
  | "CA"
  | "CO"
  | "CT"
  | "DE"
  | "FL"
  | "GA"
  | "HI"
  | "ID"
  | "IL"
  | "IN"
  | "IA"
  | "KS"
  | "KY"
  | "LA"
  | "ME"
  | "MD"
  | "MA"
  | "MI"
  | "MN"
  | "MS"
  | "MO"
  | "MT"
  | "NE"
  | "NV"
  | "NH"
  | "NJ"
  | "NM"
  | "NY"
  | "NC"
  | "ND"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VT"
  | "VA"
  | "WA"
  | "WV"
  | "WI"
  | "WY"
  | "DC";

export type StateFilingStatus2025 = "single" | "mfj" | "mfs" | "hoh";

export type StateRateStructure =
  | { kind: "none"; note?: string }
  | { kind: "flat"; rate: number; note?: string }
  | {
      kind: "hybrid_300k";
      threshold: 300_000;
      rateAt300k: Record<StateFilingStatus2025, number>;
      topRate: Record<StateFilingStatus2025, number>;
      note?: string;
    };

export type StateRateTable = Record<StateCode, StateRateStructure>;

export const STATE_TAX_ESTIMATE_DISCLOSURE_2025 =
  "State tax is an estimate for progressive states. Hybrid method: tax up to $300k at an assumed marginal rate at $300k, then tax above $300k at the top marginal rate. This does not model state-specific income definitions, deductions, exemptions, credits, surcharges, or local taxes.";

function byStatusAll(rate: number): Record<StateFilingStatus2025, number> {
  return { single: rate, mfj: rate, mfs: rate, hoh: rate };
}

function hybrid(topRate: number, note?: string): StateRateStructure {
  return {
    kind: "hybrid_300k",
    threshold: 300_000,
    rateAt300k: byStatusAll(topRate), // conservative default for launch
    topRate: byStatusAll(topRate),
    ...(note ? { note } : {}),
  };
}

/**
 * 2025 state structures (all 50 + DC).
 *
 * NOTE:
 * - "hybrid_300k" is used for progressive states.
 * - "flat" is used for flat-rate states.
 * - "none" is used for no broad wage income tax states (and cases not modeled).
 */
export const STATE_RATES_2025: StateRateTable = {
  // Progressive / bracketed (hybrid estimate)
  AL: hybrid(0.05),
  AR: hybrid(0.039),
  CA: hybrid(0.133, "CA is progressive; this uses top rate for both segments as a conservative estimate."),
  CT: hybrid(0.0699),
  DE: hybrid(0.066),
  GA: { kind: "flat", rate: 0.0539 }, // treated flat per current rules; adjust if you later model brackets
  HI: hybrid(0.11),
  IA: { kind: "flat", rate: 0.038 }, // treated flat per current rules; adjust if you later model brackets
  KS: hybrid(0.0558),
  ME: hybrid(0.0715),
  MD: hybrid(0.0575, "Maryland has local income taxes (not modeled). This is state-only."),
  MA: hybrid(0.09, "Includes high-income surtax conceptually; modeled here as top rate estimate."),
  MN: hybrid(0.0985),
  MO: hybrid(0.047),
  MT: hybrid(0.059),
  NE: hybrid(0.052),
  NJ: hybrid(0.1075),
  NM: hybrid(0.059),
  NY: hybrid(0.109, "New York City local tax not modeled. This is NYS-only."),
  ND: hybrid(0.025),
  OH: hybrid(0.035),
  OK: hybrid(0.0475),
  OR: hybrid(0.099),
  RI: hybrid(0.0599),
  SC: hybrid(0.062),
  VT: hybrid(0.0875),
  VA: hybrid(0.0575),
  WV: hybrid(0.0482),
  WI: hybrid(0.0765),
  DC: hybrid(0.1075),

  // Flat-rate states
  AZ: { kind: "flat", rate: 0.025 },
  CO: { kind: "flat", rate: 0.044 },
  ID: { kind: "flat", rate: 0.05695 },
  IL: { kind: "flat", rate: 0.0495 },
  IN: { kind: "flat", rate: 0.03 },
  KY: { kind: "flat", rate: 0.04 },
  LA: { kind: "flat", rate: 0.03 },
  MI: { kind: "flat", rate: 0.0425 },
  MS: { kind: "flat", rate: 0.044, note: "Simplified as flat for baseline estimate." },
  NC: { kind: "flat", rate: 0.0425 },
  PA: { kind: "flat", rate: 0.0307 },
  UT: { kind: "flat", rate: 0.0455 },

  // No broad wage income tax (or not modeled)
  AK: { kind: "none" },
  FL: { kind: "none" },
  NV: { kind: "none" },
  NH: { kind: "none", note: "No wage income tax (interest/dividends not modeled)." },
  SD: { kind: "none" },
  TN: { kind: "none" },
  TX: { kind: "none" },
  WA: { kind: "none", note: "No wage income tax (capital gains tax not modeled)." },
  WY: { kind: "none" },
};

/**
 * Normalize arbitrary state strings to StateCode where possible.
 * Returns null if not supported.
 */
export function asStateCode(state: string): StateCode | null {
  const s = (state || "").trim().toUpperCase();
  return (s.length === 2 || s === "DC") && (s as StateCode) in STATE_RATES_2025
    ? (s as StateCode)
    : null;
}
