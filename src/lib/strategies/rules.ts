// /src/lib/strategies/rules.ts

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  JsonValue,
  RuleOperator,
  StrategyRuleRow,
  StrategyRulesFile,
} from "./types";
import { StrategyIdSchema, type StrategyId } from "../../contracts/strategyIds";

/**
 * Default location for the rules JSON file (relative to repo root).
 * Adjust if your project stores rules elsewhere.
 */
export const DEFAULT_RULES_JSON_PATH = "src/lib/strategies/strategy-rules.json";

/**
 * Narrowing helpers (no `any`).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonPrimitive(value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

const OPERATORS: ReadonlySet<RuleOperator> = new Set([
  "eq",
  "neq",
  "gte",
  "lte",
  "in",
  "exists",
]);

function isRuleOperator(value: unknown): value is RuleOperator {
  return typeof value === "string" && OPERATORS.has(value as RuleOperator);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Deterministic normalization:
 * - trims strings
 * - required is REQUIRED in StrategyRuleRow, so it must be boolean
 * - description is REQUIRED in StrategyRuleRow, so it must be string
 * - value is REQUIRED in StrategyRuleRow, so it must be JsonValue
 */
export function normalizeRuleRow(row: StrategyRuleRow): StrategyRuleRow {
  const strategy_id = row.strategy_id;
  const rule_group = row.rule_group.trim();
  const field = row.field.trim();
  const op = row.op;

  // REQUIRED boolean → default true
  const required = row.required ?? true;

  // REQUIRED string → default ""
  const description = (row.description ?? "").trim();

  // REQUIRED JsonValue
  // If op === "exists" and value is missing, default to true
  const value =
    row.value !== undefined
      ? row.value
      : op === "exists"
        ? true
        : true; // fallback should never occur due to validation

  return {
    strategy_id,
    rule_group,
    field,
    op,
    value,
    required,
    description,
  };
}


export class RulesParseError extends Error {
  public readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "RulesParseError";
    this.issues = issues;
  }
}

/**
 * Parse either:
 * - StrategyRulesFile: { version: string, rules: StrategyRuleRow[] }
 * - or a bare StrategyRuleRow[]
 */
