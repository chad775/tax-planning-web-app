// src/app/intake/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { mapUiToNormalizedIntake } from "../../lib/ui/intakeMapper";
import type { UiIntakeFormState } from "../../lib/ui/types";
import { STRATEGY_IDS } from "../../contracts/strategyIds";

type AnalyzeApiResponse = unknown;

const FILING_STATUS_OPTIONS: Array<{ value: UiIntakeFormState["filingStatus"]; label: string }> = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED_FILING_JOINTLY", label: "Married filing jointly" },
  { value: "MARRIED_FILING_SEPARATELY", label: "Married filing separately" },
  { value: "HEAD_OF_HOUSEHOLD", label: "Head of household" },
];

const STATE_OPTIONS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

const ENTITY_TYPE_OPTIONS: Array<{ value: UiIntakeFormState["businessEntityType"]; label: string }> = [
  { value: "SOLE_PROP", label: "Sole proprietorship" },
  { value: "S_CORP", label: "S corporation" },
  { value: "C_CORP", label: "C corporation" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "LLC", label: "LLC" },
  { value: "UNKNOWN", label: "Not sure / Other" },
];

function labelForStrategy(id: string): string {
  // simple human labels; we can refine later
  switch (id) {
    case "augusta_loophole":
      return "Augusta Loophole (rent your home to your business)";
    case "medical_reimbursement":
      return "Medical Expense Reimbursement Plan";
    case "hiring_children":
      return "Hiring Your Children";
    case "cash_balance_plan":
      return "Cash Balance Plan";
    case "k401":
      return "401(k)";
    case "leveraged_charitable":
      return "Leveraged Charitable Giving";
    case "short_term_rental":
      return "Short-Term Rental Strategy";
    case "rtu_program":
      return "Real Estate Professional / RTU Program";
    case "film_credits":
      return "Film Tax Credits";
    default:
      return id;
  }
}

