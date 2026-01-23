// /src/contracts/intake.ts
/**
 * Normalized intake schema (2025) - LOCKED CONTRACT
 * 
 * This is the single source of truth for intake data structure.
 * All threads must use this schema - no variations.
 * 
 * Matches what runImpactEngine expects: personal/business/retirement/strategies_in_use
 */

import { z } from "zod";
import { STRATEGY_IDS, type StrategyId } from "./strategyIds";

/**
 * Filing status enum matching impactTypes.ts
 */
export const FilingStatusSchema = z.enum([
  "SINGLE",
  "MARRIED_FILING_JOINTLY",
  "MARRIED_FILING_SEPARATELY",
  "HEAD_OF_HOUSEHOLD",
]);
export type FilingStatus = z.infer<typeof FilingStatusSchema>;

/**
 * US State abbreviation enum (all 50 states + DC)
 */
export const USStateAbbrevSchema = z.enum([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC",
  "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY",
]);
export type USStateAbbrev = z.infer<typeof USStateAbbrevSchema>;

/**
 * Business entity type enum
 */
export const EntityTypeSchema = z.enum([
  "SOLE_PROP",
  "S_CORP",
  "C_CORP",
  "PARTNERSHIP",
  "LLC",
  "UNKNOWN",
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * Strategy ID schema (imported from strategyIds.ts)
 */
import { StrategyIdSchema } from "./strategyIds";
export type StrategyIdType = z.infer<typeof StrategyIdSchema>;

/**
 * Normalized intake schema matching NormalizedIntake2025 from impactTypes.ts
 */
export const NormalizedIntakeSchema = z.object({
  personal: z.object({
    filing_status: FilingStatusSchema,
    children_0_17: z.number().int().min(0),
    income_excl_business: z.number().min(0),
    state: USStateAbbrevSchema,
  }),
  business: z.object({
    has_business: z.boolean(),
    entity_type: EntityTypeSchema,
    employees_count: z.number().int().min(0),
    net_profit: z.number(),
  }),
  retirement: z.object({
    k401_employee_contrib_ytd: z.number().min(0),
  }),
  strategies_in_use: z.array(StrategyIdSchema),
}).strict();

export type NormalizedIntake2025 = z.infer<typeof NormalizedIntakeSchema>;
