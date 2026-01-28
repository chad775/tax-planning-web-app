// src/app/api/submit/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getBaseUrl(req: Request): string {
  // Works on localhost + Vercel/Proxies
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;

  // Fallback: origin header or APP_ORIGIN
  return req.headers.get("origin") ?? mustEnv("APP_ORIGIN");
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
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

    const baseUrl = getBaseUrl(req);

    // 1) Analyze (server-to-server)
    const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake }),
    });

    if (!analyzeRes.ok) {
      const text = await safeReadText(analyzeRes);
      return NextResponse.json(
        { ok: false, error: text || `Analyze failed (${analyzeRes.status})` },
        { status: 500 },
      );
    }

    const analysisJson = await analyzeRes.json();

    // 2) Best-effort: Call GHL ingest
    // IMPORTANT: This should never prevent returning results.
    let emailStatus: { ok: true } | { ok: false; error: string } = { ok: true };

    try {
      const ingestPayload: any = {
        email,
        analysis: analysisJson,
        ...(firstName ? { firstName } : {}),
        ...(phone ? { phone } : {}),
      };

      const ingestRes = await fetch(`${baseUrl}/api/ghl/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": mustEnv("GHL_WEBHOOK_SECRET"),
        },
        body: JSON.stringify(ingestPayload),
      });

      if (!ingestRes.ok) {
        const text = await safeReadText(ingestRes);
        emailStatus = {
          ok: false,
          error: text || `EMAIL_SEND_FAILED (${ingestRes.status})`,
        };
      } else {
        // In case the ingest route returns {ok:false,...} with 200
        try {
          const maybe = await ingestRes.json();
          if (maybe && typeof maybe === "object" && (maybe as any).ok === false) {
            emailStatus = {
              ok: false,
              error: typeof (maybe as any).error === "string" ? (maybe as any).error : "EMAIL_SEND_FAILED",
            };
          }
        } catch {
          // ignore JSON parse; still ok
        }
      }
    } catch (e: any) {
      emailStatus = { ok: false, error: e?.message ?? "EMAIL_SEND_FAILED" };
    }

    // 3) Always return analysis for /results
    // Wrap it so the client can still access the exact analysis JSON.
    return NextResponse.json(
      {
        ok: true,
        analysis: analysisJson,
        email: emailStatus, // {ok:true} or {ok:false,error:"..."}
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Submit failed" },
      { status: 500 },
    );
  }
}
