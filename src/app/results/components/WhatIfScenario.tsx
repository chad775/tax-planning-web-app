// src/app/results/components/WhatIfScenario.tsx
/**
 * Component for displaying Tier 3 "what-if" scenarios in a prospect-friendly format.
 * 
 * Shows what the tax breakdown would look like if ONLY this strategy
 * were applied on top of Tier 1-2 strategies.
 * 
 * Each Tier 3 strategy is shown independently (not combined with other Tier 3).
 */

import React, { useState } from "react";
import { STRATEGY_CATALOG } from "@/lib/strategies/strategyCatalog";
import type { StrategyId } from "@/contracts/strategyIds";
import type { TaxBreakdown } from "./TaxBreakdownTable";

type WhatIfScenarioProps = {
  strategyId: string;
  breakdown: TaxBreakdown;
  taxableIncomeDeltaBase: number;
  baselineBreakdown: TaxBreakdown;
  assumptions?: Array<{ id: string; category: string; value: unknown }>;
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
  assumptions: Array<{ id: string; category: string; value: unknown }> | undefined,
  id: string,
): number | null {
  if (!assumptions) return null;
  const assumption = assumptions.find((a) => a.id === id);
  if (!assumption) return null;
  return safeNumber(assumption.value);
}

function deriveEstimatedCost(
  strategyId: string,
  assumptions: Array<{ id: string; category: string; value: unknown }> | undefined,
): number | null {
  if (!assumptions) return null;
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
    default:
      return null;
  }
}

function deriveCapitalRequired(
  strategyId: string,
  assumptions: Array<{ id: string; category: string; value: unknown }> | undefined,
): number | null {
  if (!assumptions) return null;
  if (strategyId === "short_term_rental") {
    return getAssumptionNumber(assumptions, "STR_PURCHASE_PRICE");
  }
  return null;
}

function deriveRecommendedIncomeMin(
  assumptions: Array<{ id: string; category: string; value: unknown }> | undefined,
): number | null {
  if (!assumptions) return null;
  return getAssumptionNumber(assumptions, "RECOMMENDED_INCOME_MIN");
}

