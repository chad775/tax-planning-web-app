// src/app/api/analyze/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { buildMessages, type AnalysisContextForLLM } from "../../../lib/openai/promptTemplates";

import {
  parseOpenAIAnalysisResponse,
  StrategyIdSchema,
  type OpenAIAnalysisResponse,
} from "../../../lib/openai/schema";

import { runBaselineTaxEngine } from "../../../lib/tax/baselineEngine";
import { evaluateStrategies } from "../../../lib/strategies/evaluator";
import { runImpactEngine } from "../../../lib/strategies/impactEngine";

// ✅ Bundled JSON (Vercel-safe)
import strategyRulesJson from "../../../lib/strategies/strategy-rules.json";

// Contracts (single source of truth)
import { NormalizedIntakeSchema, type NormalizedIntake2025 } from "../../../contracts/intake";
import type { EvaluateStrategiesInput, StrategyRuleRow as ContractStrategyRuleRow } from "../../../contracts/evaluator";
import type { BaselineTaxTotals } from "../../../contracts/baseline";
import type { ImpactEngineInput, ImpactEngineOutput } from "../../../contracts/impact";

export const runtime = "nodejs";

/* ---------------- request schema ---------------- */

const AnalyzeRequestSchema = z
  .object({
    intake: NormalizedIntakeSchema,
    applyPotential: z.boolean().optional(),
    model: z.enum(["gpt-4.1", "gpt-4.1-mini"]).optional(),
    requestId: z.string().min(6).optional(),
  })
  .strict();

/* ---------------- utils ---------------- */

function ensureEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix = "req"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
    throw new Error("Model response was not valid JSON.");
  }
}

/**
 * Normalize OpenAI output so it always matches strict schema
 */
function normalizeNarrativeCandidate(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj.strategy_explanations)) {
    obj.strategy_explanations = obj.strategy_explanations.map((s: any) => {
      const out: any = { ...(s ?? {}) };

      if (typeof out.what_it_is !== "string") {
        out.what_it_is = "";
      }

      if (typeof out.why_it_applies_or_not !== "string") {
        out.why_it_applies_or_not =
          typeof out.explanation === "string" ? out.explanation : "";
      }

      delete out.status;
      delete out.explanation;

      return out;
    });
  }

  return obj;
}

/* ---------------- analysis context ---------------- */

function buildAnalysisContext(args: {
  requestId: string;
  createdAtIso: string;
  intake: any;
  baseline: any;
  evaluation: any;
  impact: any;
  applyPotential: boolean;
}): AnalysisContextForLLM {
  const { requestId, createdAtIso, intake, baseline, evaluation, impact, applyPotential } = args;

  const normalizeStrategyId = (id: unknown) => StrategyIdSchema.parse(id);

  const evaluationList = Array.isArray(evaluation?.all) ? evaluation.all : [];

  const strategy_evaluation = evaluationList.map((s: any) => ({
    strategy_id: normalizeStrategyId(s.strategy_id),
    status: s.status,
    reasons: Array.isArray(s.failedConditions)
      ? s.failedConditions.map((fc: any) => ({
          code: fc.status,
          message: fc.message ?? "",
          field: fc.row?.field ?? null,
        }))
      : [],
    already_in_use: null,
  }));

  return {
    request_id: requestId,
    created_at_iso: createdAtIso,

    taxpayer_profile: {
      filing_status: intake.personal.filing_status,
      state: intake.personal.state,
      entity_type: intake.business.entity_type,
    },

    baseline: {
      federal_tax_total: baseline.federalTax,
      state_tax_total: baseline.stateTax,
      total_tax: baseline.totalTax,
      taxable_income_federal: baseline.taxableIncome,
      taxable_income_state: baseline.taxableIncome,
      effective_tax_rate_total:
        baseline.totalTax > 0 && baseline.taxableIncome > 0
          ? baseline.totalTax / baseline.taxableIncome
          : null,
    },

    strategy_evaluation,

    impact_summary: {
      apply_potential: applyPotential,
      revised: {
        federal_tax_total: impact.revised.federalTax,
        state_tax_total: impact.revised.stateTax,
        total_tax: impact.revised.totalTax,
        taxable_income_federal: impact.revised.taxableIncome,
        taxable_income_state: impact.revised.taxableIncome,
        effective_tax_rate_total:
          impact.revised.totalTax > 0 && impact.revised.taxableIncome > 0
            ? impact.revised.totalTax / impact.revised.taxableIncome
            : null,
      },
      deltas: {
        total_tax_delta_low: impact.totalTaxDelta.low,
        total_tax_delta_base: impact.totalTaxDelta.base,
        total_tax_delta_high: impact.totalTaxDelta.high,
      },
      per_strategy: [],
    },
  };
}

/* ---------------- handler ---------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const parsed = AnalyzeRequestSchema.parse(body);

    const applyPotential = parsed.applyPotential ?? false;
    const createdAtIso = nowIso();
    const requestId = parsed.requestId ?? randomId("analyze");

    const intake: NormalizedIntake2025 = parsed.intake;

    // ✅ extract rules
    const raw = strategyRulesJson as any;
    if (!Array.isArray(raw?.rules)) {
      throw new Error("strategy-rules.json must be shaped like { rules: [...] }");
    }
    const rules = raw.rules as ContractStrategyRuleRow[];

    const baseline: BaselineTaxTotals = await runBaselineTaxEngine(intake);

    const evaluation = await evaluateStrategies({
      intake: intake as any,
      rules,
    } as EvaluateStrategiesInput);

    const strategyEvaluations = evaluation.all.map((s) => ({
      strategyId: s.strategy_id as any,
      status: s.status as any,
      reasons: [],
      missingFields: s.missingRequired?.map((m) => m.field),
    }));

    const impact = await runImpactEngine({
      intake,
      baseline,
      strategyEvaluations: strategyEvaluations as any,
      applyPotential,
    } as ImpactEngineInput);

    const analysisContext = buildAnalysisContext({
      requestId,
      createdAtIso,
      intake,
      baseline,
      evaluation,
      impact,
      applyPotential,
    });

    const openai = new OpenAI({ apiKey: ensureEnv("OPENAI_API_KEY") });

    const response = await openai.responses.create({
      model: parsed.model ?? "gpt-4.1-mini",
      input: buildMessages(analysisContext) as any,
      temperature: 0.2,
      store: false,
    });

    const rawJson = safeJsonParse(response.output_text);
    const normalizedJson = normalizeNarrativeCandidate(rawJson);
    const narrative: OpenAIAnalysisResponse = parseOpenAIAnalysisResponse(normalizedJson);

    return NextResponse.json(
      {
        request_id: requestId,
        created_at_iso: createdAtIso,
        intake,
        baseline,
        strategy_evaluation: evaluation,
        impact_summary: impact,
        narrative,
      },
      { status: 200 },
    );
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_REQUEST", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "ANALYZE_FAILED", message: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
