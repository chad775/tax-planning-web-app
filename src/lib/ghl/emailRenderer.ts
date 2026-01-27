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

/**
 * Display tax impact in a more client-friendly way:
 * - negative delta => savings
 * - positive delta => increases tax
 */
function formatTaxImpact(delta: number): { label: string; value: string } {
  if (delta < 0) return { label: "Estimated savings", value: formatUsd(Math.abs(delta)) };
  if (delta > 0) return { label: "Estimated increase", value: formatUsd(delta) };
  return { label: "Estimated impact", value: formatUsd(0) };
}

function truncate(s: string, maxChars: number): { text: string; truncated: boolean } {
  if (s.length <= maxChars) return { text: s, truncated: false };
  return { text: s.slice(0, maxChars) + "\n…(truncated)", truncated: true };
}

function normalizeStatus(raw: unknown): string {
  const s = asString(raw);
  if (!s) return "";
  return s.toUpperCase();
}

function isAppliedStatus(status: string): boolean {
  // handle your contract statuses + common variants
  // APPLIED / ALREADY_IN_USE = "applied-like"
  return (
    status === "APPLIED" ||
    status === "ALREADY_IN_USE" ||
    status === "IN_USE" ||
    status === "USED" ||
    status === "ACTIVE"
  );
}

function isPotentialStatus(status: string): boolean {
  // NOT_APPLIED_POTENTIAL is the main one in your contracts
  return (
    status === "NOT_APPLIED_POTENTIAL" ||
    status === "POTENTIAL" ||
    status === "ELIGIBLE" ||
    status === "RECOMMENDED"
  );
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
    asString(get(analysis, "intake.business.type")) ?? asString(get(analysis, "business.type"));

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

  // NOTE: delta could be "after - baseline" (negative = savings) OR a "savings" positive number
  // We display it with best-effort formatting:
  const deltaRaw =
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
  if (deltaRaw != null) {
    // If this field is actually a "savings" positive number, it will label as increase.
    // But in most pipelines delta is "after - baseline". Keeping best-effort:
    const { label, value } = formatTaxImpact(deltaRaw);
    taxRows.push([label, value]);
  }

  const strategiesBlock = renderStrategiesAndTopOpportunities(strategies);

  const rawJson = JSON.stringify(analysis, null, 2) ?? "";
  const { text: rawJsonTrunc, truncated } = truncate(rawJson, 12000);
  const rawJsonEsc = escapeHtml(rawJsonTrunc);

  return `
<div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.45; color:#111;">
  <div style="max-width: 760px; margin: 0 auto; padding: 10px 0;">
    <h2 style="margin:0 0 10px 0;">Tax Planning Analysis</h2>

    <p style="margin:0 0 14px 0; color:#333;">
      Below is a summary of the key inputs, estimated results, and the biggest opportunities identified.
    </p>

    ${intakeRows.length ? renderKeyValueTable("Intake Summary", intakeRows) : ""}

    ${taxRows.length ? renderKeyValueTable("High-Level Results (best-effort)", taxRows) : ""}

    ${strategiesBlock}

    <h3 style="margin:18px 0 8px 0;">Next Steps</h3>
    <ul style="margin:0 0 14px 0; padding-left:18px;">
      <li>Reply with any missing details (entity type, payroll, retirement contributions, expenses).</li>
      <li>If you want, we can rerun a refined version using updated inputs.</li>
    </ul>

    <h3 style="margin:18px 0 8px 0;">Raw Analysis (as received)</h3>
    <pre style="background:#f6f8fa; padding:12px; border-radius:8px; overflow:auto; white-space:pre-wrap; border:1px solid #e5e7eb;">${rawJsonEsc}</pre>
    ${
      truncated
        ? `<p style="margin-top:8px; color:#666; font-size:12px;">
            Raw analysis was truncated for email length.
          </p>`
        : ""
    }

    <p style="margin-top:16px; color:#666; font-size:12px;">
      This email is generated automatically. Figures are shown only if present in the payload; no numbers are recomputed.
    </p>
  </div>
</div>
`.trim();
}

function renderKeyValueTable(title: string, rows: Array<[string, string]>): string {
  const trs = rows
    .map(
      ([k, v]) => `
    <tr>
      <td style="padding:8px 10px; border:1px solid #ddd; font-weight:bold; background:#fafafa; width:240px;">${escapeHtml(
        k
      )}</td>
      <td style="padding:8px 10px; border:1px solid #ddd;">${escapeHtml(v)}</td>
    </tr>`
    )
    .join("");

  return `
  <h3 style="margin:18px 0 8px 0;">${escapeHtml(title)}</h3>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:760px;">
    ${trs}
  </table>
  `.trim();
}

function parseStrategies(strategies: any): any[] {
  if (!strategies) return [];

  // Accept either:
  // - array of impacts [{ id, name, delta, status, ...}]
  // - object map { id: { ... } }
  const list: any[] = Array.isArray(strategies)
    ? strategies
    : typeof strategies === "object"
      ? Object.entries(strategies).map(([id, v]) => ({ id, ...(v as any) }))
      : [];

  return list.filter(Boolean);
}