export default function IntakePage() {
  const router = useRouter();

  const [form, setForm] = useState<UiIntakeFormState>({
    // Contact
    contactEmail: "",
    contactFirstName: "",
    contactPhone: "",

    // Personal
    filingStatus: "SINGLE",
    state: "CO",
    numChildren: 0,
    grossIncome: "",

    // Business
    hasBusiness: false,
    businessEntityType: "UNKNOWN",
    businessNetProfit: "",
    employeesCount: 0,

    // Strategies
    strategiesInUse: [],

    // Retirement (required by contract)
    k401EmployeeContribYtd: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldIssues, setFieldIssues] = useState<Array<{ path: string; message: string }>>([]);

  const canSubmit = useMemo(() => !submitting, [submitting]);

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

  function toggleStrategy(id: (typeof STRATEGY_IDS)[number]) {
    setForm((prev) => {
      const has = prev.strategiesInUse.includes(id as any);
      const next = has
        ? prev.strategiesInUse.filter((x) => x !== (id as any))
        : [...prev.strategiesInUse, id as any];

      // If they uncheck k401, we can keep contrib YTD as-is (0 default), but no need to clear.
      return { ...prev, strategiesInUse: next };
    });
  }

  const k401Checked = form.strategiesInUse.includes("k401" as any);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldIssues([]);

    const mapped = mapUiToNormalizedIntake(form);
    if (!mapped.ok) {
      setFieldIssues(mapped.issues);
      setFormError("Please fix the highlighted fields below.");
      return;
    }

    // Require email to send results
    if (!mapped.contact.email || !mapped.contact.email.includes("@")) {
      setFormError("Please enter a valid email address so we can send your analysis.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake: mapped.intake,
          contact: mapped.contact,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Submit failed (${res.status})`);
      }

      const json: any = await res.json();

// /api/submit returns a wrapper; results page expects the analysis itself
const analysis = json?.analysis ?? json;

sessionStorage.setItem("latestAnalysis", JSON.stringify(analysis));
router.push("/results");

    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
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

          {fieldIssues.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Validation issues</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#b00020", fontSize: 12 }}>
                {fieldIssues.map((i, idx) => (
                  <li key={idx}>
                    <code>{i.path}</code>: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
        <section style={cardStyle}>
          <h2 style={h2Style}>Contact</h2>

          <div style={grid2Style}>
            <Field label="Email" issues={issuesFor("contact.email")}>
              <input
                inputMode="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                style={inputStyle}
                placeholder="you@example.com"
              />
            </Field>

            <Field label="First name (optional)" issues={issuesFor("contact.firstName")}>
              <input
                value={form.contactFirstName}
                onChange={(e) => set("contactFirstName", e.target.value)}
                style={inputStyle}
                placeholder="Chad"
              />
            </Field>

            <Field label="Phone (optional)" issues={issuesFor("contact.phone")}>
              <input
                inputMode="tel"
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
                style={inputStyle}
                placeholder="+15555555555"
              />
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={h2Style}>Personal</h2>

          <div style={grid2Style}>
            <Field label="Filing status" issues={issuesFor("personal.filing_status")}>
              <select
                value={form.filingStatus}
                onChange={(e) =>
                  set("filingStatus", e.target.value as UiIntakeFormState["filingStatus"])
                }
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

            <Field
              label="Gross income (excluding business)"
              issues={issuesFor("personal.income_excl_business")}
            >
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
                    set("businessEntityType", "UNKNOWN");
                    set("businessNetProfit", "");
                    set("employeesCount", 0);
                  }
                }}
              />
              <span>Has a business</span>
            </label>

            <div style={grid2Style}>
              <Field label="Entity type" issues={issuesFor("business.entity_type")}>
                <select
                  value={form.businessEntityType}
                  onChange={(e) =>
                    set("businessEntityType", e.target.value as UiIntakeFormState["businessEntityType"])
                  }
                  style={inputStyle}
                  disabled={!form.hasBusiness}
                >
                  {ENTITY_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Business net profit" issues={issuesFor("business.net_profit")}>
                <input
                  inputMode="decimal"
                  value={String(form.businessNetProfit)}
                  onChange={(e) => set("businessNetProfit", e.target.value)}
                  style={inputStyle}
                  disabled={!form.hasBusiness}
                  placeholder="e.g., 200000"
                />
              </Field>

              <Field label="Employees count" issues={issuesFor("business.employees_count")}>
                <input
                  inputMode="numeric"
                  value={String(form.employeesCount)}
                  onChange={(e) => set("employeesCount", e.target.value)}
                  style={inputStyle}
                  disabled={!form.hasBusiness}
                  placeholder="0"
                />
              </Field>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={h2Style}>Strategies already in use</h2>
          <p style={{ marginTop: 0, color: "#444" }}>
            Check any strategies you are already using. If 401(k) is checked, we’ll ask how much you’ve contributed YTD.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {STRATEGY_IDS.map((id) => {
              const checked = form.strategiesInUse.includes(id as any);
              return (
                <label key={id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStrategy(id)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>{labelForStrategy(id)}</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>{id}</div>
                  </span>
                </label>
              );
            })}
          </div>

          {k401Checked && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "10px 0 8px", fontSize: 16 }}>401(k) details</h3>
              <div style={grid2Style}>
                <Field
                  label="401(k) employee contributions YTD"
                  issues={issuesFor("retirement.k401_employee_contrib_ytd")}
                >
                  <input
                    inputMode="decimal"
                    value={String(form.k401EmployeeContribYtd)}
                    onChange={(e) => set("k401EmployeeContribYtd", e.target.value)}
                    style={inputStyle}
                    placeholder="e.g., 12000"
                  />
                </Field>
              </div>
              <p style={{ margin: "8px 0 0", color: "#666", fontSize: 12 }}>
                This is used as an input to estimate remaining room and strategy impact (best-effort).
              </p>
            </div>
          )}
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
