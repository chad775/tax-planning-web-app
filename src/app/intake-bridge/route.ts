// src/app/intake-bridge/route.ts
// Bridge route to accept tp_session from GHL redirect and store as HttpOnly cookie

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("tp_session");

    // If token is missing, redirect to /intake without setting cookie
    if (!token || token.trim().length === 0) {
      return NextResponse.redirect(new URL("/intake", request.url), 302);
    }

    // Set HttpOnly cookie with token
    const cookieStore = await cookies();
    cookieStore.set("tp_session", token.trim(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    // Redirect to /intake (no query params)
    return NextResponse.redirect(new URL("/intake", request.url), 302);
  } catch (err) {
    console.error("[INTAKE-BRIDGE] Error:", err);
    // On error, still redirect to /intake (graceful degradation)
    return NextResponse.redirect(new URL("/intake", request.url), 302);
  }
}
