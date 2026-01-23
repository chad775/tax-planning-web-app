// /src/lib/openai/__tests__/promptTemplates.test.ts
import { describe, it, expect } from "vitest";

import {
  buildSystemMessage,
  buildDeveloperMessage,
  buildUserMessage,
  buildResponseFormatHint,
  type AnalysisContextForLLM,
} from "../promptTemplates";

/**
 * Prompt contract tests:
 * - Prevent accidental drift that weakens guardrails
 * - Ensure JSON-only requirement remains explicit
 * - Ensure “no how-to” prohibition remains explicit
 *
 * These are lightweight and do not call OpenAI.
 */

const minimalContext: AnalysisContextForLLM = {
  request_id: "req_test_123",
  created_at_iso: "2026-01-21T00:00:00.000Z",
  taxpayer_profile: {
    filing_status: "MFJ",
    state: "CA",
    residency_notes: null,
    entity_type: "S-Corp",
  },
  baseline: {
    federal_tax_total: 100000,
    state_tax_total: 50000,
    total_tax: 150000,
    taxable_income_federal: 600000,
    taxable_income_state: 600000,
    effective_tax_rate_total: 0.25,
  },
  strategy_evaluation: [
    {
      strategy_id: "augusta_loophole",
      status: "ELIGIBLE",
      reasons: ["Owns a home and can substantiate meetings"],
      already_in_use: false,
    },
  ],
  impact_summary: {
    apply_potential: false,
    revised: {
      federal_tax_total: 95000,
      state_tax_total: 48000,
      total_tax: 143000,
      taxable_income_federal: 590000,
      taxable_income_state: 590000,
      effective_tax_rate_total: 0.242,
    },
    deltas: {
      total_tax_delta_low: 5000,
      total_tax_delta_base: 7000,
      total_tax_delta_high: 9000,
    },
    per_strategy: [
      {
        strategy_id: "augusta_loophole",
        applied: true,
        status: "ELIGIBLE",
        delta_type: "TAX",
        delta_low: 5000,
        delta_base: 7000,
        delta_high: 9000,
        assumptions: ["Meets substantiation requirements"],
        flags: [],
        evaluator_reasons: ["Owns a home and can substantiate meetings"],
        already_in_use: false,
      },
    ],
  },
  brand: {
    firm_name: "Good Fellow CFO LLC",
    tone: "professional",
  },
};

describe("promptTemplates contract", () => {
  it("system message contains non-negotiable guardrails", () => {
    const sys = buildSystemMessage();

    expect(sys).toMatch(/Do NOT calculate/i);
    expect(sys).toMatch(/Do NOT determine eligibility/i);
    expect(sys).toMatch(/Do NOT perform or describe impact math/i);
    expect(sys).toMatch(/Do NOT introduce new strategies/i);
    expect(sys).toMatch(/Do NOT provide implementation steps|how-to/i);
    expect(sys).toMatch(/Output MUST be valid JSON only/i);
  });

  it("developer message enforces output shape and prohibits how-to", () => {
    const dev = buildDeveloperMessage();

    expect(dev).toMatch(/Return JSON/i);
    expect(dev).toMatch(/No step-by-step/i);
    expect(dev).toMatch(/No new numbers/i);
    expect(dev).toMatch(/No new strategies/i);
  });

  it("user message includes authoritative context and explicit output contract", () => {
    const user = buildUserMessage(minimalContext);

    expect(user).toMatch(/ANALYSIS CONTEXT/i);
    expect(user).toMatch(/TASK:/i);
    expect(user).toMatch(/OUTPUT FORMAT:\s*JSON only/i);

    // Ensure the serialized context appears (basic check)
    expect(user).toContain(minimalContext.request_id);
    expect(user).toContain(minimalContext.taxpayer_profile.state);
  });

  it("response format hint is strict and includes required fields", () => {
    const hint = buildResponseFormatHint();

    expect(hint).toHaveProperty("type", "json_schema");
    expect(hint).toHaveProperty("json_schema.strict", true);

    const schema = (hint as any).json_schema?.schema;
    expect(schema?.required).toEqual(
      expect.arrayContaining([
        "executive_summary",
        "baseline_tax_summary",
        "revised_tax_summary",
        "strategy_explanations",
        "disclaimers",
        "call_to_action_text",
      ]),
    );
    expect(schema?.additionalProperties).toBe(false);
  });

  it("snapshots (optional): messages remain stable", () => {
    // These snapshots will fail if prompts are edited—intentionally.
    // Update snapshots only when you explicitly change the prompt contract.
    expect(buildSystemMessage()).toMatchSnapshot("systemMessage");
    expect(buildDeveloperMessage()).toMatchSnapshot("developerMessage");
    expect(buildUserMessage(minimalContext)).toMatchSnapshot("userMessage");
    expect(buildResponseFormatHint()).toMatchSnapshot("responseFormatHint");
  });
});
