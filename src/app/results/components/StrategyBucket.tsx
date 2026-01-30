// src/app/results/components/StrategyBucket.tsx
/**
 * Component for displaying strategies in a bucket (Tier 1, Tier 2, or Tier 3).
 * 
 * Prospect-friendly version showing:
 * - Strategy name and plain English summary
 * - Friendly status labels
 * - Key numbers (deduction, tax savings, cost, net savings for Tier 3)
 * - Simple flag explanations
 */

import React from "react";
import { STRATEGY_CATALOG } from "@/lib/strategies/strategyCatalog";
import type { StrategyId } from "@/contracts/strategyIds";
import type { TaxBreakdown } from "./TaxBreakdownTable";

type StrategyImpact = {
  strategyId: string;
  tier: 1 | 2 | 3;
  flags: string[];
  status: string | null;
  needsConfirmation: boolean | null;
  taxableIncomeDelta: { low: number; base: number; high: number } | null;
  taxLiabilityDelta: { low: number; base: number; high: number } | null;
  model: string | null;
  assumptions: Array<{ id: string; category: string; value: unknown }>;
};

type WhatIfScenarioData = {
  strategyId: string;
  tier: 3;
  taxableIncomeDeltaBase: number;
  totals: {
    federalTax: number;
    stateTax: number;
    totalTax: number;
  };
  breakdown: TaxBreakdown;
};

