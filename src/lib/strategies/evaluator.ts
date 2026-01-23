// /src/lib/strategies/evaluator.ts

import {
    EvaluateStrategiesInput,
    EvaluatedRuleGroup,
    EvaluatedRuleRow,
    EvaluatedStrategy,
    JsonObject,
    JsonValue,
    RuleOperator,
    StrategyEvaluationResult,
    StrategyRuleRow,
    StrategyEligibilityStatus,
  } from "./types";
  
  /**
   * -------------------------
   * Utilities
   * -------------------------
   */
  
  /**
   * Resolve a dot-path against a JSON object.
   * - Supports numeric array indices (e.g. "businesses.0.entityType")
   * - Returns undefined if any segment is missing
   */
  function getValueAtPath(obj: JsonObject, path: string): JsonValue | undefined {
    const parts = path.split(".");
    let current: JsonValue | undefined = obj;
  
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
  
      if (Array.isArray(current)) {
        const idx = Number(part);
        if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
          return undefined;
        }
        current = current[idx];
        continue;
      }
  
      if (typeof current === "object") {
        if (!(part in current)) return undefined;
        current = (current as Record<string, JsonValue>)[part];
        continue;
      }
  
      return undefined;
    }
  
    return current;
  }
  
  /**
   * Compare a resolved value against a rule.
   * Assumes the value exists (undefined handled earlier).
   */
  function evaluateOperator(
    actual: JsonValue,
    op: RuleOperator,
    expected?: JsonValue,
  ): boolean {
    switch (op) {
      case "exists":
        return true;
  
      case "eq":
        return actual === expected;
  
      case "neq":
        return actual !== expected;
  
      case "gte":
        return typeof actual === "number" &&
          typeof expected === "number" &&
          actual >= expected;
  
      case "lte":
        return typeof actual === "number" &&
          typeof expected === "number" &&
          actual <= expected;
  
      case "in":
        return Array.isArray(expected) && expected.includes(actual);
  
      default: {
        const _exhaustive: never = op;
        return _exhaustive;
      }
    }
  }
  
  /**
   * -------------------------
   * Row Evaluation
   * -------------------------
   */
  
  function evaluateRuleRow(
    row: StrategyRuleRow,
    intake: JsonObject,
  ): EvaluatedRuleRow {
    const actual = getValueAtPath(intake, row.field);
  
    if (actual === undefined) {
      if (row.required !== false) {
        return {
          row,
          status: "MISSING_REQUIRED",
          message: `Required field "${row.field}" is missing.`,
        };
      }
  
      return {
        row,
        status: "MISSING_OPTIONAL",
        message: `Optional field "${row.field}" is missing.`,
      };
    }
  
    const passed = evaluateOperator(actual, row.op, row.value);
  
    if (!passed) {
      return {
        row,
        status: "FAILED",
        actual,
        message: `Condition failed: ${row.field} ${row.op} ${JSON.stringify(row.value)}`,
      };
    }
  
    return {
      row,
      status: "PASSED",
      actual,
      message: "Condition passed.",
    };
  }
  
  /**
   * -------------------------
   * Group Evaluation (AND)
   * -------------------------
   */
  
  function evaluateRuleGroup(
    strategy_id: string,
    rule_group: string,
    rows: StrategyRuleRow[],
    intake: JsonObject,
  ): EvaluatedRuleGroup {
    const evaluatedRows = rows.map((row) => evaluateRuleRow(row, intake));
  
    const hasMissingRequired = evaluatedRows.some(
      (r) => r.status === "MISSING_REQUIRED",
    );
  
    const passed =
      !hasMissingRequired &&
      evaluatedRows.every((r) => r.status === "PASSED");
  
    return {
      strategy_id,
      rule_group,
      passed,
      hasMissingRequired,
      rows: evaluatedRows,
    };
  }
  
  /**
   * -------------------------
   * Strategy Evaluation (OR)
   * -------------------------
   */
  
  function evaluateStrategy(
    strategy_id: string,
    rows: StrategyRuleRow[],
    intake: JsonObject,
  ): EvaluatedStrategy {
    // group rows by rule_group
    const groupsMap = new Map<string, StrategyRuleRow[]>();
    for (const row of rows) {
      const list = groupsMap.get(row.rule_group) ?? [];
      list.push(row);
      groupsMap.set(row.rule_group, list);
    }
  
    const evaluatedGroups: EvaluatedRuleGroup[] = [];
    for (const [rule_group, groupRows] of groupsMap.entries()) {
      evaluatedGroups.push(
        evaluateRuleGroup(strategy_id, rule_group, groupRows, intake),
      );
    }
  
    // deterministic ordering
    evaluatedGroups.sort((a, b) =>
      a.rule_group.localeCompare(b.rule_group),
    );
  
    const anyGroupPassed = evaluatedGroups.some((g) => g.passed);
    const anyMissingRequired = evaluatedGroups.some((g) => g.hasMissingRequired);
  
    let status: StrategyEligibilityStatus;
  
    if (anyGroupPassed) {
      status = "ELIGIBLE";
    } else if (anyMissingRequired) {
      status = "POTENTIAL";
    } else {
      status = "NOT_ELIGIBLE";
    }
  
    const failedConditions =
      status === "NOT_ELIGIBLE"
        ? evaluatedGroups
            .flatMap((g) => g.rows)
            .filter((r) => r.status === "FAILED")
        : [];
  
    const missingRequired =
      status === "POTENTIAL"
        ? collectMissingRequired(evaluatedGroups)
        : [];
  
    const summary =
      status === "ELIGIBLE"
        ? "At least one rule group passed."
        : status === "POTENTIAL"
          ? "Missing required intake fields."
          : "All rule groups failed.";
  
    return {
      strategy_id,
      status,
      groups: evaluatedGroups,
      failedConditions,
      missingRequired,
      summary,
    };
  }
  
  /**
   * Collect missing required fields across all groups.
   */
  function collectMissingRequired(
    groups: EvaluatedRuleGroup[],
  ): EvaluatedStrategy["missingRequired"] {
    const map = new Map<
      string,
      { field: string; requiredBy: Array<{ rule_group: string; op: RuleOperator }> }
    >();
  
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.status === "MISSING_REQUIRED") {
          const field = row.row.field;
          const entry =
            map.get(field) ??
            {
              field,
              requiredBy: [],
            };
  
          entry.requiredBy.push({
            rule_group: group.rule_group,
            op: row.row.op,
          });
  
          map.set(field, entry);
        }
      }
    }
  
    return Array.from(map.values()).sort((a, b) =>
      a.field.localeCompare(b.field),
    );
  }
  
  /**
   * -------------------------
   * Public API
   * -------------------------
   */
  
  export function evaluateStrategies(
    input: EvaluateStrategiesInput,
  ): StrategyEvaluationResult {
    const { intake, rules, strategyIds } = input;
  
    const rulesByStrategy = new Map<string, StrategyRuleRow[]>();
    for (const rule of rules) {
      if (strategyIds && !strategyIds.includes(rule.strategy_id)) continue;
  
      const list = rulesByStrategy.get(rule.strategy_id) ?? [];
      list.push(rule);
      rulesByStrategy.set(rule.strategy_id, list);
    }
  
    const strategies: EvaluatedStrategy[] = [];
  
    for (const [strategy_id, strategyRules] of rulesByStrategy.entries()) {
      strategies.push(
        evaluateStrategy(strategy_id, strategyRules, intake),
      );
    }
  
    // deterministic ordering by strategy_id
    strategies.sort((a, b) =>
      a.strategy_id.localeCompare(b.strategy_id),
    );
  
    return {
      eligible: strategies.filter((s) => s.status === "ELIGIBLE"),
      notEligible: strategies.filter((s) => s.status === "NOT_ELIGIBLE"),
      potential: strategies.filter((s) => s.status === "POTENTIAL"),
      all: strategies,
    };
  }
  