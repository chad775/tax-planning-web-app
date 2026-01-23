// src/app/results/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AnalyzeResponse = Record<string, unknown>;

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

  const viewModel = useMemo(() => buildResultsViewModel(raw), [raw]);

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

  if (!raw || !viewModel) {
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
        {viewModel.executiveSummary ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{viewModel.executiveSummary}</p>
        ) : (
          <p style={{ margin: 0, color: "#555" }}>No executive summary returned.</p>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Baseline vs revised</h2>
        <div style={twoColStyle}>
          <div>
            <h3 style={h3Style}>Baseline narrative</h3>
            <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>
              {viewModel.baselineNarrative ?? "No baseline narrative returned."}
            </p>
          </div>
          <div>
            <h3 style={h3Style}>Revised narrative</h3>
            <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>
              {viewModel.revisedNarrative ?? "No revised narrative returned."}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <h3 style={h3Style}>Numbers (as provided)</h3>
          <div style={twoColStyle}>
            <KeyValues title="Baseline totals" items={viewModel.baselineTotals} />
            <KeyValues title="Revised totals" items={viewModel.revisedTotals} />
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Strategies</h2>
        {viewModel.strategies.length === 0 ? (
          <p style={{ margin: 0, color: "#555" }}>No strategy explanations returned.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {viewModel.strategies.map((s) => (
              <div key={s.id} style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>{s.title ?? s.id}</div>
                  {s.status && (
                    <div style={{ fontSize: 12, color: "#333", border: "1px solid #ccc", padding: "2px 8px", borderRadius: 999 }}>
                      {s.status}
                    </div>
                  )}
                </div>
                {s.summary && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{s.summary}</p>}
                {s.details && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", color: "#444" }}>{s.details}</p>}
                {s.impact && (
                  <div style={{ marginTop: 8 }}>
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
        {viewModel.disclaimers.length === 0 ? (
          <p style={{ margin: 0, color: "#555" }}>No disclaimers returned.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {viewModel.disclaimers.map((d, idx) => (
              <li key={idx} style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>
                {d}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>CTA</h2>
        {viewModel.cta ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{viewModel.cta}</p>
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
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            background: "#f7f7f7",
            border: "1px solid #e5e5e5",
            padding: 12,
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {JSON.stringify(viewModel.emailModel, null, 2)}
        </pre>
      </section>
    </main>
  );
}

/**
 * Builds a UI-friendly view model from the raw /api/analyze JSON.
 * - No recomputation
 * - No eligibility logic
 * - Best-effort extraction based on common keys
 */
function buildResultsViewModel(raw: AnalyzeResponse | null) {
  if (!raw) return null;

  const executiveSummary =
    asString(raw["executive_summary"]) ??
    asString(raw["executiveSummary"]) ??
    asString(raw["summary"]);

  const baselineNarrative =
    asString(raw["baseline_narrative"]) ??
    asString(raw["baselineNarrative"]) ??
    asString(deepGet(raw, ["narratives", "baseline"])) ??
    asString(deepGet(raw, ["baseline", "narrative"]));

  const revisedNarrative =
    asString(raw["revised_narrative"]) ??
    asString(raw["revisedNarrative"]) ??
    asString(deepGet(raw, ["narratives", "revised"])) ??
    asString(deepGet(raw, ["revised", "narrative"]));

  const baselineTotals =
    asRecord(raw["baseline_totals"]) ??
    asRecord(raw["baselineTotals"]) ??
    asRecord(raw["baseline"]) ??
    asRecord(deepGet(raw, ["baseline", "totals"])) ??
    null;

  const revisedTotals =
    asRecord(raw["revised_totals"]) ??
    asRecord(raw["revisedTotals"]) ??
    asRecord(raw["revised"]) ??
    asRecord(deepGet(raw, ["revised", "totals"])) ??
    null;

  const strategiesRaw =
    (raw["strategies"] as unknown) ??
    deepGet(raw, ["explanations", "strategies"]) ??
    deepGet(raw, ["strategy_explanations"]) ??
    deepGet(raw, ["strategyExplanations"]);

  const strategies = normalizeStrategies(strategiesRaw);

  const disclaimers =
    asStringArray(raw["disclaimers"]) ??
    asStringArray(raw["disclaimer"]) ??
    asStringArray(deepGet(raw, ["narratives", "disclaimers"])) ??
    [];

  const cta =
    asString(raw["cta"]) ??
    asString(raw["call_to_action"]) ??
    asString(deepGet(raw, ["narratives", "cta"])) ??
    asString(deepGet(raw, ["copy", "cta"])) ??
    null;

  const emailModel = {
    subject:
      asString(raw["email_subject"]) ??
      asString(deepGet(raw, ["email", "subject"])) ??
      "Your tax planning analysis",
    previewText:
      asString(raw["email_preview"]) ??
      asString(deepGet(raw, ["email", "preview"])) ??
      null,
    executiveSummary,
    baselineNarrative,
    revisedNarrative,
    baselineTotals,
    revisedTotals,
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
    strategies,
    disclaimers,
    cta,
    emailModel,
  };
}

function normalizeStrategies(v: unknown): Array<{
  id: string;
  title: string | null;
  status: string | null;
  summary: string | null;
  details: string | null;
  impact: Record<string, unknown> | null;
}> {
  if (!Array.isArray(v)) return [];

  return v
    .map((item) => {
      const r = asRecord(item);
      if (!r) return null;

      const id = asString(r["id"]) ?? asString(r["strategyId"]) ?? asString(r["strategy_id"]);
      if (!id) return null;

      return {
        id,
        title: asString(r["title"]) ?? asString(r["name"]) ?? null,
        status: asString(r["status"]) ?? asString(r["result"]) ?? null,
        summary: asString(r["summary"]) ?? asString(r["explanation"]) ?? null,
        details: asString(r["details"]) ?? asString(r["long"]) ?? null,
        impact:
          asRecord(r["impact"]) ??
          asRecord(r["numbers"]) ??
          asRecord(r["delta"]) ??
          null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

function KeyValues(props: { title: string; items: Record<string, unknown> | null }) {
  const entries = props.items ? Object.entries(props.items) : [];
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{props.title}</div>
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

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
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
  fontWeight: 800,
};

const h3Style: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
  fontWeight: 800,
};

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #111",
  padding: "10px 14px",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const buttonSecondaryStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #999",
  padding: "10px 14px",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};
