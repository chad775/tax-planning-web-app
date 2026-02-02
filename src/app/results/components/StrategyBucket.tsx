// src/app/results/components/StrategyBucket.tsx
/**
 * Component for displaying strategies in a bucket (Tier 1 or Tier 2).
 * 
 * Prospect-friendly version showing:
 * - Strategy name and plain English summary
 * - Friendly status labels
 * - Key numbers (deduction, tax savings, cost, net savings for Tier 2)
 * - Simple flag explanations
 */

import React from "react";
import { STRATEGY_CATALOG } from "@/lib/strategies/strategyCatalog";
import type { StrategyId } from "@/contracts/strategyIds";
import type { TaxBreakdown } from "./TaxBreakdownTable";
import { colors, typography, spacing, borderRadius } from "@/lib/ui/designSystem";

type StrategyImpact = {
  strategyId: string;
  tier: 1 | 2;
  flags: string[];
  status: string | null;
  needsConfirmation: boolean | null;
  taxableIncomeDelta: { low: number; base: number; high: number } | null;
  taxLiabilityDelta: { low: number; base: number; high: number } | null;
  model: string | null;
  assumptions: Array<{ id: string; category: string; value: unknown }>;
};

type WhatIfScenarioData = {
  strategyId: string;
  tier: 2;
  taxableIncomeDeltaBase: number;
  totals: {
    federalTax: number;
    stateTax: number;
    totalTax: number;
  };
  breakdown: TaxBreakdown;
};

