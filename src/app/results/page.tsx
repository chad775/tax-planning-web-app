// src/app/results/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TaxBreakdownTable, type TaxBreakdown } from "./components/TaxBreakdownTable";
import { StrategyBucket } from "./components/StrategyBucket";
import { STRATEGY_CATALOG } from "@/lib/strategies/strategyCatalog";
import type { StrategyId } from "@/contracts/strategyIds";
import { colors, typography, spacing, borderRadius, shadows, styles } from "@/lib/ui/designSystem";

type JsonRecord = Record<string, unknown>;

type StrategyImpact = {
  strategyId: string;
  tier: 1 | 2;
  flags: string[];
  status: string | null;
  needsConfirmation: boolean | null;
  taxableIncomeDelta: { low: number; base: number; high: number } | null;
  taxLiabilityDelta: { low: number; base: number; high: number } | null;
  payrollTaxDelta: { low: number; base: number; high: number } | null;
  model: string | null;
  assumptions: Array<{ id: string; category: string; value: unknown }>;
};

type WhatIfScenarioData = {
  strategyId: string;
  tier: 2;
  taxableIncomeDeltaBase: number;
  totals: {
    federalTax: number;
    stateTax: number;
    totalTax: number;
  };
  breakdown: TaxBreakdown;
};

type StrategyBuckets = {
  applied: StrategyImpact[];
  opportunities: StrategyImpact[];
  opportunity_what_if: WhatIfScenarioData[];
};

