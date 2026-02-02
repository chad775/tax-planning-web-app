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

// ✅ recompute revised totals from taxable income deltas
import { recomputeRevisedTotalsFromTaxableIncome } from "../../../lib/results/recomputeRevisedTotalsFromTaxableIncome";

// ✅ Federal helpers for step-by-step breakdown
import {
  computeFederalBaseline2025,
  getStandardDeduction2025,
  type FilingStatus2025,
} from "../../../lib/tax/federal";

import { computeStateIncomeTax2025 } from "../../../lib/tax/state";
import { asStateCode, type StateCode } from "../../../lib/tax/stateTables";
import { computePayrollTaxes2025 } from "../../../lib/tax/payroll/payroll2025";

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

function clampMin0(x: number): number {
  return x < 0 ? 0 : x;
}

function roundToCents(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function toFederalStatus(status: NormalizedIntake2025["personal"]["filing_status"]): FilingStatus2025 {
  switch (status) {
    case "SINGLE":
      return "single";
    case "MARRIED_FILING_JOINTLY":
      return "mfj";
    case "MARRIED_FILING_SEPARATELY":
      return "mfs";
    case "HEAD_OF_HOUSEHOLD":
      return "hoh";
    default:
      return "single";
  }
}

/* ------------------------------------------------------------------ */
/* Strategy tiers (local, deterministic) */
/* ------------------------------------------------------------------ */
/**
 * Two-tier system:
 * Tier 1: Quick Wins (auto-applied when eligible)
 * Tier 2: Bigger Opportunities (what-if scenarios only)
 */
type Tier = 1 | 2;

const STRATEGY_TIER_MAP: Readonly<Record<string, Tier>> = {
  // Tier 1: Auto-applied when eligible
  augusta_loophole: 1,
  medical_reimbursement: 1,
  k401: 1,
  hiring_children: 1,
  s_corp_conversion: 1,

  // Tier 2: What-if only (never auto-applied)
  cash_balance_plan: 2,
  short_term_rental: 2,
  leveraged_charitable: 2,
  rtu_program: 2,
  film_credits: 2,
} as const;

function getTier(strategyId: string): Tier {
  return STRATEGY_TIER_MAP[strategyId] ?? 2;
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
        out.what_it_is = out.strategy_id ? `Tax strategy: ${out.strategy_id}` : `Tax strategy #${idx + 1}`;
      }

      if (typeof out.why_it_applies_or_not !== "string" || out.why_it_applies_or_not.trim().length < 1) {
        out.why_it_applies_or_not =
          typeof s?.explanation === "string" ? s.explanation : "Eligibility depends on your specific facts.";
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
/* Tax breakdown helpers (baseline + revised) */
/* ------------------------------------------------------------------ */

function computeTaxBreakdown(params: {
  filingStatus: NormalizedIntake2025["personal"]["filing_status"];
  state: string;
  childrenUnder17: number;

  incomeW2: number;
  businessProfit: number;
  k401EmployeeYtd: number;

  // For payroll tax calculation
  hasBusiness?: boolean;
  entityType?: NormalizedIntake2025["business"]["entity_type"];

  // If provided, we recompute with this AGI directly (for revised scenarios).
  agiOverride?: number;
}) {
  const fedStatus = toFederalStatus(params.filingStatus);
  const stateCodeRaw = asStateCode(params.state);
if (!stateCodeRaw) {
  throw new Error(`Invalid state code: ${params.state}`);
}
const stateCode: StateCode = stateCodeRaw;


  const grossIncome = roundToCents(clampMin0(params.incomeW2 + params.businessProfit));
  const aboveLine401k = roundToCents(clampMin0(params.k401EmployeeYtd));

  const agi = roundToCents(
    clampMin0(typeof params.agiOverride === "number" ? params.agiOverride : grossIncome - aboveLine401k),
  );

  const standardDeduction = getStandardDeduction2025(fedStatus);
  const taxableIncome = roundToCents(clampMin0(agi - standardDeduction));

  // Federal (ordinary-only) with CTC phaseout + nonrefundable limit
  const fed = computeFederalBaseline2025({
    filingStatus: fedStatus,
    agi,
    taxableOrdinaryIncomeAfterDeduction: taxableIncome,
    taxablePreferentialIncomeAfterDeduction: 0,
    qualifyingChildrenUnder17: Math.max(0, Math.floor(params.childrenUnder17)),
  });

  const incomeTaxBeforeCredits = roundToCents(fed.incomeTaxBeforeCredits ?? 0);
  const ctcAvailable = roundToCents(fed.ctcAvailable ?? 0);
  const ctcUsed = roundToCents(fed.ctcUsedNonrefundable ?? 0);
  const ctcUnused = roundToCents(fed.ctcUnused ?? 0);
  const federalTax = roundToCents(fed.incomeTaxAfterCTC ?? incomeTaxBeforeCredits);

  // State (still uses taxable income proxy)
  const stateStatus = params.filingStatus as any;
  const stAny: any = computeStateIncomeTax2025({
    taxYear: 2025,
    state: stateCode,
    filingStatus: stateStatus,
    taxableBase: taxableIncome,
  });

  const stateTax = roundToCents(clampMin0(stAny?.stateIncomeTax ?? stAny?.tax ?? stAny?.stateTax ?? 0));

  // Compute payroll tax if business info is provided
  let payrollTax = 0;
  if (params.hasBusiness !== undefined && params.entityType !== undefined) {
    const payrollIntake: NormalizedIntake2025 = {
      personal: {
        filing_status: params.filingStatus,
        children_0_17: params.childrenUnder17,
        income_excl_business: params.incomeW2,
        state: stateCode,
      },
      business: {
        has_business: params.hasBusiness,
        entity_type: params.entityType,
        employees_count: 0, // Not used for payroll tax calculation
        net_profit: params.businessProfit,
      },
      retirement: {
        k401_employee_contrib_ytd: params.k401EmployeeYtd,
      },
      strategies_in_use: [],
    };
    const payrollResult = computePayrollTaxes2025(payrollIntake, {
      taxYear: 2025,
      baselineTaxableIncome: taxableIncome,
    });
    payrollTax = roundToCents(clampMin0(payrollResult.payrollTaxTotal));
  }

  const totalTax = roundToCents(clampMin0(federalTax + stateTax + payrollTax));

  return {
    gross_income: grossIncome,
    adjustments: {
      k401_employee_contrib_ytd: aboveLine401k,
    },
    agi,
    standard_deduction: standardDeduction,
    taxable_income: taxableIncome,
    federal: {
      income_tax_before_credits: incomeTaxBeforeCredits,
      ctc: {
        available: ctcAvailable,
        used_nonrefundable: ctcUsed,
        unused: ctcUnused,
        phaseout_rules: "Phaseout starts at $200,000 single / $400,000 MFJ. Reduce $50 per $1,000 over.",
      },
      tax_after_credits: federalTax,
    },
    state: {
      tax: stateTax,
      taxable_base_proxy: taxableIncome,
    },
    totals: {
      federalTax,
      stateTax,
      payrollTax,
      totalTax,
    },
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

    // pull delta range for recompute + revised breakdown
    const totalTaxableIncomeDelta =
      (impact as any)?.revisedTotals?.totalTaxableIncomeDelta ??
      (impact as any)?.revisedTotals?.totalTaxableIncome_delta;

    // Intake inputs (used for breakdown)
    const incomeW2 = (intake as any)?.personal?.income_excl_business ?? 0;
    const bizProfit = (intake as any)?.business?.has_business ? ((intake as any)?.business?.net_profit ?? 0) : 0;
    const k401Ytd = (intake as any)?.retirement?.k401_employee_contrib_ytd ?? 0;

    // Baseline AGI proxy used everywhere (matches baselineEngine)
    const baselineAgiOverride = Math.max(0, incomeW2 + bizProfit - k401Ytd);

    // ✅ recompute revised totals so federal/state tax reflect CTC + phaseout
    if (totalTaxableIncomeDelta && typeof totalTaxableIncomeDelta === "object") {
      const baselineTotals = {
        federalTax: (baseline as any).federalTax ?? 0,
        stateTax: (baseline as any).stateTax ?? 0,
        payrollTax: (baseline as any).payrollTax ?? 0,
        totalTax: (baseline as any).totalTax ?? 0,
        taxableIncome: (baseline as any).taxableIncome ?? 0,
      };

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

    /* ---------------- NEW: breakdown fields ---------------- */

    // Extract impacts list early so we can check for s_corp_conversion
    const impactsList: any[] = Array.isArray((impact as any)?.impacts) ? (impact as any).impacts : [];

    const baseline_breakdown = computeTaxBreakdown({
      filingStatus: intake.personal.filing_status,
      state: intake.personal.state,
      childrenUnder17: intake.personal.children_0_17 ?? 0,
      incomeW2,
      businessProfit: bizProfit,
      k401EmployeeYtd: k401Ytd,
      hasBusiness: intake.business.has_business,
      entityType: intake.business.entity_type,
      agiOverride: baselineAgiOverride,
    });

    const revisedBaseDelta =
      totalTaxableIncomeDelta && typeof (totalTaxableIncomeDelta as any).base === "number"
        ? (totalTaxableIncomeDelta as any).base
        : 0;

    const revisedAgiBase = clampMin0(baselineAgiOverride + revisedBaseDelta);

    // Check if s_corp_conversion is applied to adjust entity type and income
    const sCorpImpact = impactsList.find((i: any) => 
      (String(i?.strategyId ?? i?.strategy_id ?? "") === "s_corp_conversion") &&
      Array.isArray(i?.flags) && i.flags.includes("APPLIED")
    );
    
    let revisedEntityType = intake.business.entity_type;
    let revisedIncomeW2 = incomeW2;
    let revisedBusinessProfit = bizProfit;
    
    if (sCorpImpact) {
      // S-corp conversion: entity becomes S_CORP
      revisedEntityType = "S_CORP";
      
      // Find reasonable salary from assumptions
      const reasonableSalaryAssumption = (sCorpImpact.assumptions || []).find(
        (a: any) => a.id === "REASONABLE_SALARY"
      );
      const reasonableSalary = reasonableSalaryAssumption?.value as number || 0;
      
      if (reasonableSalary > 0) {
        // Add reasonable salary to W-2 wages (subject to FICA)
        revisedIncomeW2 = incomeW2 + reasonableSalary;
        // Reduce business profit by reasonable salary (that portion is now W-2 wages, not business profit)
        // The remaining business profit becomes distributions (not subject to SE tax)
        revisedBusinessProfit = Math.max(0, bizProfit - reasonableSalary);
      }
    }

    const revised_breakdown = computeTaxBreakdown({
      filingStatus: intake.personal.filing_status,
      state: intake.personal.state,
      childrenUnder17: intake.personal.children_0_17 ?? 0,
      incomeW2: revisedIncomeW2,
      businessProfit: revisedBusinessProfit,
      k401EmployeeYtd: k401Ytd,
      hasBusiness: intake.business.has_business,
      entityType: revisedEntityType,
      agiOverride: revisedAgiBase,
    });

    /* ---------------- NEW: buckets + tier-2 what-if ---------------- */

    // Build Set of applied strategy IDs from core.appliedStrategyIds OR from flags
    const appliedIds = new Set<string>();
    
    // First, try to get from impact.core.appliedStrategyIds
    const coreAppliedIds = (impact as any)?.core?.appliedStrategyIds;
    if (Array.isArray(coreAppliedIds)) {
      for (const id of coreAppliedIds) {
        if (typeof id === "string") appliedIds.add(id);
      }
    }
    
    // Also add any strategy with APPLIED flag
    for (const i of impactsList) {
      const id = String(i?.strategyId ?? i?.strategy_id ?? "");
      const flags: string[] = Array.isArray(i?.flags) ? i.flags : [];
      if (flags.includes("APPLIED")) {
        appliedIds.add(id);
      }
    }

    const appliedTier1 = impactsList.filter((i: any) => {
      const id = String(i?.strategyId ?? i?.strategy_id ?? "");
      const tier = getTier(id);
      const flags: string[] = Array.isArray(i?.flags) ? i.flags : [];
      return tier === 1 && flags.includes("APPLIED");
    });

    // Filter tier2 to exclude applied strategies (tier2 never auto-applies)
    const tier2 = impactsList.filter((i: any) => {
      const id = String(i?.strategyId ?? i?.strategy_id ?? "");
      return getTier(id) === 2 && !appliedIds.has(id);
    });

    const sumAppliedTier1BaseDelta = appliedTier1.reduce((acc: number, i: any) => {
      const base = i?.taxableIncomeDelta?.base ?? i?.taxLiabilityDelta?.base;
      return acc + (typeof base === "number" ? base : 0);
    }, 0);

    // Build opportunity_what_if only for tier 2 strategies (what-if only)
    // Use S-Corp adjusted values if S-Corp conversion is applied (same as revised_breakdown)
    const opportunity_what_if = tier2
      .filter((i: any) => {
        const id = String(i?.strategyId ?? i?.strategy_id ?? "");
        return !appliedIds.has(id);
      })
      .map((i: any) => {
        const id = String(i?.strategyId ?? i?.strategy_id ?? "");
        const base = i?.taxableIncomeDelta?.base ?? i?.taxLiabilityDelta?.base;
        const tier2Delta = typeof base === "number" ? base : 0;

        const whatIfAgi = clampMin0(baselineAgiOverride + sumAppliedTier1BaseDelta + tier2Delta);

        const what_if_breakdown = computeTaxBreakdown({
          filingStatus: intake.personal.filing_status,
          state: intake.personal.state,
          childrenUnder17: intake.personal.children_0_17 ?? 0,
          incomeW2: revisedIncomeW2, // Use S-Corp adjusted W-2 income
          businessProfit: revisedBusinessProfit, // Use S-Corp adjusted business profit
          k401EmployeeYtd: k401Ytd,
          hasBusiness: intake.business.has_business,
          entityType: revisedEntityType, // Use S-Corp adjusted entity type
          agiOverride: whatIfAgi,
        });

        return {
          strategyId: id,
          tier: 2 as const,
          taxableIncomeDeltaBase: tier2Delta,
          totals: what_if_breakdown.totals,
          breakdown: what_if_breakdown,
        };
      });

    const strategy_buckets = {
      applied: impactsList
        .map((i: any) => {
          const id = String(i?.strategyId ?? i?.strategy_id ?? "");
          return {
            strategyId: id,
            tier: getTier(id),
            flags: Array.isArray(i?.flags) ? i.flags : [],
            status: i?.status ?? null,
            needsConfirmation: i?.needsConfirmation ?? null,
            taxableIncomeDelta: i?.taxableIncomeDelta ?? null,
            taxLiabilityDelta: i?.taxLiabilityDelta ?? null,
            model: i?.model ?? null,
            assumptions: Array.isArray(i?.assumptions) ? i.assumptions : [],
          };
        })
        .filter((x: any) => x.flags.includes("APPLIED")),

      opportunities: impactsList
        .map((i: any) => {
          const id = String(i?.strategyId ?? i?.strategy_id ?? "");
          return {
            strategyId: id,
            tier: getTier(id),
            flags: Array.isArray(i?.flags) ? i.flags : [],
            status: i?.status ?? null,
            needsConfirmation: i?.needsConfirmation ?? null,
            taxableIncomeDelta: i?.taxableIncomeDelta ?? null,
            taxLiabilityDelta: i?.taxLiabilityDelta ?? null,
            model: i?.model ?? null,
            assumptions: Array.isArray(i?.assumptions) ? i.assumptions : [],
          };
        })
        .filter((x: any) => {
          const id = x.strategyId;
          return x.tier === 2 && !appliedIds.has(id);
        }),

      opportunity_what_if,
    };

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

        // ✅ NEW: steps
        baseline_breakdown,
        revised_breakdown,

        // ✅ NEW: buckets for UI
        strategy_buckets,
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
