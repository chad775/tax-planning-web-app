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
  const taxPlanEventFired = React.useRef(false);

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

  useEffect(() => {
    if (taxPlanEventFired.current || !raw) return;
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    const requestIdOrPath =
      asString(raw["request_id"]) ?? asString(raw["requestId"]) ?? window.location.pathname;
    const storageKey = `meta_pixel_tax_plan_${requestIdOrPath}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
    taxPlanEventFired.current = true;
    window.fbq("trackCustom", "TaxPlanCompleted");
  }, [raw]);

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

        {(() => {
          const enhancedSummary = buildEnhancedExecutiveSummary(vm, raw);
          if (!enhancedSummary) return null;
          
          return (
            <div style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
              <h3 style={styles.heading3}>Executive Summary</h3>
              <div style={{ ...styles.bodyText, margin: 0, marginTop: spacing.sm, lineHeight: typography.lineHeight.relaxed }}>
                {enhancedSummary.map((paragraph, idx) => (
                  <p key={idx} style={{ marginBottom: spacing.md, marginTop: idx === 0 ? 0 : spacing.md }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          );
        })()}
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
                  revisedBreakdown={vm.revisedBreakdown}
                  strategyExplanations={vm.strategyExplanations}
                />
              </div>
            </section>
          );
        })()}

      {/* CTA Section */}
      <section
        style={{
          marginTop: spacing.xl,
          marginBottom: spacing.xl,
          paddingTop: spacing.xl,
          borderTop: `2px solid ${colors.border}`,
        }}
      >
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              ...styles.bodyText,
              fontSize: typography.fontSize.lg,
              lineHeight: typography.lineHeight.relaxed,
              marginBottom: spacing.xl,
              color: colors.textSecondary,
            }}
          >
            Your tax savings opportunities are only as good as the strategy behind them.
            Meet with a Boyd Group Services advisor to walk through these results, pressure-test the assumptions, and map out the next steps to actually implement the savings.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing.md,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <a
              href="https://healthcheck.boydgroupservices.com/start-schedulepage"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...styles.button,
                textDecoration: "none",
                display: "inline-block",
                textAlign: "center",
                fontSize: typography.fontSize["2xl"],
                padding: `${spacing.lg} ${spacing["2xl"]}`,
                minWidth: "400px",
                background: "#36a9a2",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#2d8a84";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#36a9a2";
              }}
            >
              Schedule Your Free Call
            </a>

            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.print();
                }
              }}
              style={{
                ...styles.buttonSecondary,
                textAlign: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.background;
                e.currentTarget.style.borderColor = colors.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.surface;
                e.currentTarget.style.borderColor = colors.borderDark;
              }}
            >
              Print This Analysis
            </button>
          </div>
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
/* Enhanced executive summary builder                                 */
/* ------------------------------------------------------------------ */

function buildEnhancedExecutiveSummary(vm: ResultsViewModel | null, raw: JsonRecord | null): string[] | null {
  if (!vm || !raw) return null;

  const intake = asRecord(raw["intake"]);
  const personal = asRecord(intake?.["personal"]);
  const business = asRecord(intake?.["business"]);
  const baseline = asRecord(raw["baseline"]);
  const impactSummary = asRecord(raw["impact_summary"]);
  const revisedTotals = asRecord(impactSummary?.["revisedTotals"]);
  const revised = asRecord(revisedTotals?.["revised"]);

  // Extract key data
  const filingStatus = vm.filingStatus;
  const state = vm.state;
  const hasBusiness = vm.hasBusiness;
  const businessType = vm.businessType;
  const childrenCount = vm.childrenCount ?? 0;
  const incomeW2 = asNumber(personal?.["income_excl_business"]) ?? 0;
  const businessProfit = asNumber(business?.["net_profit"]) ?? 0;
  const totalIncome = incomeW2 + businessProfit;
  const baselineTotalTax = asNumber(baseline?.["totalTax"]) ?? 0;
  const revisedTotalTax = asNumber(revised?.["totalTax"]) ?? 0;
  const savings = baselineTotalTax - revisedTotalTax;
  const appliedCount = vm.strategyBuckets?.applied.length ?? 0;
  const opportunitiesCount = vm.strategyBuckets?.opportunities.length ?? 0;

  // Format helpers
  const formatMoney = (amount: number): string => {
    return `$${Math.round(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatFilingStatus = (status: string | null): string => {
    if (!status) return "your filing status";
    const map: Record<string, string> = {
      SINGLE: "single",
      MARRIED_FILING_JOINTLY: "married filing jointly",
      MARRIED_FILING_SEPARATELY: "married filing separately",
      HEAD_OF_HOUSEHOLD: "head of household",
    };
    return map[status] ?? status.toLowerCase().replace(/_/g, " ");
  };

  const paragraphs: string[] = [];

  // Paragraph 1: Your situation
  let para1 = `Based on your situation as ${filingStatus ? `someone filing ${formatFilingStatus(filingStatus)}` : "a taxpayer"}`;
  if (state) {
    para1 += ` in ${state}`;
  }
  if (hasBusiness && businessType) {
    para1 += ` with a ${businessType.toLowerCase()} business`;
  } else if (hasBusiness) {
    para1 += ` with a business`;
  }
  if (childrenCount > 0) {
    para1 += ` and ${childrenCount} ${childrenCount === 1 ? "child" : "children"}`;
  }
  para1 += `, we've analyzed your tax situation for 2025. `;
  
  if (totalIncome > 0) {
    para1 += `Your total income is around ${formatMoney(totalIncome)}`;
    if (hasBusiness && businessProfit > 0 && incomeW2 > 0) {
      para1 += ` (${formatMoney(incomeW2)} from wages and ${formatMoney(businessProfit)} from your business)`;
    } else if (hasBusiness && businessProfit > 0) {
      para1 += ` from your business`;
    }
    para1 += `. `;
  }
  
  para1 += `Without any tax planning strategies, you would owe approximately ${formatMoney(baselineTotalTax)} in total taxes this year.`;
  paragraphs.push(para1);

  // Paragraph 2: What we found
  let para2 = `The good news is we found ${appliedCount > 0 ? `${appliedCount} ${appliedCount === 1 ? "strategy" : "strategies"}` : "several strategies"} that can help reduce your tax bill. `;
  
  if (appliedCount > 0) {
    para2 += `These ${appliedCount === 1 ? "strategy is" : "strategies are"} already applied in the calculations below and ${appliedCount === 1 ? "shows" : "show"} how much you could save. `;
  }
  
  if (savings > 0) {
    para2 += `By using these strategies, your total tax could drop to around ${formatMoney(revisedTotalTax)}, which means you could save approximately ${formatMoney(savings)}. `;
  } else {
    para2 += `These strategies can help lower your tax bill. `;
  }
  
  if (opportunitiesCount > 0) {
    para2 += `We also found ${opportunitiesCount} ${opportunitiesCount === 1 ? "additional opportunity" : "additional opportunities"} that might work for you, but ${opportunitiesCount === 1 ? "it needs" : "they need"} a bit more review to see if ${opportunitiesCount === 1 ? "it's" : "they're"} the right fit.`;
  } else {
    para2 += `All the strategies we identified are already included in your savings estimate above.`;
  }
  paragraphs.push(para2);

  // Paragraph 3: Next steps / insights
  let para3 = "";
  if (appliedCount > 0 && opportunitiesCount > 0) {
    para3 = `The strategies we've applied still require proper setup, documentation, and compliance with IRS rules to work correctly. `;
    para3 += `The additional opportunities we found are even more complex—they often involve significant upfront investments, detailed plan design, ongoing compliance requirements, and careful cost-benefit analysis. `;
    para3 += `Each one has specific eligibility criteria, documentation requirements, and IRS regulations that must be followed precisely to avoid issues. `;
    para3 += `Getting these right requires understanding the technical details, ensuring proper implementation, and maintaining compliance over time.`;
  } else if (appliedCount > 0) {
    para3 = `While these strategies can provide real savings, they're not simple to implement correctly. `;
    para3 += `Each one requires proper setup, detailed documentation, compliance with IRS regulations, and often involves plan design, payroll setup, or other technical requirements. `;
    para3 += `The exact savings depend on getting all the details right—proper substantiation, meeting eligibility criteria, and ensuring everything is structured correctly according to tax law.`;
  } else if (opportunitiesCount > 0) {
    para3 = `The opportunities we found are complex strategies that require significant planning and careful execution. `;
    para3 += `They typically involve large upfront investments, detailed plan design, ongoing compliance requirements, and specific documentation that must meet IRS standards. `;
    para3 += `Each strategy has intricate eligibility rules, cost-benefit considerations, and regulatory requirements that need to be carefully evaluated and properly implemented. `;
    para3 += `Getting these strategies right requires deep understanding of tax law, proper structuring, and meticulous attention to compliance details.`;
  } else {
    para3 = `We've reviewed your situation and calculated your tax estimate. `;
    para3 += `If you'd like to explore additional strategies, keep in mind that most tax planning strategies require proper setup, detailed documentation, and compliance with complex IRS regulations to be effective.`;
  }
  paragraphs.push(para3);

  return paragraphs;
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
    totals: (() => {
      const federalTax = asNumber(totals["federalTax"]) ?? asNumber(totals["federal_tax"]) ?? 0;
      const stateTax = asNumber(totals["stateTax"]) ?? asNumber(totals["state_tax"]) ?? 0;
      const payrollTax = asNumber(totals["payrollTax"]) ?? asNumber(totals["payroll_tax"]) ?? 0;
      const totalTax = asNumber(totals["totalTax"]) ?? asNumber(totals["total_tax"]) ?? 0;
      // If totalTax is 0 but components exist, derive total (handles missing or mis-keyed totalTax)
      const derived =
        totalTax === 0 && (federalTax !== 0 || stateTax !== 0 || payrollTax !== 0)
          ? federalTax + stateTax + payrollTax
          : totalTax;
      return { federalTax, stateTax, payrollTax, totalTax: derived };
    })(),
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
