// src/app/results/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AnalyzeResponse = Record<string, unknown>;

type StrategyCardVM = {
  id: string;
  title: string;
  status: string | null;
  whatItIs: string | null;
  why: string | null;
  eligibilityDetails: string[]; // from evaluator failedConditions
  impact: Record<string, unknown> | null; // impact per strategy
};

type TotalsVM = {
  federalTax?: number;
  stateTax?: number;
  totalTax?: number;
  taxableIncome?: number;
};

export default function ResultsPage() {
  const router = useRouter();
  const [raw, setRaw] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("latestAnalysis");
      if (!s) {
        setError("No analysis found. Please complete the intake form.");
        return;
      }
      const json = JSON.parse(s) as AnalyzeResponse;
      setRaw(json);
    } catch {
      setError("Unable to read analysis. Please re-run intake.");
    }
  }, []);

  const vm = useMemo(() => buildResultsViewModel(raw), [raw]);

  if (error) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 10px" }}>Results</h1>
        <div
          role="alert"
          style={{
            border: "1px solid #c00",
            background: "#fff5f5",
            padding: 12,
            borderRadius: 8,
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
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Results</h1>
        <p style={{ color: "#444" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ display: "grid", gap: 6, marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Results</h1>
        <p style={{ margin: 0, color: "#444" }}>
          This page renders the analysis JSON returned by <code>/api/analyze</code>. It does not recompute
          eligibility or math.
        </p>
      </header>

      <section style={cardStyle}>
        <h2 style={h2Style}>Executive summary</h2>
        {vm.executiveSummary ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{vm.executiveSummary}</p>
        ) : (
          <p style={{ margin: 0, color: "#555" }}>No executive summary returned.</p>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Baseline vs revised</h2>

        <div style={twoColStyle}>
          <div>
            <h3 style={h3Style}>Baseline narrative</h3>
            {vm.baselineNarrative ? (
              <pre style={preStyle}>{vm.baselineNarrative}</pre>
            ) : (
              <p style={{ marginTop: 0, color: "#555" }}>No baseline narrative returned.</p>
            )}
          </div>

          <div>
            <h3 style={h3Style}>Revised narrative</h3>
            {vm.revisedNarrative ? (
              <pre style={preStyle}>{vm.revisedNarrative}</pre>
            ) : (
              <p style={{ marginTop: 0, color: "#555" }}>No revised narrative returned.</p>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <h3 style={h3Style}>Totals</h3>
          <div style={twoColStyle}>
            <KeyValues title="Baseline totals" items={vm.baselineTotals} />
            <KeyValues title="Revised totals" items={vm.revisedTotals} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <h3 style={h3Style}>Delta ranges (as provided)</h3>
          <div style={twoColStyle}>
            <KeyValues title="Total tax delta" items={vm.totalTaxDelta} />
            <KeyValues title="Taxable income delta" items={vm.totalTaxableIncomeDelta} />
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Strategies</h2>

        {vm.strategies.length === 0 ? (
          <p style={{ margin: 0, color: "#555" }}>No strategies found.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {vm.strategies.map((s) => (
              <div key={s.id} style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 900 }}>
                    {s.title}
                    <span style={{ color: "#666", fontWeight: 700 }}>{"  "}({s.id})</span>
                  </div>
                  {s.status && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#333",
                        border: "1px solid #ccc",
                        padding: "2px 8px",
                        borderRadius: 999,
                        height: "fit-content",
                      }}
                    >
                      {s.status}
                    </div>
                  )}
                </div>

                {s.whatItIs && (
                  <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", color: "#111" }}>
                    <strong>What it is:</strong> {s.whatItIs}
                  </p>
                )}

                {s.why && (
                  <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", color: "#222" }}>
                    <strong>Why it applies / not:</strong> {s.why}
                  </p>
                )}

                {s.eligibilityDetails.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Eligibility details</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#444" }}>
                      {s.eligibilityDetails.map((m, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.impact && (
                  <div style={{ marginTop: 10 }}>
                    <KeyValues title="Impact (as provided)" items={s.impact} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Disclaimers</h2>
        {vm.disclaimers.length === 0 ? (
          <p style={{ margin: 0, color: "#555" }}>No disclaimers returned.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {vm.disclaimers.map((d, idx) => (
              <li key={idx} style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>
                {d}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>CTA</h2>
        {vm.cta ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{vm.cta}</p>
        ) : (
          <p style={{ margin: 0, color: "#555" }}>No CTA text returned.</p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={() => router.push("/intake")} style={buttonStyle}>
            Run again
          </button>
          <button
            onClick={() => copyToClipboard(JSON.stringify(raw, null, 2))}
            style={buttonSecondaryStyle}
          >
            Copy raw JSON
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Email-ready rendering model</h2>
        <p style={{ marginTop: 0, color: "#444" }}>
          This is a structured model suitable for an email template. No sending occurs here.
        </p>
        <pre style={preStyle}>{JSON.stringify(vm.emailModel, null, 2)}</pre>
      </section>
    </main>
  );
}

/**
 * Build a UI-friendly view model from your ACTUAL /api/analyze shape:
 * - raw.narrative.{executive_summary, baseline_tax_summary, revised_tax_summary, strategy_explanations, disclaimers, call_to_action_text}
 * - raw.strategy_evaluation.all (evaluator results)
 * - raw.impact_summary.impacts + raw.impact_summary.revisedTotals
 */
function buildResultsViewModel(raw: AnalyzeResponse | null) {
  if (!raw) return null;

  const narrative = asRecord(deepGet(raw, ["narrative"])) ?? {};

  const executiveSummary = asNonEmptyString(narrative["executive_summary"]);

  // baseline_tax_summary / revised_tax_summary in your response are JSON STRINGS
  // We prettify if they are valid JSON, otherwise display raw string.
  const baselineNarrative = prettifyJsonString(asString(narrative["baseline_tax_summary"]));
  const revisedNarrative = prettifyJsonString(asString(narrative["revised_tax_summary"]));

  const baselineTotals = normalizeTotals(asRecord(raw["baseline"])) ?? null;

  const revisedTotals =
    normalizeTotals(asRecord(deepGet(raw, ["impact_summary", "revisedTotals", "revised"]))) ??
    normalizeTotals(asRecord(deepGet(raw, ["impact_summary", "revisedTotals", "baseline"]))) ??
    null;

  const totalTaxDelta = asRecord(deepGet(raw, ["impact_summary", "revisedTotals", "totalTaxDelta"])) ?? null;
  const totalTaxableIncomeDelta =
    asRecord(deepGet(raw, ["impact_summary", "revisedTotals", "totalTaxableIncomeDelta"])) ?? null;

  const strategyExplanations = Array.isArray(narrative["strategy_explanations"])
    ? (narrative["strategy_explanations"] as unknown[])
    : [];

  const evaluationAll = Array.isArray(deepGet(raw, ["strategy_evaluation", "all"]))
    ? (deepGet(raw, ["strategy_evaluation", "all"]) as unknown[])
    : [];

  const impacts = Array.isArray(deepGet(raw, ["impact_summary", "impacts"]))
    ? (deepGet(raw, ["impact_summary", "impacts"]) as unknown[])
    : [];

  const strategies = buildStrategyCards({
    explanations: strategyExplanations,
    evaluationAll,
    impacts,
  });

  const disclaimers = Array.isArray(narrative["disclaimers"])
    ? (narrative["disclaimers"] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const cta = asNonEmptyString(narrative["call_to_action_text"]);

  const emailModel = {
    subject: "Your tax planning analysis",
    previewText: null,
    executiveSummary,
    baselineNarrative,
    revisedNarrative,
    baselineTotals,
    revisedTotals,
    totalTaxDelta,
    totalTaxableIncomeDelta,
    strategies,
    disclaimers,
    cta,
  };

  return {
    executiveSummary,
    baselineNarrative,
    revisedNarrative,
    baselineTotals,
    revisedTotals,
    totalTaxDelta,
    totalTaxableIncomeDelta,
    strategies,
    disclaimers,
    cta,
    emailModel,
  };
}

function buildStrategyCards(args: {
  explanations: unknown[];
  evaluationAll: unknown[];
  impacts: unknown[];
}): StrategyCardVM[] {
  const evalById = new Map<string, any>();
  for (const item of args.evaluationAll) {
    const r = asRecord(item);
    const id = r ? asString(r["strategy_id"]) : null;
    if (id) evalById.set(id, r);
  }

  const impactById = new Map<string, any>();
  for (const item of args.impacts) {
    const r = asRecord(item);
    const id = r ? (asString(r["strategyId"]) ?? asString(r["strategy_id"])) : null;
    if (id) impactById.set(id, r);
  }

  return args.explanations
    .map((item) => {
      const r = asRecord(item);
      if (!r) return null;

      const id = asString(r["strategy_id"]);
      if (!id) return null;

      const what = asNonEmptyString(r["what_it_is"]);
      const why = asNonEmptyString(r["why_it_applies_or_not"]);

      const ev = evalById.get(id) ?? null;
      const status = ev ? asString(ev["status"]) : null;

      const failedConditions: string[] = [];
      if (ev && Array.isArray(ev["failedConditions"])) {
        for (const fc of ev["failedConditions"]) {
          const frc = asRecord(fc);
          const msg = frc ? asNonEmptyString(frc["message"]) : null;
          if (msg) failedConditions.push(msg);
        }
      }

      const impact = impactById.get(id) ?? null;

      return {
        id,
        title: humanizeStrategyId(id),
        status,
        whatItIs: what,
        why,
        eligibilityDetails: failedConditions,
        impact: impact ? (impact as Record<string, unknown>) : null,
      };
    })
    .filter((x): x is StrategyCardVM => !!x)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function normalizeTotals(r: Record<string, unknown> | null): TotalsVM | null {
  if (!r) return null;
  const out: TotalsVM = {};
  if (typeof r.federalTax === "number") out.federalTax = r.federalTax;
  if (typeof r.stateTax === "number") out.stateTax = r.stateTax;
  if (typeof r.totalTax === "number") out.totalTax = r.totalTax;
  if (typeof r.taxableIncome === "number") out.taxableIncome = r.taxableIncome;
  return out;
}

function KeyValues(props: { title: string; items: Record<string, unknown> | null }) {
  const entries = props.items ? Object.entries(props.items) : [];
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{props.title}</div>
      {entries.length === 0 ? (
        <div style={{ color: "#555" }}>Not provided</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", width: "45%", color: "#333" }}>
                  {k}
                </td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", color: "#111" }}>
                  {formatValue(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function prettifyJsonString(s: string | null): string | null {
  if (!s) return null;
  // only attempt parse if it looks like JSON
  const trimmed = s.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return s;
  try {
    const obj = JSON.parse(trimmed);
    return JSON.stringify(obj, null, 2);
  } catch {
    return s;
  }
}

function humanizeStrategyId(id: string): string {
  return id
    .split("_")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function deepGet(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    const r = asRecord(cur);
    if (!r) return undefined;
    cur = r[p];
  }
  return cur;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
  marginBottom: 14,
};

const h2Style: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 18,
  fontWeight: 900,
};

const h3Style: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
  fontWeight: 900,
};

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  background: "#f7f7f7",
  border: "1px solid #e5e5e5",
  padding: 12,
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.4,
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