type StrategyBucketProps = {
  strategies: StrategyImpact[];
  tier: 1 | 2 | 3;
  title: string;
  description?: string;
  whatIfMap?: Map<string, WhatIfScenarioData>;
  baselineBreakdown?: TaxBreakdown | null;
  strategyExplanations?: Map<string, { what_it_is: string; why_it_applies_or_not: string }>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const absAmount = Math.abs(amount);
  return `${sign}$${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatMoneyOrDash(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  return formatMoney(value);
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function getAssumptionNumber(
  assumptions: Array<{ id: string; category: string; value: unknown }>,
  id: string,
): number | null {
  const assumption = assumptions.find((a) => a.id === id);
  if (!assumption) return null;
  return safeNumber(assumption.value);
}

function getAssumptionString(
  assumptions: Array<{ id: string; category: string; value: unknown }>,
  id: string,
): string | null {
  const assumption = assumptions.find((a) => a.id === id);
  if (!assumption) return null;
  return typeof assumption.value === "string" ? assumption.value : null;
}

function deriveEstimatedCost(
  strategyId: string,
  assumptions: Array<{ id: string; category: string; value: unknown }>,
): number | null {
  switch (strategyId) {
    case "rtu_program":
      return getAssumptionNumber(assumptions, "RTU_INVESTMENT");
    case "film_credits":
      return getAssumptionNumber(assumptions, "FILM_INVESTMENT_MIN");
    case "leveraged_charitable":
      return getAssumptionNumber(assumptions, "LEVERAGED_CHARITABLE_INVESTMENT_MIN");
    case "short_term_rental":
      // Cost is NOT just purchase price; treat purchase price as "capital required"
      return null;
    case "s_corp_conversion":
      // Setup/admin cost placeholder: typically $1-3k
      // Return null to show "Varies" in UI, but we could add an assumption if needed
      return null;
    default:
      return null;
  }
}

function deriveCapitalRequired(
  strategyId: string,
  assumptions: Array<{ id: string; category: string; value: unknown }>,
): number | null {
  if (strategyId === "short_term_rental") {
    return getAssumptionNumber(assumptions, "STR_PURCHASE_PRICE");
  }
  return null;
}

function deriveRecommendedIncomeMin(
  assumptions: Array<{ id: string; category: string; value: unknown }>,
): number | null {
  return getAssumptionNumber(assumptions, "RECOMMENDED_INCOME_MIN");
}

export function StrategyBucket({
  strategies,
  tier,
  title,
  description,
  whatIfMap,
  baselineBreakdown,
  strategyExplanations,
}: StrategyBucketProps) {
  const formatIncomeReduction = (range: { low: number; base: number; high: number } | null): string => {
    if (range === null) return "—";
    const base = Math.abs(range.base);
    const low = Math.abs(range.low);
    const high = Math.abs(range.high);

    if (low === base && base === high) {
      return `About ${formatMoney(-base)}`;
    }
    return `About ${formatMoney(-base)} (range ${formatMoney(-low)} to ${formatMoney(-high)})`;
  };

  const getFriendlyStatus = (status: string | null): string => {
    if (status === "ELIGIBLE") return "Eligible";
    if (status === "NOT_ELIGIBLE") return "Not eligible";
    if (status === "POTENTIAL") return "Could be eligible";
    return "Needs review";
  };

  const getStatusColor = (status: string | null): string => {
    if (status === "ELIGIBLE") return "#117a2a";
    if (status === "NOT_ELIGIBLE") return "#b00020";
    if (status === "POTENTIAL") return "#946200";
    return "#666";
  };

  const getFriendlyFlagLabel = (flag: string): string | null => {
    if (flag === "ALREADY_IN_USE") return "Already using this";
    if (flag === "NOT_APPLIED_POTENTIAL" && tier === 3) return "Optional";
    if (flag === "CAPPED_BY_TAXABLE_INCOME") return "Limited by your income";
    if (flag === "CAPPED_BY_TAX_LIABILITY") return "Limited by tax owed";
    // Hide other flags from prospect view
    return null;
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
    marginBottom: 12,
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    marginBottom: 8,
  };

  const summaryStyle: React.CSSProperties = {
    fontSize: 14,
    color: "#555",
    lineHeight: 1.5,
    marginBottom: 12,
  };

  const tagStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    marginRight: 6,
    marginBottom: 6,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "#333",
    marginTop: 12,
    marginBottom: 6,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: "#111",
    lineHeight: 1.5,
  };

  const numbersSectionStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 12,
    padding: "12px",
    background: "#fafafa",
    borderRadius: 8,
    border: "1px solid #e5e5e5",
  };

  const numberItemStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const numberLabelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#666",
  };

  const numberValueStyle: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 900,
    color: "#111",
  };

  const friendlyNoteStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#666",
    lineHeight: 1.5,
    marginTop: 8,
    fontStyle: "italic",
  };

  if (strategies.length === 0) {
    return (
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>{title}</h3>
        {description && <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{description}</p>}
        <p style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>No strategies in this tier.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>{title}</h3>
      {description && <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{description}</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {strategies.map((strategy) => {
          const catalogEntry =
            strategy.strategyId in STRATEGY_CATALOG
              ? STRATEGY_CATALOG[strategy.strategyId as StrategyId]
              : undefined;
          const strategyName = catalogEntry?.uiLabel ?? strategy.strategyId;
          
          // Prefer narrative explanation, fallback to catalog summary
          const narrativeExplanation = strategyExplanations?.get(strategy.strategyId);
          const strategySummary = narrativeExplanation?.what_it_is ?? catalogEntry?.uiSummary;

          const friendlyStatus = getFriendlyStatus(strategy.status);
          const statusColor = getStatusColor(strategy.status);

          // Collect friendly flags (only show relevant ones)
          const friendlyFlags: string[] = [];
          for (const flag of strategy.flags) {
            const friendly = getFriendlyFlagLabel(flag);
            if (friendly) friendlyFlags.push(friendly);
          }

          // For Tier 3: derive cost and capital required from assumptions
          const estimatedCost = tier === 3 ? deriveEstimatedCost(strategy.strategyId, strategy.assumptions) : null;
          const capitalRequired = tier === 3 ? deriveCapitalRequired(strategy.strategyId, strategy.assumptions) : null;
          const recommendedIncomeMin =
            tier === 3 ? deriveRecommendedIncomeMin(strategy.assumptions) : null;

          // Calculate key metrics for Tier 3 using what-if data
          let deductionAmount: number | null = null;
          let taxSavings: number | null = null;
          let hasWhatIfData = false;

          if (tier === 3) {
            const whatIf = whatIfMap?.get(strategy.strategyId);
            if (whatIf && baselineBreakdown) {
              hasWhatIfData = true;
              deductionAmount = Math.abs(whatIf.taxableIncomeDeltaBase);
              taxSavings = Math.max(0, baselineBreakdown.totals.totalTax - whatIf.totals.totalTax);
            } else if (strategy.taxableIncomeDelta !== null) {
              // Fallback to strategy delta if what-if not available
              deductionAmount = Math.abs(strategy.taxableIncomeDelta.base);
              taxSavings = strategy.taxLiabilityDelta !== null ? Math.abs(strategy.taxLiabilityDelta.base) : null;
            }
          }

          const netSavings = tier === 3 && estimatedCost !== null && taxSavings !== null ? taxSavings - estimatedCost : null;

          // Build reason why not applied (clear, plain English)
          const whyNotApplied: string[] = [];
          if (strategy.needsConfirmation) {
            whyNotApplied.push("Needs a quick fact check");
          }
          if (strategy.flags.includes("CAPPED_BY_TAXABLE_INCOME")) {
            whyNotApplied.push("Limited by your current taxable income");
          }
          if (strategy.flags.includes("ALREADY_IN_USE")) {
            whyNotApplied.push("Already in use (additional savings may be $0)");
          }
          if (strategy.status === "NOT_ELIGIBLE") {
            const narrativeReason = narrativeExplanation?.why_it_applies_or_not;
            if (narrativeReason) {
              whyNotApplied.push(narrativeReason);
            } else {
              whyNotApplied.push("Not eligible based on your current situation");
            }
          } else if (strategy.status === "POTENTIAL") {
            whyNotApplied.push("May be eligible with additional information");
          }

          return (
            <div key={strategy.strategyId} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={headerStyle}>{strategyName}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      ...tagStyle,
                      border: `1px solid ${statusColor}`,
                      background: statusColor === "#117a2a" ? "#f0fff4" : "#fff",
                      color: statusColor,
                    }}
                  >
                    {friendlyStatus}
                  </span>
                  {strategy.needsConfirmation && (
                    <span
                      style={{
                        ...tagStyle,
                        border: "1px solid #946200",
                        background: "#fff9e6",
                        color: "#946200",
                      }}
                    >
                      Needs more info
                    </span>
                  )}
                  {friendlyFlags.map((flag) => (
                    <span
                      key={flag}
                      style={{
                        ...tagStyle,
                        border: "1px solid #666",
                        background: "#f5f5f5",
                        color: "#333",
                      }}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>

              {/* What this is summary - only show if exists */}
              {strategySummary && <div style={summaryStyle}>{strategySummary}</div>}

              {/* Tier 3: Key numbers section */}
              {tier === 3 && (
                <div style={numbersSectionStyle}>
                  {strategy.strategyId !== "s_corp_conversion" && (
                    <div style={numberItemStyle}>
                      <div style={numberLabelStyle}>Estimated deduction</div>
                      <div style={numberValueStyle}>
                        {hasWhatIfData ? formatMoneyOrDash(deductionAmount) : "Estimate requires review"}
                      </div>
                    </div>
                  )}
                  <div style={numberItemStyle}>
                    <div style={numberLabelStyle}>
                      {strategy.strategyId === "s_corp_conversion"
                        ? "Estimated payroll tax savings"
                        : "Estimated tax savings"}
                    </div>
                    <div style={{ ...numberValueStyle, color: "#117a2a" }}>
                      {hasWhatIfData ? formatMoneyOrDash(taxSavings) : "Estimate requires review"}
                    </div>
                  </div>
                  <div style={numberItemStyle}>
                    <div style={numberLabelStyle}>Cost</div>
                    <div style={numberValueStyle}>
                      {estimatedCost !== null
                        ? formatMoneyOrDash(estimatedCost)
                        : strategy.strategyId === "s_corp_conversion"
                          ? "Typically $1–3k"
                          : "Varies"}
                    </div>
                  </div>
                  {capitalRequired !== null && (
                    <div style={numberItemStyle}>
                      <div style={numberLabelStyle}>Capital required</div>
                      <div style={numberValueStyle}>{formatMoneyOrDash(capitalRequired)}</div>
                    </div>
                  )}
                  {netSavings !== null && (
                    <div style={numberItemStyle}>
                      <div style={numberLabelStyle}>Net tax benefit after cost</div>
                      <div style={{ ...numberValueStyle, color: netSavings > 0 ? "#117a2a" : "#b00020" }}>
                        {formatMoney(netSavings)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tier 1-2: Estimated income reduction */}
              {tier !== 3 && strategy.taxableIncomeDelta !== null && (
                <div>
                  <div style={labelStyle}>Estimated deduction</div>
                  <div style={valueStyle}>{formatIncomeReduction(strategy.taxableIncomeDelta)}</div>
                </div>
              )}

              {/* Why this needs review */}
              {whyNotApplied.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, background: "#fff9e6", borderRadius: 8, border: "1px solid #ffd700" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#946200", marginBottom: 6 }}>
                    Why this needs review
                  </div>
                  {whyNotApplied.map((reason, idx) => (
                    <div key={idx} style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                      • {reason}
                    </div>
                  ))}
                </div>
              )}

              {/* Recommended income minimum (Tier 3 only) */}
              {tier === 3 && recommendedIncomeMin !== null && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                  Recommended for income above {formatMoney(recommendedIncomeMin)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
