import "server-only";

type Json = Record<string, any>;

/** Set to true to include the raw analysis JSON block in the email (default off for WOW-ready emails). */
const INCLUDE_RAW_JSON = false;

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

/** USD with 0 decimals for headline values (Intl). */
function formatUsd0(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

interface BestEffortTax {
  baselineTax: number | null;
  afterTax: number | null;
  deltaRaw: number | null;
}

/** If both baselineTax and afterTax present, return afterTax - baselineTax; else return existing deltaRaw. */
function computeDelta(bestEffort: BestEffortTax): number | null {
  const { baselineTax, afterTax, deltaRaw } = bestEffort;
  if (
    baselineTax != null &&
    typeof baselineTax === "number" &&
    Number.isFinite(baselineTax) &&
    afterTax != null &&
    typeof afterTax === "number" &&
    Number.isFinite(afterTax)
  ) {
    return afterTax - baselineTax;
  }
  return deltaRaw ?? null;
}

/** First name from intake/contact; "there" if missing. */
function inferName(analysis: Json): string {
  const name =
    asString(get(analysis, "intake.personal.first_name")) ??
    asString(get(analysis, "intake.personal.firstName")) ??
    asString(get(analysis, "contact.firstName")) ??
    asString(get(analysis, "contact.first_name")) ??
    asString(get(analysis, "personal.first_name")) ??
    asString(get(analysis, "personal.firstName"));
  return name && name.trim().length > 0 ? name.trim() : "there";
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

export function buildEmailSubject(_email: string, analysis: Json): string {
  const state =
    asString(get(analysis, "intake.personal.state")) ??
    asString(get(analysis, "personal.state")) ??
    asString(get(analysis, "state"));

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
  const deltaRaw =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    null;
  const delta = computeDelta({ baselineTax, afterTax, deltaRaw });

  if (delta != null && delta < 0) {
    const parts = ["Est. Savings", formatUsd0(Math.abs(delta))];
    if (state) parts.push(`(${state})`);
    return parts.join(" ");
  }
  const parts: string[] = ["Your Tax Planning Summary"];
  if (state) parts.push(`(${state})`);
  return parts.join(" ");
}

/**
 * Best-effort HTML rendering. WOW-ready structure aligned with on-screen results.
 */
export function buildEmailHtml(analysis: Json): string {
  const hasBiz =
    get(analysis, "intake.business.has_business") ??
    get(analysis, "business.has_business") ??
    get(analysis, "business.hasBusiness");
  const bizType =
    asString(get(analysis, "intake.business.type")) ?? asString(get(analysis, "business.type"));

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
  const deltaRaw =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    null;
  const delta = computeDelta({ baselineTax, afterTax, deltaRaw });

  const firstName = inferName(analysis);
  const strategyData = renderStrategiesAndTopOpportunities(strategies);

  // Hero line
  let heroLine = "Summary of your results.";
  if (delta != null && delta < 0) {
    heroLine = `Estimated annual tax savings: ${formatUsd0(Math.abs(delta))}`;
  } else if (delta != null && delta > 0) {
    heroLine = `Estimated annual tax increase: ${formatUsd0(delta)}`;
  } else if (delta === null) {
    const heroTopOpp = strategyData.topOpps[0];
    if (heroTopOpp) {
      heroLine = `Top opportunity savings: ${formatUsd0(heroTopOpp.savings)}`;
    }
  }

  // Results mini-row (baseline / after strategies)
  const resultsMiniRow =
    baselineTax != null && afterTax != null
      ? `<p style="margin:0 0 14px 0; color:#333;">Baseline tax: ${escapeHtml(formatUsd(baselineTax))} → After strategies tax: ${escapeHtml(formatUsd(afterTax))}</p>`
      : "";

  // Highlights: (a) biggest opportunity, (b) already in use, (c) next data to confirm
  const highlightBullets: string[] = [];
  const topOpp0 = strategyData.topOpps[0];
  if (topOpp0) {
    highlightBullets.push(`Largest opportunity detected: ${escapeHtml(topOpp0.name)} (~${formatUsd0(topOpp0.savings)}).`);
  }
  const applied0 = strategyData.applied[0];
  if (applied0) {
    highlightBullets.push(`You already have ${escapeHtml(applied0.name)} in place.`);
  }
  const hasRetirementField =
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib_ytd")) != null ||
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib")) != null ||
    get(analysis, "intake.personal.retirement") != null;
  if (hasBiz && !bizType) {
    highlightBullets.push("Confirm your entity type (LLC, S-Corp, etc.) for a refined estimate.");
  } else if (!hasRetirementField) {
    highlightBullets.push("Confirm retirement contributions (401k, IRA) for a refined estimate.");
  } else {
    highlightBullets.push("Confirm payroll, retirement, and expenses for a refined run.");
  }

  const highlightsHtml = highlightBullets
    .map((b) => `<li style="margin:0 0 6px 0;">${b}</li>`)
    .join("");

  // CTA block
  const ctaBlock = `
    <h3 style="margin:18px 0 8px 0;">Recommended next step</h3>
    <p style="margin:0 0 14px 0; color:#333;">If you'd like to walk through this plan in detail and see which strategies make sense for you, just reply to this email and we'll set up a time to chat.</p>
    <p style="margin:0 0 18px 0;">
      <a href="mailto:" style="display:inline-block; padding:10px 20px; background:#36a9a2; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">Reply to set up a call</a>
    </p>
  `.trim();

  // Raw JSON (gated)
  let rawJsonBlock = "";
  if (INCLUDE_RAW_JSON) {
    const rawJson = JSON.stringify(analysis, null, 2) ?? "";
    const { text: rawJsonTrunc, truncated } = truncate(rawJson, 12000);
    const rawJsonEsc = escapeHtml(rawJsonTrunc);
    rawJsonBlock = `
    <h3 style="margin:18px 0 8px 0;">Raw Analysis (as received)</h3>
    <pre style="background:#f6f8fa; padding:12px; border-radius:8px; overflow:auto; white-space:pre-wrap; border:1px solid #e5e7eb;">${rawJsonEsc}</pre>
    ${truncated ? `<p style="margin-top:8px; color:#666; font-size:12px;">Raw analysis was truncated for email length.</p>` : ""}
    `.trim();
  }

  return `
<div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.45; color:#111;">
  <div style="max-width: 760px; margin: 0 auto; padding: 10px 0;">
    <p style="margin:0 0 4px 0; font-size:14px; color:#555;">Good Fellow CFO LLC</p>
    <h2 style="margin:0 0 18px 0;">Tax Planning Summary</h2>

    <p style="margin:0 0 14px 0; color:#333;">Hi ${escapeHtml(firstName)},</p>

    <p style="margin:0 0 8px 0; font-size:18px; font-weight:bold; color:#111;">${heroLine}</p>
    ${resultsMiniRow}

    <h3 style="margin:18px 0 8px 0;">Highlights</h3>
    <ul style="margin:0 0 14px 0; padding-left:18px;">
      ${highlightsHtml}
    </ul>

    ${strategyData.html}

    ${ctaBlock}

    ${rawJsonBlock}

    <p style="margin-top:16px; color:#666; font-size:12px;">
      This email is generated automatically. Figures are shown only if present in the payload; no numbers are recomputed.
    </p>
  </div>
</div>
`.trim();
}

/**
 * Plain text version of the email: hero, highlights, top 3 opportunities, assumptions, disclaimer.
 * No tables; simple bullet lists.
 */
export function buildEmailText(analysis: Json): string {
  const hasBiz =
    get(analysis, "intake.business.has_business") ??
    get(analysis, "business.has_business") ??
    get(analysis, "business.hasBusiness");
  const bizType =
    asString(get(analysis, "intake.business.type")) ?? asString(get(analysis, "business.type"));

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
  const deltaRaw =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    null;
  const delta = computeDelta({ baselineTax, afterTax, deltaRaw });

  const firstName = inferName(analysis);
  const strategyData = renderStrategiesAndTopOpportunities(strategies);

  const lines: string[] = [];
  lines.push("Good Fellow CFO LLC");
  lines.push("Tax Planning Summary");
  lines.push("");
  lines.push(`Hi ${firstName},`);
  lines.push("");

  if (delta != null && delta < 0) {
    lines.push(`Estimated annual tax savings: ${formatUsd0(Math.abs(delta))}`);
  } else if (delta != null && delta > 0) {
    lines.push(`Estimated annual tax increase: ${formatUsd0(delta)}`);
  } else {
    const heroTopOpp = strategyData.topOpps[0];
    if (heroTopOpp) {
      lines.push(`Top opportunity savings: ${formatUsd0(heroTopOpp.savings)}`);
    } else {
      lines.push("Summary of your results.");
    }
  }
  if (baselineTax != null && afterTax != null) {
    lines.push(`Baseline tax: ${formatUsd(baselineTax)} → After strategies tax: ${formatUsd(afterTax)}`);
  }
  lines.push("");

  lines.push("Highlights");
  const topOppFirst = strategyData.topOpps[0];
  if (topOppFirst) {
    lines.push(`• Largest opportunity detected: ${topOppFirst.name} (~${formatUsd0(topOppFirst.savings)}).`);
  }
  const appliedFirst = strategyData.applied[0];
  if (appliedFirst) {
    lines.push(`• You already have ${appliedFirst.name} in place.`);
  }
  const hasRetirementField =
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib_ytd")) != null ||
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib")) != null ||
    get(analysis, "intake.personal.retirement") != null;
  if (hasBiz && !bizType) {
    lines.push("• Confirm your entity type (LLC, S-Corp, etc.) for a refined estimate.");
  } else if (!hasRetirementField) {
    lines.push("• Confirm retirement contributions (401k, IRA) for a refined estimate.");
  } else {
    lines.push("• Confirm payroll, retirement, and expenses for a refined run.");
  }
  lines.push("");

  lines.push("Top Opportunities (top 3)");
  for (const opp of strategyData.topOpps.slice(0, 3)) {
    lines.push(`• ${opp.name}: ~${formatUsd0(opp.savings)} estimated savings`);
  }
  if (strategyData.topOpps.length === 0) {
    lines.push("• No large potential savings items detected in the payload.");
  }
  lines.push("");

  lines.push("Assumptions");
  if (baselineTax != null || afterTax != null) {
    if (baselineTax != null) lines.push(`• Baseline total tax: ${formatUsd(baselineTax)}`);
    if (afterTax != null) lines.push(`• After strategies total tax: ${formatUsd(afterTax)}`);
  } else {
    lines.push("• Figures are from the payload; no numbers recomputed.");
  }
  lines.push("");

  lines.push("Recommended next step");
  lines.push("");
  lines.push("If you'd like to walk through this plan in detail and see which strategies make sense for you,");
  lines.push("just reply to this email and we'll set up a time to chat.");
  lines.push("");
  lines.push("This email is generated automatically. Figures are shown only if present in the payload; no numbers are recomputed.");

  return lines.join("\n");
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

type StrategyRow = { id: string; name: string; status: string; delta: number | null };
type TopOpp = StrategyRow & { savings: number };

function extractStrategyRow(s: any): StrategyRow {
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

interface StrategyBlockResult {
  html: string;
  topOpps: TopOpp[];
  applied: StrategyRow[];
  potential: StrategyRow[];
  other: StrategyRow[];
}

function renderStrategiesAndTopOpportunities(strategies: any): StrategyBlockResult {
  const empty: StrategyBlockResult = { html: "", topOpps: [], applied: [], potential: [], other: [] };
  const list = parseStrategies(strategies);
  if (!list.length) return empty;

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
    }))
    .sort((a, b) => b.savings - a.savings);

  const topOpps = oppCandidates.filter((x) => x.savings > 0).slice(0, 3);

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
  const showOther = applied.length === 0 && potential.length === 0 && other.length > 0;
  const otherTable = showOther && other.length ? renderStrategyTable("Other Strategy Results", other) : "";

  const html = `
    ${topOppsHtml}
    ${appliedTable}
    ${potentialTable}
    ${otherTable}
  `.trim();

  return { html, topOpps, applied, potential, other };
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
