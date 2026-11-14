import { DocumentCategory } from "@/fixtures/documents";
import { invokeStructuredExtractorLLM } from "@/lib/llm";
import {
  ExtractedDocumentPayload,
  getSchemaForCategory,
  ValidationAttemptTrace,
} from "./schemas";

export interface ExtractionStepOutput {
  payload: ExtractedDocumentPayload | null;
  attempts: ValidationAttemptTrace[];
  retryCount: number;
  totalLatencyMs: number;
  totalTokens: number;
  modelUsed: string;
  providerMode: "LIVE_OPENAI_COMPATIBLE" | "DETERMINISTIC_FALLBACK_ENGINE";
  exhaustedRetries: boolean;
}

const MAX_RETRIES = 3;

export function getValueAtPath(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    if (Array.isArray(current) && typeof segment === "number") {
      current = current[segment];
    } else {
      current = (current as Record<string | number, unknown>)[segment];
    }
  }
  return current;
}

export async function runSelfHealingExtractor(params: {
  category: DocumentCategory;
  rawText: string;
  simulateFaultOnAttempt1?: boolean;
}): Promise<ExtractionStepOutput> {
  const schema = getSchemaForCategory(params.category);
  const attempts: ValidationAttemptTrace[] = [];

  let totalLatencyMs = 0;
  let totalTokens = 0;
  let priorFeedback: string | undefined;
  let priorCandidateJson: unknown;
  let modelUsed = "qwen2.5:14b";
  let providerMode: "LIVE_OPENAI_COMPATIBLE" | "DETERMINISTIC_FALLBACK_ENGINE" =
    "LIVE_OPENAI_COMPATIBLE";

  const maxTotalAttempts = MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= maxTotalAttempts; attempt++) {
    const callOut = await invokeStructuredExtractorLLM({
      category: params.category,
      rawText: params.rawText,
      attempt,
      priorCandidateJson,
      priorZodErrorFeedback: priorFeedback,
      simulateFaultOnAttempt1: params.simulateFaultOnAttempt1,
    });

    totalLatencyMs = Number((totalLatencyMs + callOut.latencyMs).toFixed(2));
    totalTokens += callOut.tokensUsed;
    modelUsed = callOut.modelUsed;
    providerMode = callOut.providerMode;

    const parsed = schema.safeParse(callOut.rawJsonObject);
    if (parsed.success) {
      attempts.push({
        attempt,
        status: "VALID",
        latencyMs: callOut.latencyMs,
        zodErrors: [],
      });

      return {
        payload: parsed.data as ExtractedDocumentPayload,
        attempts,
        retryCount: attempt - 1,
        totalLatencyMs,
        totalTokens,
        modelUsed,
        providerMode,
        exhaustedRetries: false,
      };
    }

    priorCandidateJson = callOut.rawJsonObject;

    const zodErrors = parsed.error.issues.map((issue) => {
      const pathStr = issue.path.join(".") || "<root>";
      return {
        path: pathStr,
        message: issue.message,
        received: getValueAtPath(callOut.rawJsonObject, issue.path as (string | number)[]),
      };
    });

    priorFeedback = zodErrors
      .map(
        (e, i) =>
          `[${i + 1}] Field "${e.path}": ${e.message} (received: ${JSON.stringify(e.received)})`
      )
      .join("\n");

    attempts.push({
      attempt,
      status: "ZOD_SCHEMA_ERROR",
      latencyMs: callOut.latencyMs,
      zodErrors,
      repairFeedbackPrompt: priorFeedback,
    });
  }

  return {
    payload: null,
    attempts,
    retryCount: MAX_RETRIES,
    totalLatencyMs,
    totalTokens,
    modelUsed,
    providerMode,
    exhaustedRetries: true,
  };
}
