import { NextRequest, NextResponse } from "next/server";
import { executeDeterministicPipeline } from "@/lib/pipeline";
import { listRecentAuditRuns } from "@/lib/pipeline/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      rawText?: string;
      documentTitle?: string;
      simulateFaultOnAttempt1?: boolean;
    };

    const rawText = (body.rawText ?? "").trim();
    if (!rawText || rawText.length < 30) {
      return NextResponse.json(
        {
          error: "INVALID_DOCUMENT_INPUT",
          message: "Document text must contain at least 30 characters.",
        },
        { status: 400 }
      );
    }

    const execution = await executeDeterministicPipeline({
      rawText,
      documentTitle: body.documentTitle,
      simulateFaultOnAttempt1: Boolean(body.simulateFaultOnAttempt1),
    });

    const recentRuns = listRecentAuditRuns(12);

    return NextResponse.json({
      execution,
      recentRuns,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected pipeline execution error";
    return NextResponse.json(
      {
        error: "PIPELINE_EXECUTION_ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
