// src/lib/ui/types.ts
import type { NormalizedIntake2025 } from "../../contracts";

type FilingStatus = NormalizedIntake2025["personal"]["filing_status"];
type StateCode = NormalizedIntake2025["personal"]["state"];
type EntityType = NormalizedIntake2025["business"]["entity_type"];
type StrategyId = NormalizedIntake2025["strategies_in_use"][number];

export type UiIntakeFormState = {
  // Contact info (UI-only; used for GHL upsert + emailing results)
  contactEmail: string;
  contactFirstName: string;
  contactPhone: string;

  // Personal
  filingStatus: FilingStatus;
  state: StateCode | string;
  numChildren: string | number;
  grossIncome: string | number;

  // Business
  hasBusiness: boolean;
  businessEntityType: EntityType;
  businessNetProfit: string | number;
  employeesCount: string | number;

  // Strategies (checkboxes)
  strategiesInUse: StrategyId[];

  // Required by contract
  k401EmployeeContribYtd: string | number;
};
