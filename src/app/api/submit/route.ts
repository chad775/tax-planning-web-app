// src/app/api/submit/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as any;

    const intake = body?.intake;
    const contact = body?.contact;

    const email = typeof contact?.email === "string" ? contact.email.trim() : "";
    const firstName = typeof contact?.firstName === "string" ? contact.firstName.trim() : "";
    const phone = typeof contact?.phone === "string" ? contact.phone.trim() : "";

    if (!email) {
      return NextResponse.json({ ok: false, error: "Missing contact.email" }, { status: 400 });
    }

    if (!intake || typeof intake !== "object") {
      return NextResponse.json({ ok: false, error: "Missing intake object" }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? mustEnv("APP_ORIGIN");

    // 1) Analyze (server-to-server) — IMPORTANT: analyze expects { intake: ... }
    const analyzeRes = await fetch(`${origin}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake }),
    });

    if (!analyzeRes.ok) {
      const text = await analyzeRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: text || `Analyze failed (${analyzeRes.status})` },
        { status: 500 },
      );
    }

    const analysisJson = await analyzeRes.json();

    // 2) Call GHL ingest (server-to-server; secret stays private)
    const ingestPayload: any = {
      email,
      analysis: analysisJson,
      ...(firstName ? { firstName } : {}),
      ...(phone ? { phone } : {}),
    };

    const ingestRes = await fetch(`${origin}/api/ghl/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": mustEnv("GHL_WEBHOOK_SECRET"),
      },
      body: JSON.stringify(ingestPayload),
    });

    if (!ingestRes.ok) {
      const text = await ingestRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: text || `GHL ingest failed (${ingestRes.status})` },
        { status: 500 },
      );
    }

    // Return analysis so /results page continues to work
    return NextResponse.json(analysisJson);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Submit failed" },
      { status: 500 },
    );
  }
}
