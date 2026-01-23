// /src/lib/strategies/runEvaluator.ts

import type { JsonObject } from "../../contracts";
import type { EvaluatorStrategyEvaluationResult } from "../../contracts";
import { StrategyIdSchema } from "../../contracts/strategyIds";
import { loadStrategyRulesFromFile } from "./rules";
import { evaluateStrategies } from "./evaluator";

/**
 * This file is a strict adapter between:
 * - lib/strategies evaluator output (looser internal types)
 * - contracts evaluator output (strict unions, required fields)
 *
 * Do NOT add business logic here.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeStrategyId(value: unknown) {
  return StrategyIdSchema.parse(String(value));
}

function normalizeRule(rule: unknown): unknown {
  if (!isRecord(rule)) return rule;

  const out: UnknownRecord = { ...rule };

  if ("strategy_id" in out) {
    out.strategy_id = normalizeStrategyId(out.strategy_id);
  }

  return out;
}

function normalizeGroup(group: unknown): unknown {
  if (!isRecord(group)) return group;

  const out: UnknownRecord = { ...group };

  if ("strategy_id" in out) {
    out.strategy_id = normalizeStrategyId(out.strategy_id);
  }

  if (Array.isArray(out.rules)) {
    out.rules = out.rules.map((r) => normalizeRule(r));
  }

  return out;
}

function normalizeStrategy(strategy: unknown): unknown {
  if (!isRecord(strategy)) return strategy;

  const out: UnknownRecord = { ...strategy };

  if ("strategy_id" in out) {
    out.strategy_id = normalizeStrategyId(out.strategy_id);
  }

  if (Array.isArray(out.groups)) {
    out.groups = out.groups.map((g) => normalizeGroup(g));
  }

  return out;
}

export async function runStrategyEvaluator(
  intake: JsonObject,
): Promise<EvaluatorStrategyEvaluationResult> {
  const rules = await loadStrategyRulesFromFile();
  const raw = evaluateStrategies({ intake, rules }) as unknown;

  const rec = isRecord(raw) ? raw : {};

  const allRaw = Array.isArray(rec.all) ? rec.all : [];
  const eligibleRaw = Array.isArray(rec.eligible) ? rec.eligible : [];
  const potentialRaw = Array.isArray(rec.potential) ? rec.potential : [];
  const notEligibleRaw = Array.isArray(rec.notEligible) ? rec.notEligible : [];

  return {
    all: allRaw.map((s) => normalizeStrategy(s)) as EvaluatorStrategyEvaluationResult["all"],
    eligible: eligibleRaw.map((s) => normalizeStrategy(s)) as EvaluatorStrategyEvaluationResult["eligible"],
    potential: potentialRaw.map((s) => normalizeStrategy(s)) as EvaluatorStrategyEvaluationResult["potential"],
    notEligible: notEligibleRaw.map((s) => normalizeStrategy(s)) as EvaluatorStrategyEvaluationResult["notEligible"],
  };
}