export function WhatIfScenario({
  strategyId,
  breakdown,
  taxableIncomeDeltaBase,
  baselineBreakdown,
  assumptions,
}: WhatIfScenarioProps) {
  const [showDetails, setShowDetails] = useState(false);

  const catalogEntry =
    strategyId in STRATEGY_CATALOG ? STRATEGY_CATALOG[strategyId as StrategyId] : undefined;
  const strategyName = catalogEntry?.uiLabel ?? strategyId;
  const strategySummary = catalogEntry?.uiSummary;

  // Derive cost and capital required from assumptions
  const estimatedCost = deriveEstimatedCost(strategyId, assumptions);
  const capitalRequired = deriveCapitalRequired(strategyId, assumptions);
  const recommendedIncomeMin = deriveRecommendedIncomeMin(assumptions);

  // Calculate key metrics
  const deductionAmount = Math.abs(taxableIncomeDeltaBase);
  const taxSavings = Math.max(0, baselineBreakdown.totals.totalTax - breakdown.totals.totalTax);
  const netSavings = estimatedCost !== null ? taxSavings - estimatedCost : null;

  // Check if user income is below recommended minimum
  const userIncome = baselineBreakdown.gross_income;
  const incomeWarning = recommendedIncomeMin !== null && userIncome < recommendedIncomeMin;

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: 20,
    background: "#fff",
    marginBottom: 16,
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 20,
    marginBottom: 8,
    color: "#111",
  };

  const summaryStyle: React.CSSProperties = {
    fontSize: 14,
    color: "#555",
    lineHeight: 1.6,
    marginBottom: 20,
  };

  const numbersSectionStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 20,
    padding: "16px",
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
    fontSize: 24,
    fontWeight: 900,
    color: "#111",
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

  const toggleButtonStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "#117a2a",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "8px 0",
    textDecoration: "underline",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    marginTop: 12,
  };

  const rowStyle: React.CSSProperties = {
    borderTop: "1px solid #e5e5e5",
    padding: "8px 0",
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "#333",
    paddingRight: 16,
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 700,
    color: "#111",
    textAlign: "right" as const,
  };

  const deltaStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "#666",
    textAlign: "right" as const,
    fontSize: 12,
  };

  const formatDelta = (baselineVal: number, revisedVal: number): string => {
    const delta = revisedVal - baselineVal;
    if (delta === 0) return "—";
    const sign = delta < 0 ? "-" : "+";
    const absDelta = Math.abs(delta);
    return `${sign}$${absDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>What if you did: {strategyName}</div>
      {strategySummary && <div style={summaryStyle}>{strategySummary}</div>}

      {/* Income warning */}
      {incomeWarning && (
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              ...tagStyle,
              border: "1px solid #946200",
              background: "#fff9e6",
              color: "#946200",
            }}
          >
            May not be a fit at your current income
          </span>
        </div>
      )}

      {/* Recommended income minimum */}
      {recommendedIncomeMin !== null && (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
          Recommended for income above {formatMoney(recommendedIncomeMin)}
        </div>
      )}

      {/* Key Numbers Section */}
      <div style={numbersSectionStyle}>
        <div style={numberItemStyle}>
          <div style={numberLabelStyle}>Estimated deduction</div>
          <div style={numberValueStyle}>{formatMoney(deductionAmount)}</div>
        </div>
        <div style={numberItemStyle}>
          <div style={numberLabelStyle}>Estimated tax savings</div>
          <div style={{ ...numberValueStyle, color: "#117a2a" }}>{formatMoney(taxSavings)}</div>
        </div>
        <div style={numberItemStyle}>
          <div style={numberLabelStyle}>Estimated cost</div>
          <div style={numberValueStyle}>{formatMoneyOrDash(estimatedCost)}</div>
        </div>
        {capitalRequired !== null && (
          <div style={numberItemStyle}>
            <div style={numberLabelStyle}>Capital required</div>
            <div style={numberValueStyle}>{formatMoneyOrDash(capitalRequired)}</div>
          </div>
        )}
        {netSavings !== null && (
          <div style={numberItemStyle}>
            <div style={numberLabelStyle}>Estimated net savings</div>
            <div style={{ ...numberValueStyle, color: netSavings > 0 ? "#117a2a" : "#b00020" }}>
              {formatMoney(netSavings)}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Details Section */}
      <div>
        <button onClick={() => setShowDetails(!showDetails)} style={toggleButtonStyle}>
          {showDetails ? "Hide details" : "Show details"}
        </button>

        {showDetails && (
          <table style={tableStyle}>
            <tbody>
              <tr style={rowStyle}>
                <td style={labelStyle}>Taxable Income</td>
                <td style={valueStyle}>{formatMoney(breakdown.taxable_income)}</td>
                <td style={deltaStyle}>{formatDelta(baselineBreakdown.taxable_income, breakdown.taxable_income)}</td>
              </tr>
              <tr style={rowStyle}>
                <td style={labelStyle}>Federal Tax (Before Credits)</td>
                <td style={valueStyle}>{formatMoney(breakdown.federal.income_tax_before_credits)}</td>
                <td style={deltaStyle}>
                  {formatDelta(baselineBreakdown.federal.income_tax_before_credits, breakdown.federal.income_tax_before_credits)}
                </td>
              </tr>
              <tr style={rowStyle}>
                <td style={labelStyle}>Child Tax Credit</td>
                <td style={valueStyle}>{formatMoney(breakdown.federal.ctc.used_nonrefundable)}</td>
                <td style={deltaStyle}>
                  {formatDelta(
                    baselineBreakdown.federal.ctc.used_nonrefundable,
                    breakdown.federal.ctc.used_nonrefundable,
                  )}
                </td>
              </tr>
              <tr style={rowStyle}>
                <td style={labelStyle}>Federal Tax (After Credits)</td>
                <td style={valueStyle}>{formatMoney(breakdown.federal.tax_after_credits)}</td>
                <td style={deltaStyle}>
                  {formatDelta(baselineBreakdown.federal.tax_after_credits, breakdown.federal.tax_after_credits)}
                </td>
              </tr>
              <tr style={rowStyle}>
                <td style={labelStyle}>State Tax</td>
                <td style={valueStyle}>{formatMoney(breakdown.state.tax)}</td>
                <td style={deltaStyle}>{formatDelta(baselineBreakdown.state.tax, breakdown.state.tax)}</td>
              </tr>
              <tr style={{ ...rowStyle, borderTop: "2px solid #111", paddingTop: 12, marginTop: 8 }}>
                <td style={{ ...labelStyle, fontWeight: 900 }}>Total Tax</td>
                <td style={{ ...valueStyle, fontWeight: 900 }}>{formatMoney(breakdown.totals.totalTax)}</td>
                <td style={{ ...deltaStyle, fontWeight: 900 }}>
                  {formatDelta(baselineBreakdown.totals.totalTax, breakdown.totals.totalTax)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
