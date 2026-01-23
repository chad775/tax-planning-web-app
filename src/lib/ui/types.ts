// src/lib/ui/types.ts
import type { NormalizedIntake2025 } from "../../contracts";

type FilingStatus = NormalizedIntake2025["personal"]["filing_status"];
type StateCode = NormalizedIntake2025["personal"]["state"];

type BusinessType = NormalizedIntake2025["business"] extends {
  type: infer T;
}
  ? T
  : never;

export type UiIntakeFormState = {
  filingStatus: FilingStatus;
  state: StateCode | string;

  numChildren: string | number;
  grossIncome: string | number;

  hasBusiness: boolean;
  businessType: BusinessType | null;
  businessNetIncome: string | number;

  numEmployees: string | number;

  // UI convenience: let user select strategies already in use (optional)
  strategiesInUse?: Array<NormalizedIntake2025["strategies_in_use"][number]>;
};
