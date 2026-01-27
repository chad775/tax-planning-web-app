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

// ✅ IMPORTANT: import JSON so Next/Vercel bundles it
import strategyRulesJson from "../../../lib/strategies/strategy-rules.json";

// Import contracts (single source of truth)
import { NormalizedIntakeSchema, type NormalizedIntake2025 } from "../../../contracts/intake";
import type { EvaluateStrategiesInput, StrategyRuleRow as ContractStrategyRuleRow } from "../../../contracts/evaluator";
import type { BaselineTaxTotals } from "../../../contracts/baseline";
import type { ImpactEngineInput, ImpactEngineOutput } from "../../../contracts/impact";

export const runtime = "nodejs";

const AnalyzeRequestSchema = z
  .object({
    intake: NormalizedIntakeSchema, // Use contract schema
    applyPotential: z.boolean().optional(),
    model: z.enum(["gpt-4.1", "gpt-4.1-mini"]).optional(),
    requestId: z.string().min(6).optional(),
  })
  .strict();

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
 * (model sometimes returns { status, explanation } instead of required fields)
 */
function normalizeNarrativeCandidate(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj.strategy_explanations)) {
    obj.strategy_explanations = obj.strategy_explanations.map((s: any) => {
      const out: any = { ...(s ?? {}) };

      if (typeof out.what_it_is !== "string") out.what_it_is = "";
      if (typeof out.why_it_applies_or_not !== "string") {
        out.why_it_applies_or_not = typeof out.explanation === "string" ? out.explanation : "";
      }

      delete out.status;
      delete out.explanation;

      return out;
    });
  }

  return obj;
}

/** Derive the public origin for server-to-server calls (Vercel safe). */
function getOriginFromRequest(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) throw new Error("Missing host headers; cannot derive origin.");
  return `${proto}://${host}`;
}

/**
 * Option A: call GHL ingest directly from the app after analysis is produced.
 * (Safe to keep; usually skipped because intake contract doesn't include email.)
 */
async function postToGhlIngest(req: Request, payload: unknown): Promise<void> {
  const secret = ensureEnv("GHL_WEBHOOK_SECRET");
  const baseUrl = process.env.APP_BASE_URL ?? getOriginFromRequest(req);
  const url = `${baseUrl.replace(/\/+$/, "")}/api/ghl/ingest`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": secret,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ghl/ingest failed: ${res.status} ${text}`);
  }
}

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
    strategy_id: normalizeStrategyId(s.strategy_id ?? s.id),
    status: s.status,
    reasons: Array.isArray(s.failedConditions)
      ? s.failedConditions.map((fc: any) => ({
          code: fc.status,
          message: fc.message ?? "",
          field: fc.row?.field ?? null,
        }))
      : [],
    already_in_use: s.already_in_use ?? s.alreadyInUse ?? null,
  }));

  // ✅ FIX: impact engine output shape is { impacts, revisedTotals }
  const revisedTotals = (impact as any)?.revisedTotals;
  const revised = revisedTotals?.revised ?? null;
  const deltas = revisedTotals?.totalTaxDelta ?? null;

  const per_strategy = Array.isArray((impact as any)?.impacts)
    ? (impact as any).impacts.map((s: any) => ({
        strategy_id: normalizeStrategyId(s.strategyId ?? s.strategy_id ?? s.id),
        applied: Array.isArray(s.flags) ? s.flags.includes("APPLIED") : false,
        status: s.status,
        delta_type: s.deltaType ?? s.delta_type ?? "UNKNOWN",
        delta_low: s.taxLiabilityDelta?.low ?? null,
        delta_base: s.taxLiabilityDelta?.base ?? null,
        delta_high: s.taxLiabilityDelta?.high ?? null,
        assumptions: Array.isArray(s.assumptions) ? s.assumptions : [],
        flags: Array.isArray(s.flags) ? s.flags : null,
        evaluator_reasons: [],
        already_in_use: null,
      }))
    : [];

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
      effective_tax_rate_total:
        (baseline as any).totalTax && (baseline as any).taxableIncome
          ? (baseline as any).totalTax / (baseline as any).taxableIncome
          : null,
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
        effective_tax_rate_total:
          revised?.totalTax && revised?.taxableIncome ? revised.totalTax / revised.taxableIncome : null,
      },
      deltas: {
        total_tax_delta_low: deltas?.low ?? 0,
        total_tax_delta_base: deltas?.base ?? 0,
        total_tax_delta_high: deltas?.high ?? 0,
      },
      per_strategy,
    },

    brand: {
      firm_name: null,
      tone: "professional",
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const parsed = AnalyzeRequestSchema.parse(body);

    const applyPotential = parsed.applyPotential ?? false;
    const createdAtIso = nowIso();
    const requestId = parsed.requestId ?? randomId("analyze");

    const intake: NormalizedIntake2025 = parsed.intake;

    // ✅ Load rules from bundled JSON (no fs / no path issues on Vercel)
    const raw = strategyRulesJson as any;
    if (!raw || !Array.isArray(raw.rules)) {
      throw new Error("strategy-rules.json must be shaped like { rules: [...] }");
    }
    const rules = raw.rules as ContractStrategyRuleRow[];

    // Run baseline engine
    const baseline: BaselineTaxTotals = await runBaselineTaxEngine(intake);

    // Evaluate strategies
    const evaluatorInput: EvaluateStrategiesInput = {
      intake: intake as any,
      rules,
    };
    const evaluation = await evaluateStrategies(evaluatorInput);

    // Transform evaluator output to impact engine input format
    const strategyEvaluations = evaluation.all.map((s) => ({
      strategyId: s.strategy_id as any,
      status: s.status as any,
      reasons: [],
      missingFields: s.missingRequired?.map((mr) => mr.field),
    }));

    // Run impact engine
    const impactInput: ImpactEngineInput = {
      intake,
      baseline,
      strategyEvaluations: strategyEvaluations as any,
      applyPotential,
    };
    const impact = (await runImpactEngine(impactInput)) as ImpactEngineOutput;

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

    const json = safeJsonParse(response.output_text);
    const normalized = normalizeNarrativeCandidate(json);
    const narrative: OpenAIAnalysisResponse = parseOpenAIAnalysisResponse(normalized);

    const result = {
      request_id: requestId,
      created_at_iso: createdAtIso,
      intake,
      baseline,
      strategy_evaluation: evaluation,
      impact_summary: impact,
      narrative,
    };

    // Usually skipped (intake contract doesn't include email)
    const email = (intake as any)?.contact?.email ?? (intake as any)?.email ?? undefined;
    const firstName = (intake as any)?.contact?.first_name ?? (intake as any)?.firstName ?? undefined;
    const phone = (intake as any)?.contact?.phone ?? (intake as any)?.phone ?? undefined;

    if (typeof email === "string" && email.trim().length > 3) {
      postToGhlIngest(req, {
        email,
        firstName,
        phone,
        analysis: result,
        tags: ["analysis_ready"],
      }).catch((err) => {
        console.error("[analyze] postToGhlIngest failed:", err);
      });
    }

    return NextResponse.json(result, { status: 200 });
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
