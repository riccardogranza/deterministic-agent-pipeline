import { NextResponse } from "next/server";
import { probeOpenAICompatibleServer, getLLMConfig } from "@/lib/llm";
import { listRecentAuditRuns } from "@/lib/pipeline/db";

export async function GET() {
  try {
    const cfg = getLLMConfig();
    const probe = await probeOpenAICompatibleServer();
    const recentRuns = listRecentAuditRuns(12);

    return NextResponse.json({
      llm: {
        configuredModel: cfg.model,
        baseUrl: cfg.baseUrl,
        reachable: probe.reachable,
        configuredModelAvailable: probe.configuredModelAvailable,
        availableModels: probe.availableModels,
        activeModel: probe.activeModel,
      },
      recentRuns,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
