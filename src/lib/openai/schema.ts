// /src/lib/openai/schema.ts
import { z } from "zod";
import { StrategyIdSchema, type StrategyId } from "../../contracts/strategyIds";

/**
 * OpenAI is narrative-only. It must not compute tax numbers, determine eligibility,
 * or introduce new strategies. This schema enforces JSON-only, strongly typed output.
 *
 * Note: Strategy IDs are imported from contracts (single source of truth).
 */

/** Supported strategy identifiers (from contracts - matches Thread 3/4 IDs). */
export { StrategyIdSchema, type StrategyId };

/** Per-strategy narrative explanation (no how-to steps). */
export const StrategyExplanationSchema = z
  .object({
    strategy_id: StrategyIdSchema,
    /**
     * Plain-English justification. Should reference known intake facts and evaluator outputs,
     * but must not invent facts or compute numbers.
     */
    why_it_applies_or_not: z.string().min(1),
    /**
     * High-level description of what the strategy is, without steps, setup instructions,
     * or “do X then Y” guidance.
     */
    what_it_is: z.string().min(1),
  })
  .strict();

export type StrategyExplanation = z.infer<typeof StrategyExplanationSchema>;

/** Model response schema (JSON-only). */
export const OpenAIAnalysisResponseSchema = z
  .object({
    executive_summary: z.string().min(1),

    /**
     * Text-only narrative. Numbers are passed in via analysis context; model may reference
     * provided numbers but must not create new ones.
     */
    baseline_tax_summary: z.string().min(1),
    revised_tax_summary: z.string().min(1),

    /**
     * One entry per strategy the app knows about (applicable or not).
     * The route can decide whether to request all strategies or only those evaluated.
     */
    strategy_explanations: z.array(StrategyExplanationSchema),

    /**
     * Disclaimer-safe statements; safe to show on results page and email.
     * Keep as an array to support rendering as bullets.
     */
    disclaimers: z.array(z.string().min(1)).min(1),

    /**
     * Safe, non-advisory next step text (e.g., “Schedule a review call…”).
     * Must not contain step-by-step tax/legal instructions.
     */
    call_to_action_text: z.string().min(1),
  })
  .strict();

export type OpenAIAnalysisResponse = z.infer<typeof OpenAIAnalysisResponseSchema>;

/**
 * Helpers
 */
export function parseOpenAIAnalysisResponse(json: unknown): OpenAIAnalysisResponse {
  return OpenAIAnalysisResponseSchema.parse(json);
}

/**
 * Optional: If you want a “safe parse” path for non-throwing validation.
 */
export function safeParseOpenAIAnalysisResponse(json: unknown) {
  return OpenAIAnalysisResponseSchema.safeParse(json);
}
