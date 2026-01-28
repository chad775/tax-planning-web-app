// src/app/results/components/WhatIfScenario.tsx
/**
 * Component for displaying Tier 3 "what-if" scenarios.
 * 
 * Shows what the tax breakdown would look like if ONLY this strategy
 * were applied on top of Tier 1-2 strategies.
 * 
 * Each Tier 3 strategy is shown independently (not combined with other Tier 3).
 */

import React from "react";
import { STRATEGY_CATALOG } from "@/lib/strategies/strategyCatalog";
import type { StrategyId } from "@/contracts/strategyIds";
import type { TaxBreakdown } from "./TaxBreakdownTable";

type WhatIfScenarioProps = {
  strategyId: string;
  breakdown: TaxBreakdown;
  taxableIncomeDeltaBase: number;
  baselineBreakdown: TaxBreakdown;
};

export function WhatIfScenario({
  strategyId,
  breakdown,
  taxableIncomeDeltaBase,
  baselineBreakdown,
}: WhatIfScenarioProps) {
  const catalogEntry =
    strategyId in STRATEGY_CATALOG ? STRATEGY_CATALOG[strategyId as StrategyId] : undefined;
  const strategyName = catalogEntry?.uiLabel ?? strategyId;

  const formatMoney = (amount: number): string => {
    const sign = amount < 0 ? "-" : "";
    const absAmount = Math.abs(amount);
    return `${sign}$${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatDelta = (baselineVal: number, revisedVal: number): string => {
    const delta = revisedVal - baselineVal;
    if (delta === 0) return "—";
    const sign = delta < 0 ? "-" : "+";
    const absDelta = Math.abs(delta);
    return `${sign}$${absDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
    marginBottom: 16,
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 18,
    marginBottom: 4,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
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

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>What if: {strategyName}</div>
      <div style={subtitleStyle}>
        Estimated impact if this strategy is applied on top of Tier 1-2 strategies
      </div>

      <table style={tableStyle}>
        <tbody>
          <tr style={rowStyle}>
            <td style={labelStyle}>Taxable Income Delta</td>
            <td style={valueStyle}>{formatMoney(taxableIncomeDeltaBase)}</td>
            <td style={deltaStyle}></td>
          </tr>
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
    </div>
  );
}