type ResultsViewModel = {
  requestId: string | null;
  filingStatus: string | null;
  state: string | null;
  hasBusiness: boolean;
  businessType: string | null;
  childrenCount: number | null;
  executiveSummary: string | null;
  baselineBreakdown: TaxBreakdown | null;
  revisedBreakdown: TaxBreakdown | null;
  strategyBuckets: StrategyBuckets | null;
  strategyExplanations: Map<string, { what_it_is: string; why_it_applies_or_not: string }>;
  whatIfMap: Map<string, WhatIfScenarioData>;
};

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function ResultsPage() {
  const router = useRouter();
  const [raw, setRaw] = useState<JsonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("latestAnalysis");
      if (!s) {
        setError("No analysis found. Please complete the intake form.");
        return;
      }
      const json = JSON.parse(s) as JsonRecord;
      setRaw(json);
    } catch {
      setError("Unable to read analysis. Please re-run intake.");
    }
  }, []);

  const vm = useMemo(() => buildViewModel(raw), [raw]);

  if (error) {
    return (
      <main style={styles.container}>
        <h1 style={styles.heading1}>Results</h1>
        <div
          role="alert"
          style={{
            border: `1px solid ${colors.error}`,
            background: "#fef2f2",
            padding: spacing.md,
            borderRadius: borderRadius.lg,
            marginTop: spacing.md,
          }}
        >
          {error}
        </div>
        <div style={{ marginTop: spacing.lg }}>
          <button 
            onClick={() => router.push("/intake")} 
            style={styles.button}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.primaryDark;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.primary;
            }}
          >
            Back to intake
          </button>
        </div>
      </main>
    );
  }

  if (!raw || !vm) {
    return (
      <main style={styles.container}>
        <h1 style={styles.heading1}>Results</h1>
        <p style={styles.bodyText}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={styles.container}>
      <header style={{ display: "grid", gap: spacing.sm, marginBottom: spacing.xl }}>
        <h1 style={styles.heading1}>Your Tax Planning Results</h1>
        <p style={{ ...styles.bodyText, margin: 0 }}>
          These are estimates based on the information provided. Final eligibility and savings depend on your facts and
          implementation.
        </p>
      </header>

      {/* Overview Section */}
      <section style={{ ...styles.card, marginBottom: spacing.lg }}>
        <h2 style={styles.heading2}>Overview</h2>
        <div style={{ ...pillRowStyle, marginTop: spacing.md }}>
          <Pill label="Request ID" value={vm.requestId ?? "—"} />
          <Pill label="Filing Status" value={vm.filingStatus ?? "—"} />
          <Pill label="State" value={vm.state ?? "—"} />
          <Pill label="Business" value={vm.hasBusiness ? "Yes" : "No"} />
          {vm.businessType && <Pill label="Business Type" value={vm.businessType} />}
          {vm.childrenCount !== null && (
            <Pill label="Children" value={vm.childrenCount === 0 ? "None" : String(vm.childrenCount)} />
          )}
        </div>

        {vm.executiveSummary && (
          <div style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
            <h3 style={styles.heading3}>Executive Summary</h3>
            <p style={{ ...styles.bodyText, margin: 0, whiteSpace: "pre-wrap", marginTop: spacing.sm }}>
              {vm.executiveSummary}
            </p>
          </div>
        )}
      </section>

      {/* Baseline vs Revised Tax Breakdown */}
      {vm.baselineBreakdown && vm.revisedBreakdown && (() => {
        const appliedStrategies = buildAppliedStrategies(vm.strategyBuckets, raw);
        
        // Dev-only invariant check: sum of applied AGI reductions should equal baseline AGI - revised AGI
        if (process.env.NODE_ENV !== "production" && vm.strategyBuckets) {
          const sumAppliedAgiDelta = appliedStrategies.reduce((sum, s) => sum + s.agiDeltaBase, 0);
          const actualAgiDelta = vm.baselineBreakdown.agi - vm.revisedBreakdown.agi;
          const diff = Math.abs(sumAppliedAgiDelta - actualAgiDelta);
          
          if (diff > 1) { // Allow 1 dollar rounding tolerance
            console.warn(
              `[AGI Reduction Mismatch] Sum of applied strategies (${sumAppliedAgiDelta}) does not match actual AGI delta (${actualAgiDelta}). Difference: ${diff}`,
              {
                appliedStrategies,
                baselineAgi: vm.baselineBreakdown.agi,
                revisedAgi: vm.revisedBreakdown.agi,
              }
            );
          }
        }
        
        return (
          <section style={{ ...styles.card, marginBottom: spacing.lg }}>
            <h2 style={styles.heading2}>Tax Breakdown: Baseline vs After Strategies</h2>
            <TaxBreakdownTable
              baseline={vm.baselineBreakdown}
              revised={vm.revisedBreakdown}
              appliedStrategies={appliedStrategies}
            />
          </section>
        );
      })()}

      {/* Strategy Buckets */}
      {vm.strategyBuckets &&
        (() => {
          const buckets = vm.strategyBuckets;
          return (
            <section style={{ ...styles.card, marginBottom: spacing.lg }}>
              <h2 style={styles.heading2}>Strategies</h2>

              {/* Tier 1: Quick wins */}
              <StrategyBucket
                strategies={buckets.applied.filter((s) => s.tier === 1)}
                tier={1}
                title="Quick wins (usually easiest)"
                description="These strategies are applied automatically when eligible. They stack together to reduce your taxable income."
              />

              {/* Tier 2: Bigger opportunities */}
              <div style={{ marginTop: spacing.xl }}>
                <StrategyBucket
                  strategies={buckets.opportunities.filter((s) => {
                    // Defensive: exclude any strategy already in applied bucket
                    return !buckets.applied.some((a) => a.strategyId === s.strategyId);
                  })}
                  tier={2}
                  title="Bigger opportunities to explore"
                  description="Each strategy is calculated independently (not combined with other Tier 2 strategies)."
                  whatIfMap={vm.whatIfMap}
                  baselineBreakdown={vm.baselineBreakdown}
                  strategyExplanations={vm.strategyExplanations}
                />
              </div>
            </section>
          );
        })()}

      {/* Actions */}
      <section style={{ ...styles.card, marginBottom: spacing.lg }}>
        <h2 style={styles.heading2}>Next Steps</h2>
        <div style={{ display: "flex", gap: spacing.md, flexWrap: "wrap" }}>
          <button 
            onClick={() => router.push("/intake")} 
            style={styles.button}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.primaryDark;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.primary;
            }}
          >
            Run Analysis Again
          </button>
          <button 
            onClick={() => copyToClipboard(JSON.stringify(raw, null, 2))} 
            style={styles.buttonSecondary}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.background;
              e.currentTarget.style.borderColor = colors.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.surface;
              e.currentTarget.style.borderColor = colors.borderDark;
            }}
          >
            Copy Raw JSON
          </button>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Components                                                         */
/* ------------------------------------------------------------------ */