type StrategyBucketProps = {
  strategies: StrategyImpact[];
  tier: 1 | 2;
  title: string;
  description?: string;
  whatIfMap?: Map<string, WhatIfScenarioData>;
  baselineBreakdown?: TaxBreakdown | null;
  strategyExplanations?: Map<string, { what_it_is: string; why_it_applies_or_not: string }>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const absAmount = Math.abs(amount);
  return `${sign}$${absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatMoneyOrDash(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  return formatMoney(value);
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function getAssumptionNumber(
  assumptions: Array<{ id: string; category: string; value: unknown }>,
  id: string,
): number | null {
  const assumption = assumptions.find((a) => a.id === id);
  if (!assumption) return null;
  return safeNumber(assumption.value);
}

function getAssumptionString(
  assumptions: Array<{ id: string; category: string; value: unknown }>,
  id: string,
): string | null {
  const assumption = assumptions.find((a) => a.id === id);
  if (!assumption) return null;
  return typeof assumption.value === "string" ? assumption.value : null;
}

function deriveEstimatedCost(
  strategyId: string,
  assumptions: Array<{ id: string; category: string; value: unknown }>,
): number | null {
  switch (strategyId) {
    case "rtu_program":
      return getAssumptionNumber(assumptions, "RTU_INVESTMENT");
    case "film_credits":
      return getAssumptionNumber(assumptions, "FILM_INVESTMENT_MIN");
    case "leveraged_charitable":
      return getAssumptionNumber(assumptions, "LEVERAGED_CHARITABLE_INVESTMENT_MIN");
    case "short_term_rental":
      // Cost is NOT just purchase price; treat purchase price as "capital required"
      return null;
    case "s_corp_conversion":
      // Setup/admin cost placeholder: typically $1-3k
      // Return null to show "Varies" in UI, but we could add an assumption if needed
      return null;
    default:
      return null;
  }
}

function deriveCapitalRequired(
  strategyId: string,
  assumptions: Array<{ id: string; category: string; value: unknown }>,
): number | null {
  if (strategyId === "short_term_rental") {
    return getAssumptionNumber(assumptions, "STR_PURCHASE_PRICE");
  }
  return null;
}

function deriveRecommendedIncomeMin(
  assumptions: Array<{ id: string; category: string; value: unknown }>,
): number | null {
  return getAssumptionNumber(assumptions, "RECOMMENDED_INCOME_MIN");
}

export function StrategyBucket({
  strategies,
  tier,
  title,
  description,
  whatIfMap,
  baselineBreakdown,
  strategyExplanations,
}: StrategyBucketProps) {
  const formatIncomeReduction = (range: { low: number; base: number; high: number } | null): string => {
    if (range === null) return "—";
    const base = Math.abs(range.base);
    const lowAbs = Math.abs(range.low);
    const highAbs = Math.abs(range.high);

    if (lowAbs === base && base === highAbs) {
      return `About ${formatMoney(-base)}`;
    }
    // Show range from smallest to largest (lowAbs is typically the smallest absolute value, highAbs is largest)
    // But since these are negative numbers, low is more negative (larger absolute), high is less negative (smaller absolute)
    // So we want to show: smallest absolute value first, then largest
    const minAbs = Math.min(lowAbs, highAbs);
    const maxAbs = Math.max(lowAbs, highAbs);
    return `About ${formatMoney(-base)} (range ${formatMoney(-minAbs)} to ${formatMoney(-maxAbs)})`;
  };

  const getFriendlyStatus = (status: string | null): string => {
    if (status === "ELIGIBLE") return "Eligible";
    if (status === "NOT_ELIGIBLE") return "Not eligible";
    if (status === "POTENTIAL") return "Could be eligible";
    return "Needs review";
  };

  const getStatusColor = (status: string | null): string => {
    if (status === "ELIGIBLE") return colors.savings;
    if (status === "NOT_ELIGIBLE") return colors.error;
    if (status === "POTENTIAL") return colors.warning;
    return colors.textTertiary;
  };

  const getFriendlyFlagLabel = (flag: string): string | null => {
    if (flag === "ALREADY_IN_USE") return "Already using this";
    if (flag === "NOT_APPLIED_POTENTIAL" && tier === 2) return "Optional";
    if (flag === "CAPPED_BY_TAXABLE_INCOME") return "Limited by your income";
    if (flag === "CAPPED_BY_TAX_LIABILITY") return "Limited by tax owed";
    // Hide other flags from prospect view
    return null;
  };

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    background: colors.surface,
    marginBottom: spacing.md,
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: typography.fontWeight.black,
    fontSize: typography.fontSize.lg,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  };

  const summaryStyle: React.CSSProperties = {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.lineHeight.normal,
    marginBottom: spacing.md,
  };

  const tagStyle: React.CSSProperties = {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    padding: `${spacing.xs} ${spacing.sm}`,
    borderRadius: borderRadius.full,
    display: "inline-flex",
    alignItems: "center",
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: typography.lineHeight.normal,
  };

  const numbersSectionStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    background: colors.background,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border}`,
  };

  const numberItemStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: spacing.xs,
  };

  const numberLabelStyle: React.CSSProperties = {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textTertiary,
  };

  const numberValueStyle: React.CSSProperties = {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.black,
    color: colors.textPrimary,
  };

  const friendlyNoteStyle: React.CSSProperties = {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    lineHeight: typography.lineHeight.normal,
    marginTop: spacing.sm,
    fontStyle: "italic",
  };

  if (strategies.length === 0) {
    return (
      <div>
        <h3 style={headerStyle}>{title}</h3>
        {description && <p style={summaryStyle}>{description}</p>}
        <p style={{ ...friendlyNoteStyle, color: colors.textTertiary }}>No strategies in this tier.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={headerStyle}>{title}</h3>
      {description && <p style={summaryStyle}>{description}</p>}
      <div style={{ display: "grid", gap: spacing.md }}>
        {strategies.map((strategy) => {
          const catalogEntry =
            strategy.strategyId in STRATEGY_CATALOG
              ? STRATEGY_CATALOG[strategy.strategyId as StrategyId]
              : undefined;
          const strategyName = catalogEntry?.uiLabel ?? strategy.strategyId;
          
          // Use structured description if available, otherwise fallback to narrative or summary
          const uiDescription = catalogEntry?.uiDescription;
          const narrativeExplanation = strategyExplanations?.get(strategy.strategyId);
          const strategySummary = uiDescription 
            ? undefined // Don't show old summary if we have structured description
            : (narrativeExplanation?.what_it_is ?? catalogEntry?.uiSummary);

          const friendlyStatus = getFriendlyStatus(strategy.status);
          const statusColor = getStatusColor(strategy.status);

          // Collect friendly flags (only show relevant ones)
          const friendlyFlags: string[] = [];
          for (const flag of strategy.flags) {
            const friendly = getFriendlyFlagLabel(flag);
            if (friendly) friendlyFlags.push(friendly);
          }

          // For Tier 2: derive cost and capital required from assumptions
          const estimatedCost = tier === 2 ? deriveEstimatedCost(strategy.strategyId, strategy.assumptions) : null;
          const capitalRequired = tier === 2 ? deriveCapitalRequired(strategy.strategyId, strategy.assumptions) : null;
          const recommendedIncomeMin =
            tier === 2 ? deriveRecommendedIncomeMin(strategy.assumptions) : null;

          // Calculate key metrics for Tier 2 using what-if data
          let deductionAmount: number | null = null;
          let taxSavings: number | null = null;
          let hasWhatIfData = false;

          if (tier === 2) {
            const whatIf = whatIfMap?.get(strategy.strategyId);
            if (whatIf && baselineBreakdown) {
              hasWhatIfData = true;
              deductionAmount = Math.abs(whatIf.taxableIncomeDeltaBase);
              taxSavings = Math.max(0, baselineBreakdown.totals.totalTax - whatIf.totals.totalTax);
            } else if (strategy.taxableIncomeDelta !== null) {
              // Fallback to strategy delta if what-if not available
              deductionAmount = Math.abs(strategy.taxableIncomeDelta.base);
              taxSavings = strategy.taxLiabilityDelta !== null ? Math.abs(strategy.taxLiabilityDelta.base) : null;
            }
          }

          const netSavings = tier === 2 && estimatedCost !== null && taxSavings !== null ? taxSavings - estimatedCost : null;

          // Build advisor-like explanation for why this needs review (8th-grade level, directive, emphasizes advisor need)
          const buildWhyNeedsReview = (): string | null => {
            const requiredItems: string[] = [];
            const reasons: string[] = [];
            let isInBestInterest = false;
            let hasCostBenefit = false;
            let requiresAdvisor = false;

            // Check assumptions for specific needs
            const hasDataGap = strategy.assumptions.some((a) => a.category === "DATA_GAP");
            const requiresCostBenefitReview = strategy.assumptions.some((a) => a.id === "REQUIRES_COST_BENEFIT_REVIEW");
            const requiresPlanDesign = strategy.assumptions.some((a) => a.id === "REQUIRES_PLAN_DESIGN");
            const requiresProgramSpecs = strategy.assumptions.some((a) => a.id === "REQUIRES_PROGRAM_SPECIFICS");
            const requiresPropertyFacts = strategy.assumptions.some((a) => a.id === "REQUIRES_PROPERTY_AND_PARTICIPATION_FACTS");
            const requiresPayrollSetup = strategy.assumptions.some((a) => a.id === "REQUIRES_PAYROLL_SETUP");
            const requiresReasonableSalary = strategy.assumptions.some((a) => a.id === "REQUIRES_REASONABLE_SALARY");
            const needsWageSubstantiation = strategy.assumptions.some((a) => a.id === "NEEDS_WAGE_AND_SUBSTANTIATION");
            const requiresPlanSubstantiation = strategy.assumptions.some((a) => a.id === "REQUIRES_PLAN_AND_SUBSTANTIATION");
            const incomeGateNotMet = strategy.assumptions.some((a) => a.id === "INCOME_GATE_NOT_MET");
            const incomeGateValue = strategy.assumptions.find((a) => a.id === "INCOME_GATE_NOT_MET")?.value as number | undefined;

            // Check flags
            const isCappedByIncome = strategy.flags.includes("CAPPED_BY_TAXABLE_INCOME");
            const isAlreadyInUse = strategy.flags.includes("ALREADY_IN_USE");
            const isNotEligible = strategy.status === "NOT_ELIGIBLE";
            const isPotential = strategy.status === "POTENTIAL";

            // Build explanation based on specific needs - directive language
            if (requiresCostBenefitReview) {
              reasons.push("To take this deduction, you need a professional review of the costs versus benefits to ensure it makes financial sense.");
              requiredItems.push("upfront investment amount and ongoing costs");
              hasCostBenefit = true;
              requiresAdvisor = true;
            }

            if (requiresPlanDesign) {
              reasons.push("To take this deduction, you need a retirement plan that's professionally designed and approved by the IRS.");
              requiredItems.push("a properly designed retirement plan");
              isInBestInterest = true;
              requiresAdvisor = true;
            }

            if (requiresProgramSpecs) {
              reasons.push("To take this deduction, you need to review the specific program details with a tax advisor to confirm it's a good fit.");
              requiredItems.push("program details and current terms");
              hasCostBenefit = true;
              requiresAdvisor = true;
            }

            if (requiresPropertyFacts) {
              reasons.push("To take this deduction, you need proper documentation of the property purchase and your participation level.");
              requiredItems.push("property purchase price, location, and participation documentation");
              isInBestInterest = true;
              requiresAdvisor = true;
            }

            if (requiresPayrollSetup || requiresReasonableSalary) {
              reasons.push("To take this deduction, you need to set up payroll and have a tax advisor determine a reasonable salary amount.");
              requiredItems.push("payroll setup and reasonable salary determination");
              isInBestInterest = true;
              requiresAdvisor = true;
            }

            if (needsWageSubstantiation) {
              reasons.push("To take this deduction, you need proper documentation of wages paid and proof of work performed.");
              requiredItems.push("wage documentation and proof of work");
              isInBestInterest = true;
              requiresAdvisor = true;
            }

            if (requiresPlanSubstantiation) {
              reasons.push("To take this deduction, you need a properly set up medical reimbursement plan with good record keeping.");
              requiredItems.push("a formal medical reimbursement plan and expense records");
              isInBestInterest = true;
              requiresAdvisor = true;
            }

            if (incomeGateNotMet && incomeGateValue) {
              reasons.push(`This strategy typically requires taxable income of at least ${formatMoney(incomeGateValue)} to be effective. Your current income is below that threshold.`);
              isInBestInterest = false;
            }

            if (isCappedByIncome) {
              reasons.push("The potential savings are limited by your current taxable income level.");
            }

            if (isAlreadyInUse) {
              const remainingRoom = getAssumptionNumber(strategy.assumptions, "ALREADY_IN_USE_REMAINING_ROOM");
              if (remainingRoom && remainingRoom > 0) {
                reasons.push(`You're already using this strategy, but you could contribute up to ${formatMoney(remainingRoom)} more to maximize your savings.`);
                isInBestInterest = true;
              } else {
                reasons.push("You're already using this strategy at the maximum level, so there's no additional savings available.");
              }
            }

            if (isNotEligible) {
              const narrativeReason = narrativeExplanation?.why_it_applies_or_not;
              if (narrativeReason && narrativeReason.length > 0) {
                reasons.push(narrativeReason);
              } else {
                reasons.push("Based on your current situation, you don't meet the requirements for this strategy right now.");
              }
            } else if (isPotential) {
              reasons.push("This might work for you, but it requires additional review and proper setup to take the deduction.");
              requiresAdvisor = true;
            }

            if (strategy.needsConfirmation && reasons.length === 0) {
              reasons.push("To take this deduction, you need to verify details and ensure proper implementation.");
              requiresAdvisor = true;
            }

            // Build the final explanation
            if (reasons.length === 0) return null;

            let explanation = reasons.join(" ");

            // Add required items list
            if (requiredItems.length > 0) {
              explanation += ` To move forward, you'll need: ${requiredItems.join(", ")}.`;
            }

            // Emphasize advisor requirement
            if (requiresAdvisor || requiredItems.length > 0) {
              explanation += " These deductions require proper setup and documentation, which is best handled with a tax advisor to ensure everything is done correctly and to maximize your savings.";
            } else if (isInBestInterest && !isNotEligible) {
              explanation += " We recommend working with a tax advisor to ensure proper implementation and to confirm the exact savings you'll see.";
            }

            return explanation;
          };

          const whyNeedsReview = buildWhyNeedsReview();

          return (
            <div key={strategy.strategyId} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm }}>
                <div style={headerStyle}>
                  {uiDescription?.heading ? (
                    <div style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.textPrimary, lineHeight: typography.lineHeight.tight }}>
                      {uiDescription.heading}
                    </div>
                  ) : (
                    strategyName
                  )}
                </div>
                <div style={{ display: "flex", gap: spacing.xs, flexWrap: "wrap" }}>
                  <span
                    style={{
                      ...tagStyle,
                      border: `1px solid ${statusColor}`,
                      background: statusColor === colors.savings ? colors.savingsLight : colors.surface,
                      color: statusColor,
                    }}
                  >
                    {friendlyStatus}
                  </span>
                  {strategy.needsConfirmation && (
                    <span
                      style={{
                        ...tagStyle,
                        border: `1px solid ${colors.warning}`,
                        background: "#fef3c7",
                        color: colors.warning,
                      }}
                    >
                      Needs more info
                    </span>
                  )}
                  {friendlyFlags.map((flag) => (
                    <span
                      key={flag}
                      style={{
                        ...tagStyle,
                        border: `1px solid ${colors.textTertiary}`,
                        background: colors.background,
                        color: colors.textSecondary,
                      }}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Structured description or fallback summary */}
              {uiDescription ? (
                <div style={{ marginBottom: spacing.lg }}>
                  {/* What this strategy is */}
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.textSecondary, marginBottom: spacing.xs }}>What this strategy is</div>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, lineHeight: typography.lineHeight.normal }}>{uiDescription.whatThisStrategyIs}</div>
                  </div>
                  
                  {/* How it lowers taxes */}
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.textSecondary, marginBottom: spacing.xs }}>How it lowers taxes</div>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, lineHeight: typography.lineHeight.normal }}>{uiDescription.howItLowersTaxes}</div>
                  </div>
                  
                  {/* Who this usually works best for */}
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.textSecondary, marginBottom: spacing.xs }}>Who this usually works best for</div>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, lineHeight: typography.lineHeight.normal }}>{uiDescription.whoThisUsuallyWorksBestFor}</div>
                  </div>
                  
                  {/* Why this may need confirmation or planning */}
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.textSecondary, marginBottom: spacing.xs }}>Why this may need confirmation or planning</div>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, lineHeight: typography.lineHeight.normal }}>{uiDescription.whyThisMayNeedConfirmationOrPlanning}</div>
                  </div>
                  
                  {/* Typical effort or cost to implement */}
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.textSecondary, marginBottom: spacing.xs }}>Typical effort or cost to implement</div>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, lineHeight: typography.lineHeight.normal }}>{uiDescription.typicalEffortOrCostToImplement}</div>
                  </div>
                </div>
              ) : (
                strategySummary && <div style={summaryStyle}>{strategySummary}</div>
              )}

              {/* Tier 2: Key numbers section */}
              {tier === 2 && (
                <div style={numbersSectionStyle}>
                  {strategy.strategyId !== "s_corp_conversion" && (
                    <div style={numberItemStyle}>
                      <div style={numberLabelStyle}>Estimated deduction</div>
                      <div style={numberValueStyle}>
                        {hasWhatIfData ? formatMoneyOrDash(deductionAmount) : "Estimate requires review"}
                      </div>
                    </div>
                  )}
                  <div style={numberItemStyle}>
                    <div style={numberLabelStyle}>
                      {strategy.strategyId === "s_corp_conversion"
                        ? "Estimated payroll tax savings"
                        : "Estimated tax savings"}
                    </div>
                    <div style={{ ...numberValueStyle, color: colors.savings }}>
                      {hasWhatIfData ? formatMoneyOrDash(taxSavings) : "Estimate requires review"}
                    </div>
                  </div>
                  <div style={numberItemStyle}>
                    <div style={numberLabelStyle}>Cost</div>
                    <div style={numberValueStyle}>
                      {estimatedCost !== null
                        ? formatMoneyOrDash(estimatedCost)
                        : strategy.strategyId === "s_corp_conversion"
                          ? "Typically $1–3k"
                          : "Varies"}
                    </div>
                  </div>
                  {capitalRequired !== null && (
                    <div style={numberItemStyle}>
                      <div style={numberLabelStyle}>Capital required</div>
                      <div style={numberValueStyle}>{formatMoneyOrDash(capitalRequired)}</div>
                    </div>
                  )}
                  {netSavings !== null && (
                    <div style={numberItemStyle}>
                      <div style={numberLabelStyle}>Net tax benefit after cost</div>
                      <div style={{ ...numberValueStyle, color: netSavings > 0 ? colors.savings : colors.error }}>
                        {formatMoney(netSavings)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tier 1: Estimated income reduction */}
              {tier === 1 && strategy.taxableIncomeDelta !== null && (
                <div>
                  <div style={labelStyle}>Estimated deduction</div>
                  <div style={valueStyle}>{formatIncomeReduction(strategy.taxableIncomeDelta)}</div>
                </div>
              )}

              {/* Why this needs review */}
              {whyNeedsReview && (
                <div style={{ marginTop: spacing.md, padding: spacing.md, background: "#fef3c7", borderRadius: borderRadius.lg, border: `1px solid ${colors.warning}` }}>
                  <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: colors.warning, marginBottom: spacing.xs }}>
                    Why this needs review
                  </div>
                  <div style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: typography.lineHeight.relaxed }}>
                    {whyNeedsReview}
                  </div>
                </div>
              )}

              {/* Recommended income minimum (Tier 2 only) */}
              {tier === 2 && recommendedIncomeMin !== null && (
                <div style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.sm }}>
                  Recommended for income above {formatMoney(recommendedIncomeMin)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
