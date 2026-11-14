"use client";

import React, { useEffect, useState } from "react";
import { DOCUMENT_FIXTURES, DocumentFixture } from "@/fixtures/documents";
import { PipelineExecutionResult } from "@/lib/pipeline/schemas";
import { AuditRunSummary } from "@/lib/pipeline/db";

interface LLMStatusInfo {
  configuredModel: string;
  baseUrl: string;
  reachable: boolean;
  configuredModelAvailable: boolean;
  availableModels: string[];
  activeModel: string;
}

type InspectorTab = "split" | "json" | "trace";

const FIXTURE_LABELS: Record<string, { code: string; shortTitle: string; categoryLabel: string }> = {
  "it-public-tender-2026": {
    code: "FIX-01",
    shortTitle: "Bando di Gara D.Lgs. 36/2023",
    categoryLabel: "Public Tender",
  },
  "b2b-invoice-sdi-2026": {
    code: "FIX-02",
    shortTitle: "Fattura Elettronica B2B",
    categoryLabel: "B2B Invoice",
  },
  "vendor-contract-msa-2026": {
    code: "FIX-03",
    shortTitle: "Enterprise SaaS SLA",
    categoryLabel: "Vendor Contract",
  },
};

function SignalTag({
  variant,
  label,
  testId,
}: {
  variant: "emerald" | "ochre" | "crimson" | "neutral";
  label: string;
  testId?: string;
}) {
  const palette = {
    emerald: {
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
      dot: "#047857",
    },
    ochre: {
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FDE68A",
      dot: "#D97706",
    },
    crimson: {
      bg: "#FEF2F2",
      text: "#B91C1C",
      border: "#FECACA",
      dot: "#B91C1C",
    },
    neutral: {
      bg: "#F5F5F2",
      text: "#575752",
      border: "#DCDCD7",
      dot: "#8A8A84",
    },
  }[variant];

  return (
    <span
      data-testid={testId}
      className="font-mono-tabular"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "1.5px 6px",
        borderRadius: "2px",
        fontSize: "10.5px",
        fontWeight: 500,
        backgroundColor: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        lineHeight: 1.35,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "0px",
          backgroundColor: palette.dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function LightPaperJsonViewer({ data }: { data: unknown }) {
  const jsonString = JSON.stringify(data, null, 2) ?? "{}";
  const lines = jsonString.split("\n");

  const renderLineContent = (line: string) => {
    const keyMatch = line.match(/^(\s*)"([^"]+)"(:\s*)(.*)$/);
    if (!keyMatch) {
      const strItemMatch = line.match(/^(\s*)(".*")(,?)$/);
      if (strItemMatch) {
        return (
          <>
            <span>{strItemMatch[1]}</span>
            <span style={{ color: "#047857" }}>{strItemMatch[2]}</span>
            <span style={{ color: "#8A8A84" }}>{strItemMatch[3]}</span>
          </>
        );
      }
      return <span style={{ color: "#8A8A84" }}>{line}</span>;
    }

    const [, indent, key, colon, rest] = keyMatch;
    const trailingComma = rest.endsWith(",") ? "," : "";
    const rawVal = trailingComma ? rest.slice(0, -1) : rest;

    let valColor = "#8A8A84";
    if (rawVal.startsWith('"')) {
      valColor = "#047857"; // Signal emerald for strings
    } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
      valColor = "#1D4ED8"; // Crisp technical blue for numbers
    } else if (rawVal === "true" || rawVal === "false") {
      valColor = "#1D4ED8";
    } else if (rawVal === "[" || rawVal === "{") {
      valColor = "#575752";
    }

    return (
      <>
        <span>{indent}</span>
        <span style={{ color: "#111111", fontWeight: 500 }}>&quot;{key}&quot;</span>
        <span style={{ color: "#8A8A84" }}>{colon}</span>
        <span style={{ color: valColor }}>{rawVal}</span>
        {trailingComma && <span style={{ color: "#8A8A84" }}>,</span>}
      </>
    );
  };

  return (
    <div
      data-testid="structured-json-output"
      className="font-mono-tabular"
      style={{
        fontSize: "11px",
        lineHeight: 1.52,
        color: "#111111",
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "26px 1fr",
            gap: "8px",
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              color: "#A1A19A",
              fontSize: "10px",
              textAlign: "right",
              userSelect: "none",
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {renderLineContent(line)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [selectedFixture, setSelectedFixture] = useState<DocumentFixture>(DOCUMENT_FIXTURES[0]);
  const [rawText, setRawText] = useState<string>(DOCUMENT_FIXTURES[0].rawText);
  const [documentTitle, setDocumentTitle] = useState<string>(DOCUMENT_FIXTURES[0].title);
  const [simulateFault, setSimulateFault] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [execution, setExecution] = useState<PipelineExecutionResult | null>(null);
  const [recentRuns, setRecentRuns] = useState<AuditRunSummary[]>([]);
  const [llmStatus, setLlmStatus] = useState<LLMStatusInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("split");
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState<boolean>(false);

  useEffect(() => {
    void fetchStatusAndHistory();
  }, []);

  async function fetchStatusAndHistory() {
    try {
      const res = await fetch("/api/pipeline/runs", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          llm: LLMStatusInfo;
          recentRuns: AuditRunSummary[];
        };
        setLlmStatus(data.llm);
        setRecentRuns(data.recentRuns ?? []);
      }
    } catch {
      // Ignore initial telemetry fetch errors
    }
  }

  function handleSelectFixture(fix: DocumentFixture) {
    setSelectedFixture(fix);
    setRawText(fix.rawText);
    setDocumentTitle(fix.title);
    setErrorMsg(null);
  }

  async function handleExecutePipeline() {
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          documentTitle,
          simulateFaultOnAttempt1: simulateFault,
        }),
      });
      const data = (await res.json()) as {
        execution?: PipelineExecutionResult;
        recentRuns?: AuditRunSummary[];
        message?: string;
      };
      if (!res.ok || !data.execution) {
        setErrorMsg(data.message || "Pipeline execution failed");
        return;
      }
      setExecution(data.execution);
      if (data.recentRuns) {
        setRecentRuns(data.recentRuns);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsRunning(false);
    }
  }

  const lineCount = rawText.split("\n").length;
  const byteSize = new TextEncoder().encode(rawText).length;

  const s1Ms = execution?.steps[0]?.latencyMs ?? 0.4;
  const s2Ms = execution?.steps[1]?.latencyMs ?? 1400.0;
  const s3Ms = execution?.steps[2]?.latencyMs ?? 0.6;
  const s4Ms = execution?.steps[3]?.latencyMs ?? 0.5;
  const totalMs = Math.max(1, s1Ms + s2Ms + s3Ms + s4Ms);
  const deterministicMs = s1Ms + s3Ms + s4Ms;

  const stageCards = execution
    ? [
        {
          num: "01",
          title: "Classifier & Chunker",
          variant: "emerald" as const,
          tagLabel: "Passed",
          meta: `${execution.documentType} · ${execution.chunksDetected} chunks`,
          latency: `${s1Ms.toFixed(2)} ms`,
          warmTint: false,
        },
        {
          num: "02",
          title: "Zod Extractor",
          variant: execution.retryCount > 0 ? ("ochre" as const) : ("emerald" as const),
          tagLabel:
            execution.retryCount > 0
              ? `Repaired · ${execution.retryCount} retry`
              : "Passed",
          meta: `${execution.modelUsed} · ${execution.totalTokens.toLocaleString()} tok`,
          latency: `${s2Ms.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ms`,
          warmTint: execution.retryCount > 0,
        },
        {
          num: "03",
          title: "Rule Verifier",
          variant: execution.businessRules.every((r) => r.passed)
            ? ("emerald" as const)
            : ("crimson" as const),
          tagLabel: `Passed · ${
            execution.businessRules.filter((r) => r.passed).length
          }/${execution.businessRules.length}`,
          meta: "Pure TS statutory audit",
          latency: `${s3Ms.toFixed(2)} ms`,
          warmTint: false,
        },
        {
          num: "04",
          title: "WAL Persistence",
          variant: "emerald" as const,
          tagLabel: "Passed",
          meta: "SHA-256 committed",
          latency: `${s4Ms.toFixed(2)} ms`,
          warmTint: false,
        },
      ]
    : [];

  const attempt1Errors =
    execution?.validationAttempts.find((a) => a.status === "ZOD_SCHEMA_ERROR")?.zodErrors ?? [];

  const getRepairedValuePreview = (fieldPath: string): string => {
    if (!execution?.extractedPayload) return "";
    const rec = execution.extractedPayload as Record<string, unknown>;
    if (fieldPath in rec) {
      return JSON.stringify(rec[fieldPath]);
    }
    return "Normalized";
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#F5F5F2",
        color: "#111111",
      }}
    >
      {/* Top Masthead (h-12 border-b border-[#DCDCD7] bg-[#FFFFFF] px-6) */}
      <header
        style={{
          height: "48px",
          minHeight: "48px",
          borderBottom: "1px solid #DCDCD7",
          backgroundColor: "#FFFFFF",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Minimalist 18x18px geometric Swiss grid mark */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="0.5" y="0.5" width="17" height="17" stroke="#111111" strokeWidth="1" />
            <rect x="3" y="3" width="5" height="5" fill="#111111" />
            <rect x="10" y="3" width="5" height="5" fill="#DCDCD7" />
            <rect x="3" y="10" width="5" height="5" fill="#DCDCD7" />
            <rect x="10" y="10" width="5" height="5" fill="#111111" />
          </svg>
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "#111111",
            }}
          >
            B2B Extraction &amp; Verification
          </span>
          <span
            className="font-mono-tabular"
            style={{
              fontSize: "10.5px",
              fontWeight: 500,
              color: "#575752",
              backgroundColor: "#F5F5F2",
              border: "1px solid #DCDCD7",
              borderRadius: "2px",
              padding: "1.5px 6px",
            }}
          >
            ZOD V3 · SQLITE WAL
          </span>
        </div>

        {/* Right Inline Telemetry Readouts separated by 1px vertical hairlines */}
        <div
          className="font-mono-tabular"
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "11.5px",
            color: "#575752",
          }}
        >
          <span style={{ padding: "0 12px" }}>
            ollama ·{" "}
            <strong style={{ color: "#111111", fontWeight: 500 }}>
              {llmStatus?.baseUrl
                .replace(/^https?:\/\//, "")
                .replace(/\/v1$/, "") || "localhost:11434"}
            </strong>
          </span>
          <span
            style={{
              height: "14px",
              width: "1px",
              backgroundColor: "#DCDCD7",
            }}
          />
          <span style={{ padding: "0 12px", color: "#111111", fontWeight: 500 }}>
            {execution?.modelUsed || llmStatus?.configuredModel || "llama3.2:3b"}
          </span>
          <span
            style={{
              height: "14px",
              width: "1px",
              backgroundColor: "#DCDCD7",
            }}
          />
          <span style={{ padding: "0 12px" }}>{recentRuns.length} audit runs</span>
          <span
            style={{
              height: "14px",
              width: "1px",
              backgroundColor: "#DCDCD7",
              marginRight: "12px",
            }}
          />
          <SignalTag
            testId="header-pipeline-status"
            variant={
              execution?.status === "VERIFIED"
                ? "emerald"
                : execution?.status === "RULE_VIOLATION"
                ? "crimson"
                : "neutral"
            }
            label={
              execution?.status === "VERIFIED"
                ? "VERIFIED"
                : execution?.status === "RULE_VIOLATION"
                ? "VIOLATION"
                : "STANDBY"
            }
          />
        </div>
      </header>

      {/* Main 2-Column Structural Grid (grid-cols-[340px_1fr]) */}
      <main
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left Control Rail */}
        <aside
          style={{
            borderRight: "1px solid #DCDCD7",
            backgroundColor: "#F5F5F2",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* 1. Fixture Selector (p-5 border-b border-[#DCDCD7]) */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #DCDCD7",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#575752",
                  letterSpacing: "-0.01em",
                }}
              >
                Input Fixtures
              </span>
              <span
                className="font-mono-tabular"
                style={{ fontSize: "10.5px", color: "#8A8A84" }}
              >
                {selectedFixture.jurisdiction}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {DOCUMENT_FIXTURES.map((fix) => {
                const active = selectedFixture.id === fix.id;
                const info = FIXTURE_LABELS[fix.id] ?? {
                  code: fix.code,
                  shortTitle: fix.title,
                  categoryLabel: fix.expectedCategory,
                };
                return (
                  <button
                    key={fix.id}
                    type="button"
                    data-testid={`fixture-${fix.id}`}
                    onClick={() => handleSelectFixture(fix)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      textAlign: "left",
                      padding: active ? "8px 10px 8px 9px" : "8px 10px",
                      backgroundColor: active ? "#FFFFFF" : "transparent",
                      borderTop: active ? "1px solid #DCDCD7" : "1px solid transparent",
                      borderRight: active ? "1px solid #DCDCD7" : "1px solid transparent",
                      borderBottom: active ? "1px solid #DCDCD7" : "1px solid transparent",
                      borderLeft: active ? "3px solid #111111" : "1px solid transparent",
                      borderRadius: "2px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12.5px",
                          fontWeight: active ? 600 : 500,
                          color: "#111111",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <span
                          className="font-mono-tabular"
                          style={{
                            color: active ? "#111111" : "#8A8A84",
                            marginRight: "6px",
                            fontSize: "11px",
                          }}
                        >
                          {info.code}
                        </span>
                        {info.shortTitle}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#575752",
                        marginTop: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {fix.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Execution Controls (p-5 border-b border-[#DCDCD7] bg-[#FFFFFF]) */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #DCDCD7",
              backgroundColor: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              onClick={() => setSimulateFault(!simulateFault)}
              data-testid="toggle-self-healing-fault"
              role="switch"
              aria-checked={simulateFault}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                userSelect: "none",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#111111" }}>
                  Inject Attempt-1 schema fault
                </div>
                <div style={{ fontSize: "11px", color: "#575752", marginTop: "1px" }}>
                  Tests bounded Zod self-healing repair loop
                </div>
              </div>

              {/* Crisp mechanical toggle switch (2px radius, #111111 active track) */}
              <div
                style={{
                  width: "34px",
                  height: "18px",
                  borderRadius: "2px",
                  backgroundColor: simulateFault ? "#111111" : "#E5E5E0",
                  border: `1px solid ${simulateFault ? "#111111" : "#C8C8C2"}`,
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: simulateFault ? "17px" : "2px",
                    width: "12px",
                    height: "12px",
                    borderRadius: "1px",
                    backgroundColor: "#FFFFFF",
                    transition: "left 120ms ease",
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              data-testid="run-pipeline-btn"
              disabled={isRunning}
              onClick={handleExecutePipeline}
              style={{
                width: "100%",
                height: "38px",
                backgroundColor: isRunning ? "#575752" : "#111111",
                color: "#FFFFFF",
                border: "1px solid #111111",
                borderRadius: "2px",
                padding: "0 14px",
                fontSize: "13px",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: isRunning ? "wait" : "pointer",
              }}
            >
              <span>
                {isRunning ? "Executing Extraction Pipeline..." : "Run Extraction Pipeline"}
              </span>
              <span
                className="font-mono-tabular"
                style={{
                  fontSize: "11px",
                  color: "#DCDCD7",
                  padding: "1px 5px",
                  border: "1px solid rgba(255, 255, 255, 0.22)",
                  borderRadius: "2px",
                }}
              >
                ⌘↵
              </span>
            </button>

            {errorMsg && (
              <div
                style={{
                  fontSize: "11.5px",
                  color: "#B91C1C",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "2px",
                  padding: "6px 8px",
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* 3. Source Payload Excerpt (p-5 border-b border-[#DCDCD7]) */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #DCDCD7",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#575752" }}>
                Source Payload
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  className="font-mono-tabular"
                  style={{ fontSize: "11px", color: "#8A8A84" }}
                >
                  {lineCount} lines · {byteSize.toLocaleString()} B
                </span>
                <button
                  type="button"
                  onClick={() => setIsPayloadModalOpen(true)}
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 500,
                    color: "#111111",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #DCDCD7",
                    borderRadius: "2px",
                    padding: "1.5px 6px",
                    cursor: "pointer",
                  }}
                >
                  Expand
                </button>
              </div>
            </div>

            <div
              style={{
                height: "126px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #DCDCD7",
                borderRadius: "2px",
                padding: "10px 12px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <pre
                data-testid="raw-document-textarea"
                className="font-mono-tabular"
                style={{
                  fontSize: "10.5px",
                  lineHeight: 1.55,
                  color: "#3F3F3B",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {rawText}
              </pre>
              {/* Clean bottom gradient fade mask */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "36px",
                  background: "linear-gradient(to bottom, rgba(255,255,255,0), #FFFFFF 90%)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>

          {/* 4. Audit Ledger (p-5 flex-1) */}
          <div
            style={{
              padding: "14px 20px",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#575752" }}>
                SQLite WAL Audit Trail
              </span>
              <span
                className="font-mono-tabular"
                style={{ fontSize: "11px", color: "#8A8A84" }}
              >
                {recentRuns.length} records
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11.5px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #DCDCD7",
                      color: "#8A8A84",
                      textAlign: "left",
                      fontSize: "10.5px",
                    }}
                  >
                    <th style={{ padding: "5px 2px", fontWeight: 500 }}>Run ID</th>
                    <th style={{ padding: "5px 4px", fontWeight: 500 }}>Type</th>
                    <th style={{ padding: "5px 4px", fontWeight: 500 }}>Retries</th>
                    <th style={{ padding: "5px 2px", fontWeight: 500, textAlign: "right" }}>
                      Latency
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => {
                    const isVerified = run.status === "VERIFIED";
                    return (
                      <tr
                        key={run.runId}
                        style={{
                          borderBottom: "1px solid #E5E5E0",
                          color: "#111111",
                        }}
                      >
                        <td
                          className="font-mono-tabular"
                          style={{
                            padding: "6px 2px",
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              backgroundColor: isVerified ? "#047857" : "#B91C1C",
                              flexShrink: 0,
                            }}
                          />
                          <span>{run.runId.slice(0, 12)}</span>
                        </td>
                        <td style={{ padding: "6px 4px", fontSize: "11px", color: "#575752" }}>
                          {run.documentType === "PUBLIC_TENDER"
                            ? "Tender"
                            : run.documentType === "B2B_INVOICE"
                            ? "Invoice"
                            : "Contract"}
                        </td>
                        <td
                          className="font-mono-tabular"
                          style={{
                            padding: "6px 4px",
                            fontSize: "11px",
                            color: run.retryCount > 0 ? "#B45309" : "#8A8A84",
                            fontWeight: run.retryCount > 0 ? 600 : 400,
                          }}
                        >
                          {run.retryCount}
                        </td>
                        <td
                          className="font-mono-tabular"
                          style={{
                            padding: "6px 2px",
                            fontSize: "11px",
                            textAlign: "right",
                            color: "#111111",
                          }}
                        >
                          {run.totalLatencyMs.toFixed(1)} ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </aside>

        {/* Right Inspection Canvas */}
        <section
          style={{
            backgroundColor: "#FFFFFF",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {!execution ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#111111" }}>
                Inspection Canvas Standby
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#575752",
                  maxWidth: "460px",
                  textAlign: "center",
                }}
              >
                Select an input fixture in the left control rail and execute the pipeline to inspect
                stage telemetry, statutory invariants, and Zod schema repair diffs.
              </div>
            </div>
          ) : (
            <>
              {/* Zone 1 — Execution Pipeline & Proportional Latency Bar (px-6 py-4 border-b border-[#DCDCD7]) */}
              <div
                style={{
                  padding: "14px 24px",
                  borderBottom: "1px solid #DCDCD7",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        color: "#111111",
                      }}
                    >
                      Execution Trace
                    </span>
                    <span
                      className="font-mono-tabular"
                      style={{
                        fontSize: "11px",
                        color: "#575752",
                        backgroundColor: "#F5F5F2",
                        border: "1px solid #DCDCD7",
                        borderRadius: "2px",
                        padding: "1px 6px",
                      }}
                    >
                      {execution.runId}
                    </span>
                  </div>

                  <div
                    className="font-mono-tabular"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "11.5px",
                      color: "#575752",
                    }}
                  >
                    <span>
                      Total:{" "}
                      <strong style={{ color: "#111111", fontWeight: 600 }}>
                        {execution.totalLatencyMs.toLocaleString("en-US", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                        ms
                      </strong>
                    </span>
                    <span style={{ color: "#DCDCD7" }}>·</span>
                    <span>
                      Tokens:{" "}
                      <strong style={{ color: "#111111", fontWeight: 600 }}>
                        {execution.totalTokens.toLocaleString()}
                      </strong>
                    </span>
                    <span style={{ color: "#DCDCD7" }}>·</span>
                    <span style={{ color: execution.retryCount > 0 ? "#B45309" : "#047857" }}>
                      Zod Retries:{" "}
                      <strong style={{ fontWeight: 600 }}>{execution.retryCount}</strong>
                    </span>
                  </div>
                </div>

                {/* 4-column horizontal step grid (border border-[#DCDCD7] divide-x divide-[#DCDCD7] mt-3) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    border: "1px solid #DCDCD7",
                    borderBottom: "none",
                    marginTop: "10px",
                  }}
                >
                  {stageCards.map((stage, idx) => (
                    <div
                      key={stage.num}
                      data-testid={`step-card-${idx + 1}`}
                      style={{
                        padding: "10px 12px",
                        borderRight: idx < 3 ? "1px solid #DCDCD7" : "none",
                        backgroundColor: stage.warmTint ? "#FFFDF7" : "#FFFFFF",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12.5px",
                            fontWeight: 600,
                            color: "#111111",
                            letterSpacing: "-0.015em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            className="font-mono-tabular"
                            style={{
                              fontSize: "11px",
                              color: "#8A8A84",
                              fontWeight: 500,
                              marginRight: "5px",
                            }}
                          >
                            {stage.num}
                          </span>
                          {stage.title}
                        </span>
                        <SignalTag variant={stage.variant} label={stage.tagLabel} />
                      </div>

                      <div
                        className="font-mono-tabular"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          fontSize: "11px",
                          color: "#575752",
                        }}
                      >
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            paddingRight: "6px",
                          }}
                        >
                          {stage.meta}
                        </span>
                        <span
                          style={{
                            color: "#111111",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {stage.latency}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Proportional Execution Timeline Bar directly flush beneath the 4-column grid */}
                <div
                  style={{
                    height: "6px",
                    width: "100%",
                    border: "1px solid #DCDCD7",
                    display: "flex",
                    backgroundColor: "#F5F5F2",
                    overflow: "hidden",
                  }}
                >
                  <div
                    title={`01 Classifier: ${s1Ms.toFixed(2)} ms`}
                    style={{
                      width: `${Math.max(1.2, (s1Ms / totalMs) * 100)}%`,
                      backgroundColor: "#047857",
                      borderRight: "1px solid #FFFFFF",
                    }}
                  />
                  <div
                    title={`02 Zod Extractor (LLM): ${s2Ms.toFixed(2)} ms`}
                    style={{
                      flex: 1,
                      backgroundColor: "#111111",
                      borderRight: "1px solid #FFFFFF",
                    }}
                  />
                  <div
                    title={`03 Rule Verifier: ${s3Ms.toFixed(2)} ms`}
                    style={{
                      width: `${Math.max(1.2, (s3Ms / totalMs) * 100)}%`,
                      backgroundColor: "#047857",
                      borderRight: "1px solid #FFFFFF",
                    }}
                  />
                  <div
                    title={`04 WAL Persistence: ${s4Ms.toFixed(2)} ms`}
                    style={{
                      width: `${Math.max(1.2, (s4Ms / totalMs) * 100)}%`,
                      backgroundColor: "#047857",
                    }}
                  />
                </div>

                <div
                  className="font-mono-tabular"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "#8A8A84",
                    marginTop: "5px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          backgroundColor: "#111111",
                          display: "inline-block",
                        }}
                      />
                      LLM Inference &amp; Self-Healing ({((s2Ms / totalMs) * 100).toFixed(1)}% ·{" "}
                      {s2Ms.toFixed(1)} ms)
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          backgroundColor: "#047857",
                          display: "inline-block",
                        }}
                      />
                      Deterministic Verification + SQLite WAL ({deterministicMs.toFixed(2)} ms total
                      overhead)
                    </span>
                  </div>
                  <span>PROPORTIONAL LATENCY DISTRIBUTION</span>
                </div>
              </div>

              {/* Zone 2 — Deterministic Verification Matrix (px-6 py-4 border-b border-[#DCDCD7]) */}
              <div
                style={{
                  padding: "12px 24px",
                  borderBottom: "1px solid #DCDCD7",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        color: "#111111",
                      }}
                    >
                      Deterministic Verification Matrix
                    </span>
                    <span style={{ fontSize: "12px", color: "#575752" }}>
                      Pure TypeScript statutory &amp; financial invariants
                    </span>
                  </div>
                  <SignalTag
                    testId="verification-matrix-summary"
                    variant={
                      execution.businessRules.every((r) => r.passed) ? "emerald" : "crimson"
                    }
                    label={`${
                      execution.businessRules.filter((r) => r.passed).length
                    }/${execution.businessRules.length} Rules Passed`}
                  />
                </div>

                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderTop: "1px solid #DCDCD7",
                        borderBottom: "1px solid #DCDCD7",
                        color: "#575752",
                        textAlign: "left",
                        fontSize: "11px",
                      }}
                    >
                      <th style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>Invariant Rule</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Formula</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Expected</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Computed</th>
                      <th style={{ padding: "6px 0 6px 8px", fontWeight: 600, textAlign: "right" }}>
                        Audit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {execution.businessRules.map((rule) => (
                      <tr
                        key={rule.ruleId}
                        style={{
                          borderBottom: "1px solid #ECECE8",
                        }}
                      >
                        <td style={{ padding: "6.5px 8px 6.5px 0" }}>
                          <div style={{ fontWeight: 600, color: "#111111", fontSize: "12px" }}>
                            {rule.ruleName}
                          </div>
                          <div
                            className="font-mono-tabular"
                            style={{ fontSize: "10.5px", color: "#6E6E68" }}
                          >
                            {rule.ruleId}
                          </div>
                        </td>
                        <td style={{ padding: "6.5px 8px" }}>
                          <code
                            className="font-mono-tabular"
                            style={{
                              display: "inline-block",
                              backgroundColor: "#F5F5F2",
                              border: "1px solid #E5E5E0",
                              borderRadius: "2px",
                              padding: "1.5px 6px",
                              fontSize: "10.5px",
                              color: "#111111",
                            }}
                          >
                            {rule.formula}
                          </code>
                        </td>
                        <td
                          className="font-mono-tabular"
                          style={{ padding: "6.5px 8px", color: "#575752", fontSize: "11px" }}
                        >
                          {rule.expectedValue}
                        </td>
                        <td
                          className="font-mono-tabular"
                          style={{
                            padding: "6.5px 8px",
                            color: "#111111",
                            fontWeight: 600,
                            fontSize: "11px",
                          }}
                        >
                          {rule.actualValue}
                        </td>
                        <td style={{ padding: "6.5px 0 6.5px 8px", textAlign: "right" }}>
                          <SignalTag
                            testId={
                              rule.passed ? "verification-badge-pass" : "verification-badge-fail"
                            }
                            variant={rule.passed ? "emerald" : "crimson"}
                            label={rule.passed ? "VERIFIED" : "FAILED"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Zone 3 — Unclipped Output & Repair Inspector (flex-1 min-h-0 flex flex-col bg-[#F9F9F7]) */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  backgroundColor: "#F9F9F7",
                  overflow: "hidden",
                }}
              >
                {/* Clean architectural tab bar (h-9 px-6 border-b border-[#DCDCD7] bg-[#FFFFFF]) */}
                <div
                  style={{
                    height: "36px",
                    minHeight: "36px",
                    padding: "0 24px",
                    borderBottom: "1px solid #DCDCD7",
                    backgroundColor: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "stretch", height: "100%", gap: "20px" }}>
                    {[
                      { id: "split" as const, label: "Validated JSON & Schema Diff" },
                      { id: "json" as const, label: "Raw JSON" },
                      {
                        id: "trace" as const,
                        label: `Repair Trace (${execution.validationAttempts.length} attempts)`,
                      },
                    ].map((tab) => {
                      const isTabActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            borderBottom: isTabActive
                              ? "2px solid #111111"
                              : "2px solid transparent",
                            color: isTabActive ? "#111111" : "#575752",
                            fontWeight: isTabActive ? 600 : 500,
                            fontSize: "12px",
                            cursor: "pointer",
                            padding: "0 2px",
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="font-mono-tabular"
                    style={{ fontSize: "11px", color: "#575752" }}
                  >
                    Schema:{" "}
                    <strong style={{ color: "#111111", fontWeight: 500 }}>
                      {execution.documentType === "PUBLIC_TENDER"
                        ? "PublicTenderExtractionSchema"
                        : execution.documentType === "B2B_INVOICE"
                        ? "B2BInvoiceExtractionSchema"
                        : "VendorContractExtractionSchema"}
                    </strong>
                  </div>
                </div>

                {/* Split Content Area */}
                {activeTab === "split" && (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: "grid",
                      gridTemplateColumns: "1.25fr 1fr",
                      overflow: "hidden",
                    }}
                  >
                    {/* Left pane (p-4 overflow-y-auto bg-[#FFFFFF] border-r border-[#DCDCD7]) */}
                    <div
                      style={{
                        padding: "12px 24px",
                        overflowY: "auto",
                        backgroundColor: "#FFFFFF",
                        borderRight: "1px solid #DCDCD7",
                        minHeight: 0,
                      }}
                    >
                      <LightPaperJsonViewer data={execution.extractedPayload} />
                    </div>

                    {/* Right pane (p-4 overflow-y-auto bg-[#F9F9F7]) */}
                    <div
                      style={{
                        padding: "12px 20px",
                        overflowY: "auto",
                        backgroundColor: "#F9F9F7",
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12.5px",
                            fontWeight: 600,
                            color: "#111111",
                            letterSpacing: "-0.01em",
                          }}
                        >
                          Attempt #1 Zod Schema Diff
                        </span>
                        <SignalTag
                          variant={attempt1Errors.length > 0 ? "ochre" : "emerald"}
                          label={
                            attempt1Errors.length > 0
                              ? `${attempt1Errors.length} Fields Repaired`
                              : "Zero Schema Errors"
                          }
                        />
                      </div>

                      {attempt1Errors.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {attempt1Errors.map((errItem, idx) => (
                            <div
                              key={idx}
                              style={{
                                backgroundColor: "#FFFFFF",
                                border: "1px solid #DCDCD7",
                                borderRadius: "2px",
                                padding: "8px 10px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "baseline",
                                  gap: "8px",
                                }}
                              >
                                <span
                                  className="font-mono-tabular"
                                  style={{
                                    fontSize: "11.5px",
                                    fontWeight: 600,
                                    color: "#111111",
                                  }}
                                >
                                  {errItem.path}
                                </span>
                                <span
                                  className="font-mono-tabular"
                                  style={{ fontSize: "10px", color: "#8A8A84" }}
                                >
                                  Attempt #1 → #2
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#575752",
                                  lineHeight: 1.3,
                                }}
                              >
                                {errItem.message}
                              </div>

                              <div
                                className="font-mono-tabular"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontSize: "11px",
                                  marginTop: "2px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    padding: "1px 6px",
                                    borderRadius: "2px",
                                    backgroundColor: "#FEF2F2",
                                    color: "#B91C1C",
                                    border: "1px solid #FECACA",
                                    textDecoration: "line-through",
                                  }}
                                >
                                  {JSON.stringify(errItem.received)}
                                </span>
                                <span style={{ color: "#8A8A84", fontWeight: 600 }}>→</span>
                                <span
                                  style={{
                                    padding: "1px 6px",
                                    borderRadius: "2px",
                                    backgroundColor: "#ECFDF5",
                                    color: "#047857",
                                    border: "1px solid #A7F3D0",
                                    fontWeight: 500,
                                  }}
                                >
                                  {getRepairedValuePreview(errItem.path)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", color: "#575752" }}>
                          All schema constraints validated on initial attempt.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "json" && (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      padding: "12px 24px",
                      overflowY: "auto",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <LightPaperJsonViewer data={execution.extractedPayload} />
                  </div>
                )}

                {activeTab === "trace" && (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      padding: "12px 24px",
                      overflowY: "auto",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    {execution.validationAttempts.map((att) => (
                      <div
                        key={att.attempt}
                        style={{
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #DCDCD7",
                          borderRadius: "2px",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "6px",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#111111" }}>
                            Attempt #{att.attempt}
                          </span>
                          <SignalTag
                            variant={att.status === "VALID" ? "emerald" : "ochre"}
                            label={
                              att.status === "VALID"
                                ? `Valid · ${att.latencyMs.toFixed(1)} ms`
                                : `Zod Error · ${att.latencyMs.toFixed(1)} ms`
                            }
                          />
                        </div>
                        <div
                          className="font-mono-tabular"
                          style={{ fontSize: "11px", color: "#575752", whiteSpace: "pre-wrap" }}
                        >
                          {att.status === "VALID"
                            ? "All schema constraints, ISO-8601 timestamps, and numeric bounds verified."
                            : att.repairFeedbackPrompt}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Expandable Full Payload Modal Drawer */}
      {isPayloadModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(17, 17, 17, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "760px",
              height: "620px",
              backgroundColor: "#FFFFFF",
              border: "1px solid #111111",
              borderRadius: "2px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #DCDCD7",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Source Payload Editor — {selectedFixture.title}
              </span>
              <button
                type="button"
                onClick={() => setIsPayloadModalOpen(false)}
                style={{
                  padding: "3px 10px",
                  backgroundColor: "#111111",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "2px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              spellCheck={false}
              className="font-mono-tabular"
              style={{
                flex: 1,
                padding: "14px 16px",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: "11.5px",
                lineHeight: 1.55,
                color: "#111111",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
