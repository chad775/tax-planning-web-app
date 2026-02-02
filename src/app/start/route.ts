// src/app/start/route.ts
// Route handler that mints a token, sets cookie, and redirects to GHL landing page

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GHL landing page URL - should be set via environment variable
const GHL_LANDING_URL = process.env.GHL_LANDING_URL || "https://healthcheck.boydgroupservices.com/start";

/**
 * GET /start
 * 
 * Generates a correlation token, sets it as an HttpOnly cookie on our domain,
 * and redirects to the GHL landing page with the token as a query parameter.
 * 
 * Preserves UTM parameters and other query params from the request.
 */
export async function GET(request: Request) {
  try {
    // Generate correlation token
    const token = randomUUID();
    
    // Get existing query params from request (for UTM tracking, etc.)
    const url = new URL(request.url);
    const searchParams = new URLSearchParams(url.search);
    
    // Add our token to the query params
    searchParams.set("tp_session", token);
    
    // Build GHL landing page URL with token and preserved params
    const ghlUrl = new URL(GHL_LANDING_URL);
    // Preserve existing GHL query params if any
    const ghlParams = new URLSearchParams(ghlUrl.search);
    
    // Merge our params (including token) with any existing GHL params
    for (const [key, value] of searchParams.entries()) {
      ghlParams.set(key, value);
    }
    
    const redirectUrl = `${ghlUrl.origin}${ghlUrl.pathname}?${ghlParams.toString()}`;
    
    // Set HttpOnly cookie with token
    const cookieStore = await cookies();
    cookieStore.set("tp_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 2, // 2 hours (matches prefill TTL + buffer)
    });
    
    // Redirect to GHL landing page with token
    return NextResponse.redirect(redirectUrl, 302);
  } catch (err) {
    console.error("[START] Error in /start route:", err);
    // Fallback: redirect to GHL without token (non-fatal)
    return NextResponse.redirect(GHL_LANDING_URL, 302);
  }
}
