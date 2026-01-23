// /src/contracts/index.ts
/**
 * Contracts - Single Source of Truth
 * 
 * All threads must import from this module or specific contract files.
 * DO NOT define duplicate types in thread-specific modules.
 * 
 * LOCKED: These contracts should not change without coordination across all threads.
 */

// Strategy IDs (canonical list)
export * from "./strategyIds";

// Intake schema (normalized 2025)
export * from "./intake";

// Evaluator contract (Thread 3)
export * from "./evaluator";
// Rename to avoid collision with impact contract
export type { StrategyEvaluationResult as EvaluatorStrategyEvaluationResult } from "./evaluator";

// Baseline engine contract (Thread 2)
export * from "./baseline";

// Impact engine contract (Thread 4)
export * from "./impact";
// Explicitly export the renamed type
export type { ImpactStrategyEvaluationResult } from "./impact";

export * from "./json";

