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

// ✅ NEW: recompute revised totals from taxable income deltas
import { recomputeRevisedTotalsFromTaxableIncome } from "../../../lib/results/recomputeRevisedTotalsFromTaxableIncome";

// ✅ JSON import (bundled by Next/Vercel)
import strategyRulesJson from "../../../lib/strategies/strategy-rules.json";

// Contracts
import { NormalizedIntakeSchema, type NormalizedIntake2025 } from "../../../contracts/intake";
import type { EvaluateStrategiesInput, StrategyRuleRow } from "../../../contracts/evaluator";
import type { BaselineTaxTotals } from "../../../contracts/baseline";
import type { ImpactEngineInput, ImpactEngineOutput } from "../../../contracts/impact";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/* Request schema */
/* ------------------------------------------------------------------ */

const AnalyzeRequestSchema = z
  .object({
    intake: NormalizedIntakeSchema,
    applyPotential: z.boolean().optional(),
    model: z.enum(["gpt-4.1", "gpt-4.1-mini"]).optional(),
    requestId: z.string().min(6).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Utilities */
/* ------------------------------------------------------------------ */

function ensureEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix = "req"): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("Model response was not valid JSON");
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI output normalizer (STRICT SCHEMA SAFE) */
/* ------------------------------------------------------------------ */

function normalizeNarrativeCandidate(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  // summaries must be strings
  if (typeof obj.baseline_tax_summary !== "string") {
    obj.baseline_tax_summary =
      obj.baseline_tax_summary == null
        ? "Baseline tax summary unavailable."
        : typeof obj.baseline_tax_summary === "object"
          ? JSON.stringify(obj.baseline_tax_summary)
          : String(obj.baseline_tax_summary);
  }

  if (typeof obj.revised_tax_summary !== "string") {
    obj.revised_tax_summary =
      obj.revised_tax_summary == null
        ? "Revised tax summary unavailable."
        : typeof obj.revised_tax_summary === "object"
          ? JSON.stringify(obj.revised_tax_summary)
          : String(obj.revised_tax_summary);
  }

  // normalize strategy explanations
  if (Array.isArray(obj.strategy_explanations)) {
    obj.strategy_explanations = obj.strategy_explanations.map((s: any, idx: number) => {
      const out: any = { ...(s ?? {}) };

      // remove illegal keys
      delete out.status;
      delete out.explanation;
      delete out.applies;

      if (typeof out.what_it_is !== "string" || out.what_it_is.trim().length < 1) {
        out.what_it_is = out.strategy_id
          ? `Tax strategy: ${out.strategy_id}`
          : `Tax strategy #${idx + 1}`;
      }

      if (
        typeof out.why_it_applies_or_not !== "string" ||
        out.why_it_applies_or_not.trim().length < 1
      ) {
        out.why_it_applies_or_not =
          typeof s?.explanation === "string"
            ? s.explanation
            : "Eligibility depends on your specific facts.";
      }

      return out;
    });
  }

  return obj;
}

/* ------------------------------------------------------------------ */
/* Impact shape adapter (your engine returns { impacts, revisedTotals }) */
/* ------------------------------------------------------------------ */

function getImpactParts(impact: ImpactEngineOutput) {
  const rt = (impact as any)?.revisedTotals;
  const revised = rt?.revised;
  const totalTaxDelta = rt?.totalTaxDelta;

  return {
    revised,
    totalTaxDelta,
    impacts: Array.isArray((impact as any)?.impacts) ? (impact as any).impacts : [],
  };
}

/* ------------------------------------------------------------------ */
/* Build LLM context */
/* ------------------------------------------------------------------ */

function buildAnalysisContext(args: {
  requestId: string;
  createdAtIso: string;
  intake: NormalizedIntake2025;
  baseline: BaselineTaxTotals;
  evaluation: any;
  impact: ImpactEngineOutput;
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

  const { revised, totalTaxDelta, impacts } = getImpactParts(impact);

  return {
    request_id: requestId,
    created_at_iso: createdAtIso,

    taxpayer_profile: {
      filing_status: intake.personal.filing_status,
      state: intake.personal.state,
      residency_notes: null,
      entity_type: intake.business.entity_type,
    },

    baseline: {
      federal_tax_total: (baseline as any).federalTax ?? 0,
      state_tax_total: (baseline as any).stateTax ?? 0,
      total_tax: (baseline as any).totalTax ?? 0,
      taxable_income_federal: (baseline as any).taxableIncome ?? null,
      taxable_income_state: (baseline as any).taxableIncome ?? null,
      effective_tax_rate_total: null,
    },

    strategy_evaluation,

    impact_summary: {
      apply_potential: applyPotential,
      revised: {
        federal_tax_total: revised?.federalTax ?? 0,
        state_tax_total: revised?.stateTax ?? 0,
        total_tax: revised?.totalTax ?? 0,
        taxable_income_federal: revised?.taxableIncome ?? null,
        taxable_income_state: revised?.taxableIncome ?? null,
        effective_tax_rate_total: null,
      },
      deltas: {
        total_tax_delta_low: totalTaxDelta?.low ?? 0,
        total_tax_delta_base: totalTaxDelta?.base ?? 0,
        total_tax_delta_high: totalTaxDelta?.high ?? 0,
      },
      per_strategy: impacts,
    },

    brand: {
      firm_name: null,
      tone: "professional",
    },
  };
}

/* ------------------------------------------------------------------ */
/* POST handler */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = AnalyzeRequestSchema.parse(body);

    const intake: NormalizedIntake2025 = parsed.intake;
    const applyPotential = parsed.applyPotential ?? false;

    const requestId = parsed.requestId ?? randomId("analyze");
    const createdAtIso = nowIso();

    // rules
    const raw = strategyRulesJson as any;
    if (!Array.isArray(raw?.rules)) {
      throw new Error("strategy-rules.json must be { rules: [...] }");
    }
    const rules = raw.rules as StrategyRuleRow[];

    // baseline
    const baseline: BaselineTaxTotals = await runBaselineTaxEngine(intake);

    // evaluator
    const evaluation = evaluateStrategies({
      intake: intake as any,
      rules,
    } as EvaluateStrategiesInput);

    // impact
    const impact = runImpactEngine({
      intake,
      baseline,
      strategyEvaluations: evaluation.all.map((s) => ({
        strategyId: s.strategy_id as any,
        status: s.status as any,
        reasons: [],
      })),
      applyPotential,
    } as ImpactEngineInput) as ImpactEngineOutput;

    // ✅ FIX: recompute revisedTotals from taxable income delta range, then overwrite impact.revisedTotals
    const totalTaxableIncomeDelta =
      (impact as any)?.revisedTotals?.totalTaxableIncomeDelta ??
      (impact as any)?.revisedTotals?.totalTaxableIncome_delta;

    if (totalTaxableIncomeDelta && typeof totalTaxableIncomeDelta === "object") {
      const baselineTotals = {
        federalTax: (baseline as any).federalTax ?? 0,
        stateTax: (baseline as any).stateTax ?? 0,
        totalTax: (baseline as any).totalTax ?? 0,
        taxableIncome: (baseline as any).taxableIncome ?? 0,
      };

      const incomeW2 = (intake as any)?.personal?.income_excl_business ?? 0;
const bizProfit = (intake as any)?.business?.has_business ? ((intake as any)?.business?.net_profit ?? 0) : 0;
const k401Ytd = (intake as any)?.retirement?.k401_employee_contrib_ytd ?? 0;
const baselineAgiOverride = Math.max(0, incomeW2 + bizProfit - k401Ytd);

const recomputed = recomputeRevisedTotalsFromTaxableIncome({
  baseline: baselineTotals,
  filingStatus: intake.personal.filing_status,
  state: intake.personal.state,
  totalTaxableIncomeDelta: totalTaxableIncomeDelta as any,

  qualifyingChildrenUnder17: intake.personal.children_0_17 ?? 0,
  baselineAgiOverride,
});
     

      (impact as any).revisedTotals = recomputed;
    }

    // LLM
    const ctx = buildAnalysisContext({
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
      input: buildMessages(ctx) as any,
      temperature: 0.2,
      store: false,
    });

    const rawJson = safeJsonParse(response.output_text);
    const normalized = normalizeNarrativeCandidate(rawJson);
    const narrative: OpenAIAnalysisResponse = parseOpenAIAnalysisResponse(normalized);

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
