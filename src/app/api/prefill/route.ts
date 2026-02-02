// src/app/api/prefill/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOrCreateSessionId, consumePrefill } from "@/lib/session/prefillStore";

export const runtime = "nodejs";

/**
 * GET /api/prefill
 * Returns prefill data (firstName, email, phone) for the current session.
 * Uses consumePrefill() for one-time read: data is returned once and then deleted.
 * Returns {} if no prefill exists or entry has expired.
 * Ensures session cookie is set if it doesn't exist.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = getOrCreateSessionId(cookieStore);
    
    // Consume prefill (one-time read: returns data then deletes entry)
    const prefill = consumePrefill(sessionId);
    
    // Ensure session cookie is set in response
    const existingCookie = cookieStore.get("tp_session");
    const response = NextResponse.json(prefill ?? {}, { status: 200 });
    
    // Set cookie if it doesn't exist
    if (!existingCookie) {
      response.cookies.set("tp_session", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 2, // 2 hours
      });
    }
    
    return response;
  } catch (err) {
    console.error("[PREFILL] Error fetching prefill:", err);
    // Return empty object on error (non-fatal)
    return NextResponse.json({}, { status: 200 });
  }
}
