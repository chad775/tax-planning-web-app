// src/app/results/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TaxBreakdownTable, type TaxBreakdown } from "./components/TaxBreakdownTable";
import { StrategyBucket } from "./components/StrategyBucket";
import { WhatIfScenario } from "./components/WhatIfScenario";

type JsonRecord = Record<string, unknown>;

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
  executiveSummary: string | null;
  baselineBreakdown: TaxBreakdown | null;
  revisedBreakdown: TaxBreakdown | null;
  strategyBuckets: StrategyBuckets | null;
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
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 10px" }}>Results</h1>
        <div
          role="alert"
          style={{
            border: "1px solid #c00",
            background: "#fff5f5",
            padding: 12,
            borderRadius: 10,
          }}
        >
          {error}
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={() => router.push("/intake")} style={buttonStyle}>
            Back to intake
          </button>
        </div>
      </main>
    );
  }

  if (!raw || !vm) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Results</h1>
        <p style={{ color: "#444" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ display: "grid", gap: 6, marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>Your Tax Planning Results</h1>
        <p style={{ margin: 0, color: "#666", fontSize: 15 }}>
          These are estimates based on the information provided. Final eligibility and savings depend on your facts and
          implementation.
        </p>
      </header>

      {/* Overview Section */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Overview</h2>
        <div style={pillRowStyle}>
          <Pill label="Request ID" value={vm.requestId ?? "—"} />
          <Pill label="Filing Status" value={vm.filingStatus ?? "—"} />
          <Pill label="State" value={vm.state ?? "—"} />
          <Pill label="Business" value={vm.hasBusiness ? "Yes" : "No"} />
        </div>

        {vm.executiveSummary && (
          <div style={{ marginTop: 16 }}>
            <h3 style={h3Style}>Executive Summary</h3>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#111", lineHeight: 1.6 }}>
              {vm.executiveSummary}
            </p>
          </div>
        )}
      </section>

      {/* Baseline vs Revised Tax Breakdown */}
      {vm.baselineBreakdown && vm.revisedBreakdown && (
        <section style={cardStyle}>
          <h2 style={h2Style}>Tax Breakdown: Baseline vs After Strategies</h2>
          <TaxBreakdownTable baseline={vm.baselineBreakdown} revised={vm.revisedBreakdown} />
        </section>
      )}

      {/* Strategy Buckets */}
      {vm.strategyBuckets && (
        <section style={cardStyle}>
          <h2 style={h2Style}>Strategies</h2>

          {/* Tier 1: Applied Automatically */}
          <StrategyBucket
            strategies={vm.strategyBuckets.applied.filter((s) => s.tier === 1)}
            tier={1}
            title="Tier 1: Applied Automatically"
            description="These strategies are applied automatically when eligible. They stack together to reduce your taxable income."
          />

          {/* Tier 2: Applied Conditionally */}
          <div style={{ marginTop: 24 }}>
            <StrategyBucket
              strategies={vm.strategyBuckets.applied.filter((s) => s.tier === 2)}
              tier={2}
              title="Tier 2: Applied Conditionally"
              description="These strategies are applied when eligible and income thresholds are met. They stack with Tier 1 strategies."
            />
          </div>

          {/* Tier 3: Opportunities */}
          <div style={{ marginTop: 24 }}>
            <StrategyBucket
              strategies={vm.strategyBuckets.opportunities}
              tier={3}
              title="Tier 3: Opportunities to Consider"
              description="These are shown as 'what-if' opportunities. Each strategy is calculated independently (not combined with other Tier 3 strategies)."
            />
          </div>

          {/* Tier 3 What-If Scenarios */}
          {vm.strategyBuckets.opportunity_what_if.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ ...h3Style, marginBottom: 12 }}>What-If Scenarios (Tier 3)</h3>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                Below shows the tax breakdown if each Tier 3 strategy were applied individually on top of Tier 1-2
                strategies.
              </p>
              {vm.strategyBuckets.opportunity_what_if.map((whatIf) => (
                <WhatIfScenario
                  key={whatIf.strategyId}
                  strategyId={whatIf.strategyId}
                  breakdown={whatIf.breakdown}
                  taxableIncomeDeltaBase={whatIf.taxableIncomeDeltaBase}
                  baselineBreakdown={vm.baselineBreakdown!}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Actions */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Next Steps</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/intake")} style={buttonStyle}>
            Run Analysis Again
          </button>
          <button onClick={() => copyToClipboard(JSON.stringify(raw, null, 2))} style={buttonSecondaryStyle}>
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
      <div style={{ fontSize: 12, color: "#666", fontWeight: 700 }}>{props.label}</div>
      <div style={{ fontSize: 14, color: "#111", fontWeight: 900 }}>{props.value}</div>
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

  const narrative = asRecord(raw["narrative"]);
  const executiveSummary = asString(narrative?.["executive_summary"]);

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

  return {
    requestId,
    filingStatus,
    state,
    hasBusiness,
    executiveSummary,
    baselineBreakdown,
    revisedBreakdown,
    strategyBuckets,
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

function normalizeBreakdown(v: JsonRecord | null): TaxBreakdown | null {
  if (!v) return null;

  const adjustments = asRecord(v["adjustments"]);
  const federal = asRecord(v["federal"]);
  const ctc = asRecord(federal?.["ctc"]);
  const state = asRecord(v["state"]);
  const totals = asRecord(v["totals"]);

  if (
    !asNumber(v["gross_income"]) ||
    !asNumber(v["agi"]) ||
    !asNumber(v["standard_deduction"]) ||
    !asNumber(v["taxable_income"]) ||
    !federal ||
    !ctc ||
    !state ||
    !totals
  ) {
    return null;
  }

  return {
    gross_income: asNumber(v["gross_income"])!,
    adjustments: {
      k401_employee_contrib_ytd: asNumber(adjustments?.["k401_employee_contrib_ytd"]) ?? 0,
    },
    agi: asNumber(v["agi"])!,
    standard_deduction: asNumber(v["standard_deduction"])!,
    taxable_income: asNumber(v["taxable_income"])!,
    federal: {
      income_tax_before_credits: asNumber(federal["income_tax_before_credits"]) ?? 0,
      ctc: {
        available: asNumber(ctc["available"]) ?? 0,
        used_nonrefundable: asNumber(ctc["used_nonrefundable"]) ?? 0,
        unused: asNumber(ctc["unused"]) ?? 0,
        ...(asString(ctc["phaseout_rules"]) ? { phaseout_rules: asString(ctc["phaseout_rules"])! } : {}),
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
    if (!strategyId || !tier || (tier !== 1 && tier !== 2 && tier !== 3)) continue;

    const taxableIncomeDelta = normalizeRange3(asRecord(r["taxableIncomeDelta"]));
    const taxLiabilityDelta = normalizeRange3(asRecord(r["taxLiabilityDelta"]));
    const assumptions = normalizeAssumptions(asArray(r["assumptions"]) ?? []);

    out.push({
      strategyId,
      tier: tier as 1 | 2 | 3,
      flags: asStringArray(r["flags"]) ?? [],
      status: asString(r["status"]),
      needsConfirmation: asBoolean(r["needsConfirmation"]),
      taxableIncomeDelta,
      taxLiabilityDelta,
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
      tier: 3,
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

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 14,
  padding: 20,
  background: "#fff",
  marginBottom: 20,
};

const h2Style: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 20,
  fontWeight: 900,
};

const h3Style: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 16,
  fontWeight: 900,
};

const pillRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const pillStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  background: "#fafafa",
  borderRadius: 999,
  padding: "8px 12px",
  display: "grid",
  gap: 2,
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #111",
  padding: "10px 14px",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const buttonSecondaryStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #999",
  padding: "10px 14px",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};
