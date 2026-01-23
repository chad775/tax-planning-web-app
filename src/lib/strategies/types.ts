// /src/lib/strategies/types.ts

/**
 * @deprecated This file is being phased out in favor of @/contracts.
 * New code should import from @/contracts instead.
 * 
 * Strategy Rules Evaluator (Thread 3)
 * Strongly-typed contracts for:
 * - Intake payload access (normalized schema is locked elsewhere)
 * - Rule definitions (Pattern A: rows grouped by strategy + rule_group)
 * - Evaluator outputs (eligible / not eligible / potential)
 */

import type { StrategyId } from "../../contracts/strategyIds";

export type Primitive = string | number | boolean | null;

/**
 * Supported operators (locked).
 */
export type RuleOperator = "eq" | "neq" | "gte" | "lte" | "in" | "exists";

/**
 * A dot-path into the normalized intake payload.
 * Example: "taxpayer.filingStatus" or "businesses.0.entityType"
 */
export type FieldPath = string;

/**
 * A JSON value type used for rule values and for safe comparisons.
 * - Note: undefined is intentionally excluded; "missing" is represented by absence at path.
 */
export type JsonValue = Primitive | JsonObject | JsonArray;
export type JsonObject = { [k: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * Row-level rule (Pattern A).
 * - AND within a rule_group: all rows in the group must pass.
 * - OR across rule_groups: any group passing makes the strategy eligible.
 * 
 * @deprecated Use StrategyRuleRow from @/contracts/evaluator instead.
 */
export interface StrategyRuleRow {
  /** Strategy identifier (stable key). */
  strategy_id: StrategyId;

  /** A label for the rule group (string/number both fine if stringified). */
  rule_group: string;

  /** Dot-path into intake payload. */
  field: FieldPath;

  /** Operator (locked set). */
  op: RuleOperator;

  /**
   * Value used by eq/neq/gte/lte/in.
   * Not used by exists.
   */
  value?: JsonValue;

  /**
   * Whether this rule requires the field to be present to decide eligibility.
   * If the field is missing and required=true, evaluator should mark strategy as POTENTIAL.
   *
   * Default should be true if omitted (implemented in evaluator).
   */
  required?: boolean;

  /**
   * Optional human-readable description of the rule condition for reporting.
   * (Not required for evaluation.)
   */
  description?: string;
}

/**
 * JSON file shape containing all rules.
 * (Allows either a flat array or an object wrapper; implementer can choose one,
 * but keep this type available for parsing/validation.)
 */
export interface StrategyRulesFile {
  version: string;
  rules: StrategyRuleRow[];
}

/**
 * Minimal strategy metadata (optional, but useful for outputs).
 * If you keep metadata elsewhere, evaluator can still return only ids.
 */
export interface StrategyDefinition {
  strategy_id: string;
  name: string;
  description?: string;
  category?: string;
}

/**
 * Internal evaluation status for a single rule row.
 */
export type RuleRowStatus = "PASSED" | "FAILED" | "MISSING_REQUIRED" | "MISSING_OPTIONAL";

/**
 * Details about a single evaluated rule row (for failure/missing reporting).
 */
export interface EvaluatedRuleRow {
  row: StrategyRuleRow;
  status: RuleRowStatus;

  /**
   * The resolved value from the intake payload at `row.field`, if present.
   * Undefined indicates the path was missing.
   */
  actual?: JsonValue;

  /**
   * Helpful message for debugging / client display.
   * Keep deterministic (no stack traces).
   */
  message: string;
}

/**
 * Result for a rule group: AND of all rows in group.
 */
export interface EvaluatedRuleGroup {
  strategy_id: string;
  rule_group: string;

  /**
   * True only if all rows PASSED.
   * If any FAILED or MISSING_REQUIRED, this is false.
   */
  passed: boolean;

  /**
   * Whether the group could not be fully evaluated due to missing required fields.
   * If true, passed must be false.
   */
  hasMissingRequired: boolean;

  /** Row-by-row details for this group. */
  rows: EvaluatedRuleRow[];
}

/**
 * Strategy-level evaluation aggregates all groups (OR across groups).
 */
export type StrategyEligibilityStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "POTENTIAL";

export interface EvaluatedStrategy {
  strategy_id: string;
  status: StrategyEligibilityStatus;

  /**
   * All groups evaluated for this strategy.
   * Deterministic ordering recommended (implemented in evaluator).
   */
  groups: EvaluatedRuleGroup[];

  /**
   * For NOT_ELIGIBLE: includes failed rows across all groups (excluding missing-required).
   * For POTENTIAL: may be empty (missing fields are in `missingRequired`).
   * For ELIGIBLE: should be empty.
   */
  failedConditions: EvaluatedRuleRow[];

  /**
   * Fields required to make an eligibility determination but missing in intake payload.
   * Populated only for POTENTIAL.
   */
  missingRequired: Array<{
    field: FieldPath;
    /** Which strategy/rule_groups demanded this field. */
    requiredBy: Array<{ rule_group: string; op: RuleOperator }>;
  }>;

  /**
   * A single sentence summary suitable for logs.
   */
  summary: string;
}

/**
 * Overall evaluator output.
 */
export interface StrategyEvaluationResult {
  eligible: EvaluatedStrategy[];
  notEligible: EvaluatedStrategy[];
  potential: EvaluatedStrategy[];

  /**
   * Convenience: all strategies evaluated (including eligible/not/potential),
   * in deterministic order.
   */
  all: EvaluatedStrategy[];
}

/**
 * Evaluator inputs.
 */
export interface EvaluateStrategiesInput {
  /**
   * Normalized intake payload.
   * Keep as JsonObject to avoid `any` while permitting arbitrary schema.
   */
  intake: JsonObject;

  /**
   * Rules loaded from JSON.
   */
  rules: StrategyRuleRow[];

  /**
   * Optional: subset of strategies to evaluate.
   * If omitted, evaluate all strategies present in `rules`.
   */
  strategyIds?: string[];
}
