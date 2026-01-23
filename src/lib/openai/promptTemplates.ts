// /src/lib/openai/promptTemplates.ts

import type { StrategyId } from "./schema";

/**
 * Prompting contract:
 * - Model is narrative-only.
 * - Deterministic engines already computed all numbers, eligibility, and impacts.
 * - Model must not compute or infer tax math, must not introduce strategies, and must not provide how-to steps.
 * - Model must return JSON ONLY that conforms to /src/lib/openai/schema.ts.
 */

export type AnalysisContextForLLM = {
  // Metadata
  request_id: string;
  created_at_iso: string;

  // Intake (normalized) — keep to facts that help narrative; do not include raw PII beyond what you intend to email.
  taxpayer_profile: {
    filing_status: string; // already normalized upstream
    state: string; // e.g. "CA"
    residency_notes?: string | null;
    entity_type?: string | null; // e.g. "S-Corp", "Partnership", etc.
  };

  // Baseline results (deterministic)
  baseline: {
    federal_tax_total: number;
    state_tax_total: number;
    total_tax: number;
    taxable_income_federal?: number | null;
    taxable_income_state?: number | null;

    // Optional: effective rates if you already compute them deterministically
    effective_tax_rate_total?: number | null;
  };

  // Strategy evaluation (Thread 3 eligibility-only)
  strategy_evaluation: Array<{
    strategy_id: StrategyId;
    status: "ELIGIBLE" | "INELIGIBLE" | "POTENTIAL";
    reasons: string[]; // machine-readable or human-readable, deterministic
    already_in_use?: boolean | null;
  }>;

  // Strategy impacts + revised totals (Thread 4 deterministic)
  impact_summary: {
    apply_potential: boolean;

    revised: {
      federal_tax_total: number;
      state_tax_total: number;
      total_tax: number;
      taxable_income_federal?: number | null;
      taxable_income_state?: number | null;
      effective_tax_rate_total?: number | null;
    };

    // Aggregate deltas (deterministic)
    deltas: {
      total_tax_delta_low: number; // baseline - revised (low estimate)
      total_tax_delta_base: number;
      total_tax_delta_high: number;
    };

    // Per-strategy applied + ranges (deterministic)
    per_strategy: Array<{
      strategy_id: StrategyId;
      applied: boolean;
      status: "ELIGIBLE" | "INELIGIBLE" | "POTENTIAL";
      // Ranges are already computed; model must not compute new ones.
      delta_type: "TAX" | "TAXABLE_INCOME" | "UNKNOWN";
      delta_low?: number | null;
      delta_base?: number | null;
      delta_high?: number | null;
      assumptions: string[]; // deterministic assumptions
      flags?: string[] | null; // caps, data gaps, interactions, etc.
      evaluator_reasons: string[]; // mirror from evaluator for narrative grounding
      already_in_use?: boolean | null;
    }>;
  };

  // Optional: product/firm branding used in CTA/disclaimer tone (safe for email)
  brand?: {
    firm_name?: string | null;
    tone?: "neutral" | "professional" | "friendly";
  };
};

export type OpenAIModelConfig = {
  model: "gpt-4.1" | "gpt-4.1-mini";
  temperature?: number; // default 0.2 recommended for consistency
};

/**
 * Creates the system message with hard guardrails.
 */
export function buildSystemMessage(): string {
  return [
    "You are a narrative summarizer for a tax-planning analysis app.",
    "",
    "NON-NEGOTIABLE RULES:",
    "1) Do NOT calculate tax numbers, rates, or deltas. Use ONLY the numeric values provided in the analysis context.",
    "2) Do NOT determine eligibility. Eligibility and applicability are already computed and provided.",
    "3) Do NOT perform or describe impact math. Impacts are already computed and provided.",
    "4) Do NOT introduce new strategies. You may only discuss strategies present in the provided strategy list.",
    "5) Do NOT provide implementation steps, procedural guidance, or 'how-to' instructions. High-level 'what it is' only.",
    "6) Do NOT provide legal/tax advice. Use disclaimer-safe language.",
    "7) Output MUST be valid JSON only. No markdown, no prose outside JSON.",
    "8) If a detail is missing, say so explicitly in narrative terms rather than guessing.",
  ].join("\n");
}

