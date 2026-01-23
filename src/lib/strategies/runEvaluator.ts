// /src/lib/strategies/runEvaluator.ts

import type { JsonObject } from "../../contracts";
import type { EvaluatorStrategyEvaluationResult } from "../../contracts";
import { loadStrategyRulesFromFile } from "./rules";
import { evaluateStrategies } from "./evaluator";

export async function runStrategyEvaluator(
  intake: JsonObject,
): Promise<EvaluatorStrategyEvaluationResult> {
  const rules = await loadStrategyRulesFromFile();
  return evaluateStrategies({ intake, rules });
}
