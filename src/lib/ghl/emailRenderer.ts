import "server-only";

type Json = Record<string, any>;

/** Set to true to include the raw analysis JSON block in the email (default off for WOW-ready emails). */
const INCLUDE_RAW_JSON = false;

/** Set to true to include strategy tables (Applied/Potential); default off for advisor-grade email. */
const INCLUDE_TABLES = false;

/** Advisor-style one-liners per strategy id (no new dependencies). */
const STRATEGY_ONE_LINERS: Record<string, string> = {
  s_corp_conversion:
    "Often reduces self-employment tax exposure when structured correctly.",
  cash_balance_plan:
    "Can allow significantly higher retirement contributions than a standard 401(k), depending on age and income.",
  k401:
    "Maximizes retirement deferral opportunities for business owners and spouses when applicable.",
  augusta_loophole:
    "May allow tax-favored reimbursement for qualifying home office rental days when documented properly.",
  hiring_children:
    "Can shift income to family members for legitimate work and potentially reduce overall tax burden.",
  medical_reimbursement:
    "May allow tax-advantaged reimbursement of qualifying medical costs under the right plan structure.",
  short_term_rental:
    "Under certain rules, can create tax-favored deductions tied to active participation.",
  film_credits:
    "Certain state programs may provide credits if you qualify and file properly.",
  leveraged_charitable:
    "Advanced charitable structures may increase deduction efficiency for the right taxpayers.",
  rtu_program:
    "Certain state incentives may apply depending on industry and filings.",
};

/** Human-readable strategy names when payload has no name/title (presentation only). */
const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  s_corp_conversion: "S-Corp conversion",
  cash_balance_plan: "Cash balance plan",
  k401: "401(k)",
  augusta_loophole: "Augusta loophole",
  hiring_children: "Hiring children",
  medical_reimbursement: "Medical reimbursement",
  short_term_rental: "Short-term rental",
  film_credits: "Film credits",
  leveraged_charitable: "Leveraged charitable",
  rtu_program: "RTU program",
};

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

