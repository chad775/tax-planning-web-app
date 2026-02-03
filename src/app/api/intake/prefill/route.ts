// src/app/api/intake/prefill/route.ts
// API route to fetch contact prefill data from GHL based on tp_session cookie

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GhlClient, GhlApiError } from "@/lib/ghl/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Extract contact fields from GHL contact response.
 * Handles various GHL response shapes.
 */
function extractContactData(contact: any): {
  firstName: string;
  email: string;
  phone: string;
} {
  const result = { firstName: "", email: "", phone: "" };

  // Extract firstName
  const firstName =
    contact?.firstName ||
    contact?.first_name ||
    contact?.contact?.firstName ||
    contact?.contact?.first_name;
  if (typeof firstName === "string" && firstName.trim().length > 0) {
    result.firstName = firstName.trim();
  }

  // Extract email
  const email = contact?.email || contact?.contact?.email;
  if (typeof email === "string" && email.trim().length > 0) {
    result.email = email.trim().toLowerCase();
  }

  // Extract phone
  const phone =
    contact?.phone ||
    contact?.phoneNumber ||
    contact?.contact?.phone ||
    contact?.contact?.phoneNumber;
  if (typeof phone === "string" && phone.trim().length > 0) {
    result.phone = phone.trim();
  }

  return result;
}

/**
 * Extract custom field value from GHL contact response.
 * Handles various custom field structures.
 */
function findCustomFieldValue(contact: any, fieldKey: string): string | null {
  // Try contact.customFields array
  if (Array.isArray(contact?.customFields)) {
    const field = contact.customFields.find(
      (f: any) => (f?.key === fieldKey || f?.name === fieldKey) && typeof f?.value === "string"
    );
    if (field?.value) return field.value.trim();
  }

  // Try contact.custom_fields object
  if (isPlainObject(contact?.custom_fields)) {
    const value = contact.custom_fields[fieldKey];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }

  // Try root-level customFields array
  if (Array.isArray(contact?.customFields)) {
    const field = contact.customFields.find(
      (f: any) => (f?.key === fieldKey || f?.name === fieldKey) && typeof f?.value === "string"
    );
    if (field?.value) return field.value.trim();
  }

  // Try root-level custom_fields object
  if (isPlainObject(contact?.custom_fields)) {
    const value = contact.custom_fields[fieldKey];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }

  return null;
}

export async function GET() {
  try {
    // Read tp_session cookie (NOT from query params)
    const cookieStore = await cookies();
    const token = cookieStore.get("tp_session")?.value?.trim();

    if (!token || token.length === 0) {
      return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });
    }

    // Validate required env vars (do NOT guess names - use existing patterns)
    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID || "7uY97QKanoXhxDGNwDIa";
    const baseUrl = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";

    if (!apiKey || apiKey.trim().length === 0) {
      console.error("[PREFILL] Missing GHL_API_KEY env var");
      return NextResponse.json({ ok: false, reason: "MISSING_ENV" }, { status: 500 });
    }

    const ghl = new GhlClient({
      apiKey,
      locationId,
      baseUrl,
      version: "2021-07-28",
    });

    // Search for contact by tp_session custom field
    let searchResult;
    try {
      searchResult = await ghl.searchContactsByCustomField("tp_session", token);
    } catch (err) {
      // GHL fetch failure - return precise error code
      if (err instanceof GhlApiError) {
        const bodySnippet = err.bodyText ? err.bodyText.substring(0, 200) : "";
        console.error("[PREFILL] GHL fetch failed", {
          status: err.status,
          bodySnippet,
          hasToken: !!token,
        });
        return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 502 });
      } else {
        console.error("[PREFILL] GHL fetch error", { error: err, hasToken: !!token });
        return NextResponse.json({ ok: false, reason: "GHL_FETCH_FAILED" }, { status: 502 });
      }
    }

    // Extract contact from search result
    // GHL search typically returns { contacts: [...] } or { data: { contacts: [...] } }
    const contacts = searchResult?.contacts || searchResult?.data?.contacts || [];
    if (!Array.isArray(contacts) || contacts.length === 0) {
      // No contact found with this token - return ok:true with prefill:null
      return NextResponse.json({ ok: true, prefill: null }, { status: 200 });
    }

    // Use the first matching contact
    const contact = contacts[0];
    const contactData = extractContactData(contact);

    // Verify the token matches (double-check)
    const tokenInContact = findCustomFieldValue(contact, "tp_session");
    if (tokenInContact !== token) {
      console.warn("[PREFILL] Token mismatch in contact data", { hasToken: !!token });
      // Still return ok:true with prefill:null since we found a contact but token doesn't match
      return NextResponse.json({ ok: true, prefill: null }, { status: 200 });
    }

    // Return prefill data
    return NextResponse.json(
      {
        ok: true,
        prefill: {
          firstName: contactData.firstName || "",
          email: contactData.email || "",
          phone: contactData.phone || "",
        },
      },
      { status: 200 }
    );
  } catch (err) {
    // Unhandled error - log with context, never expose secrets
    console.error("[PREFILL] Unhandled error", err);
    return NextResponse.json({ ok: false, reason: "UNHANDLED" }, { status: 500 });
  }
}
