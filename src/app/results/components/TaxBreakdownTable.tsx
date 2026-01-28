// src/app/results/components/TaxBreakdownTable.tsx
/**
 * Reusable component for displaying tax breakdown side-by-side (Baseline vs Revised).
 * 
 * Shows step-by-step tax calculation:
 * - Gross income
 * - Adjustments
 * - AGI
 * - Standard deduction
 * - Taxable income
 * - Federal tax before credits
 * - Credits (CTC with phaseout)
 * - Final federal tax
 * - State tax
 * - Total tax
 */

import React from "react";

export type TaxBreakdown = {
  gross_income: number;
  adjustments: {
    k401_employee_contrib_ytd: number;
  };
  agi: number;
  standard_deduction: number;
  taxable_income: number;
  federal: {
    income_tax_before_credits: number;
    ctc: {
      available: number;
      used_nonrefundable: number;
      unused: number;
      phaseout_rules?: string;
    };
    tax_after_credits: number;
  };
  state: {
    tax: number;
    taxable_base_proxy: number;
  };
  totals: {
    federalTax: number;
    stateTax: number;
    totalTax: number;
  };
};

type TaxBreakdownTableProps = {
  baseline: TaxBreakdown;
  revised: TaxBreakdown;
};

export function TaxBreakdownTable({ baseline, revised }: TaxBreakdownTableProps) {
  const formatMoney = (amount: number): string => {
    return `$${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatDelta = (baselineVal: number, revisedVal: number): string => {
    const delta = revisedVal - baselineVal;
    if (delta === 0) return "—";
    const sign = delta < 0 ? "-" : "+";
    return `${sign}${formatMoney(Math.abs(delta))}`;
  };

  const rowStyle: React.CSSProperties = {
    borderTop: "1px solid #e5e5e5",
    padding: "10px 0",
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "#333",
    fontSize: 14,
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 700,
    color: "#111",
    fontSize: 14,
    textAlign: "right" as const,
  };

  const deltaStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "#666",
    fontSize: 13,
    textAlign: "right" as const,
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 13,
    color: "#111",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "16px", alignItems: "start" }}>
      {/* Baseline Column */}
      <div>
        <div style={sectionHeaderStyle}>Baseline</div>
        <div style={rowStyle}>
          <div style={labelStyle}>Gross Income</div>
          <div style={valueStyle}>{formatMoney(baseline.gross_income)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Adjustments</div>
          <div style={valueStyle}>{formatMoney(baseline.adjustments.k401_employee_contrib_ytd)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>AGI</div>
          <div style={valueStyle}>{formatMoney(baseline.agi)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Standard Deduction</div>
          <div style={valueStyle}>{formatMoney(baseline.standard_deduction)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Taxable Income</div>
          <div style={valueStyle}>{formatMoney(baseline.taxable_income)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Federal Tax (Before Credits)</div>
          <div style={valueStyle}>{formatMoney(baseline.federal.income_tax_before_credits)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Child Tax Credit</div>
          <div style={valueStyle}>{formatMoney(baseline.federal.ctc.used_nonrefundable)}</div>
        </div>
        {baseline.federal.ctc.unused > 0 && (
          <div style={{ ...rowStyle, fontSize: 12, color: "#666", paddingLeft: 12 }}>
            (Unused: {formatMoney(baseline.federal.ctc.unused)})
          </div>
        )}
        <div style={rowStyle}>
          <div style={labelStyle}>Federal Tax (After Credits)</div>
          <div style={valueStyle}>{formatMoney(baseline.federal.tax_after_credits)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>State Tax</div>
          <div style={valueStyle}>{formatMoney(baseline.state.tax)}</div>
        </div>
        <div style={{ ...rowStyle, borderTop: "2px solid #111", paddingTop: 12, marginTop: 8 }}>
          <div style={{ ...labelStyle, fontWeight: 900 }}>Total Tax</div>
          <div style={{ ...valueStyle, fontWeight: 900 }}>{formatMoney(baseline.totals.totalTax)}</div>
        </div>
      </div>

      {/* Delta Column */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 10 }}>
        <div style={{ ...sectionHeaderStyle, visibility: "hidden" }}>Delta</div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, height: 24 }}></div>
        <div style={{ ...rowStyle, borderTop: "2px solid #111", paddingTop: 12, marginTop: 8 }}>
          <div style={deltaStyle}>
            {formatDelta(baseline.totals.totalTax, revised.totals.totalTax)}
          </div>
        </div>
      </div>

      {/* Revised Column */}
      <div>
        <div style={sectionHeaderStyle}>After Strategies</div>
        <div style={rowStyle}>
          <div style={labelStyle}>Gross Income</div>
          <div style={valueStyle}>{formatMoney(revised.gross_income)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Adjustments</div>
          <div style={valueStyle}>{formatMoney(revised.adjustments.k401_employee_contrib_ytd)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>AGI</div>
          <div style={valueStyle}>{formatMoney(revised.agi)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Standard Deduction</div>
          <div style={valueStyle}>{formatMoney(revised.standard_deduction)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Taxable Income</div>
          <div style={valueStyle}>{formatMoney(revised.taxable_income)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Federal Tax (Before Credits)</div>
          <div style={valueStyle}>{formatMoney(revised.federal.income_tax_before_credits)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>Child Tax Credit</div>
          <div style={valueStyle}>{formatMoney(revised.federal.ctc.used_nonrefundable)}</div>
        </div>
        {revised.federal.ctc.unused > 0 && (
          <div style={{ ...rowStyle, fontSize: 12, color: "#666", paddingLeft: 12 }}>
            (Unused: {formatMoney(revised.federal.ctc.unused)})
          </div>
        )}
        <div style={rowStyle}>
          <div style={labelStyle}>Federal Tax (After Credits)</div>
          <div style={valueStyle}>{formatMoney(revised.federal.tax_after_credits)}</div>
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>State Tax</div>
          <div style={valueStyle}>{formatMoney(revised.state.tax)}</div>
        </div>
        <div style={{ ...rowStyle, borderTop: "2px solid #111", paddingTop: 12, marginTop: 8 }}>
          <div style={{ ...labelStyle, fontWeight: 900 }}>Total Tax</div>
          <div style={{ ...valueStyle, fontWeight: 900 }}>{formatMoney(revised.totals.totalTax)}</div>
        </div>
      </div>
    </div>
  );
}
