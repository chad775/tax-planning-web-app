// src/app/results/components/StrategyBucket.tsx
/**
 * Component for displaying strategies in a bucket (Tier 1, Tier 2, or Tier 3).
 * 
 * Prospect-friendly version showing:
 * - Strategy name and plain English summary
 * - Friendly status labels
 * - Estimated income reduction in readable format
 * - Simple flag explanations
 */

import React from "react";
import { STRATEGY_CATALOG } from "@/lib/strategies/strategyCatalog";
import type { StrategyId } from "@/contracts/strategyIds";

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

type StrategyBucketProps = {
  strategies: StrategyImpact[];
  tier: 1 | 2 | 3;
  title: string;
  description?: string;
};

export function StrategyBucket({ strategies, tier, title, description }: StrategyBucketProps) {
  const formatMoney = (amount: number): string => {
    const sign = amount < 0 ? "-" : "";
    const absAmount = Math.abs(amount);
    return `${sign}$${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

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
          const strategySummary = catalogEntry?.uiSummary ?? "This is a potential strategy that may reduce taxable income depending on your situation.";

          const friendlyStatus = getFriendlyStatus(strategy.status);
          const statusColor = getStatusColor(strategy.status);

          // Collect friendly flags (only show relevant ones)
          const friendlyFlags: string[] = [];
          for (const flag of strategy.flags) {
            const friendly = getFriendlyFlagLabel(flag);
            if (friendly) friendlyFlags.push(friendly);
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

              {/* What this is summary */}
              <div style={summaryStyle}>{strategySummary}</div>

              {/* Estimated income reduction */}
              {strategy.taxableIncomeDelta !== null && (
                <div>
                  <div style={labelStyle}>Estimated income reduction</div>
                  <div style={valueStyle}>{formatIncomeReduction(strategy.taxableIncomeDelta)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
