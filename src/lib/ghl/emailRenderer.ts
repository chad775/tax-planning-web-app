import "server-only";

type Json = Record<string, any>;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function get(obj: any, path: string): any {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatUsd(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function buildEmailSubject(email: string, analysis: Json): string {
  const state =
    asString(get(analysis, "intake.personal.state")) ??
    asString(get(analysis, "personal.state")) ??
    asString(get(analysis, "state"));

  const taxable =
    safeNumber(get(analysis, "baseline.taxable_income")) ??
    safeNumber(get(analysis, "baseline.taxableIncome")) ??
    safeNumber(get(analysis, "taxable_income"));

  const parts: string[] = ["Your Tax Planning Analysis"];
  if (state) parts.push(`(${state})`);
  if (taxable != null) parts.push(`– Taxable Income ${formatUsd(taxable)}`);
  parts.push(`– ${email}`);

  return parts.join(" ");
}

/**
 * Best-effort HTML rendering.
 * - Treat analysis as opaque JSON.
 * - Use structured sections when fields exist; otherwise fall back to pretty JSON.
 */
export function buildEmailHtml(analysis: Json): string {
  const filingStatus =
    asString(get(analysis, "intake.personal.filing_status")) ??
    asString(get(analysis, "personal.filing_status")) ??
    asString(get(analysis, "personal.filingStatus"));

  const state =
    asString(get(analysis, "intake.personal.state")) ??
    asString(get(analysis, "personal.state")) ??
    asString(get(analysis, "state"));

  const incomeExBiz =
    safeNumber(get(analysis, "intake.personal.income_excl_business")) ??
    safeNumber(get(analysis, "personal.income_excl_business")) ??
    safeNumber(get(analysis, "personal.incomeExclBusiness"));

  const hasBiz =
    get(analysis, "intake.business.has_business") ??
    get(analysis, "business.has_business") ??
    get(analysis, "business.hasBusiness");

  const bizType =
    asString(get(analysis, "intake.business.type")) ??
    asString(get(analysis, "business.type"));

  const bizNetIncome =
    safeNumber(get(analysis, "intake.business.net_income")) ??
    safeNumber(get(analysis, "business.net_income")) ??
    safeNumber(get(analysis, "business.netIncome"));

  const strategies =
    get(analysis, "strategies") ??
    get(analysis, "strategy_impacts") ??
    get(analysis, "impacts") ??
    null;

  const baselineTax =
    safeNumber(get(analysis, "baseline.total_tax")) ??
    safeNumber(get(analysis, "baseline.totalTax")) ??
    safeNumber(get(analysis, "baseline.total")) ??
    null;

  const afterTax =
    safeNumber(get(analysis, "after.total_tax")) ??
    safeNumber(get(analysis, "after.totalTax")) ??
    safeNumber(get(analysis, "result.total_tax")) ??
    null;

  const delta =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    null;

  const intakeRows: Array<[string, string]> = [];
  if (filingStatus) intakeRows.push(["Filing status", filingStatus]);
  if (state) intakeRows.push(["State", state]);
  if (incomeExBiz != null) intakeRows.push(["Income (excl. business)", formatUsd(incomeExBiz)]);
  if (typeof hasBiz === "boolean") intakeRows.push(["Has business", hasBiz ? "Yes" : "No"]);
  if (bizType) intakeRows.push(["Business type", bizType]);
  if (bizNetIncome != null) intakeRows.push(["Business net income", formatUsd(bizNetIncome)]);

  const taxRows: Array<[string, string]> = [];
  if (baselineTax != null) taxRows.push(["Baseline total tax", formatUsd(baselineTax)]);
  if (afterTax != null) taxRows.push(["After strategies total tax", formatUsd(afterTax)]);
  if (delta != null) taxRows.push(["Estimated change", formatUsd(delta)]);

  const strategiesHtml = renderStrategiesSection(strategies);

  const rawJson = escapeHtml(JSON.stringify(analysis, null, 2));

  return `
<div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.4;">
  <h2 style="margin:0 0 12px 0;">Tax Planning Analysis</h2>

  ${intakeRows.length ? renderKeyValueTable("Intake Summary", intakeRows) : ""}

  ${taxRows.length ? renderKeyValueTable("High-Level Results (best-effort)", taxRows) : ""}

  ${strategiesHtml}

  <h3 style="margin:18px 0 8px 0;">Raw Analysis (as received)</h3>
  <pre style="background:#f6f8fa; padding:12px; border-radius:6px; overflow:auto; white-space:pre-wrap;">${rawJson}</pre>

  <p style="margin-top:16px; color:#666; font-size:12px;">
    This email is generated automatically. Figures are shown only if present in the payload; no numbers are recomputed.
  </p>
</div>
`.trim();
}

function renderKeyValueTable(title: string, rows: Array<[string, string]>): string {
  const trs = rows
    .map(
      ([k, v]) => `
    <tr>
      <td style="padding:6px 10px; border:1px solid #ddd; font-weight:bold; background:#fafafa; width:240px;">${escapeHtml(
        k
      )}</td>
      <td style="padding:6px 10px; border:1px solid #ddd;">${escapeHtml(v)}</td>
    </tr>`
    )
    .join("");

  return `
  <h3 style="margin:18px 0 8px 0;">${escapeHtml(title)}</h3>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:720px;">
    ${trs}
  </table>
  `.trim();
}

function renderStrategiesSection(strategies: any): string {
  if (!strategies) return "";

  // Accept either:
  // - array of impacts [{ id, name, delta, status, ...}]
  // - object map { id: { ... } }
  const list: any[] = Array.isArray(strategies)
    ? strategies
    : typeof strategies === "object"
      ? Object.entries(strategies).map(([id, v]) => ({ id, ...(v as any) }))
      : [];

  if (!list.length) return "";

  const rows = list
    .slice(0, 50)
    .map((s) => {
      const id = asString(s.id) ?? asString(s.strategy_id) ?? asString(s.strategyId) ?? "—";
      const name = asString(s.name) ?? asString(s.title) ?? id;
      const status = asString(s.status) ?? asString(s.application_status) ?? "";
      const delta =
        safeNumber(s.delta_tax) ??
        safeNumber(s.deltaTax) ??
        safeNumber(s.delta) ??
        safeNumber(s.impact) ??
        null;

      const deltaStr = delta == null ? "" : formatUsd(delta);

      return `
        <tr>
          <td style="padding:6px 10px; border:1px solid #ddd;">${escapeHtml(name)}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; color:#555;">${escapeHtml(
            id
          )}</td>
          <td style="padding:6px 10px; border:1px solid #ddd;">${escapeHtml(status)}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; text-align:right;">${escapeHtml(
            deltaStr
          )}</td>
        </tr>
      `.trim();
    })
    .join("");

  return `
  <h3 style="margin:18px 0 8px 0;">Strategies (best-effort)</h3>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:720px;">
    <thead>
      <tr>
        <th style="padding:6px 10px; border:1px solid #ddd; background:#fafafa; text-align:left;">Strategy</th>
        <th style="padding:6px 10px; border:1px solid #ddd; background:#fafafa; text-align:left;">ID</th>
        <th style="padding:6px 10px; border:1px solid #ddd; background:#fafafa; text-align:left;">Status</th>
        <th style="padding:6px 10px; border:1px solid #ddd; background:#fafafa; text-align:right;">Tax impact</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  `.trim();
}
