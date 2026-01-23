// src/lib/intake/normalizedSchema.ts
import { z } from "zod";

/**
 * Temporary schema wrapper.
 * Replace fields with your true normalized intake from Thread 1 when available.
 *
 * Minimum fields used by Thread 5 route context:
 * - filingStatus
 * - state
 * Optional:
 * - residencyNotes
 * - entityType
 * - brand
 */
export const NormalizedIntakeSchema = z.object({
  filingStatus: z.string().min(1),
  state: z.string().min(2).max(2),

  residencyNotes: z.string().optional(),
  entityType: z.string().optional(),

  brand: z
    .object({
      firmName: z.string().optional(),
      tone: z.enum(["neutral", "professional", "friendly"]).optional(),
    })
    .optional(),

  // Keep extra fields without blocking (so you can send full payload)
}).passthrough();

export type NormalizedIntake = z.infer<typeof NormalizedIntakeSchema>;
