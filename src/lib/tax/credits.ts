// /src/lib/tax/credits.ts
/**
 * Simplified credits (2025 baseline).
 * Deterministic only. Currently: simplified Child Tax Credit (CTC).
 *
 * Source-of-truth implementation lives in federal.ts.
 * This file exists to match the Phase 1 folder structure and provide a stable import path.
 */

export { computeSimplifiedCTCAvailable2025, applyNonrefundableCTC } from "./federal";
