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

/** Derive the public origin for server-to-server calls (Vercel safe). */
function getOriginFromRequest(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) throw new Error("Missing host headers; cannot derive origin.");
  return `${proto}://${host}`;
}

/**
 * Option A: call GHL ingest directly from the app after analysis is produced.
 * This uses the same shared secret header auth used by GHL.
 *
 * Non-blocking: we fire-and-forget so /api/analyze always returns the analysis,
 * even if outbound email fails or is temporarily unavailable.
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
  intake: any;
  baseline: any;
  evaluation: any;
  impact: any;
  applyPotential: boolean;
}): AnalysisContextForLLM {
  const { requestId, createdAtIso, intake, baseline, evaluation, impact, applyPotential } = args;

  const normalizeStrategyId = (id: unknown) => StrategyIdSchema.parse(id);

  const strategy_evaluation = (evaluation ?? []).map((s: any) => ({
    strategy_id: normalizeStrategyId(s.strategy_id ?? s.id),
    status: s.status,
    reasons: Array.isArray(s.reasons) ? s.reasons : [],
    already_in_use: s.already_in_use ?? s.alreadyInUse ?? null,
  }));

  const per_strategy = (impact?.per_strategy ?? impact?.perStrategy ?? []).map((s: any) => ({
    strategy_id: normalizeStrategyId(s.strategy_id ?? s.id),
    applied: Boolean(s.applied),
    status: s.status,
    delta_type: s.delta_type ?? s.deltaType ?? "UNKNOWN",
    delta_low: s.delta_low ?? s.deltaLow ?? null,
    delta_base: s.delta_base ?? s.deltaBase ?? null,
    delta_high: s.delta_high ?? s.deltaHigh ?? null,
    assumptions: Array.isArray(s.assumptions) ? s.assumptions : [],
    flags: Array.isArray(s.flags) ? s.flags : null,
    evaluator_reasons: Array.isArray(s.evaluator_reasons)
      ? s.evaluator_reasons
      : Array.isArray(s.evaluatorReasons)
        ? s.evaluatorReasons
        : [],
    already_in_use: s.already_in_use ?? s.alreadyInUse ?? null,
  }));

  return {
    request_id: requestId,
    created_at_iso: createdAtIso,

    taxpayer_profile: {
      filing_status: intake?.personal?.filing_status ?? "",
      state: intake?.personal?.state ?? "",
      residency_notes: intake?.personal?.residency_notes ?? null,
      entity_type: intake?.business?.entity_type ?? null,
    },

    baseline: {
      federal_tax_total: baseline?.federal_tax_total ?? baseline?.federalTaxTotal ?? 0,
      state_tax_total: baseline?.state_tax_total ?? baseline?.stateTaxTotal ?? 0,
      total_tax: baseline?.total_tax ?? baseline?.totalTax ?? 0,
      taxable_income_federal: baseline?.taxable_income_federal ?? baseline?.taxableIncomeFederal ?? null,
      taxable_income_state: baseline?.taxable_income_state ?? baseline?.taxableIncomeState ?? null,
      effective_tax_rate_total: baseline?.effective_tax_rate_total ?? baseline?.effectiveTaxRateTotal ?? null,
    },

    strategy_evaluation,

    impact_summary: {
      apply_potential: applyPotential,
      revised: {
        federal_tax_total: impact?.revised?.federal_tax_total ?? impact?.revised?.federalTaxTotal ?? 0,
        state_tax_total: impact?.revised?.state_tax_total ?? impact?.revised?.stateTaxTotal ?? 0,
        total_tax: impact?.revised?.total_tax ?? impact?.revised?.totalTax ?? 0,
        taxable_income_federal: impact?.revised?.taxable_income_federal ?? impact?.revised?.taxableIncomeFederal ?? null,
        taxable_income_state: impact?.revised?.taxable_income_state ?? impact?.revised?.taxableIncomeState ?? null,
        effective_tax_rate_total:
          impact?.revised?.effective_tax_rate_total ?? impact?.revised?.effectiveTaxRateTotal ?? null,
      },
      deltas: {
        total_tax_delta_low: impact?.deltas?.total_tax_delta_low ?? impact?.deltas?.totalTaxDeltaLow ?? 0,
        total_tax_delta_base: impact?.deltas?.total_tax_delta_base ?? impact?.deltas?.totalTaxDeltaBase ?? 0,
        total_tax_delta_high: impact?.deltas?.total_tax_delta_high ?? impact?.deltas?.totalTaxDeltaHigh ?? 0,
      },
      per_strategy,
    },

    brand: {
      firm_name: intake?.brand?.firmName ?? intake?.brand?.firm_name ?? null,
      tone: intake?.brand?.tone ?? "professional",
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
    const rules = strategyRulesJson as unknown as ContractStrategyRuleRow[];

    // Run baseline engine
    const baseline: BaselineTaxTotals = await runBaselineTaxEngine(intake);

    // Evaluate strategies
    const evaluatorInput: EvaluateStrategiesInput = {
      intake: intake as any, // evaluator expects JsonObject, but we have typed intake
      rules,
    };
    const evaluation = await evaluateStrategies(evaluatorInput);

    // Transform evaluator output to impact engine input format
    const strategyEvaluations = evaluation.all.map((s) => ({
      strategyId: s.strategy_id as any,
      status: s.status as any,
      reasons: s.failedConditions.map((fc) => ({
        code: fc.status,
        message: fc.message ?? "",
        field: fc.row.field,
      })),
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
    const narrative: OpenAIAnalysisResponse = parseOpenAIAnalysisResponse(json);

    const result = {
      request_id: requestId,
      created_at_iso: createdAtIso,
      intake,
      baseline,
      strategy_evaluation: evaluation,
      impact_summary: impact,
      narrative,
    };

    // Option A: trigger GHL send directly from /api/analyze (non-blocking).
    // We do NOT recompute numbers; we send the same payload we're returning (opaque JSON).
    const email = (intake as any)?.contact?.email ?? (intake as any)?.email ?? undefined;
    const firstName = (intake as any)?.contact?.first_name ?? (intake as any)?.firstName ?? undefined;
    const phone = (intake as any)?.contact?.phone ?? (intake as any)?.phone ?? undefined;

    if (typeof email === "string" && email.trim().length > 3) {
      postToGhlIngest(req, {
        email,
        firstName,
        phone,
        analysis: result, // opaque JSON; emailRenderer will render best-effort
        tags: ["analysis_ready"],
      }).catch((err) => {
        console.error("[analyze] postToGhlIngest failed:", err);
      });
    } else {
      // Not fatal; the API still returns analysis.
      console.warn("[analyze] No email present on intake; skipping GHL ingest.");
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
