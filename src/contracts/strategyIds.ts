// /src/contracts/strategyIds.ts
/**
 * Canonical list of strategy IDs (source of truth).
 * 
 * Extracted from src/lib/strategies/strategy-rules.json
 * All threads must use these exact IDs - no variations.
 * 
 * LOCKED: Do not modify without updating all consumers:
 * - strategy-rules.json
 * - evaluator.ts
 * - impactEngine.ts
 * - openai/schema.ts
 */

import { z } from "zod";

export const STRATEGY_IDS = [
  "augusta_loophole",
  "medical_reimbursement",
  "hiring_children",
  "cash_balance_plan",
  "k401",
  "leveraged_charitable",
  "short_term_rental",
  "rtu_program",
  "film_credits",
  "s_corp_conversion",
] as const;

export type StrategyId = typeof STRATEGY_IDS[number];

/**
 * Zod schema for strategy IDs (for validation).
 */
export const StrategyIdSchema = z.enum(STRATEGY_IDS as unknown as [StrategyId, ...StrategyId[]]);

/**
 * Type guard to check if a string is a valid strategy ID.
 */
export function isValidStrategyId(id: string): id is StrategyId {
  return STRATEGY_IDS.includes(id as StrategyId);
}