/**
 * Developer message that defines output shape and style constraints.
 */
export function buildDeveloperMessage(): string {
  return [
    "Return JSON that matches the required schema exactly.",
    "",
    "STYLE GUIDELINES:",
    "- Plain English, concise, client-facing, and non-advisory.",
    "- Refer to baseline vs revised results, but do not compute or restate derived values unless provided.",
    "- For strategies: explain WHY it applies or does not apply using provided reasons, and WHAT it is at a high level.",
    "- For INELIGIBLE or not-applied strategies: explain why, and what it generally is (high level).",
    "- For POTENTIAL strategies: explain what additional info/conditions typically matter (without steps).",
    "",
    "PROHIBITIONS:",
    "- No step-by-step instructions, no 'do X then Y', no forms, no filing instructions.",
    "- No new numbers. No estimates beyond provided low/base/high deltas.",
    "- No new strategies, no external references, no citations, no links.",
    "",
    "DISCRETION:",
    "- If brand.firm_name is provided, you may include it in call_to_action_text. Otherwise keep generic.",
  ].join("\n");
}

/**
 * User message: contains the structured context and explicit response contract.
 * The route should JSON.stringify(context) and pass it into this template.
 */
export function buildUserMessage(context: AnalysisContextForLLM): string {
  const serialized = JSON.stringify(context);

  return [
    "ANALYSIS CONTEXT (authoritative; do not override):",
    serialized,
    "",
    "TASK:",
    "Using ONLY the context above, produce a JSON object with the following fields:",
    "- executive_summary",
    "- baseline_tax_summary",
    "- revised_tax_summary",
    "- strategy_explanations[] (one per provided strategy_id in context, covering applies/not applies)",
    "- disclaimers[]",
    "- call_to_action_text",
    "",
    "ADDITIONAL CONSTRAINTS:",
    "- Do not calculate anything. Do not add new numbers.",
    "- Do not provide how-to steps.",
    "- Do not introduce strategies not in the context.",
    "- Ensure each strategy_explanations[i].strategy_id exactly matches a provided strategy_id.",
    "- Keep disclaimers suitable for both a results page and an email.",
    "",
    "OUTPUT FORMAT:",
    "JSON only. No markdown. No extra keys.",
  ].join("\n");
}

/**
 * Minimal JSON schema hint for models that support structured outputs.
 * (You will still validate with Zod in the route.)
 */
export function buildResponseFormatHint() {
  return {
    type: "json_schema",
    json_schema: {
      name: "OpenAIAnalysisResponse",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          executive_summary: { type: "string" },
          baseline_tax_summary: { type: "string" },
          revised_tax_summary: { type: "string" },
          strategy_explanations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                strategy_id: { type: "string" },
                why_it_applies_or_not: { type: "string" },
                what_it_is: { type: "string" },
              },
              required: ["strategy_id", "why_it_applies_or_not", "what_it_is"],
            },
          },
          disclaimers: { type: "array", items: { type: "string" } },
          call_to_action_text: { type: "string" },
        },
        required: [
          "executive_summary",
          "baseline_tax_summary",
          "revised_tax_summary",
          "strategy_explanations",
          "disclaimers",
          "call_to_action_text",
        ],
      },
    },
  } as const;
}

/**
 * Convenience: build the full message set for Chat Completions style APIs.
 * (The route can adapt to the Responses/Analysis API as needed.)
 */
export function buildMessages(context: AnalysisContextForLLM) {
  return [
    { role: "system" as const, content: buildSystemMessage() },
    { role: "developer" as const, content: buildDeveloperMessage() },
    { role: "user" as const, content: buildUserMessage(context) },
  ];
}
