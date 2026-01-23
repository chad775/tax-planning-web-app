// /src/app/api/strategies/evaluate/route.ts

import { NextResponse } from "next/server";
import { runStrategyEvaluator } from "../../../lib/strategies/runEvaluator";
import type { JsonObject } from "../../../contracts";

export async function POST(req: Request) {
  const intake = (await req.json()) as JsonObject;
  const result = await runStrategyEvaluator(intake);
  return NextResponse.json(result);
}