function Pill(props: { label: string; value: string }) {
  return (
    <div style={pillStyle}>
      <div style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, fontWeight: typography.fontWeight.semibold }}>
        {props.label}
      </div>
      <div style={{ fontSize: typography.fontSize.sm, color: colors.textPrimary, fontWeight: typography.fontWeight.black }}>
        {props.value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View-model build                                                   */
/* ------------------------------------------------------------------ */

function buildViewModel(raw: JsonRecord | null): ResultsViewModel | null {
  if (!raw) return null;

  const intake = asRecord(raw["intake"]);
  const personal = asRecord(intake?.["personal"]);
  const business = asRecord(intake?.["business"]);

  const requestId = asString(raw["request_id"]) ?? asString(raw["requestId"]);
  const filingStatus = asString(personal?.["filing_status"]);
  const state = asString(personal?.["state"]);
  const hasBusiness = Boolean(business?.["has_business"]);
  const businessType = humanizeBusinessType(asString(business?.["entity_type"]));
  const childrenCount = asNumber(personal?.["children_0_17"]);

  const narrative = asRecord(raw["narrative"]);
  const executiveSummary = asString(narrative?.["executive_summary"]);

  // Extract strategy explanations from narrative
  const strategyExplanations = new Map<string, { what_it_is: string; why_it_applies_or_not: string }>();
  const explanationsArray = asArray(narrative?.["strategy_explanations"]);
  if (explanationsArray) {
    for (const item of explanationsArray) {
      const exp = asRecord(item);
      if (!exp) continue;
      const strategyId = asString(exp["strategy_id"]);
      const whatItIs = asString(exp["what_it_is"]);
      const whyItApplies = asString(exp["why_it_applies_or_not"]);
      if (strategyId && whatItIs && whyItApplies) {
        strategyExplanations.set(strategyId, { what_it_is: whatItIs, why_it_applies_or_not: whyItApplies });
      }
    }
  }

  // Extract breakdowns
  const baselineBreakdown = normalizeBreakdown(asRecord(raw["baseline_breakdown"]));
  const revisedBreakdown = normalizeBreakdown(asRecord(raw["revised_breakdown"]));

  // Extract strategy buckets
  const strategyBucketsRaw = asRecord(raw["strategy_buckets"]);
  const strategyBuckets: StrategyBuckets | null = strategyBucketsRaw
    ? {
        applied: normalizeStrategyImpacts(asArray(strategyBucketsRaw["applied"]) ?? []),
        opportunities: normalizeStrategyImpacts(asArray(strategyBucketsRaw["opportunities"]) ?? []),
        opportunity_what_if: normalizeWhatIfScenarios(
          asArray(strategyBucketsRaw["opportunity_what_if"]) ?? [],
          baselineBreakdown,
        ),
      }
    : null;

  // Build what-if map by strategyId
  const whatIfMap = new Map<string, WhatIfScenarioData>();
  if (strategyBuckets) {
    for (const whatIf of strategyBuckets.opportunity_what_if) {
      whatIfMap.set(whatIf.strategyId, whatIf);
    }
  }

  return {
    requestId,
    filingStatus,
    state,
    hasBusiness,
    businessType,
    childrenCount,
    executiveSummary,
    baselineBreakdown,
    revisedBreakdown,
    strategyBuckets,
    strategyExplanations,
    whatIfMap,
  };
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                       */
/* ------------------------------------------------------------------ */

function asRecord(v: unknown): JsonRecord | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as JsonRecord;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/* Applied strategies builder                                         */
/* ------------------------------------------------------------------ */

function buildAppliedStrategies(buckets: StrategyBuckets | null, raw: JsonRecord | null): Array<{
  strategyId: string;
  label: string;
  agiDeltaBase: number;
  taxSavings: number;
}> {
  if (!buckets) return [];

  // Build a map of payrollTaxDelta from impact_summary.impacts as a fallback
  const payrollTaxDeltaMap = new Map<string, { low: number; base: number; high: number }>();
  if (raw) {
    const impactSummary = asRecord(raw["impact_summary"]);
    const impacts = asArray(impactSummary?.["impacts"]);
    if (impacts) {
      for (const item of impacts) {
        const impact = asRecord(item);
        if (!impact) continue;
        const strategyId = asString(impact["strategyId"]);
        const payrollTaxDelta = normalizeRange3(asRecord(impact["payrollTaxDelta"]));
        if (strategyId && payrollTaxDelta) {
          payrollTaxDeltaMap.set(strategyId, payrollTaxDelta);
        }
      }
    }
  }

  // Include all strategies with APPLIED flag from all tiers
  const allStrategies = [...buckets.applied, ...buckets.opportunities];
  const applied = allStrategies.filter((s) => {
    // Must have APPLIED flag
    if (!s.flags.includes("APPLIED")) return false;
    // Must have either taxableIncomeDelta, taxLiabilityDelta, or payrollTaxDelta
    // Special case: s_corp_conversion may only have payrollTaxDelta
    if (s.strategyId === "s_corp_conversion") {
      return true; // Include s_corp_conversion even without taxableIncomeDelta
    }
    // For other strategies, require taxableIncomeDelta
    if (s.taxableIncomeDelta === null) return false;
    return true;
  });

  // Defensive deduplication: ensure each strategyId appears only once
  // If duplicates exist, keep the one from the applied bucket (prefer applied over opportunities)
  const dedupeMap = new Map<string, { strategyId: string; label: string; agiDeltaBase: number; taxSavings: number }>();
  
  for (const s of applied) {
    const catalogEntry =
      s.strategyId in STRATEGY_CATALOG ? STRATEGY_CATALOG[s.strategyId as StrategyId] : undefined;
    const label = catalogEntry?.uiLabel ?? s.strategyId;
    
    // AGI delta (deduction amount) - use 0 for s_corp_conversion if no taxableIncomeDelta
    const agiDeltaBase = s.taxableIncomeDelta?.base ?? 0;
    
    // Calculate tax savings:
    // - For s_corp_conversion: use payrollTaxDelta if available (from bucket or impact summary), otherwise taxLiabilityDelta
    // - For others: use taxLiabilityDelta if available, otherwise estimate from taxableIncomeDelta
    let taxSavings = 0;
    if (s.strategyId === "s_corp_conversion") {
      // s_corp_conversion primarily saves on payroll tax
      // First check bucket item, then fall back to impact summary
      const payrollTaxDelta = s.payrollTaxDelta ?? payrollTaxDeltaMap.get(s.strategyId);
      if (payrollTaxDelta) {
        taxSavings = Math.abs(payrollTaxDelta.base);
      } else if (s.taxLiabilityDelta) {
        // Fallback to taxLiabilityDelta if payrollTaxDelta not available
        taxSavings = Math.abs(s.taxLiabilityDelta.base);
      }
    } else if (s.taxLiabilityDelta) {
      // Use taxLiabilityDelta if available (negative value = savings)
      taxSavings = Math.abs(s.taxLiabilityDelta.base);
    } else if (s.taxableIncomeDelta) {
      // Fallback: estimate tax savings as ~25% of deduction (rough estimate)
      // This is a conservative estimate for income tax savings
      taxSavings = Math.abs(s.taxableIncomeDelta.base) * 0.25;
    }

    // If already exists, prefer the one from applied bucket (check if current is from applied)
    const isFromApplied = buckets.applied.some((a) => a.strategyId === s.strategyId);
    const existing = dedupeMap.get(s.strategyId);
    const existingIsFromApplied = existing && buckets.applied.some((a) => a.strategyId === s.strategyId);
    
    if (!existing || (isFromApplied && !existingIsFromApplied)) {
      dedupeMap.set(s.strategyId, {
        strategyId: s.strategyId,
        label,
        agiDeltaBase,
        taxSavings,
      });
    }
  }

  // Sort: regular strategies first, then s_corp_conversion at the end
  const result = Array.from(dedupeMap.values());
  const regularStrategies = result.filter((s) => s.strategyId !== "s_corp_conversion");
  const sCorpStrategy = result.find((s) => s.strategyId === "s_corp_conversion");
  
  return sCorpStrategy ? [...regularStrategies, sCorpStrategy] : regularStrategies;
}

function normalizeBreakdown(v: JsonRecord | null): TaxBreakdown | null {
  if (!v) return null;

  const adjustments = asRecord(v["adjustments"]);
  const federal = asRecord(v["federal"]);
  const ctc = asRecord(federal?.["ctc"]);
  const state = asRecord(v["state"]);
  const totals = asRecord(v["totals"]);

  const gross_income = asNumber(v["gross_income"]);
  const agi = asNumber(v["agi"]);
  const standard_deduction = asNumber(v["standard_deduction"]);
  const taxable_income = asNumber(v["taxable_income"]);

  if (
    gross_income === null ||
    agi === null ||
    standard_deduction === null ||
    taxable_income === null ||
    !federal ||
    !ctc ||
    !state ||
    !totals
  ) {
    return null;
  }

  return {
    gross_income,
    adjustments: {
      k401_employee_contrib_ytd: asNumber(adjustments?.["k401_employee_contrib_ytd"]) ?? 0,
    },
    agi,
    standard_deduction,
    taxable_income,
    federal: {
      income_tax_before_credits: asNumber(federal["income_tax_before_credits"]) ?? 0,
      ctc: {
        available: asNumber(ctc["available"]) ?? 0,
        used_nonrefundable: asNumber(ctc["used_nonrefundable"]) ?? 0,
        unused: asNumber(ctc["unused"]) ?? 0,
        ...(asString(ctc["phaseout_rules"])
          ? { phaseout_rules: asString(ctc["phaseout_rules"])! }
          : {}),
      },
      tax_after_credits: asNumber(federal["tax_after_credits"]) ?? 0,
    },
    state: {
      tax: asNumber(state["tax"]) ?? 0,
      taxable_base_proxy: asNumber(state["taxable_base_proxy"]) ?? 0,
    },
    totals: {
      federalTax: asNumber(totals["federalTax"]) ?? 0,
      stateTax: asNumber(totals["stateTax"]) ?? 0,
      payrollTax: asNumber(totals["payrollTax"]) ?? 0,
      totalTax: asNumber(totals["totalTax"]) ?? 0,
    },
  };
}

function normalizeStrategyImpacts(arr: unknown[]): StrategyImpact[] {
  const out: StrategyImpact[] = [];
  for (const item of arr) {
    const r = asRecord(item);
    if (!r) continue;

    const strategyId = asString(r["strategyId"]) ?? asString(r["strategy_id"]) ?? "";
    const tier = asNumber(r["tier"]);
    if (!strategyId || !tier || (tier !== 1 && tier !== 2)) continue;

    const taxableIncomeDelta = normalizeRange3(asRecord(r["taxableIncomeDelta"]));
    const taxLiabilityDelta = normalizeRange3(asRecord(r["taxLiabilityDelta"]));
    const payrollTaxDelta = normalizeRange3(asRecord(r["payrollTaxDelta"]));
    const assumptions = normalizeAssumptions(asArray(r["assumptions"]) ?? []);

    out.push({
      strategyId,
      tier: tier as 1 | 2,
      flags: asStringArray(r["flags"]) ?? [],
      status: asString(r["status"]),
      needsConfirmation: asBoolean(r["needsConfirmation"]),
      taxableIncomeDelta,
      taxLiabilityDelta,
      payrollTaxDelta,
      model: asString(r["model"]),
      assumptions,
    });
  }
  return out;
}

function normalizeWhatIfScenarios(
  arr: unknown[],
  baselineBreakdown: TaxBreakdown | null,
): WhatIfScenarioData[] {
  const out: WhatIfScenarioData[] = [];
  for (const item of arr) {
    const r = asRecord(item);
    if (!r) continue;

    const strategyId = asString(r["strategyId"]) ?? "";
    const breakdown = normalizeBreakdown(asRecord(r["breakdown"]));
    const totals = asRecord(r["totals"]);

    if (!strategyId || !breakdown || !totals) continue;

    out.push({
      strategyId,
      tier: 2,
      taxableIncomeDeltaBase: asNumber(r["taxableIncomeDeltaBase"]) ?? 0,
      totals: {
        federalTax: asNumber(totals["federalTax"]) ?? 0,
        stateTax: asNumber(totals["stateTax"]) ?? 0,
        totalTax: asNumber(totals["totalTax"]) ?? 0,
      },
      breakdown,
    });
  }
  return out;
}

function normalizeRange3(v: JsonRecord | null): { low: number; base: number; high: number } | null {
  if (!v) return null;
  const low = asNumber(v["low"]);
  const base = asNumber(v["base"]);
  const high = asNumber(v["high"]);
  if (low === null || base === null || high === null) return null;
  return { low, base, high };
}

function normalizeAssumptions(v: unknown[]): Array<{ id: string; category: string; value: unknown }> {
  const out: Array<{ id: string; category: string; value: unknown }> = [];
  for (const item of v) {
    const r = asRecord(item);
    const id = asString(r?.["id"]);
    const category = asString(r?.["category"]);
    if (!id || !category) continue;
    out.push({ id, category, value: r?.["value"] });
  }
  return out;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function asBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function humanizeBusinessType(entityType: string | null): string | null {
  if (!entityType) return null;
  const map: Record<string, string> = {
    S_CORP: "S Corporation",
    C_CORP: "C Corporation",
    SOLE_PROP: "Sole Proprietorship",
    PARTNERSHIP: "Partnership",
    LLC: "LLC",
  };
  return map[entityType] ?? entityType;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const pillRowStyle: React.CSSProperties = {
  display: "flex",
  gap: spacing.sm,
  flexWrap: "wrap",
};

const pillStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.background,
  borderRadius: borderRadius.full,
  padding: `${spacing.sm} ${spacing.md}`,
  display: "grid",
  gap: spacing.xs,
};
