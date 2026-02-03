// src/app/api/prefill/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/prefill
 * Fetches contact data from GHL using tp_session cookie value as contactId.
 * Returns prefill data (firstName, email, phone) for the current session.
 */
export async function GET() {
  try {
    // Read tp_session from HttpOnly cookie
    const cookieStore = await cookies();
    const tpSessionCookie = cookieStore.get("tp_session");
    
    // Missing cookie
    if (!tpSessionCookie?.value) {
      return NextResponse.json({ ok: false, reason: "MISSING_TP_SESSION" }, { status: 200 });
    }
    
    const contactId = tpSessionCookie.value.trim();
    if (!contactId) {
      return NextResponse.json({ ok: false, reason: "MISSING_TP_SESSION" }, { status: 200 });
    }

    // Validate required env vars
    const apiKey = process.env.GHL_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      console.error("[PREFILL] Missing GHL_API_KEY env var");
      return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 200 });
    }

    const baseUrl = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
    const version = "2021-07-28"; // Match existing GHL client version

    // Fetch contact from GHL: GET /contacts/{contactId}
    const contactUrl = `${baseUrl}/contacts/${encodeURIComponent(contactId)}`;
    
    let response: Response;
    try {
      response = await fetch(contactUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: version,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (err) {
      // Network error
      console.error("[PREFILL] GHL fetch network error:", err);
      return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 200 });
    }

    // Non-2xx response
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error("[PREFILL] GHL fetch failed", {
        status: response.status,
        statusText: response.statusText,
        bodySnippet: bodyText.substring(0, 200),
      });
      return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 200 });
    }

    // Parse response
    let contactData: any;
    try {
      const text = await response.text();
      if (!text) {
        return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 200 });
      }
      contactData = JSON.parse(text);
    } catch (err) {
      // Parse error
      console.error("[PREFILL] GHL response parse error:", err);
      return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 200 });
    }

    // Extract contact fields (handle nested contact object)
    const contact = contactData?.contact || contactData;
    
    // Normalize fields
    const firstName = contact?.firstName || contact?.first_name || "";
    const email = contact?.email || "";
    const phone = contact?.phone || "";

    return NextResponse.json(
      {
        ok: true,
        prefill: {
          firstName: typeof firstName === "string" ? firstName.trim() : "",
          email: typeof email === "string" ? email.trim().toLowerCase() : "",
          phone: typeof phone === "string" ? phone.trim() : "",
        },
      },
      { status: 200 }
    );
  } catch (err) {
    // Unhandled error
    console.error("[PREFILL] Unhandled error:", err);
    return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 200 });
  }
}
