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

function isJsonPrimitive(
  value: unknown,
): value is string | number | boolean | null {
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
 * - defaults `required` to true when omitted
 * - strategy_id is already validated as StrategyId, so we preserve the type
 */
export function normalizeRuleRow(row: StrategyRuleRow): StrategyRuleRow {
  return {
    ...row,
    strategy_id: row.strategy_id, // Already validated as StrategyId, no need to trim (it's a literal type)
    rule_group: row.rule_group.trim(),
    field: row.field.trim(),
    required: row.required ?? true,
    description: row.description?.trim(),
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
    throw new RulesParseError("Invalid rules JSON shape.", [
      "`rules` must be an array.",
    ]);
  }

  const parsed: StrategyRuleRow[] = [];

  for (let i = 0; i < rowsUnknown.length; i += 1) {
    const item = rowsUnknown[i];

    if (!isRecord(item)) {
      issues.push(`rules[${i}] must be an object.`);
      continue;
    }

    const strategy_id = asNonEmptyString(item.strategy_id);
    const rule_group = asNonEmptyString(item.rule_group);
    const field = asNonEmptyString(item.field);
    const op = item.op;

    if (!strategy_id) {
      issues.push(`rules[${i}].strategy_id must be a non-empty string.`);
    } else {
      // Validate strategy_id is a valid StrategyId from contracts
      const validatedId = StrategyIdSchema.safeParse(strategy_id);
      if (!validatedId.success) {
        issues.push(`rules[${i}].strategy_id "${strategy_id}" is not a valid strategy ID.`);
      }
    }
    if (!rule_group) {
      issues.push(`rules[${i}].rule_group must be a non-empty string.`);
    }
    if (!field) {
      issues.push(`rules[${i}].field must be a non-empty string.`);
    }
    if (!isRuleOperator(op)) {
      issues.push(
        `rules[${i}].op must be one of: ${[...OPERATORS].join(", ")}.`,
      );
    }

    const requiredRaw = item.required;
    const required =
      requiredRaw === undefined
        ? undefined
        : typeof requiredRaw === "boolean"
          ? requiredRaw
          : null;

    if (required === null) {
      issues.push(`rules[${i}].required must be a boolean when provided.`);
    }

    const descriptionRaw = item.description;
    const description =
      descriptionRaw === undefined
        ? undefined
        : typeof descriptionRaw === "string"
          ? descriptionRaw
          : null;

    if (description === null) {
      issues.push(`rules[${i}].description must be a string when provided.`);
    }

    const valueRaw = item.value;

    // Validate value presence depending on operator
    if (op === "exists") {
      // value may be omitted; if present, must be JSON.
      if (valueRaw !== undefined && !isJsonValue(valueRaw)) {
        issues.push(
          `rules[${i}].value must be a valid JSON value when provided.`,
        );
      }
    } else {
      // for eq/neq/gte/lte/in, value is required
      if (valueRaw === undefined) {
        issues.push(`rules[${i}].value is required when op is not "exists".`);
      } else if (!isJsonValue(valueRaw)) {
        issues.push(`rules[${i}].value must be a valid JSON value.`);
      }
    }

    // If this row had any issues, skip adding it (keep collecting other issues).
    // This also satisfies TypeScript: only construct StrategyRuleRow when non-null.
    const rowHadIssues = issues.some((msg) => msg.startsWith(`rules[${i}]`));
    if (rowHadIssues) continue;

    // At this point we know strategy_id/rule_group/field are non-null strings
    // and op is a RuleOperator.
    // Validate strategy_id is a valid StrategyId (already checked above, but TypeScript needs the cast)
    const validatedStrategyId = StrategyIdSchema.parse(strategy_id) as StrategyId;
    const row: StrategyRuleRow = normalizeRuleRow({
      strategy_id: validatedStrategyId,
      rule_group: rule_group as string,
      field: field as string,
      op: op as RuleOperator,
      value: valueRaw as JsonValue | undefined,
      required: required ?? undefined,
      description: description ?? undefined,
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
export function stableSortRules(
  rules: readonly StrategyRuleRow[],
): StrategyRuleRow[] {
  const copy = [...rules];
  copy.sort((a, b) => {
    if (a.strategy_id !== b.strategy_id)
      return a.strategy_id.localeCompare(b.strategy_id);
    if (a.rule_group !== b.rule_group)
      return a.rule_group.localeCompare(b.rule_group);
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
    throw new RulesParseError("Invalid StrategyRulesFile.", [
      "Root must be an object.",
    ]);
  }

  const version = asNonEmptyString(raw.version);
  if (!version) {
    throw new RulesParseError("Invalid StrategyRulesFile.", [
      "`version` must be a non-empty string.",
    ]);
  }

  const rules = parseStrategyRulesJson(raw);

  return { version, rules };
}
