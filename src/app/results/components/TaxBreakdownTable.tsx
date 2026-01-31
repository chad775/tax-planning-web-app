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
import { colors, typography, spacing, borderRadius } from "@/lib/ui/designSystem";

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
    payrollTax?: number;
    totalTax: number;
  };
};

type AppliedStrategy = {
  strategyId: string;
  label: string;
  agiDeltaBase: number; // negative or 0 (deduction amount)
  taxSavings: number; // positive number (tax savings)
};

type TaxBreakdownTableProps = {
  baseline: TaxBreakdown;
  revised: TaxBreakdown;
  appliedStrategies?: AppliedStrategy[];
};

export function TaxBreakdownTable({ baseline, revised, appliedStrategies = [] }: TaxBreakdownTableProps) {
  const formatMoney = (amount: number): string => {
    const sign = amount < 0 ? "-" : "";
    const absAmount = Math.abs(amount);
    return `${sign}$${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const rowStyle: React.CSSProperties = {
    borderTop: `1px solid ${colors.border}`,
    padding: `${spacing.sm} 0`,
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    textAlign: "right" as const,
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontWeight: typography.fontWeight.black,
    fontSize: typography.fontSize.xs,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  };

  // Calculate savings
  const savings = baseline.totals.totalTax - revised.totals.totalTax;
  const isSavings = savings > 0;

  // Calculate total tax savings (sum of tax savings column)
  const totalTaxSavings = appliedStrategies.reduce((sum, s) => sum + s.taxSavings, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing.xl, alignItems: "start" }}>
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
            <div style={{ ...rowStyle, fontSize: typography.fontSize.xs, color: colors.textTertiary, paddingLeft: spacing.md }}>
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
          {(baseline.totals.payrollTax !== undefined && baseline.totals.payrollTax > 0) && (
            <div style={rowStyle}>
              <div style={labelStyle}>Payroll Tax</div>
              <div style={valueStyle}>{formatMoney(baseline.totals.payrollTax)}</div>
            </div>
          )}
          <div style={{ ...rowStyle, borderTop: `2px solid ${colors.textPrimary}`, paddingTop: spacing.md, marginTop: spacing.sm }}>
            <div style={{ ...labelStyle, fontWeight: typography.fontWeight.black }}>Total Tax</div>
            <div style={{ ...valueStyle, fontWeight: typography.fontWeight.black }}>{formatMoney(baseline.totals.totalTax)}</div>
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
            <div style={{ ...rowStyle, fontSize: typography.fontSize.xs, color: colors.textTertiary, paddingLeft: spacing.md }}>
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
          {(revised.totals.payrollTax !== undefined && revised.totals.payrollTax > 0) && (
            <div style={rowStyle}>
              <div style={labelStyle}>Payroll Tax</div>
              <div style={valueStyle}>{formatMoney(revised.totals.payrollTax)}</div>
            </div>
          )}
          <div style={{ ...rowStyle, borderTop: `2px solid ${colors.textPrimary}`, paddingTop: spacing.md, marginTop: spacing.sm }}>
            <div style={{ ...labelStyle, fontWeight: typography.fontWeight.black }}>Total Tax</div>
            <div style={{ ...valueStyle, fontWeight: typography.fontWeight.black }}>{formatMoney(revised.totals.totalTax)}</div>
          </div>

          {/* Applied Strategies List */}
          {appliedStrategies.length > 0 && (
            <div style={{ marginTop: spacing.xl, paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: colors.textTertiary, marginBottom: spacing.md }}>
                Applied Strategies
              </div>
              
              {/* Table Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr",
                  gap: spacing.sm,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.textSecondary,
                  paddingBottom: spacing.xs,
                  borderBottom: `1px solid ${colors.border}`,
                  marginBottom: spacing.xs,
                }}
              >
                <div>Strategy</div>
                <div style={{ textAlign: "right" as const }}>Deduction</div>
                <div style={{ textAlign: "right" as const }}>Tax Savings</div>
              </div>
              
              {/* Table Rows */}
              <div style={{ display: "grid", gap: spacing.xs }}>
                {appliedStrategies.map((strategy) => (
                  <div
                    key={strategy.strategyId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr",
                      gap: spacing.sm,
                      fontSize: typography.fontSize.xs,
                      padding: `${spacing.xs} 0`,
                    }}
                  >
                    <span style={{ color: colors.textSecondary }}>{strategy.label}</span>
                    <span style={{ fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, textAlign: "right" as const }}>
                      {strategy.agiDeltaBase !== 0 ? formatMoney(strategy.agiDeltaBase) : "—"}
                    </span>
                    <span style={{ fontWeight: typography.fontWeight.semibold, color: colors.savings, textAlign: "right" as const }}>
                      {formatMoney(Math.abs(strategy.taxSavings))}
                    </span>
                  </div>
                ))}
                
                {/* Total Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr",
                    gap: spacing.sm,
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.bold,
                    paddingTop: spacing.sm,
                    marginTop: spacing.sm,
                    borderTop: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                  }}
                >
                  <span>Total tax savings:</span>
                  <span style={{ textAlign: "right" as const }}></span>
                  <span style={{ textAlign: "right" as const, color: colors.savings }}>{formatMoney(Math.abs(totalTaxSavings))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Big Centered Savings Block */}
      <div
        style={{
          marginTop: spacing["2xl"],
          padding: spacing.xl,
          background: isSavings ? colors.savingsLight : "#fef3c7",
          border: `2px solid ${isSavings ? colors.savings : colors.warning}`,
          borderRadius: borderRadius.xl,
          textAlign: "center" as const,
        }}
      >
        <div
          style={{
            fontSize: typography.fontSize["4xl"],
            fontWeight: typography.fontWeight.black,
            color: isSavings ? colors.savings : colors.warning,
            marginBottom: spacing.sm,
          }}
        >
          {formatMoney(savings)}
        </div>
        <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.xs }}>
          {isSavings ? "Estimated Savings (Base Case)" : "Estimated Increase"}
        </div>
        <div style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary }}>
          Baseline total tax minus after-strategies total tax.
        </div>
      </div>
    </div>
  );
}
