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
import { buildEmailHtml, buildEmailSubject } from "@/lib/ghl/emailRenderer";

export const runtime = "nodejs";

type IngestPayload = {
  email: string;
  analysis: Record<string, any>;
  firstName?: string;
  phone?: string;
  tags?: string[];

  /** Optional: bypass idempotency if true */
  forceResend?: boolean;
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

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("X-Webhook-Secret");
    const expected = process.env.GHL_WEBHOOK_SECRET;

    if (!expected || secret !== expected) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    const body = (await req.json().catch(() => null)) as IngestPayload | null;
    if (!body || typeof body.email !== "string" || !isPlainObject(body.analysis)) {
      return json(400, { ok: false, error: "INVALID_PAYLOAD" });
    }

    const email = normalizeEmail(body.email);
    const analysis = body.analysis;

    // Idempotency marker (computed even in log-only mode)
    const idHash = sha256Hex(`${email}|${JSON.stringify(analysis)}`);
    const markerTag = `taxapp_sent_${idHash.slice(0, 16)}`;

    // Resend override (header OR body)
    const forceResend =
      parseTruthyHeader(req.headers.get("X-Force-Resend")) || body.forceResend === true;

    // LOG ONLY: validate/auth/idempotency marker calculation, but no external side effects.
    if (isLogOnlyEnabled()) {
      console.log("[GHL][LOG_ONLY] ingest accepted", {
        email,
        markerTag,
        forceResend,
        tags: Array.isArray(body.tags) ? body.tags : [],
        hasFirstName: typeof body.firstName === "string" && body.firstName.trim().length > 0,
        hasPhone: typeof body.phone === "string" && body.phone.trim().length > 0,
        analysisKeys: Object.keys(analysis ?? {}).slice(0, 50),
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
    const subject = buildEmailSubject(email, analysis);
    const html = buildEmailHtml(analysis);

    /* -------------------------------------------------
       4) Send email
       ------------------------------------------------- */
    try {
      await ghl.sendEmailToContact({ contactId, subject, html });
      console.log("[GHL] Email sent to contact:", contactId, { forceResend });
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
