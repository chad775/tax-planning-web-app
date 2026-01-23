// /src/lib/openai/client.ts
import OpenAI from "openai";

export type OpenAIModel = "gpt-4.1" | "gpt-4.1-mini";

export type OpenAIClientOptions = {
  apiKey?: string;
  defaultModel?: OpenAIModel;
  maxRetries?: number;
};

export type CreateNarrativeParams = {
  model?: OpenAIModel;
  temperature?: number;
  input: any; // OpenAI SDK expects ResponseInput; keep any to avoid version lock
  response_format?: any;
};


export type CreateNarrativeResult = {
  output_text: string;
  raw_response_id?: string;
};

function ensureEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isRetryable(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  if (typeof status === "number") return status === 429 || (status >= 500 && status <= 599);
  const code = err?.code;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  const ms = 250 * Math.pow(2, attempt);
  return Math.min(ms, 4000);
}

export class OpenAINarrativeClient {
  private client: OpenAI;
  private defaultModel: OpenAIModel;
  private maxRetries: number;

  constructor(opts?: OpenAIClientOptions) {
    const apiKey = opts?.apiKey ?? ensureEnv("OPENAI_API_KEY");
    this.client = new OpenAI({ apiKey });
    this.defaultModel = opts?.defaultModel ?? "gpt-4.1-mini";
    this.maxRetries = opts?.maxRetries ?? 2;
  }

  async createNarrative(params: CreateNarrativeParams): Promise<CreateNarrativeResult> {
    const model = params.model ?? this.defaultModel;
    const temperature = params.temperature ?? 0.2;

    let lastErr: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const resp = await this.client.responses.create({
          model,
          input: params.input,
          temperature,
          store: false,
        });

        const output_text = resp.output_text;
        if (!output_text || typeof output_text !== "string") {
          throw new Error("OpenAI response missing output_text.");
        }

        return { output_text, raw_response_id: (resp as any).id };
      } catch (err: any) {
        lastErr = err;
        if (attempt >= this.maxRetries || !isRetryable(err)) break;
        await sleep(backoffMs(attempt));
      }
    }

    const msg =
      lastErr?.message ?? lastErr?.error?.message ?? "OpenAI request failed (unknown error).";
    const status = lastErr?.status ?? lastErr?.response?.status;

    const e = new Error(status ? `OpenAI request failed (${status}): ${msg}` : msg);
    (e as any).cause = lastErr;
    throw e;
  }
}
