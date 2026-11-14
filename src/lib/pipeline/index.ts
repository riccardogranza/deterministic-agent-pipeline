import crypto from "crypto";
import { classifyAndChunkDocument } from "./classifier";
import { persistPipelineAuditRun } from "./db";
import { runSelfHealingExtractor } from "./extractor";
import {
  PipelineExecutionResult,
  PipelineStepMetric,
} from "./schemas";
import { verifyExtractedPayload } from "./verifier";

export interface ExecutePipelineInput {
  rawText: string;
  documentTitle?: string;
  simulateFaultOnAttempt1?: boolean;
}

export async function executeDeterministicPipeline(
  input: ExecutePipelineInput
): Promise<PipelineExecutionResult> {
  const pipelineStart = performance.now();
  const runId = `run_${crypto.randomBytes(6).toString("hex")}`;
  const createdAt = new Date().toISOString();

  // Stage 1: Document Classifier & Chunker
  const classification = classifyAndChunkDocument(input.rawText);

  const steps: PipelineStepMetric[] = [
    {
      stepNumber: 1,
      stepId: "CLASSIFIER_CHUNKER",
      stepName: "Document Classifier & Chunker",
      status: "PASS",
      latencyMs: classification.latencyMs,
      tokensUsed: 0,
      summary: `Type=${classification.documentType} (${(classification.confidence * 100).toFixed(1)}% conf) | ${classification.chunksDetected} chunks | ~${classification.estimatedTokens} tokens`,
    },
  ];

  // Stage 2: Structured Extractor with Self-Healing Zod Validation Loop
  const extraction = await runSelfHealingExtractor({
    category: classification.documentType,
    rawText: input.rawText,
    simulateFaultOnAttempt1: input.simulateFaultOnAttempt1,
  });

  if (extraction.exhaustedRetries || !extraction.payload) {
    steps.push({
      stepNumber: 2,
      stepId: "ZOD_SELF_HEALING_EXTRACTOR",
      stepName: "Zod Structured Extractor (Self-Healing)",
      status: "FAIL",
      latencyMs: extraction.totalLatencyMs,
      tokensUsed: extraction.totalTokens,
      summary: `Failed strict Zod validation after ${extraction.retryCount} repair retries -> MANUAL_REVIEW_REQUIRED`,
    });

    const partialResult: PipelineExecutionResult = {
      runId,
      createdAt,
      documentTitle: input.documentTitle || `${classification.documentType} (${classification.documentHash})`,
      documentHash: classification.documentHash,
      documentType: classification.documentType,
      language: classification.language,
      confidence: classification.confidence,
      chunksDetected: classification.chunksDetected,
      estimatedInputTokens: classification.estimatedTokens,
      status: "MANUAL_REVIEW_REQUIRED",
      modelUsed: extraction.modelUsed,
      providerMode: extraction.providerMode,
      totalLatencyMs: Number((performance.now() - pipelineStart).toFixed(2)),
      totalTokens: extraction.totalTokens,
      retryCount: extraction.retryCount,
      steps,
      validationAttempts: extraction.attempts,
      businessRules: [],
      extractedPayload: null,
    };

    const { auditLatencyMs } = persistPipelineAuditRun(partialResult);
    partialResult.steps.push({
      stepNumber: 4,
      stepId: "SQLITE_WAL_AUDIT",
      stepName: "SQLite WAL Audit Persistence",
      status: "PASS",
      latencyMs: auditLatencyMs,
      tokensUsed: 0,
      summary: `Persisted MANUAL_REVIEW_REQUIRED trace (${runId}) to SQLite WAL`,
    });
    return partialResult;
  }

  steps.push({
    stepNumber: 2,
    stepId: "ZOD_SELF_HEALING_EXTRACTOR",
    stepName: "Zod Structured Extractor (Self-Healing)",
    status: extraction.retryCount > 0 ? "REPAIRED" : "PASS",
    latencyMs: extraction.totalLatencyMs,
    tokensUsed: extraction.totalTokens,
    summary:
      extraction.retryCount > 0
        ? `Self-healed Zod schema violation in ${extraction.retryCount} retry (${extraction.attempts.length} total attempts)`
        : `Strict Zod schema validated on Attempt 1 (${Object.keys(extraction.payload).length} typed fields)`,
  });

  // Stage 3: Deterministic Business-Rule Verifier
  const verification = verifyExtractedPayload(extraction.payload);
  const passedRulesCount = verification.rules.filter((r) => r.passed).length;

  steps.push({
    stepNumber: 3,
    stepId: "DETERMINISTIC_VERIFIER",
    stepName: "Deterministic Business-Rule Engine",
    status: verification.allPassed ? "PASS" : "FAIL",
    latencyMs: verification.latencyMs,
    tokensUsed: 0,
    summary: `${passedRulesCount}/${verification.rules.length} deterministic math & statutory invariants passed`,
  });

  // Stage 4: SQLite WAL Audit Persistence
  const finalStatus = verification.allPassed ? "VERIFIED" : "RULE_VIOLATION";

  const result: PipelineExecutionResult = {
    runId,
    createdAt,
    documentTitle:
      input.documentTitle || `${classification.documentType} [${classification.documentHash.slice(0, 8)}]`,
    documentHash: classification.documentHash,
    documentType: classification.documentType,
    language: classification.language,
    confidence: classification.confidence,
    chunksDetected: classification.chunksDetected,
    estimatedInputTokens: classification.estimatedTokens,
    status: finalStatus,
    modelUsed: extraction.modelUsed,
    providerMode: extraction.providerMode,
    totalLatencyMs: 0,
    totalTokens: extraction.totalTokens,
    retryCount: extraction.retryCount,
    steps,
    validationAttempts: extraction.attempts,
    businessRules: verification.rules,
    extractedPayload: extraction.payload,
  };

  const { auditLatencyMs } = persistPipelineAuditRun(result);
  result.steps.push({
    stepNumber: 4,
    stepId: "SQLITE_WAL_AUDIT",
    stepName: "SQLite WAL Audit Persistence",
    status: "PASS",
    latencyMs: auditLatencyMs,
    tokensUsed: 0,
    summary: `Committed audit record ${runId} (SHA-256: ${classification.documentHash}) to SQLite WAL`,
  });

  result.totalLatencyMs = Number(
    result.steps.reduce((acc, s) => acc + s.latencyMs, 0).toFixed(2)
  );
  persistPipelineAuditRun(result);

  return result;
}