/** First name from contact, intake, or personal; "there" if missing. */
function inferName(analysis: Json): string {
  const name =
    asString(get(analysis, "contact.firstName")) ??
    asString(get(analysis, "contact.first_name")) ??
    asString(get(analysis, "intake.personal.first_name")) ??
    asString(get(analysis, "intake.personal.firstName")) ??
    asString(get(analysis, "personal.first_name")) ??
    asString(get(analysis, "personal.firstName")) ??
    asString(get(analysis, "firstName"));
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

  // Prefer *_breakdown.totals so email figures match baseline_breakdown/revised_breakdown in raw JSON
  const baselineTax =
    safeNumber(get(analysis, "baseline_breakdown.totals.totalTax")) ??
    safeNumber(get(analysis, "baseline_breakdown.totals.total_tax")) ??
    safeNumber(get(analysis, "baseline.total_tax")) ??
    safeNumber(get(analysis, "baseline.totalTax")) ??
    safeNumber(get(analysis, "baseline.total")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.baseline.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.baseline.total_tax")) ??
    null;
  const afterTax =
    safeNumber(get(analysis, "revised_breakdown.totals.totalTax")) ??
    safeNumber(get(analysis, "revised_breakdown.totals.total_tax")) ??
    safeNumber(get(analysis, "after.total_tax")) ??
    safeNumber(get(analysis, "after.totalTax")) ??
    safeNumber(get(analysis, "result.total_tax")) ??
    safeNumber(get(analysis, "revised.total_tax")) ??
    safeNumber(get(analysis, "revised.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.revised.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.revised.total_tax")) ??
    null;
  const deltaRaw =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.totalTaxDelta.base")) ??
    safeNumber(get(analysis, "impact_summary.deltas.total_tax_delta_base")) ??
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
    asString(get(analysis, "intake.business.entity_type")) ??
    asString(get(analysis, "intake.business.type")) ??
    asString(get(analysis, "business.entity_type")) ??
    asString(get(analysis, "business.type"));

  const strategies =
    get(analysis, "strategies") ??
    get(analysis, "strategy_impacts") ??
    get(analysis, "impacts") ??
    get(analysis, "impact_summary.impacts") ??
    get(analysis, "impact_summary.per_strategy") ??
    null;

  // Prefer *_breakdown.totals so email figures match baseline_breakdown/revised_breakdown in raw JSON
  const baselineTax =
    safeNumber(get(analysis, "baseline_breakdown.totals.totalTax")) ??
    safeNumber(get(analysis, "baseline_breakdown.totals.total_tax")) ??
    safeNumber(get(analysis, "baseline.total_tax")) ??
    safeNumber(get(analysis, "baseline.totalTax")) ??
    safeNumber(get(analysis, "baseline.total")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.baseline.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.baseline.total_tax")) ??
    null;
  const afterTax =
    safeNumber(get(analysis, "revised_breakdown.totals.totalTax")) ??
    safeNumber(get(analysis, "revised_breakdown.totals.total_tax")) ??
    safeNumber(get(analysis, "after.total_tax")) ??
    safeNumber(get(analysis, "after.totalTax")) ??
    safeNumber(get(analysis, "result.total_tax")) ??
    safeNumber(get(analysis, "revised.total_tax")) ??
    safeNumber(get(analysis, "revised.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.revised.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.revised.total_tax")) ??
    null;
  const deltaRaw =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.totalTaxDelta.base")) ??
    safeNumber(get(analysis, "impact_summary.deltas.total_tax_delta_base")) ??
    null;
  const delta = computeDelta({ baselineTax, afterTax, deltaRaw });

  const firstName = inferName(analysis);
  const strategyData = renderStrategiesAndTopOpportunities(strategies);
  const topOpp = strategyData.topOpps[0];
  const curated = getCuratedStrategies(strategyData);

  // Advisor opening paragraph
  const openingParagraph =
    "Based on the information you provided, we ran an initial tax planning review to identify areas where you may be overpaying and where proactive planning could reduce your overall tax burden.";

  // Hero: title + value (or "Initial results summary" with no value line)
  let heroTitle = "";
  let heroValueLine = "";
  if (delta != null && delta < 0) {
    heroTitle = "Estimated annual tax savings";
    heroValueLine = formatUsd0(Math.abs(delta));
  } else if (delta != null && delta > 0) {
    heroTitle = "Estimated annual tax increase";
    heroValueLine = formatUsd0(delta);
  } else if (topOpp) {
    heroTitle = "Top opportunity savings";
    heroValueLine = formatUsd0(topOpp.savings);
  } else {
    heroTitle = "Initial results summary";
    // value line omitted
  }
  const heroBlock =
    heroValueLine !== ""
      ? `<p style="margin:0 0 8px 0; font-size:18px; font-weight:bold; color:#111;">${escapeHtml(heroTitle)}: ${escapeHtml(heroValueLine)}</p>`
      : `<p style="margin:0 0 8px 0; font-size:18px; font-weight:bold; color:#111;">${escapeHtml(heroTitle)}</p>`;

  // Baseline → After (when both exist)
  const resultsMiniRow =
    baselineTax != null && afterTax != null
      ? `<p style="margin:0 0 14px 0; color:#333;">Baseline tax: ${escapeHtml(formatUsd(baselineTax))} → After strategies tax: ${escapeHtml(formatUsd(afterTax))}</p>`
      : "";

  // What this means: 3 bullets (escape at render time)
  const bullet1 =
    "Your projected savings are driven by a small set of high-impact planning levers (entity structure and retirement planning are often the biggest drivers for business owners).";
  const bullet2 = topOpp
    ? `The largest single opportunity we detected is ${getStrategyDisplayName(topOpp)} (~${formatUsd0(topOpp.savings)}).`
    : "Several strategies appear potentially available, but the largest impact depends on confirming a few details.";
  const hasRetirementField =
    safeNumber(get(analysis, "intake.retirement.k401_employee_contrib_ytd")) != null ||
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib_ytd")) != null ||
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib")) != null ||
    get(analysis, "intake.personal.retirement") != null;
  let bullet3: string;
  if (hasBiz && !bizType) {
    bullet3 =
      "To finalize the plan, we'll confirm your business entity structure (LLC, S-Corp, etc.) and how you're currently paid.";
  } else if (!hasRetirementField) {
    bullet3 =
      "To finalize the plan, we'll confirm current retirement contributions (401(k), IRA) and whether a higher-limit plan is a fit.";
  } else {
    bullet3 =
      "To finalize the plan, we'll confirm payroll, retirement contributions, and any major deductions/expenses.";
  }
  const whatThisMeansHtml = [
    `<li style="margin:0 0 6px 0;">${escapeHtml(bullet1)}</li>`,
    `<li style="margin:0 0 6px 0;">${escapeHtml(bullet2)}</li>`,
    `<li style="margin:0 0 6px 0;">${escapeHtml(bullet3)}</li>`,
  ].join("");

  // Strategies worth discussing first (3–5 curated, one-liners; escape at render)
  const strategyBulletsHtml = curated
    .map((row) => {
      const name = getStrategyDisplayName(row);
      const oneLiner = getStrategyOneLiner(row.id);
      const line = `${name} — ${oneLiner}`;
      return `<li style="margin:0 0 6px 0;">${escapeHtml(line)}</li>`;
    })
    .join("");
  const strategiesSection =
    curated.length > 0
      ? `
    <h3 style="margin:18px 0 8px 0;">Strategies worth discussing first</h3>
    <ul style="margin:0 0 14px 0; padding-left:18px;">
      ${strategyBulletsHtml}
    </ul>
  `.trim()
      : `
    <h3 style="margin:18px 0 8px 0;">Strategies worth discussing first</h3>
    <p style="margin:0 0 14px 0; color:#333;">Impact varies by documentation and structure. We'll narrow this to the best few strategies once we confirm a handful of details.</p>
  `.trim();

  // Tables only in debug / table mode
  const tablesHtml =
    INCLUDE_TABLES || INCLUDE_RAW_JSON
      ? (() => {
          const appliedTable = strategyData.applied.length
            ? renderStrategyTable("Applied / Already In Use", strategyData.applied)
            : "";
          const potentialTable = strategyData.potential.length
            ? renderStrategyTable("Potential", strategyData.potential)
            : "";
          const showOther =
            strategyData.applied.length === 0 &&
            strategyData.potential.length === 0 &&
            strategyData.other.length > 0;
          const otherTable =
            showOther && strategyData.other.length
              ? renderStrategyTable("Other Strategy Results", strategyData.other)
              : "";
          return [appliedTable, potentialTable, otherTable].filter(Boolean).join("\n");
        })()
      : "";

  // CTA: Next step (advisor tone)
  const ctaBlock = `
    <h3 style="margin:18px 0 8px 0;">Next step</h3>
    <p style="margin:0 0 14px 0; color:#333;">If you'd like to review this plan in detail and see which strategies make sense for you, just reply to this email and we'll set up a time to chat. We'll confirm assumptions, answer questions, and outline next steps. If it's easier, you can <a href="https://healthcheck.boydgroupservices.com/start-schedulepage" style="color:#36a9a2; text-decoration:underline;">get on our calendar HERE</a> to see when a team member has their next availability.</p>
  `.trim();

  const disclaimer =
    "This is an initial planning estimate based on the information provided. Final results depend on complete facts, documentation, and your filed return.";

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
    <p style="margin:0 0 4px 0; font-size:14px; color:#555;">Boyd Group Services</p>
    <h2 style="margin:0 0 18px 0;">Tax Planning Summary</h2>

    <p style="margin:0 0 14px 0; color:#333;">Hi ${escapeHtml(firstName)},</p>

    <p style="margin:0 0 14px 0; color:#333;">${escapeHtml(openingParagraph)}</p>

    ${heroBlock}
    ${resultsMiniRow}

    <h3 style="margin:18px 0 8px 0;">What this means</h3>
    <ul style="margin:0 0 14px 0; padding-left:18px;">
      ${whatThisMeansHtml}
    </ul>

    ${strategiesSection}

    ${ctaBlock}

    ${tablesHtml}

    ${rawJsonBlock}

    <p style="margin-top:16px; color:#666; font-size:12px;">${escapeHtml(disclaimer)}</p>
  </div>
</div>
`.trim();
}

/**
 * Plain text version of the email: advisor structure, same as HTML (opening, hero, What this means, curated strategies, CTA, disclaimer). No tables.
 */
export function buildEmailText(analysis: Json): string {
  const hasBiz =
    get(analysis, "intake.business.has_business") ??
    get(analysis, "business.has_business") ??
    get(analysis, "business.hasBusiness");
  const bizType =
    asString(get(analysis, "intake.business.entity_type")) ??
    asString(get(analysis, "intake.business.type")) ??
    asString(get(analysis, "business.entity_type")) ??
    asString(get(analysis, "business.type"));

  const strategies =
    get(analysis, "strategies") ??
    get(analysis, "strategy_impacts") ??
    get(analysis, "impacts") ??
    get(analysis, "impact_summary.impacts") ??
    get(analysis, "impact_summary.per_strategy") ??
    null;
  const baselineTax =
    safeNumber(get(analysis, "baseline_breakdown.totals.totalTax")) ??
    safeNumber(get(analysis, "baseline_breakdown.totals.total_tax")) ??
    safeNumber(get(analysis, "baseline.total_tax")) ??
    safeNumber(get(analysis, "baseline.totalTax")) ??
    safeNumber(get(analysis, "baseline.total")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.baseline.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.baseline.total_tax")) ??
    null;
  const afterTax =
    safeNumber(get(analysis, "revised_breakdown.totals.totalTax")) ??
    safeNumber(get(analysis, "revised_breakdown.totals.total_tax")) ??
    safeNumber(get(analysis, "after.total_tax")) ??
    safeNumber(get(analysis, "after.totalTax")) ??
    safeNumber(get(analysis, "result.total_tax")) ??
    safeNumber(get(analysis, "revised.total_tax")) ??
    safeNumber(get(analysis, "revised.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.revised.totalTax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.revised.total_tax")) ??
    null;
  const deltaRaw =
    safeNumber(get(analysis, "delta.total_tax")) ??
    safeNumber(get(analysis, "delta.tax")) ??
    safeNumber(get(analysis, "savings.total_tax")) ??
    safeNumber(get(analysis, "impact_summary.revisedTotals.totalTaxDelta.base")) ??
    safeNumber(get(analysis, "impact_summary.deltas.total_tax_delta_base")) ??
    null;
  const delta = computeDelta({ baselineTax, afterTax, deltaRaw });

  const firstName = inferName(analysis);
  const strategyData = renderStrategiesAndTopOpportunities(strategies);
  const topOpp = strategyData.topOpps[0];
  const curated = getCuratedStrategies(strategyData);

  const hasRetirementField =
    safeNumber(get(analysis, "intake.retirement.k401_employee_contrib_ytd")) != null ||
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib_ytd")) != null ||
    safeNumber(get(analysis, "intake.personal.k401_employee_contrib")) != null ||
    get(analysis, "intake.personal.retirement") != null;

  const lines: string[] = [];
  lines.push("Boyd Group Services");
  lines.push("Tax Planning Summary");
  lines.push("");
  lines.push(`Hi ${firstName},`);
  lines.push("");
  lines.push(
    "Based on the information you provided, we ran an initial tax planning review to identify areas where you may be overpaying and where proactive planning could reduce your overall tax burden."
  );
  lines.push("");

  if (delta != null && delta < 0) {
    lines.push(`Estimated annual tax savings: ${formatUsd0(Math.abs(delta))}`);
  } else if (delta != null && delta > 0) {
    lines.push(`Estimated annual tax increase: ${formatUsd0(delta)}`);
  } else if (topOpp) {
    lines.push(`Top opportunity savings: ${formatUsd0(topOpp.savings)}`);
  } else {
    lines.push("Initial results summary");
  }
  if (baselineTax != null && afterTax != null) {
    lines.push(`Baseline tax: ${formatUsd(baselineTax)} → After strategies tax: ${formatUsd(afterTax)}`);
  }
  lines.push("");

  lines.push("What this means");
  lines.push(
    "• Your projected savings are driven by a small set of high-impact planning levers (entity structure and retirement planning are often the biggest drivers for business owners)."
  );
  lines.push(
    topOpp
      ? `• The largest single opportunity we detected is ${getStrategyDisplayName(topOpp)} (~${formatUsd0(topOpp.savings)}).`
      : "• Several strategies appear potentially available, but the largest impact depends on confirming a few details."
  );
  if (hasBiz && !bizType) {
    lines.push(
      "• To finalize the plan, we'll confirm your business entity structure (LLC, S-Corp, etc.) and how you're currently paid."
    );
  } else if (!hasRetirementField) {
    lines.push(
      "• To finalize the plan, we'll confirm current retirement contributions (401(k), IRA) and whether a higher-limit plan is a fit."
    );
  } else {
    lines.push(
      "• To finalize the plan, we'll confirm payroll, retirement contributions, and any major deductions/expenses."
    );
  }
  lines.push("");

  lines.push("Strategies worth discussing first");
  if (curated.length > 0) {
    for (const row of curated) {
      const name = getStrategyDisplayName(row);
      const oneLiner = getStrategyOneLiner(row.id);
      lines.push(`• ${name} — ${oneLiner}`);
    }
  } else {
    lines.push(
      "Impact varies by documentation and structure. We'll narrow this to the best few strategies once we confirm a handful of details."
    );
  }
  lines.push("");

  lines.push("Next step");
  lines.push("");
  lines.push(
    "If you'd like to review this plan in detail and see which strategies make sense for you, just reply to this email and we'll set up a time to chat. We'll confirm assumptions, answer questions, and outline next steps. If it's easier, you can get on our calendar HERE (https://healthcheck.boydgroupservices.com/start-schedulepage) to see when a team member has their next availability."
  );
  lines.push("");
  lines.push(
    "This is an initial planning estimate based on the information provided. Final results depend on complete facts, documentation, and your filed return."
  );

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

type StrategyRow = {
  id: string;
  name: string;
  status: string;
  delta: number | null;
  flags?: string[];
};

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
    safeNumber((s.taxLiabilityDelta as { base?: number })?.base) ??
    safeNumber(get(s, "taxLiabilityDelta.base")) ??
    safeNumber((s.payrollTaxDelta as { base?: number })?.base) ??
    safeNumber(get(s, "payrollTaxDelta.base")) ??
    null;

  const flags = Array.isArray(s.flags) ? s.flags : undefined;

  return { id, name, status, delta, flags };
}

interface StrategyBlockResult {
  html: string;
  topOpps: TopOpp[];
  applied: StrategyRow[];
  potential: StrategyRow[];
  other: StrategyRow[];
}

/** Up to 5 strategies for "Strategies worth discussing first": only those applied to tax savings. */
function getCuratedStrategies(data: StrategyBlockResult): StrategyRow[] {
  return data.applied.slice(0, 5);
}

function getStrategyOneLiner(id: string): string {
  const normalized = (id ?? "").trim().toLowerCase();
  return STRATEGY_ONE_LINERS[normalized] ?? "Potentially available; we'll confirm fit and requirements.";
}

function getStrategyDisplayName(row: StrategyRow): string {
  const id = (row.id ?? "").trim().toLowerCase();
  return STRATEGY_DISPLAY_NAMES[id] ?? row.name ?? row.id ?? "Strategy";
}

function renderStrategiesAndTopOpportunities(strategies: any): StrategyBlockResult {
  const empty: StrategyBlockResult = { html: "", topOpps: [], applied: [], potential: [], other: [] };
  const list = parseStrategies(strategies);
  if (!list.length) return empty;

  const rows = list.map(extractStrategyRow);

  const isAppliedRow = (r: StrategyRow) =>
    isAppliedStatus(r.status) || (Array.isArray(r.flags) && r.flags.includes("APPLIED"));
  const applied = rows.filter(isAppliedRow);
  const potential = rows.filter((r) => !isAppliedRow(r) && isPotentialStatus(r.status));
  const other = rows.filter((r) => !isAppliedRow(r) && !isPotentialStatus(r.status));

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
