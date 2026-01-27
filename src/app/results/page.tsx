// src/app/results/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type JsonRecord = Record<string, unknown>;

type StrategyRowVM = {
  id: string;
  title: string;
  eligibilityStatus: "ELIGIBLE" | "NOT_ELIGIBLE" | "POTENTIAL" | "UNKNOWN";
  alreadyInUse: boolean;

  whatItIs: string | null;
  why: string | null;

  impactModel: string | null;
  needsConfirmation: boolean | null;

  taxableIncomeDelta: { low: number; base: number; high: number } | null;
  taxLiabilityDelta: { low: number; base: number; high: number } | null;

  flags: string[];
  assumptions: Array<{ id: string; category: string; value: unknown }>;
};

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
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
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
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Results</h1>
        <p style={{ color: "#444" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ display: "grid", gap: 6, marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Your Tax Planning Results</h1>
        <p style={{ margin: 0, color: "#444" }}>
          These are estimates based on the information provided. Final eligibility and savings depend on your facts and
          implementation.
        </p>
      </header>

      <section style={cardStyle}>
        <h2 style={h2Style}>Overview</h2>
        <div style={pillRowStyle}>
          <Pill label="Request ID" value={vm.requestId ?? "—"} />
          <Pill label="Filing status" value={vm.filingStatus ?? "—"} />
          <Pill label="State" value={vm.state ?? "—"} />
          <Pill label="Business" value={vm.hasBusiness ? "Yes" : "No"} />
        </div>

        <div style={{ marginTop: 12 }}>
          <h3 style={h3Style}>Executive summary</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#111" }}>
            {vm.executiveSummary ?? "No executive summary returned."}
          </p>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Baseline vs revised</h2>

        <div style={twoColStyle}>
          <div style={subCardStyle}>
            <div style={subCardTitleStyle}>Baseline</div>
            <KeyValues items={vm.baselineTotals} />
          </div>

          <div style={subCardStyle}>
            <div style={subCardTitleStyle}>After strategies (estimate)</div>
            <KeyValues items={vm.revisedTotals} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={twoColStyle}>
            <div>
              <div style={smallTitleStyle}>Baseline narrative</div>
              <p style={paragraphStyle}>{vm.baselineNarrative ?? "—"}</p>
            </div>
            <div>
              <div style={smallTitleStyle}>Revised narrative</div>
              <p style={paragraphStyle}>{vm.revisedNarrative ?? "—"}</p>
            </div>
          </div>
        </div>

        {vm.deltas && (
          <div style={{ marginTop: 12 }}>
            <div style={smallTitleStyle}>Estimated change (deltas)</div>
            <KeyValues items={vm.deltas} />
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Strategy results</h2>
        <p style={{ marginTop: 0, color: "#444" }}>
          Strategies are shown with eligibility, whether you marked them as “already in use”, and any estimated impact.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {vm.strategies.map((s) => (
            <div key={s.id} style={strategyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{s.title}</div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Tag
                      text={humanizeEligibility(s.eligibilityStatus)}
                      tone={eligibilityTone(s.eligibilityStatus)}
                    />
                    {s.alreadyInUse && <Tag text="Already in use" tone="neutral" />}
                    {s.needsConfirmation && <Tag text="Needs confirmation" tone="warn" />}
                    {s.impactModel ? <Tag text={`Model: ${s.impactModel}`} tone="neutral" /> : null}
                  </div>
                </div>

                <button
                  onClick={() => copyToClipboard(JSON.stringify(buildStrategyDebugBlob(raw, s.id), null, 2))}
                  style={tinyButtonStyle}
                  title="Copy strategy debug JSON"
                >
                  Copy debug
                </button>
              </div>

              {s.whatItIs && (
                <div style={{ marginTop: 10 }}>
                  <div style={smallTitleStyle}>What it is</div>
                  <p style={paragraphStyle}>{s.whatItIs}</p>
                </div>
              )}

              {s.why && (
                <div style={{ marginTop: 10 }}>
                  <div style={smallTitleStyle}>Why it applies (or not)</div>
                  <p style={paragraphStyle}>{s.why}</p>
                </div>
              )}

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {s.taxableIncomeDelta && (
                  <div>
                    <div style={smallTitleStyle}>Taxable income delta</div>
                    <KeyValues
                      items={{
                        low: money(s.taxableIncomeDelta.low),
                        base: money(s.taxableIncomeDelta.base),
                        high: money(s.taxableIncomeDelta.high),
                      }}
                    />
                  </div>
                )}

                {s.taxLiabilityDelta && (
                  <div>
                    <div style={smallTitleStyle}>Tax liability delta</div>
                    <KeyValues
                      items={{
                        low: money(s.taxLiabilityDelta.low),
                        base: money(s.taxLiabilityDelta.base),
                        high: money(s.taxLiabilityDelta.high),
                      }}
                    />
                  </div>
                )}

                {(s.flags.length > 0 || s.assumptions.length > 0) && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {s.flags.length > 0 && (
                      <div>
                        <div style={smallTitleStyle}>Flags</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {s.flags.map((f) => (
                            <Tag key={f} text={f} tone="neutral" />
                          ))}
                        </div>
                      </div>
                    )}

                    {s.assumptions.length > 0 && (
                      <div>
                        <div style={smallTitleStyle}>Assumptions</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {s.assumptions.map((a) => (
                            <div key={a.id} style={assumptionRowStyle}>
                              <div style={{ fontWeight: 800 }}>{a.id}</div>
                              <div style={{ color: "#444" }}>{a.category}</div>
                              <div style={{ color: "#111" }}>{formatValue(a.value)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
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
        <h2 style={h2Style}>Next steps</h2>
        <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{vm.cta ?? "—"}</p>

        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/intake")} style={buttonStyle}>
            Run again
          </button>
          <button onClick={() => copyToClipboard(JSON.stringify(raw, null, 2))} style={buttonSecondaryStyle}>
            Copy raw JSON
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Developer</h2>
        <p style={{ marginTop: 0, color: "#444" }}>
          This is the raw JSON returned by <code>/api/analyze</code>.
        </p>
        <pre style={preStyle}>{JSON.stringify(raw, null, 2)}</pre>
      </section>
    </main>
  );
}

/* ----------------------------- view-model build ---------------------------- */

function buildViewModel(raw: JsonRecord | null) {
  if (!raw) return null;

  const narrative = asRecord(raw["narrative"]);
  const intake = asRecord(raw["intake"]);
  const personal = asRecord(intake?.["personal"]);
  const business = asRecord(intake?.["business"]);

  const requestId = asString(raw["request_id"]) ?? asString(raw["requestId"]);
  const filingStatus = asString(personal?.["filing_status"]);
  const state = asString(personal?.["state"]);
  const hasBusiness = Boolean(business?.["has_business"]);

  const executiveSummary = asString(narrative?.["executive_summary"]);

  const baselineNarrative = asString(narrative?.["baseline_tax_summary"]);
  const revisedNarrative = asString(narrative?.["revised_tax_summary"]);

  const baselineTotals = normalizeTotals(asRecord(raw["baseline"]));
  const impactSummary = asRecord(raw["impact_summary"]);
  const revisedTotals = normalizeTotals(
    asRecord(deepGet(impactSummary, ["revisedTotals", "revised"])) ??
      asRecord(deepGet(impactSummary, ["revised_totals", "revised"])) ??
      asRecord(deepGet(impactSummary, ["revised", "totals"])) ??
      asRecord(deepGet(impactSummary, ["revised"])) ??
      null,
  );

  const deltas = normalizeTotals(
    asRecord(deepGet(impactSummary, ["revisedTotals", "totalTaxDelta"])) ??
      asRecord(deepGet(impactSummary, ["deltas"])) ??
      null,
  );

  // strategy sets
  const strategiesInUseArr = asStringArray(intake?.["strategies_in_use"]) ?? [];
  const strategiesInUse = new Set<string>(strategiesInUseArr);

  const strategyEval = asRecord(raw["strategy_evaluation"]);
  const evalAll = asArray(strategyEval?.["all"]) ?? [];

  const impactImpacts = asArray(deepGet(impactSummary, ["impacts"])) ?? [];

  const narrativeExplanations = asArray(narrative?.["strategy_explanations"]) ?? [];

  const evalById = new Map<string, JsonRecord>();
for (const item of evalAll) {
  const r = asRecord(item);
  if (!r) continue;

  const id = asString(r["strategy_id"]);
  if (id) evalById.set(id, r);
}

const impactById = new Map<string, JsonRecord>();
for (const item of impactImpacts) {
  const r = asRecord(item);
  if (!r) continue;

  const id =
    asString(r["strategyId"]) ??
    asString(r["strategy_id"]);

  if (id) impactById.set(id, r);
}

const explById = new Map<string, JsonRecord>();
for (const item of narrativeExplanations) {
  const r = asRecord(item);
  if (!r) continue;

  const id =
    asString(r["strategy_id"]) ??
    asString(r["strategyId"]) ??
    asString(r["id"]);

  if (id) explById.set(id, r);
}

  // union of IDs from any source
  const idSet = new Set<string>();
  for (const id of evalById.keys()) idSet.add(id);
  for (const id of impactById.keys()) idSet.add(id);
  for (const id of explById.keys()) idSet.add(id);
  for (const id of strategiesInUse) idSet.add(id);

  const strategies: StrategyRowVM[] = Array.from(idSet)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => {
      const ev = evalById.get(id);
      const imp = impactById.get(id);
      const ex = explById.get(id);

      const eligibilityStatus = (asString(ev?.["status"]) as StrategyRowVM["eligibilityStatus"]) ?? "UNKNOWN";

      const impactModel = asString(imp?.["model"]) ?? null;
      const needsConfirmation = asBoolean(imp?.["needsConfirmation"]);

      const taxableIncomeDelta = normalizeRange3(asRecord(imp?.["taxableIncomeDelta"]));
      const taxLiabilityDelta = normalizeRange3(asRecord(imp?.["taxLiabilityDelta"]));

      const flags = asStringArray(imp?.["flags"]) ?? [];
      const assumptions = normalizeAssumptions(asArray(imp?.["assumptions"]) ?? []);

      const whatItIs =
        asString(ex?.["what_it_is"]) ??
        asString(ex?.["whatItIs"]) ??
        asString(ex?.["title"]) ??
        null;

      const why =
        asString(ex?.["why_it_applies_or_not"]) ??
        asString(ex?.["whyItAppliesOrNot"]) ??
        asString(ex?.["summary"]) ??
        asString(ex?.["explanation"]) ??
        null;

      return {
        id,
        title: humanizeStrategyId(id),
        eligibilityStatus,
        alreadyInUse: strategiesInUse.has(id),
        whatItIs,
        why,
        impactModel,
        needsConfirmation,
        taxableIncomeDelta,
        taxLiabilityDelta,
        flags,
        assumptions,
      };
    });

  const disclaimers = asStringArray(narrative?.["disclaimers"]) ?? [];
  const cta = asString(narrative?.["call_to_action_text"]) ?? asString(narrative?.["call_to_action"]) ?? null;

  return {
    requestId,
    filingStatus,
    state,
    hasBusiness,
    executiveSummary,
    baselineNarrative: baselineNarrative ? safeMaybeJsonToPrettyText(baselineNarrative) : null,
    revisedNarrative: revisedNarrative ? safeMaybeJsonToPrettyText(revisedNarrative) : null,
    baselineTotals,
    revisedTotals,
    deltas,
    strategies,
    disclaimers,
    cta,
  };
}

/* ----------------------------- render helpers ----------------------------- */

function Pill(props: { label: string; value: string }) {
  return (
    <div style={pillStyle}>
      <div style={{ fontSize: 12, color: "#555", fontWeight: 800 }}>{props.label}</div>
      <div style={{ fontSize: 14, color: "#111", fontWeight: 900 }}>{props.value}</div>
    </div>
  );
}

function Tag(props: { text: string; tone: "good" | "bad" | "warn" | "neutral" }) {
  const toneStyle =
    props.tone === "good"
      ? { border: "1px solid #117a2a", background: "#f0fff4", color: "#117a2a" }
      : props.tone === "bad"
        ? { border: "1px solid #b00020", background: "#fff5f5", color: "#b00020" }
        : props.tone === "warn"
          ? { border: "1px solid #946200", background: "#fff9e6", color: "#946200" }
          : { border: "1px solid #ccc", background: "#fafafa", color: "#333" };

  return (
    <span style={{ ...tagStyle, ...toneStyle }}>
      {props.text}
    </span>
  );
}

function KeyValues(props: { items: Record<string, unknown> | null }) {
  const entries = props.items ? Object.entries(props.items) : [];
  if (entries.length === 0) return <div style={{ color: "#555" }}>—</div>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", width: "45%", color: "#333" }}>{k}</td>
            <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", color: "#111", fontWeight: 700 }}>
              {formatValue(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------ data helpers ------------------------------ */

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

function asBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
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

function normalizeTotals(v: JsonRecord | null): Record<string, unknown> | null {
  if (!v) return null;

  // Accept either camelCase baseline totals or other shapes.
  // Your baseline currently looks like:
  // { federalTax, stateTax, totalTax, taxableIncome }
  const federalTax = asNumber(v["federalTax"]) ?? asNumber(v["federal_tax_total"]) ?? null;
  const stateTax = asNumber(v["stateTax"]) ?? asNumber(v["state_tax_total"]) ?? null;
  const totalTax = asNumber(v["totalTax"]) ?? asNumber(v["total_tax"]) ?? null;
  const taxableIncome = asNumber(v["taxableIncome"]) ?? asNumber(v["taxable_income_federal"]) ?? null;

  const out: Record<string, unknown> = {};
  if (federalTax !== null) out["federalTax"] = money(federalTax);
  if (stateTax !== null) out["stateTax"] = money(stateTax);
  if (totalTax !== null) out["totalTax"] = money(totalTax);
  if (taxableIncome !== null) out["taxableIncome"] = money(taxableIncome);

  // Keep anything else (best effort)
  for (const [k, vv] of Object.entries(v)) {
    if (k in out) continue;
    if (k === "baseline" || k === "revised") continue;
    // don’t explode UI with huge nested stuff
    if (typeof vv === "object") continue;
    out[k] = vv;
  }

  return Object.keys(out).length ? out : null;
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

function safeMaybeJsonToPrettyText(s: string): string {
  // Your narrative.baseline_tax_summary is currently a JSON string (not ideal, but OK).
  // We try to parse it; if it parses, show it as a readable sentence-ish block.
  try {
    const obj = JSON.parse(s) as unknown;
    const r = asRecord(obj);
    if (!r) return s;

    // Pretty print key fields if present
    const parts: string[] = [];
    const fed = asNumber(r["federal_tax_total"]);
    const st = asNumber(r["state_tax_total"]);
    const tot = asNumber(r["total_tax"]);
    const ti = asNumber(r["taxable_income_federal"]) ?? asNumber(r["taxable_income_state"]);

    if (ti !== null) parts.push(`Taxable income (proxy): ${money(ti)}`);
    if (fed !== null) parts.push(`Federal tax: ${money(fed)}`);
    if (st !== null) parts.push(`State tax: ${money(st)}`);
    if (tot !== null) parts.push(`Total tax: ${money(tot)}`);

    return parts.length ? parts.join("\n") : s;
  } catch {
    return s;
  }
}

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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

function eligibilityTone(status: StrategyRowVM["eligibilityStatus"]): "good" | "bad" | "warn" | "neutral" {
  if (status === "ELIGIBLE") return "good";
  if (status === "NOT_ELIGIBLE") return "bad";
  if (status === "POTENTIAL") return "warn";
  return "neutral";
}

function humanizeEligibility(status: StrategyRowVM["eligibilityStatus"]): string {
  if (status === "ELIGIBLE") return "Eligible";
  if (status === "NOT_ELIGIBLE") return "Not eligible";
  if (status === "POTENTIAL") return "Potential (needs info)";
  return "Unknown";
}

function humanizeStrategyId(id: string): string {
  return id
    .split("_")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function buildStrategyDebugBlob(raw: JsonRecord | null, id: string): unknown {
  if (!raw) return null;
  const narrative = asRecord(raw["narrative"]);
  const impactSummary = asRecord(raw["impact_summary"]);
  const evalObj = asRecord(raw["strategy_evaluation"]);

  const impacts = asArray(deepGet(impactSummary, ["impacts"])) ?? [];
  const impactHit = impacts.map(asRecord).find((r) => {
    const sid = asString(r?.["strategyId"]) ?? asString(r?.["strategy_id"]);
    return sid === id;
  });

  const evalAll = asArray(evalObj?.["all"]) ?? [];
  const evalHit = evalAll.map(asRecord).find((r) => asString(r?.["strategy_id"]) === id);

  const expl = asArray(narrative?.["strategy_explanations"]) ?? [];
  const explHit = expl.map(asRecord).find((r) => {
    const sid = asString(r?.["strategy_id"]) ?? asString(r?.["strategyId"]) ?? asString(r?.["id"]);
    return sid === id;
  });

  return { id, eval: evalHit, impact: impactHit, narrative: explHit };
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

/* --------------------------------- styles -------------------------------- */

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
  marginBottom: 14,
};

const h2Style: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 900,
};

const h3Style: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
  fontWeight: 900,
};

const smallTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#333",
  marginBottom: 6,
};

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  color: "#111",
};

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
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

const tagStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  padding: "3px 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
};

const subCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const subCardTitleStyle: React.CSSProperties = {
  fontWeight: 900,
  marginBottom: 8,
};

const strategyCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};

const assumptionRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr 1fr",
  gap: 10,
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 10,
  background: "#fafafa",
  fontSize: 12,
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

const tinyButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #ccc",
  padding: "6px 10px",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const preStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  background: "#f7f7f7",
  border: "1px solid #e5e5e5",
  padding: 12,
  borderRadius: 12,
  fontSize: 12,
  lineHeight: 1.4,
};
