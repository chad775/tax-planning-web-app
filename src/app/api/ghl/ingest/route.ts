// src/app/api/ghl/ingest/route.ts

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  GhlClient,
  GhlApiError,
  extractContactIdFromUpsertResponse,
  extractTagsFromGetContactResponse,
  type UpsertContactInput,
} from "@/lib/ghl/client";
import { buildEmailHtml, buildEmailSubject, buildEmailText } from "@/lib/ghl/emailRenderer";
import { setPrefill } from "@/lib/session/prefillStore";

export const runtime = "nodejs";

type IngestPayload = {
  email: string;
  analysis: Record<string, any>;
  firstName?: string;
  phone?: string;
  tags?: string[];

  /** Optional: bypass idempotency if true */
  forceResend?: boolean;
  
  // GHL webhook payload may include contact object and custom fields
  contact?: {
    first_name?: string;
    firstName?: string;
    email?: string;
    phone?: string;
    phone_number?: string;
    customFields?: Array<{ name?: string; key?: string; value?: string }>;
    custom_fields?: Record<string, any>;
  };
  customFields?: Array<{ name?: string; key?: string; value?: string }>;
  custom_fields?: Record<string, any>;
};

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const MAX_ANALYSIS_DEPTH = 6;
const MAX_ANALYSIS_VISIT = 2000;

/**
 * Score a candidate object for "looks like the analysis result" (baseline/after/strategies).
 * Higher = more likely to be the node to pass to the email renderer.
 * Prefer root when it has baseline_breakdown + revised_breakdown (includes S-Corp and full totals).
 */
function scoreAnalysisCandidate(obj: unknown): number {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
  const o = obj as Record<string, unknown>;
  let s = 0;
  if (o.baseline != null) s += 5;
  if (o.after != null || o.revised != null || o.scenario != null || o.result != null) s += 5;
  if (o.strategies != null || o.strategy_impacts != null || o.impacts != null) s += 5;
  if (o.intake != null) s += 3;
  if (o.delta != null) s += 2;
  if (o.savings != null) s += 2;
  // Prefer full payload that has breakdown blocks (revised_breakdown includes S-Corp payroll savings)
  if (o.baseline_breakdown != null) s += 5;
  if (o.revised_breakdown != null) s += 5;
  const keys = Object.keys(o);
  if (keys.some((k) => k === "request_id" || k === "created_at_iso")) s += 1;
  return s;
}

/**
 * Traverse root to find the nested plain object with the highest analysis score.
 * Depth limit 6, max nodes visited 2000. Skips arrays except to traverse object elements.
 */
function findBestAnalysisNode(root: unknown): { node: unknown; path: string; score: number } {
  let best: { node: unknown; path: string; score: number } = {
    node: root,
    path: "",
    score: isPlainObject(root) ? scoreAnalysisCandidate(root) : 0,
  };
  let visited = 0;

  function visit(obj: unknown, path: string, depth: number): void {
    if (visited >= MAX_ANALYSIS_VISIT || depth > MAX_ANALYSIS_DEPTH) return;
    if (!isPlainObject(obj)) return;
    visited++;
    const score = scoreAnalysisCandidate(obj);
    if (score > best.score) best = { node: obj, path, score };
    if (depth === MAX_ANALYSIS_DEPTH) return;
    const o = obj as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      if (visited >= MAX_ANALYSIS_VISIT) break;
      const v = o[key];
      const nextPath = path ? `${path}.${key}` : key;
      if (isPlainObject(v)) visit(v, nextPath, depth + 1);
      else if (Array.isArray(v)) {
        for (let i = 0; i < v.length && visited < MAX_ANALYSIS_VISIT; i++) {
          if (isPlainObject(v[i])) visit(v[i], `${nextPath}[${i}]`, depth + 1);
        }
      }
    }
  }

  visit(root, "", 0);
  return best;
}

