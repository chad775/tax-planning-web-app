// /src/lib/openai/redaction.ts

/**
 * Redaction is part of API-route orchestration (Thread 5 scope).
 * It prevents unnecessary PII from being sent to OpenAI while keeping
 * deterministic engines untouched.
 *
 * IMPORTANT:
 * - This is not a security boundary—assume server logs and downstream systems
 *   still need proper handling.
 * - Redaction should be conservative: remove fields that are not required for narrative.
 */

export type RedactionMode = "minimal" | "balanced" | "strict";

export type RedactionOptions = {
  mode?: RedactionMode;

  /**
   * If true, replaces removed scalar values with a placeholder string to preserve
   * structure for the model (sometimes helps with narrative coherence).
   * If false, deletes keys where possible.
   */
  preserveShape?: boolean;

  /**
   * Placeholder to use when preserveShape=true.
   */
  placeholder?: string;

  /**
   * Max string length allowed (truncates longer strings). Applies after placeholder logic.
   */
  maxStringLength?: number;

  /**
   * Max array length allowed (truncates longer arrays).
   */
  maxArrayLength?: number;
};

const DEFAULTS: Required<RedactionOptions> = {
  mode: "balanced",
  preserveShape: true,
  placeholder: "[REDACTED]",
  maxStringLength: 500,
  maxArrayLength: 50,
};

/**
 * Heuristics: keys that often contain PII.
 * We redact based on key names in addition to optional explicit paths.
 */
const PII_KEY_PATTERNS: RegExp[] = [
  /name/i,
  /email/i,
  /phone/i,
  /mobile/i,
  /address/i,
  /street/i,
  /city/i,
  /zip/i,
  /postal/i,
  /ssn/i,
  /social/i,
  /dob/i,
  /birth/i,
  /tin/i,
  /ein/i,
  /account/i,
  /routing/i,
  /bank/i,
  /passport/i,
  /license/i,
];

/**
 * Keys that are generally safe and useful for narrative (tax profile + results).
 * This is used in "strict" mode as an allowlist-ish approach to reduce payload.
 * You can extend this list as your normalized intake evolves.
 */
const STRICT_ALLOW_KEYS = new Set<string>([
  // Meta
  "request_id",
  "created_at_iso",

  // Taxpayer profile
  "taxpayer_profile",
  "filing_status",
  "filingStatus",
  "state",
  "entity_type",
  "entityType",
  "residency_notes",
  "residencyNotes",

  // Baseline & revised totals
  "baseline",
  "impact_summary",
  "strategy_evaluation",
  "strategy_evaluations",
  "federal_tax_total",
  "federalTaxTotal",
  "state_tax_total",
  "stateTaxTotal",
  "total_tax",
  "totalTax",
  "taxable_income_federal",
  "taxableIncomeFederal",
  "taxable_income_state",
  "taxableIncomeState",
  "effective_tax_rate_total",
  "effectiveTaxRateTotal",
  "revised",
  "deltas",
  "total_tax_delta_low",
  "totalTaxDeltaLow",
  "total_tax_delta_base",
  "totalTaxDeltaBase",
  "total_tax_delta_high",
  "totalTaxDeltaHigh",

  // Strategies
  "per_strategy",
  "perStrategy",
  "strategy_id",
  "status",
  "applied",
  "delta_type",
  "deltaType",
  "delta_low",
  "deltaLow",
  "delta_base",
  "deltaBase",
  "delta_high",
  "deltaHigh",
  "assumptions",
  "flags",
  "reasons",
  "evaluator_reasons",
  "evaluatorReasons",
  "already_in_use",
  "alreadyInUse",

  // Branding (optional)
  "brand",
  "firm_name",
  "firmName",
  "tone",
]);

/**
 * Redact an analysis context before sending to OpenAI.
 * Call this immediately before building messages.
 */
export function redactForLLM<T>(input: T, options?: RedactionOptions): T {
  const opt = { ...DEFAULTS, ...(options ?? {}) };

  const seen = new WeakMap<object, any>();

  const redactScalar = (v: any): any => {
    if (v == null) return v;
    if (typeof v === "string") {
      const s = v.length > opt.maxStringLength ? v.slice(0, opt.maxStringLength) : v;
      return s;
    }
    return v;
  };

  const shouldRedactKey = (key: string): boolean => {
    // In strict mode, we keep only keys in allow set (plus numeric indices handled elsewhere).
    if (opt.mode === "strict") return !STRICT_ALLOW_KEYS.has(key);
    // In minimal/balanced, redact if key matches PII patterns.
    return PII_KEY_PATTERNS.some((re) => re.test(key));
  };

  const applyRedactionToKey = (obj: any, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return;

    if (opt.preserveShape) {
      obj[key] = opt.placeholder;
    } else {
      delete obj[key];
    }
  };

  const walk = (value: any, keyHint?: string): any => {
    // Primitives
    if (value == null) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return redactScalar(value);
    }

    // Dates, etc.
    if (value instanceof Date) return value.toISOString();

    // Arrays
    if (Array.isArray(value)) {
      const out: any[] = [];
      const capped = value.slice(0, opt.maxArrayLength);
      for (const item of capped) out.push(walk(item));
      return out;
    }

    // Objects
    if (typeof value === "object") {
      if (seen.has(value)) return seen.get(value);

      const out: any = Array.isArray(value) ? [] : {};
      seen.set(value, out);

      for (const [k, v] of Object.entries(value)) {
        // Always keep strategy IDs and status fields (they're non-PII and essential),
        // even if strict allowlist misses a nested key variant.
        const lower = k.toLowerCase();
        const isEssentialStrategyField =
          lower === "strategy_id" || lower === "status" || lower === "applied";

        if (!isEssentialStrategyField && shouldRedactKey(k)) {
          if (opt.preserveShape) {
            out[k] = opt.placeholder;
          }
          // if not preserving shape, omit it
          continue;
        }

        // In strict mode, omit non-allow keys unless essential
        if (opt.mode === "strict" && !isEssentialStrategyField && !STRICT_ALLOW_KEYS.has(k)) {
          if (opt.preserveShape) out[k] = opt.placeholder;
          continue;
        }

        out[k] = walk(v, k);
      }

      // Additional "balanced" redactions: if a keyHint indicates a high-risk subtree, wipe it.
      // Example: intake.raw_client or intake.contact
      if (opt.mode !== "minimal" && keyHint) {
        const hint = keyHint.toLowerCase();
        const riskySubtree =
          hint.includes("contact") ||
          hint.includes("client") ||
          hint.includes("taxpayer") ||
          hint.includes("person");

        if (riskySubtree) {
          // But keep the non-PII taxpayer profile essentials if present.
          // Caller should already be sending a narrowed analysis context; this is a last resort.
          for (const k of Object.keys(out)) {
            const safeKeep =
              k === "filing_status" ||
              k === "filingStatus" ||
              k === "state" ||
              k === "entity_type" ||
              k === "entityType" ||
              k === "residency_notes" ||
              k === "residencyNotes";
            if (!safeKeep) applyRedactionToKey(out, k);
          }
        }
      }

      return out;
    }

    return value;
  };

  return walk(input) as T;
}

/**
 * Convenience: a safe default for LLM context in production.
 * - balanced
 * - preserve shape so prompts stay stable
 */
export function redactForLLMDefault<T>(input: T): T {
  return redactForLLM(input, { mode: "balanced", preserveShape: true });
}
