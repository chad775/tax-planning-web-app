/**
 * Local test harness:
 * - Start your Next app first (npm run dev)
 * - Then run:
 *   npx tsx scripts/ghlWebhookTest.ts
 *
 * Env:
 * - GHL_WEBHOOK_SECRET must match your server env (or defaults to dev-secret)
 * - APP_BASE_URL optional (defaults to http://localhost:3000)
 */

const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

type Payload = {
  email: string;
  firstName?: string;
  phone?: string;
  tags?: string[];
  analysis: Record<string, any>;
};

async function postOnce(payload: Payload) {
  const secret = process.env.GHL_WEBHOOK_SECRET || "dev-secret";

  const res = await fetch(`${BASE_URL}/api/ghl/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  console.log("Status:", res.status);
  console.log("Body:", parsed);
  console.log("----");
}

async function main() {
  const payload: Payload = {
    email: "chad.b.davidson@gmail.com",
    firstName: "Test",
    phone: "+15555550123",
    tags: ["taxapp_webhook", "analysis_ready"],
    analysis: {
      // Minimal representative sample; real webhook passes raw /api/analyze JSON
      intake: {
        personal: {
          filing_status: "SINGLE",
          children_0_17: 0,
          income_excl_business: 350000,
          state: "CO",
        },
        business: {
          has_business: true,
          type: "s_corporation",
          net_income: 200000,
          num_employees: 3,
        },
        strategies_in_use: ["AUGUSTA", "MERP"],
      },
      baseline: {
        total_tax: 112345.67,
        taxable_income: 410000,
      },
      strategies: [
        { id: "AUGUSTA", status: "APPLIED", delta_tax: -1200 },
        { id: "MERP", status: "POTENTIAL", delta_tax: -3500 },
      ],
      after: {
        total_tax: 107645.67,
      },
      delta: {
        total_tax: -4700,
      },
    },
  };

  // 1) First call → should SEND
  await postOnce(payload);

  // 2) Second call (identical payload) → idempotent SKIP
  await postOnce(payload);

  // 3) Third call → FORCE a different idempotency hash
  //    (guaranteed change regardless of analysis structure)
  payload.analysis._testNonce = Date.now();
  await postOnce(payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