function extractStrategyRow(s: any): {
  id: string;
  name: string;
  status: string;
  delta: number | null;
} {
  const id = asString(s.id) ?? asString(s.strategy_id) ?? asString(s.strategyId) ?? "—";
  const name = asString(s.name) ?? asString(s.title) ?? id;

  const statusRaw = asString(s.status) ?? asString(s.application_status) ?? "";
  const status = normalizeStatus(statusRaw);

  const delta =
    safeNumber(s.delta_tax) ??
    safeNumber(s.deltaTax) ??
    safeNumber(s.delta) ??
    safeNumber(s.impact) ??
    null;

  return { id, name, status, delta };
}

function renderStrategiesAndTopOpportunities(strategies: any): string {
  const list = parseStrategies(strategies);
  if (!list.length) return "";

  const rows = list.map(extractStrategyRow);

  const applied = rows.filter((r) => isAppliedStatus(r.status));
  const potential = rows.filter((r) => isPotentialStatus(r.status));
  const other = rows.filter((r) => !isAppliedStatus(r.status) && !isPotentialStatus(r.status));

  // "Top Opportunities" = biggest estimated savings among potential/other
  // Savings convention: negative delta => savings (after - baseline)
  // If delta is positive and actually means savings in your pipeline, we’ll adjust later.
  const oppCandidates = [...potential, ...other]
    .filter((r) => typeof r.delta === "number" && Number.isFinite(r.delta))
    .map((r) => ({
      ...r,
      savings: r.delta! < 0 ? Math.abs(r.delta!) : 0,
      increase: r.delta! > 0 ? r.delta! : 0,
    }))
    .sort((a, b) => b.savings - a.savings);

  const topOpps = oppCandidates.filter((x) => x.savings > 0).slice(0, 5);

  const topOppsHtml = topOpps.length
    ? renderTopOpportunities(topOpps)
    : `
      <h3 style="margin:18px 0 8px 0;">Top Opportunities</h3>
      <p style="margin:0 0 10px 0; color:#444;">
        No large “potential savings” items were detected from the strategy list in the payload.
      </p>
    `.trim();

  const appliedTable = applied.length ? renderStrategyTable("Applied / Already In Use", applied) : "";
  const potentialTable = potential.length ? renderStrategyTable("Potential", potential) : "";
  const otherTable = other.length ? renderStrategyTable("Other Strategy Results", other) : "";

  return `
    ${topOppsHtml}
    ${appliedTable}
    ${potentialTable}
    ${otherTable}
  `.trim();
}

function renderTopOpportunities(
  topOpps: Array<{
    id: string;
    name: string;
    status: string;
    delta: number | null;
    savings: number;
  }>
): string {
  const items = topOpps
    .map((o) => {
      const impact = formatUsd(o.savings);
      return `
        <li style="margin:0 0 6px 0;">
          <strong>${escapeHtml(o.name)}</strong>
          <span style="color:#555;">(${escapeHtml(o.id)})</span>
          — <span style="color:#111;">Estimated savings: <strong>${escapeHtml(impact)}</strong></span>
        </li>
      `.trim();
    })
    .join("");

  return `
    <h3 style="margin:18px 0 8px 0;">Top Opportunities</h3>
    <p style="margin:0 0 10px 0; color:#444;">
      Based on the strategy list provided, these are the biggest estimated savings opportunities (best-effort).
    </p>
    <ul style="margin:0 0 12px 0; padding-left:18px;">
      ${items}
    </ul>
  `.trim();
}

function renderStrategyTable(title: string, rowsIn: Array<{ id: string; name: string; status: string; delta: number | null }>): string {
  const rows = rowsIn
    .slice(0, 50)
    .map((s) => {
      const delta = s.delta;
      let impactStr = "";
      if (delta != null) {
        const { label, value } = formatTaxImpact(delta);
        impactStr = `${label}: ${value}`;
      }

      return `
        <tr>
          <td style="padding:8px 10px; border:1px solid #ddd;">${escapeHtml(s.name)}</td>
          <td style="padding:8px 10px; border:1px solid #ddd; color:#555;">${escapeHtml(s.id)}</td>
          <td style="padding:8px 10px; border:1px solid #ddd;">${escapeHtml(s.status)}</td>
          <td style="padding:8px 10px; border:1px solid #ddd; text-align:right;">${escapeHtml(impactStr)}</td>
        </tr>
      `.trim();
    })
    .join("");

  return `
  <h3 style="margin:18px 0 8px 0;">${escapeHtml(title)}</h3>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:760px;">
    <thead>
      <tr>
        <th style="padding:8px 10px; border:1px solid #ddd; background:#fafafa; text-align:left;">Strategy</th>
        <th style="padding:8px 10px; border:1px solid #ddd; background:#fafafa; text-align:left;">ID</th>
        <th style="padding:8px 10px; border:1px solid #ddd; background:#fafafa; text-align:left;">Status</th>
        <th style="padding:8px 10px; border:1px solid #ddd; background:#fafafa; text-align:right;">Estimated impact</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  `.trim();
}