export function parseStrategyRulesJson(raw: unknown): StrategyRuleRow[] {
  const issues: string[] = [];

  const extractRows = (value: unknown): unknown => {
    if (Array.isArray(value)) return value;
    if (isRecord(value) && Array.isArray(value.rules)) return value.rules;
    return null;
  };

  const rowsUnknown = extractRows(raw);

  if (rowsUnknown === null) {
    throw new RulesParseError("Invalid rules JSON shape.", [
      "Expected an array of rules OR an object with a `rules` array.",
    ]);
  }

  if (!Array.isArray(rowsUnknown)) {
    throw new RulesParseError("Invalid rules JSON shape.", ["`rules` must be an array."]);
  }

  const parsed: StrategyRuleRow[] = [];

  for (let i = 0; i < rowsUnknown.length; i += 1) {
    const item = rowsUnknown[i];

    if (!isRecord(item)) {
      issues.push(`rules[${i}] must be an object.`);
      continue;
    }

    const strategy_id_raw = asNonEmptyString(item.strategy_id);
    const rule_group_raw = asNonEmptyString(item.rule_group);
    const field_raw = asNonEmptyString(item.field);
    const op_raw = item.op;

    if (!strategy_id_raw) {
      issues.push(`rules[${i}].strategy_id must be a non-empty string.`);
    } else {
      const validatedId = StrategyIdSchema.safeParse(strategy_id_raw);
      if (!validatedId.success) {
        issues.push(`rules[${i}].strategy_id "${strategy_id_raw}" is not a valid strategy ID.`);
      }
    }

    if (!rule_group_raw) issues.push(`rules[${i}].rule_group must be a non-empty string.`);
    if (!field_raw) issues.push(`rules[${i}].field must be a non-empty string.`);
    if (!isRuleOperator(op_raw)) {
      issues.push(`rules[${i}].op must be one of: ${[...OPERATORS].join(", ")}.`);
    }

    // required: optional in JSON, REQUIRED in StrategyRuleRow => default true
    const requiredRaw = item.required;
    let required: boolean | null = null;
    if (requiredRaw === undefined) required = true;
    else if (typeof requiredRaw === "boolean") required = requiredRaw;
    else required = null;

    if (required === null) {
      issues.push(`rules[${i}].required must be a boolean when provided.`);
    }

    // description: optional in JSON, REQUIRED in StrategyRuleRow => default ""
    const descriptionRaw = item.description;
    let description: string | null = null;
    if (descriptionRaw === undefined) description = "";
    else if (typeof descriptionRaw === "string") description = descriptionRaw;
    else description = null;

    if (description === null) {
      issues.push(`rules[${i}].description must be a string when provided.`);
    }

    // value: REQUIRED in StrategyRuleRow => must always produce a JsonValue
    const valueRaw = item.value;
    let value: JsonValue | null = null;

    if (op_raw === "exists") {
      // If omitted, default to true (deterministic)
      if (valueRaw === undefined) value = true;
      else if (isJsonValue(valueRaw)) value = valueRaw;
      else value = null;

      if (value === null) {
        issues.push(`rules[${i}].value must be a valid JSON value when provided.`);
      }
    } else {
      // For other ops, value is required
      if (valueRaw === undefined) {
        issues.push(`rules[${i}].value is required when op is not "exists".`);
      } else if (isJsonValue(valueRaw)) {
        value = valueRaw;
      } else {
        issues.push(`rules[${i}].value must be a valid JSON value.`);
      }
    }

    const rowHadIssues = issues.some((msg) => msg.startsWith(`rules[${i}]`));
    if (rowHadIssues) continue;

    if (value === null || description === null || required === null) {
      // Defensive; should not happen if rowHadIssues check is correct
      issues.push(`rules[${i}] could not be normalized due to missing normalized values.`);
      continue;
    }

    const validatedStrategyId = StrategyIdSchema.parse(strategy_id_raw) as StrategyId;

    const row: StrategyRuleRow = normalizeRuleRow({
      strategy_id: validatedStrategyId,
      rule_group: rule_group_raw as string,
      field: field_raw as string,
      op: op_raw as RuleOperator,
      value, // JsonValue (never undefined)
      required, // boolean (never undefined)
      description, // string (never undefined)
    });

    parsed.push(row);
  }

  if (issues.length > 0) {
    throw new RulesParseError("Rules JSON failed validation.", issues);
  }

  return stableSortRules(parsed);
}

/**
 * Stable, deterministic ordering:
 * - strategy_id asc
 * - rule_group asc
 * - field asc
 * - op asc
 */
export function stableSortRules(rules: readonly StrategyRuleRow[]): StrategyRuleRow[] {
  const copy = [...rules];
  copy.sort((a, b) => {
    if (a.strategy_id !== b.strategy_id) return a.strategy_id.localeCompare(b.strategy_id);
    if (a.rule_group !== b.rule_group) return a.rule_group.localeCompare(b.rule_group);
    if (a.field !== b.field) return a.field.localeCompare(b.field);
    if (a.op !== b.op) return a.op.localeCompare(b.op);
    return 0;
  });
  return copy;
}

/**
 * Node runtime loader (Next.js server-side / API route).
 * Not compatible with Edge runtime due to fs usage.
 */
export async function loadStrategyRulesFromFile(
  filePath: string = DEFAULT_RULES_JSON_PATH,
): Promise<StrategyRuleRow[]> {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  const text = await readFile(absolute, "utf8");

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown JSON parse error";
    throw new RulesParseError("Failed to parse rules JSON.", [msg]);
  }

  return parseStrategyRulesJson(raw);
}

/**
 * Helper: parse the full file wrapper if you choose to keep it around.
 * Optional, but useful if you later want to validate `version`.
 */
export function parseStrategyRulesFile(raw: unknown): StrategyRulesFile {
  if (!isRecord(raw)) {
    throw new RulesParseError("Invalid StrategyRulesFile.", ["Root must be an object."]);
  }

  const version = asNonEmptyString(raw.version);
  if (!version) {
    throw new RulesParseError("Invalid StrategyRulesFile.", ["`version` must be a non-empty string."]);
  }

  const rules = parseStrategyRulesJson(raw);

  return { version, rules };
}
