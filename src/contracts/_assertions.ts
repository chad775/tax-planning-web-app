// src/contracts/_assertions.ts

/**
 * Compile-time guard to detect contract drift.
 *
 * No runtime effect.
 * If any of these contracts are renamed, removed, or structurally changed,
 * TypeScript will fail the build.
 */

import type {
    NormalizedIntake2025,
  
    EvaluateStrategiesInput,
    StrategyRuleRow,
  
    BaselineTaxTotals,
  
    ImpactEngineInput,
    ImpactEngineOutput,
  
    StrategyId,
  } from "./index";
  
  export type __contracts_assertions = {
    intake: NormalizedIntake2025;
  
    evaluatorInput: EvaluateStrategiesInput;
    evaluatorRow: StrategyRuleRow;
  
    baselineTotals: BaselineTaxTotals;
  
    impactInput: ImpactEngineInput;
    impactOutput: ImpactEngineOutput;
  
    strategyId: StrategyId;
  };
  
  // Force TS to evaluate the imports (no runtime usage)
  export const __contracts_assertions__ok: true = true;
  