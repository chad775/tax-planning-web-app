// src/app/intake/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { mapUiToNormalizedIntake } from "../../lib/ui/intakeMapper";
import type { UiIntakeFormState } from "../../lib/ui/types";
import { STRATEGY_IDS } from "../../contracts/strategyIds";
import { colors, typography, spacing, borderRadius, shadows, styles } from "../../lib/ui/designSystem";
import { STRATEGY_CATALOG } from "../../lib/strategies/strategyCatalog";
import type { StrategyId } from "../../contracts/strategyIds";

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
    <main style={{ ...styles.container, maxWidth: "860px" }}>
      <header style={{ marginBottom: spacing.xl }}>
        <h1 style={styles.heading1}>Tax Planning Intake</h1>
        <p style={{ ...styles.bodyText, marginTop: spacing.sm, lineHeight: typography.lineHeight.relaxed }}>
          This process is quick and easy—just answer a few simple questions about your financial situation. 
          In about a minute, you'll receive actionable figures showing your current tax situation and potential savings from various strategies. 
          You'll also discover tax-saving strategies you may not have heard about before, each with clear explanations of how they work and who they benefit most.
        </p>
      </header>

      {formError && (
        <div
          role="alert"
          style={{
            border: `1px solid ${colors.error}`,
            background: "#fef2f2",
            padding: spacing.md,
            borderRadius: borderRadius.lg,
            marginBottom: spacing.lg,
          }}
        >
          <div style={{ fontWeight: typography.fontWeight.semibold, marginBottom: spacing.xs, color: colors.error }}>
            Error
          </div>
          <div style={{ color: colors.textPrimary }}>{formError}</div>

          {fieldIssues.length > 0 && (
            <div style={{ marginTop: spacing.md }}>
              <div style={{ fontWeight: typography.fontWeight.semibold, marginBottom: spacing.xs, fontSize: typography.fontSize.sm, color: colors.error }}>
                Validation issues
              </div>
              <ul style={{ margin: 0, paddingLeft: spacing.lg, color: colors.error, fontSize: typography.fontSize.sm }}>
                {fieldIssues.map((i, idx) => (
                  <li key={idx} style={{ marginBottom: spacing.xs }}>
                    <code style={{ background: "#fee2e2", padding: "2px 4px", borderRadius: borderRadius.sm }}>{i.path}</code>: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: spacing.lg }}>
        <section style={styles.card}>
          <h2 style={styles.heading2}>Contact</h2>

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

        <section style={styles.card}>
          <h2 style={styles.heading2}>Personal</h2>

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

        <section style={styles.card}>
          <h2 style={styles.heading2}>Business</h2>

          <div style={{ display: "grid", gap: spacing.md }}>
            <label style={{ display: "flex", gap: spacing.sm, alignItems: "center", cursor: "pointer" }}>
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
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span style={{ fontSize: typography.fontSize.base, color: colors.textPrimary }}>Has a business</span>
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

        <section style={styles.card}>
          <h2 style={styles.heading2}>Strategies already in use</h2>
          <p style={{ ...styles.bodyText, marginTop: 0 }}>
            Check any strategies you are already using. If 401(k) is checked, we'll ask how much you've contributed YTD.
          </p>

          <div style={{ display: "grid", gap: spacing.md }}>
            {STRATEGY_IDS.filter((id) => id !== "s_corp_conversion").map((id) => {
              const checked = form.strategiesInUse.includes(id as any);
              return (
                <label key={id} style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start", cursor: "pointer", padding: spacing.sm, borderRadius: borderRadius.md, transition: "background-color 0.2s ease" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStrategy(id)}
                    style={{ marginTop: 3, width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>
                    <strong style={{ fontSize: typography.fontSize.base, color: colors.textPrimary }}>{labelForStrategy(id)}</strong>
                    {(() => {
                      const catalogEntry = STRATEGY_CATALOG[id as StrategyId];
                      const description = catalogEntry?.uiSummary || catalogEntry?.uiDescription?.whatThisStrategyIs;
                      return description ? (
                        <div style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: spacing.xs, lineHeight: typography.lineHeight.normal }}>
                          {description}
                        </div>
                      ) : null;
                    })()}
                  </span>
                </label>
              );
            })}
          </div>

          {k401Checked && (
            <div style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
              <h3 style={styles.heading3}>401(k) details</h3>
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
              <p style={{ ...styles.bodyText, marginTop: spacing.sm, fontSize: typography.fontSize.sm }}>
                This is used as an input to estimate remaining room and strategy impact (best-effort).
              </p>
            </div>
          )}
        </section>

        <div style={{ display: "flex", gap: spacing.md, alignItems: "center", flexWrap: "wrap" }}>
          <button 
            type="submit" 
            disabled={!canSubmit} 
            style={{
              ...styles.button,
              fontSize: typography.fontSize.lg,
              padding: `${spacing.md} ${spacing.xl}`,
              opacity: canSubmit ? 1 : 0.6,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            onMouseEnter={(e) => {
              if (canSubmit) {
                e.currentTarget.style.background = colors.primaryDark;
              }
            }}
            onMouseLeave={(e) => {
              if (canSubmit) {
                e.currentTarget.style.background = colors.primary;
              }
            }}
          >
            {submitting ? "Analyzing…" : "Get Tax Plan Estimate Now!"}
          </button>
          <span style={{ ...styles.bodyText, fontSize: typography.fontSize.sm }}>
            Results are estimates; final eligibility depends on facts and implementation.
          </span>
        </div>
      </form>
    </main>
  );
}

function Field(props: { label: string; issues: string[]; children: React.ReactNode }) {
  const hasIssues = props.issues.length > 0;
  const [isFocused, setIsFocused] = React.useState(false);
  
  return (
    <div style={{ display: "grid", gap: spacing.xs }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: spacing.md }}>
        <label style={styles.label}>{props.label}</label>
        {hasIssues && <span style={{ color: colors.error, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}>Needs attention</span>}
      </div>
      <div
        style={{
          border: hasIssues ? `1px solid ${colors.error}` : isFocused ? `1px solid ${colors.primary}` : `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          padding: `${spacing.sm} ${spacing.md}`,
          background: colors.surface,
          boxShadow: isFocused && !hasIssues ? `0 0 0 3px ${colors.primaryLight}33` : "none",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          minHeight: "40px",
          display: "flex",
          alignItems: "center",
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {props.children}
      </div>
      {hasIssues && (
        <ul style={{ margin: 0, paddingLeft: spacing.lg, color: colors.error, fontSize: typography.fontSize.xs }}>
          {props.issues.map((m, idx) => (
            <li key={idx} style={{ marginBottom: spacing.xs }}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: spacing.md,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  fontSize: typography.fontSize.base,
  padding: 0,
  background: "transparent",
  color: colors.textPrimary,
  fontFamily: typography.fontFamily.sans,
  boxSizing: "border-box" as const,
};