function parseTruthyEnvFlag(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isLogOnlyEnabled(): boolean {
  return parseTruthyEnvFlag(process.env.GHL_LOG_ONLY);
}

function parseTruthyHeader(v: string | null): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Extract correlation token from GHL webhook payload custom fields.
 * Tolerant to various payload shapes:
 * - contact.customFields array (name/key/value)
 * - custom_fields object
 * - contact.custom_fields
 * - customFields array at root
 */
function extractTokenFromPayload(body: any): string | null {
  // FAST-PATH: Check top-level tp_session first
  if (typeof body?.tp_session === "string") {
    return body.tp_session.trim() || null;
  }
  
  const tokenKey = "tp_session";
  
  // Try contact.customFields array
  if (Array.isArray(body.contact?.customFields)) {
    for (const field of body.contact.customFields) {
      const key = field?.key || field?.name;
      if (key === tokenKey && typeof field?.value === "string") {
        return field.value.trim() || null;
      }
    }
  }
  
  // Try contact.custom_fields object
  if (isPlainObject(body.contact?.custom_fields)) {
    const value = body.contact.custom_fields[tokenKey];
    if (typeof value === "string") {
      return value.trim() || null;
    }
  }
  
  // Try root-level customFields array
  if (Array.isArray(body.customFields)) {
    for (const field of body.customFields) {
      const key = field?.key || field?.name;
      if (key === tokenKey && typeof field?.value === "string") {
        return field.value.trim() || null;
      }
    }
  }
  
  // Try root-level custom_fields object
  if (isPlainObject(body.custom_fields)) {
    const value = body.custom_fields[tokenKey];
    if (typeof value === "string") {
      return value.trim() || null;
    }
  }
  
  return null;
}

/**
 * Extract contact fields from GHL webhook payload.
 * Tolerant to various payload shapes.
 */
function extractContactFields(body: any): {
  firstName?: string;
  email?: string;
  phone?: string;
} {
  const result: { firstName?: string; email?: string; phone?: string } = {};
  
  // Extract firstName
  const firstName =
    body.firstName ||
    body.contact?.first_name ||
    body.contact?.firstName ||
    body.first_name;
  if (typeof firstName === "string" && firstName.trim().length > 0) {
    result.firstName = firstName.trim();
  }
  
  // Extract email from various locations
  const email =
    body.email ||
    body.contact?.email;
  if (typeof email === "string" && email.trim().length > 0) {
    result.email = email.trim();
  }
  
  // Extract phone
  const phone =
    body.phone ||
    body.contact?.phone ||
    body.contact?.phone_number ||
    body.phone_number;
  if (typeof phone === "string" && phone.trim().length > 0) {
    result.phone = phone.trim();
  }
  
  return result;
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("X-Webhook-Secret");
    const expected = process.env.GHL_WEBHOOK_SECRET;

    if (!expected || secret !== expected) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    const body = (await req.json().catch(() => null)) as IngestPayload | null;
    if (!body) {
      return json(400, { ok: false, error: "INVALID_PAYLOAD" });
    }

    // Extract correlation token and contact fields early (before analysis check)
    const token = extractTokenFromPayload(body);
    const contactFields = extractContactFields(body);
    const { firstName, email: emailRaw, phone } = contactFields;
    const email = emailRaw ? normalizeEmail(emailRaw) : undefined;

    // Store prefill data if token exists and we have contact info (even without analysis)
    if (token && (firstName || email || phone)) {
      try {
        const prefillData: { firstName?: string; email?: string; phone?: string } = {};
        if (firstName) prefillData.firstName = firstName;
        if (email) prefillData.email = email;
        if (phone) prefillData.phone = phone;
        
        setPrefill(token, prefillData);
        console.log("[GHL] prefill stored", {
          hasToken: true,
          hasEmail: !!email,
          hasFirstName: !!firstName,
          hasPhone: !!phone,
        });
      } catch (err) {
        console.warn("[GHL] Failed to store prefill data:", err);
      }
    }

    // Locate the best nested node that looks like the analysis result (baseline/after/strategies)
    const result = body;
    const best = findBestAnalysisNode(result);
    const analysisForEmail = best.node ?? result;

    const hasAnalysis = isPlainObject(analysisForEmail);
    if (!hasAnalysis) {
      return json(200, { ok: true, prefillOnly: true });
    }

    // Continue with analysis email flow - require email for this path
    if (!email || typeof email !== "string") {
      return json(400, { ok: false, error: "INVALID_PAYLOAD" });
    }

    // Idempotency marker (computed even in log-only mode)
    const idHash = sha256Hex(`${email}|${JSON.stringify(analysisForEmail)}`);
    const markerTag = `taxapp_sent_${idHash.slice(0, 16)}`;

    // Resend override (header OR body)
    const forceResend =
      parseTruthyHeader(req.headers.get("X-Force-Resend")) || body.forceResend === true;

    // LOG ONLY: validate/auth/idempotency marker calculation, but no external side effects.
    if (isLogOnlyEnabled()) {
      console.log("[GHL][LOG_ONLY] ingest accepted", {
        markerTag,
        forceResend,
        tags: Array.isArray(body.tags) ? body.tags : [],
        hasFirstName: typeof body.firstName === "string" && body.firstName.trim().length > 0,
        hasPhone: typeof body.phone === "string" && body.phone.trim().length > 0,
        analysisKeys: Object.keys(analysisForEmail ?? {}).slice(0, 50),
      });
      return json(200, { ok: true, logOnly: true });
    }

    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID || "7uY97QKanoXhxDGNwDIa";
    const baseUrl = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";

    if (!apiKey) {
      console.error("[GHL] Missing GHL_API_KEY");
      return json(500, { ok: false, error: "EMAIL_SEND_FAILED" });
    }

    const ghl = new GhlClient({
      apiKey,
      locationId,
      baseUrl,
      version: "2021-07-28",
    });

    /* -------------------------------------------------
       1) Upsert contact
       ------------------------------------------------- */
    const upsertInput: UpsertContactInput = { email };
    if (body.firstName !== undefined) upsertInput.firstName = body.firstName;
    if (body.phone !== undefined) upsertInput.phone = body.phone;

    let upsertResp;
    try {
      upsertResp = await ghl.upsertContact(upsertInput);
      console.log("[GHL] Upsert response:", upsertResp);
    } catch (e) {
      console.error("[GHL] upsertContact failed:", e);
      if (e instanceof GhlApiError) {
        console.error("[GHL] upsertContact status/body:", { status: e.status, body: e.bodyText });
      }
      return json(500, { ok: false, error: "EMAIL_SEND_FAILED" });
    }

    const contactId = extractContactIdFromUpsertResponse(upsertResp);
    if (!contactId) {
      console.error("[GHL] Failed to extract contactId. Response:", upsertResp);
      return json(500, { ok: false, error: "EMAIL_SEND_FAILED" });
    }

    /* -------------------------------------------------
       2) Idempotency check (skip duplicate sends unless forceResend)
       ------------------------------------------------- */
    let existingTags: string[] = [];
    try {
      const contactResp = await ghl.getContact(contactId);
      existingTags = extractTagsFromGetContactResponse(contactResp);
    } catch (e) {
      console.warn("[GHL] getContact failed (continuing):", e);
    }

    if (!forceResend && existingTags.includes(markerTag)) {
      return json(200, { ok: true });
    }

    /* -------------------------------------------------
       3) Build email
       ------------------------------------------------- */
    // Merge contact fields (e.g. firstName from GHL/intake) into payload so the email greeting can use them
    const payloadForEmail =
      isPlainObject(analysisForEmail) && (firstName || email || phone)
        ? {
            ...analysisForEmail,
            contact: {
              ...(typeof (analysisForEmail as Record<string, unknown>).contact === "object" &&
              (analysisForEmail as Record<string, unknown>).contact !== null
                ? (analysisForEmail as Record<string, unknown>).contact as Record<string, unknown>
                : {}),
              ...contactFields,
            },
          }
        : (analysisForEmail as Record<string, any>);

    console.log("EMAIL_ANALYSIS_PICK", {
      pickedPath: best.path,
      pickedScore: best.score,
      topLevelKeys:
        payloadForEmail && typeof payloadForEmail === "object"
          ? Object.keys(payloadForEmail).slice(0, 40)
          : [],
      hasBaseline: !!(payloadForEmail as Record<string, unknown>)?.baseline,
      hasAfter: !!(
        (payloadForEmail as Record<string, unknown>)?.after ||
        (payloadForEmail as Record<string, unknown>)?.revised ||
        (payloadForEmail as Record<string, unknown>)?.scenario ||
        (payloadForEmail as Record<string, unknown>)?.result
      ),
      hasStrategies: !!(
        (payloadForEmail as Record<string, unknown>)?.strategies ||
        (payloadForEmail as Record<string, unknown>)?.strategy_impacts ||
        (payloadForEmail as Record<string, unknown>)?.impacts
      ),
      strategiesType: Array.isArray((payloadForEmail as Record<string, unknown>)?.strategies)
        ? "array"
        : typeof (payloadForEmail as Record<string, unknown>)?.strategies,
      strategiesLen: (() => {
        const s = (payloadForEmail as Record<string, unknown>)?.strategies;
        return Array.isArray(s) ? s.length : null;
      })(),
      baselineKeys: (payloadForEmail as Record<string, unknown>)?.baseline
        ? Object.keys((payloadForEmail as Record<string, unknown>).baseline as object).slice(0, 25)
        : [],
      afterKeys: (payloadForEmail as Record<string, unknown>)?.after
        ? Object.keys((payloadForEmail as Record<string, unknown>).after as object).slice(0, 25)
        : (payloadForEmail as Record<string, unknown>)?.revised
          ? Object.keys((payloadForEmail as Record<string, unknown>).revised as object).slice(0, 25)
          : [],
    });

    const subject = buildEmailSubject(email, payloadForEmail);
    const html = buildEmailHtml(payloadForEmail);
    const text = buildEmailText(payloadForEmail);
    console.log("EMAIL_BODY_LENGTHS", { subjectLen: subject.length, htmlLen: html.length, textLen: text.length });

    /* -------------------------------------------------
       4) Send email
       ------------------------------------------------- */
    try {
      await ghl.sendEmailToContact({ contactId, subject, html, text });
      console.log("[GHL] Email sent", {
        contactId,
        forceResend,
        bodyFields: { htmlLength: html.length, textLength: text.length },
      });
    } catch (e) {
      console.error("[GHL] sendEmailToContact failed:", e);
      if (e instanceof GhlApiError) {
        console.error("[GHL] sendEmailToContact status/body:", { status: e.status, body: e.bodyText });
      }
      return json(500, { ok: false, error: "EMAIL_SEND_FAILED" });
    }

    /* -------------------------------------------------
       5) Add tags (non-fatal)
       ------------------------------------------------- */
    const tagsToAdd = Array.from(
      new Set(
        [
          ...(Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : []),
          markerTag,
          ...(forceResend ? ["taxapp_force_resend"] : []),
        ]
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    );

    if (tagsToAdd.length) {
      try {
        await ghl.addTags(contactId, tagsToAdd);
      } catch (e) {
        console.warn("[GHL] addTags failed (non-fatal):", e);
      }
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("[GHL] Unexpected error:", err);
    return json(500, { ok: false, error: "EMAIL_SEND_FAILED" });
  }
}
