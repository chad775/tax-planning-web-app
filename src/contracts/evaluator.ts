// src/contracts/evaluator.ts
import type { StrategyId } from "./strategyIds";
import type { JsonObject, JsonValue } from "./json";

export type RuleOperator = "eq" | "neq" | "gte" | "lte" | "in" | "exists";
export type FieldPath = string;

export interface StrategyRuleRow {
  strategy_id: StrategyId;
  rule_group: string;
  field: FieldPath;
  op: RuleOperator;
  value?: JsonValue;
  required?: boolean;
  description?: string;
}

export interface StrategyRulesFile {
  version: string;
  rules: StrategyRuleRow[];
}

export type RuleRowStatus = "PASSED" | "FAILED" | "MISSING_REQUIRED" | "MISSING_OPTIONAL";

export interface EvaluatedRuleRow {
  row: StrategyRuleRow;
  status: RuleRowStatus;
  actual?: JsonValue;
  message: string;
}

export interface EvaluatedRuleGroup {
  strategy_id: StrategyId;
  rule_group: string;
  passed: boolean;
  hasMissingRequired: boolean;
  rows: EvaluatedRuleRow[];
}

export type StrategyEligibilityStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "POTENTIAL";

export interface EvaluatedStrategy {
  strategy_id: StrategyId;
  status: StrategyEligibilityStatus;
  groups: EvaluatedRuleGroup[];
  failedConditions: EvaluatedRuleRow[];
  missingRequired: Array<{
    field: FieldPath;
    requiredBy: Array<{ rule_group: string; op: RuleOperator }>;
  }>;
  summary: string;
}

export interface StrategyEvaluationResult {
  eligible: EvaluatedStrategy[];
  notEligible: EvaluatedStrategy[];
  potential: EvaluatedStrategy[];
  all: EvaluatedStrategy[];
}

export interface EvaluateStrategiesInput {
  intake: JsonObject;
  rules: StrategyRuleRow[];
  strategyIds?: StrategyId[];
}
