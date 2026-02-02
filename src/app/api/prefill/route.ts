// src/app/api/prefill/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumePrefill } from "@/lib/session/prefillStore";

export const runtime = "nodejs";

/**
 * GET /api/prefill
 * Returns prefill data (firstName, email, phone) for the current session.
 * Uses consumePrefill() for one-time read: data is returned once and then deleted.
 * Returns {} if no prefill exists, entry has expired, or cookie is missing.
 * 
 * Token correlation: Reads tp_session cookie to get the correlation token,
 * then fetches prefill data keyed by that token.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get("tp_session");
    
    // If no cookie, return empty (no prefill available)
    if (!tokenCookie?.value) {
      return NextResponse.json({}, { status: 200 });
    }
    
    const token = tokenCookie.value.trim();
    if (!token) {
      return NextResponse.json({}, { status: 200 });
    }
    
    // Consume prefill (one-time read: returns data then deletes entry)
    const prefill = consumePrefill(token);
    
    return NextResponse.json(prefill ?? {}, { status: 200 });
  } catch (err) {
    console.error("[PREFILL] Error fetching prefill:", err);
    // Return empty object on error (non-fatal)
    return NextResponse.json({}, { status: 200 });
  }
}
