// src/app/intake/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { mapUiToNormalizedIntake } from "../../lib/ui/intakeMapper";
import type { UiIntakeFormState } from "../../lib/ui/types";

type AnalyzeApiResponse = unknown;

const FILING_STATUS_OPTIONS: Array<{ value: UiIntakeFormState["filingStatus"]; label: string }> = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED_FILING_JOINTLY", label: "Married filing jointly" },
  { value: "MARRIED_FILING_SEPARATELY", label: "Married filing separately" },
  { value: "HEAD_OF_HOUSEHOLD", label: "Head of household" },
];

const STATE_OPTIONS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

const BUSINESS_TYPE_OPTIONS = [
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "s_corporation", label: "S corporation" },
  { value: "c_corporation", label: "C corporation" },
] as const;

export default function IntakePage() {
  const router = useRouter();

  const [form, setForm] = useState<UiIntakeFormState>({
    filingStatus: "SINGLE",
    state: "CO",
    numChildren: 0,
    grossIncome: "",
    hasBusiness: false,
    businessType: null,
    businessNetIncome: "",
    numEmployees: 0,
    strategiesInUse: [],
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldIssues, setFieldIssues] = useState<Array<{ path: string; message: string }>>([]);

  const canSubmit = useMemo(() => {
    return !submitting;
  }, [submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldIssues([]);

    const mapped = mapUiToNormalizedIntake(form);
    if (!mapped.ok) {
      setFieldIssues(mapped.issues);
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapped.intake),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Analyze failed (${res.status})`);
      }

      const json: AnalyzeApiResponse = await res.json();

      // Results page renders only what /api/analyze returned.
      sessionStorage.setItem("latestAnalysis", JSON.stringify(json));

      router.push("/results");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Analyze failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const issueByPath = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of fieldIssues) {
      const list = m.get(i.path) ?? [];
      list.push(i.message);
      m.set(i.path, list);
    }
    return m;
  }, [fieldIssues]);

  function issuesFor(path: string): string[] {
    return issueByPath.get(path) ?? [];
  }

  function set<K extends keyof UiIntakeFormState>(key: K, value: UiIntakeFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Tax Planning Intake</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Enter your details. We’ll calculate a baseline estimate and potential impact from strategies.
      </p>

      {formError && (
        <div
          role="alert"
          style={{
            border: "1px solid #c00",
            background: "#fff5f5",
            padding: 12,
            borderRadius: 8,
            margin: "12px 0 16px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div>{formError}</div>
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
        <section style={cardStyle}>
          <h2 style={h2Style}>Personal</h2>

          <div style={grid2Style}>
            <Field label="Filing status" issues={issuesFor("personal.filing_status")}>
              <select
                value={form.filingStatus}
                onChange={(e) => set("filingStatus", e.target.value as UiIntakeFormState["filingStatus"])}
                style={inputStyle}
              >
                {FILING_STATUS_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="State" issues={issuesFor("personal.state")}>
              <select
                value={String(form.state)}
                onChange={(e) => set("state", e.target.value)}
                style={inputStyle}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Children (0–17)" issues={issuesFor("personal.children_0_17")}>
              <input
                inputMode="numeric"
                value={String(form.numChildren)}
                onChange={(e) => set("numChildren", e.target.value)}
                style={inputStyle}
                placeholder="0"
              />
            </Field>

            <Field label="Gross income (excluding business)" issues={issuesFor("personal.income_excl_business")}>
              <input
                inputMode="decimal"
                value={String(form.grossIncome)}
                onChange={(e) => set("grossIncome", e.target.value)}
                style={inputStyle}
                placeholder="e.g., 350000"
              />
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={h2Style}>Business</h2>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!form.hasBusiness}
                onChange={(e) => {
                  const checked = e.target.checked;
                  set("hasBusiness", checked);
                  if (!checked) {
                    set("businessType", null);
                    set("businessNetIncome", "");
                    set("numEmployees", 0);
                  }
                }}
              />
              <span>Has a business</span>
            </label>

            <div style={grid2Style}>
              <Field label="Business type" issues={issuesFor("business.type")}>
                <select
                  value={form.businessType ?? ""}
                  onChange={(e) => set("businessType", (e.target.value || null) as any)}
                  style={inputStyle}
                  disabled={!form.hasBusiness}
                >
                  <option value="">Select…</option>
                  {BUSINESS_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Business net income" issues={issuesFor("business.net_income")}>
                <input
                  inputMode="decimal"
                  value={String(form.businessNetIncome)}
                  onChange={(e) => set("businessNetIncome", e.target.value)}
                  style={inputStyle}
                  disabled={!form.hasBusiness}
                  placeholder="e.g., 200000"
                />
              </Field>

              <Field label="Number of employees" issues={issuesFor("business.num_employees")}>
                <input
                  inputMode="numeric"
                  value={String(form.numEmployees)}
                  onChange={(e) => set("numEmployees", e.target.value)}
                  style={inputStyle}
                  disabled={!form.hasBusiness}
                  placeholder="0"
                />
              </Field>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={!canSubmit} style={buttonStyle}>
            {submitting ? "Analyzing…" : "Analyze"}
          </button>
          <span style={{ color: "#555" }}>
            Results are estimates; final eligibility depends on facts and implementation.
          </span>
        </div>
      </form>
    </main>
  );
}

function Field(props: { label: string; issues: string[]; children: React.ReactNode }) {
  const hasIssues = props.issues.length > 0;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <label style={{ fontWeight: 600 }}>{props.label}</label>
        {hasIssues && <span style={{ color: "#b00020", fontSize: 12 }}>Needs attention</span>}
      </div>
      <div
        style={{
          border: hasIssues ? "1px solid #b00020" : "1px solid #ccc",
          borderRadius: 8,
          padding: 8,
          background: "#fff",
        }}
      >
        {props.children}
      </div>
      {hasIssues && (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#b00020", fontSize: 12 }}>
          {props.issues.map((m, idx) => (
            <li key={idx}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const h2Style: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 18,
  fontWeight: 700,
};

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  fontSize: 14,
  padding: 6,
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
