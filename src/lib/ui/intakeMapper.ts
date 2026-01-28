// src/lib/ui/intakeMapper.ts
import { NormalizedIntakeSchema, type NormalizedIntake2025 } from "../../contracts";
import type { UiIntakeFormState } from "./types";

export type IntakeMapperOk = {
  ok: true;
  intake: NormalizedIntake2025;
  contact: { email: string; firstName?: string; phone?: string };
};

export type IntakeMapperErr = {
  ok: false;
  issues: Array<{ path: string; message: string }>;
};

export function mapUiToNormalizedIntake(ui: UiIntakeFormState): IntakeMapperOk | IntakeMapperErr {
  const candidate: unknown = {
    personal: {
      filing_status: ui.filingStatus,
      children_0_17: toInt(ui.numChildren),
      income_excl_business: toMoney(ui.grossIncome),
      state: normalizeState(ui.state),
    },
    business: {
      has_business: !!ui.hasBusiness,
      entity_type: ui.hasBusiness ? normalizeEntityType(ui.businessEntityType) : null,
      employees_count: ui.hasBusiness ? toInt(ui.employeesCount) : 0,
      net_profit: ui.hasBusiness ? toMoney(ui.businessNetProfit) : 0,
    },
    retirement: {
      k401_employee_contrib_ytd: toMoney(ui.k401EmployeeContribYtd),
    },
    strategies_in_use: ui.strategiesInUse ?? [],
  };

  const parsed = NormalizedIntakeSchema.safeParse(candidate);
  if (parsed.success) {
    return {
      ok: true,
      intake: parsed.data as NormalizedIntake2025,
      contact: buildContact(ui),
    };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

/* ---------------- helpers ---------------- */

function normalizeEntityType(v: unknown): string | null {
  if (typeof v !== "string") return null;

  // normalize case + separators
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (s) {
    case "sole_prop":
    case "soleproprietor":
    case "sole_proprietor":
    case "soleproprietorship":
    case "sole_proprietorship":
      return "sole_prop";

    case "partnership":
    case "partner":
      return "partnership";

    case "s_corp":
    case "scorp":
    case "s_corporation":
    case "s-corp":
      return "s_corp";

    case "c_corp":
    case "ccorp":
    case "c_corporation":
    case "c-corp":
      return "c_corp";

    default:
      // if UI ever sends something unexpected, pass through normalized string
      return s || null;
  }
}

function buildContact(ui: UiIntakeFormState): { email: string; firstName?: string; phone?: string } {
  const email = String(ui.contactEmail ?? "").trim();
  const firstName = String(ui.contactFirstName ?? "").trim();
  const phone = String(ui.contactPhone ?? "").trim();

  return {
    email,
    ...(firstName ? { firstName } : {}),
    ...(phone ? { phone } : {}),
  };
}

function normalizeState(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const n = Number(String(v ?? "").replace(/[,_\s]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return n2(v);
  const n = Number(String(v ?? "").replace(/[$,_\s]/g, "").trim());
  return Number.isFinite(n) ? n2(n) : 0;
}

function n2(n: number): number {
  return Math.round(n * 100) / 100;
}
