// inside /src/lib/openai/validate.ts
import { z } from "zod";
export function toClientError(err: unknown): {
    error: string;
    message: string;
    issues?: Array<{ path: string; message: string }>;
  } {
    if (err instanceof z.ZodError) {
      return {
        error: "INVALID_RESPONSE",
        message: "Model response did not match the expected format.",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
    }
  
    if (typeof err === "object" && err !== null) {
      const e = err as { message?: unknown; code?: unknown; issues?: unknown };
  
      if (e.code === "OPENAI_SCHEMA_INVALID" && Array.isArray(e.issues)) {
        const issues = e.issues
          .filter((x): x is { path: string; message: string } => {
            return (
              typeof x === "object" &&
              x !== null &&
              typeof (x as any).path === "string" &&
              typeof (x as any).message === "string"
            );
          });
  
        return {
          error: "INVALID_RESPONSE",
          message: "Model response failed schema validation.",
          issues,
        };
      }
  
      if (typeof e.message === "string") {
        return { error: "ANALYZE_FAILED", message: e.message };
      }
    }
  
    return { error: "ANALYZE_FAILED", message: "Unknown error" };
  }
  