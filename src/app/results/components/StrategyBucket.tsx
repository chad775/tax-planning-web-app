// src/app/results/components/StrategyBucket.tsx
/**
 * Component for displaying strategies in a bucket (Tier 1, Tier 2, or Tier 3).
 * 
 * Shows strategy details including:
 * - Strategy name and tier
 * - Eligibility status
 * - Impact deltas (taxable income and tax liability)
 * - Flags and assumptions
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

  const formatRange = (range: { low: number; base: number; high: number } | null): string => {
    if (range === null) return "—";
    if (range.low === range.base && range.base === range.high) {
      return formatMoney(range.base);
    }
    return `${formatMoney(range.low)} - ${formatMoney(range.high)} (base: ${formatMoney(range.base)})`;
  };

  const getStatusColor = (status: string | null): string => {
    if (status === "ELIGIBLE") return "#117a2a";
    if (status === "NOT_ELIGIBLE") return "#b00020";
    if (status === "POTENTIAL") return "#946200";
    return "#666";
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: 14,
    background: "#fff",
    marginBottom: 12,
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    marginBottom: 8,
  };

  const tagStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    marginRight: 6,
    marginBottom: 6,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "#666",
    marginTop: 10,
    marginBottom: 4,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#111",
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

          return (
            <div key={strategy.strategyId} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={headerStyle}>{strategyName}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      ...tagStyle,
                      border: `1px solid ${getStatusColor(strategy.status)}`,
                      background: getStatusColor(strategy.status) === "#117a2a" ? "#f0fff4" : "#fff",
                      color: getStatusColor(strategy.status),
                    }}
                  >
                    {strategy.status || "UNKNOWN"}
                  </span>
                  <span
                    style={{
                      ...tagStyle,
                      border: "1px solid #ccc",
                      background: "#fafafa",
                      color: "#333",
                    }}
                  >
                    Tier {tier}
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
                      Needs Confirmation
                    </span>
                  )}
                  {strategy.flags.includes("ALREADY_IN_USE") && (
                    <span
                      style={{
                        ...tagStyle,
                        border: "1px solid #666",
                        background: "#f5f5f5",
                        color: "#333",
                      }}
                    >
                      Already in Use
                    </span>
                  )}
                </div>
              </div>

              {strategy.taxableIncomeDelta !== null && (
                <div>
                  <div style={labelStyle}>Taxable Income Delta</div>
                  <div style={valueStyle}>{formatRange(strategy.taxableIncomeDelta)}</div>
                </div>
              )}

              {strategy.taxLiabilityDelta !== null && (
                <div>
                  <div style={labelStyle}>Tax Liability Delta</div>
                  <div style={valueStyle}>{formatRange(strategy.taxLiabilityDelta)}</div>
                </div>
              )}

              {strategy.model !== null && strategy.model !== undefined && (
                <div>
                  <div style={labelStyle}>Model</div>
                  <div style={valueStyle}>{strategy.model}</div>
                </div>
              )}

              {strategy.assumptions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={labelStyle}>Assumptions</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {strategy.assumptions.map((assumption) => (
                      <div
                        key={assumption.id}
                        style={{
                          fontSize: 11,
                          padding: 6,
                          background: "#fafafa",
                          borderRadius: 6,
                          border: "1px solid #eee",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{assumption.id}</div>
                        <div style={{ color: "#666", fontSize: 10 }}>{assumption.category}</div>
                        {assumption.value !== undefined && (
                          <div style={{ color: "#111", fontSize: 10 }}>
                            {typeof assumption.value === "number"
                              ? formatMoney(assumption.value)
                              : String(assumption.value)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
