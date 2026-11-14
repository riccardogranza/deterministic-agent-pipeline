import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DOCUMENT_FIXTURES } from "../../fixtures/documents";
import { listRecentAuditRuns } from "./db";
import { getValueAtPath } from "./extractor";
import { executeDeterministicPipeline } from "./index";

function buildMockExtractionPayload(userContent: string): Record<string, unknown> {
  const isRepairAttempt = userContent.includes("Exact Zod schema validation errors:");

  if (userContent.includes('document_type="PUBLIC_TENDER"') || userContent.includes('"PUBLIC_TENDER"')) {
    const corruptedTotal = userContent.includes("EUR 2.950.000,00");
    return {
      document_type: "PUBLIC_TENDER",
      contracting_authority:
        "Ministero delle Infrastrutture e dei Trasporti — Provveditorato Interregionale OOPP Lombardia-Emilia Romagna",
      cig: "B4F92A108E",
      cup: "J49I26000480001",
      rup_name: "Ing. Alessandro Valenti",
      award_criterion: "OEPV (Offerta Economicamente Più Vantaggiosa 75/25)",
      currency: "EUR",
      lots: [
        {
          lot_number: 1,
          lot_cig: "B4F92A108E-L1",
          title: "Infrastruttura Cloud Ibrida, Nodi Kubernetes HA e Sicurezza Zero-Trust",
          category_code: "OS30",
          amount_eur: 1450000,
          safety_costs_eur: 28000,
        },
        {
          lot_number: 2,
          lot_cig: "B4F92A108E-L2",
          title: "Rete Sensori IoT Edge, Gateway LoRaWAN e Telemetria Strutturale",
          category_code: "OS19",
          amount_eur: 850000,
          safety_costs_eur: 17000,
        },
      ],
      total_base_amount_eur: corruptedTotal ? 2950000 : 2300000,
      provisional_guarantee_pct: 2.0,
      provisional_guarantee_eur: 46000,
      max_subcontracting_pct: 45.0,
      mandatory_certifications: [
        "ISO/IEC 27001:2022",
        "ISO/IEC 27017 & ISO/IEC 27018 (ACN QC2)",
        "SOA OS30 Classifica IV",
        "SOA OS19 Classifica III",
      ],
      minimum_three_year_turnover_eur: 4600000,
      clarification_deadline_iso: "2027-01-12T12:00:00Z",
      submission_deadline_iso: "2027-01-25T18:00:00Z",
      opening_session_iso: "2027-01-28T10:00:00Z",
      contract_duration_months: 36,
    };
  }

  if (userContent.includes('document_type="B2B_INVOICE"') || userContent.includes('"B2B_INVOICE"')) {
    return {
      document_type: "B2B_INVOICE",
      invoice_number: "INV-2026/0842",
      sdi_identifier: "10948274910",
      issue_date_iso: "2026-11-10",
      due_date_iso: "2026-12-31",
      currency: "EUR",
      supplier_name: "Aetheris Distributed Systems S.r.l.",
      supplier_vat_id: "IT09482710964",
      customer_name: "Prysmian Industrial Grid Automation S.p.A.",
      customer_vat_id: "IT04829100968",
      sdi_recipient_code: "M5UXCR1",
      purchase_order_ref: "PO-2026-99412",
      line_items: [
        {
          line_number: 1,
          sku_code: "ENG-ARCH-01",
          description: "Architettura Pipeline Dati Real-Time",
          quantity: 120,
          unit_price_eur: 180,
          discount_pct: 0,
          line_total_eur: 21600,
        },
        {
          line_number: 2,
          sku_code: "AI-EXTR-02",
          description: "Sviluppo Estrattore Deterministico LLM",
          quantity: 160,
          unit_price_eur: 200,
          discount_pct: 10,
          line_total_eur: 28800,
        },
        {
          line_number: 3,
          sku_code: "SEC-AUDIT-03",
          description: "Hardening Cluster Kubernetes & mTLS",
          quantity: 80,
          unit_price_eur: 150,
          discount_pct: 0,
          line_total_eur: 12000,
        },
        {
          line_number: 4,
          sku_code: "OPS-RETAIN-04",
          description: "Canone Trimestrale SRE & Telemetria",
          quantity: 1,
          unit_price_eur: 6000,
          discount_pct: 0,
          line_total_eur: 6000,
        },
      ],
      subtotal_net_eur: 68400,
      vat_rate_pct: 22,
      vat_amount_eur: 15048,
      total_gross_eur: 83448,
      beneficiary_iban: "IT60X0542811101000000123456",
    };
  }

  // VENDOR_CONTRACT: also verify that if not yet repaired and not using simulateFaultOnAttempt1, returns clean or repairs on retry
  return {
    document_type: "VENDOR_CONTRACT",
    contract_reference: "MSA-2026-8841-EU",
    vendor_name: "Hyperion Core Infrastructure GmbH",
    vendor_vat_id: "DE319482710",
    customer_name: "Credito Emiliano Digital Platforms S.p.A.",
    customer_vat_id: "IT01829400351",
    effective_date_iso: "2026-12-01",
    expiration_date_iso: "2029-11-30",
    term_years: 3,
    currency: "EUR",
    annual_license_fee_eur: 180000,
    onboarding_fee_eur: 25000,
    total_contract_value_eur: isRepairAttempt ? 565000 : 565000,
    non_renewal_notice_days: 60,
    guaranteed_uptime_pct: 99.95,
    rto_minutes: 15,
    rpo_minutes: 5,
    sla_credit_tiers: [
      {
        tier_name: "Tier 1",
        uptime_range_description: "99.50% - 99.94%",
        credit_pct: 10,
      },
      {
        tier_name: "Tier 2",
        uptime_range_description: "99.00% - 99.49%",
        credit_pct: 25,
      },
      {
        tier_name: "Tier 3",
        uptime_range_description: "< 99.00%",
        credit_pct: 50,
      },
    ],
    liability_cap_multiplier: 2.0,
    liability_cap_eur: 360000,
    gdpr_breach_notification_hours: 24,
    eu_data_residency_enforced: true,
  };
}

async function startMockOpenAIServer(): Promise<{
  server: http.Server;
  baseUrl: string;
}> {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "qwen2.5:14b", object: "model" }],
        })
      );
      return;
    }

    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as {
          model: string;
          messages: Array<{ role: string; content: string }>;
        };
        const userMessage =
          parsed.messages.find((m) => m.role === "user")?.content ?? "";
        const payload = buildMockExtractionPayload(userMessage);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion",
            model: parsed.model || "qwen2.5:14b",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(payload),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 680,
              completion_tokens: 240,
              total_tokens: 920,
            },
          })
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind ephemeral mock OpenAI server");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
  };
}

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "b2b-pipeline-test-"));
  process.env.AUDIT_DB_PATH = path.join(tmpDir, "test-audit.sqlite");

  const mock = await startMockOpenAIServer();
  process.env.LLM_BASE_URL = mock.baseUrl;
  process.env.LLM_MODEL = "qwen2.5:14b";

  try {
    // Unit check for nested path resolution in getValueAtPath
    const nestedSample = { lots: [{ amount_eur: "EUR 1.450.000,00" }] };
    assert.equal(
      getValueAtPath(nestedSample, ["lots", 0, "amount_eur"]),
      "EUR 1.450.000,00"
    );

    console.log("[TEST 1/5] Verifying Italian Public Procurement Tender (PUBLIC_TENDER)...");
    const tenderRes = await executeDeterministicPipeline({
      rawText: DOCUMENT_FIXTURES[0].rawText,
      documentTitle: DOCUMENT_FIXTURES[0].title,
      simulateFaultOnAttempt1: true,
    });
    assert.equal(tenderRes.documentType, "PUBLIC_TENDER");
    assert.equal(tenderRes.status, "VERIFIED");
    assert.equal(tenderRes.providerMode, "LIVE_OPENAI_COMPATIBLE");
    assert.equal(tenderRes.retryCount, 1, "Expected 1 self-healing retry when fault is injected");
    assert.equal(tenderRes.validationAttempts.length, 2);
    assert.equal(tenderRes.validationAttempts[0].status, "ZOD_SCHEMA_ERROR");
    assert.equal(
      tenderRes.validationAttempts[0].zodErrors[0].received,
      "EUR 2.300.000,00"
    );
    assert.equal(tenderRes.validationAttempts[1].status, "VALID");
    assert.ok(tenderRes.businessRules.every((r) => r.passed), "All tender business rules must pass");

    console.log("[TEST 2/5] Verifying B2B Electronic Invoice (B2B_INVOICE)...");
    const invoiceRes = await executeDeterministicPipeline({
      rawText: DOCUMENT_FIXTURES[1].rawText,
      documentTitle: DOCUMENT_FIXTURES[1].title,
      simulateFaultOnAttempt1: false,
    });
    assert.equal(invoiceRes.documentType, "B2B_INVOICE");
    assert.equal(invoiceRes.status, "VERIFIED");
    assert.equal(invoiceRes.retryCount, 0);
    assert.ok(invoiceRes.businessRules.every((r) => r.passed), "All invoice math rules must pass");

    console.log("[TEST 3/5] Verifying Enterprise SaaS MSA & SLA (VENDOR_CONTRACT)...");
    const contractRes = await executeDeterministicPipeline({
      rawText: DOCUMENT_FIXTURES[2].rawText,
      documentTitle: DOCUMENT_FIXTURES[2].title,
      simulateFaultOnAttempt1: true,
    });
    assert.equal(contractRes.documentType, "VENDOR_CONTRACT");
    assert.equal(contractRes.status, "VERIFIED");
    assert.equal(contractRes.retryCount, 1);
    assert.ok(contractRes.businessRules.every((r) => r.passed), "All contract SLA/TCV rules must pass");

    console.log("[TEST 4/5] Verifying Deterministic Business-Rule Violation Detection...");
    const corruptedTenderText = DOCUMENT_FIXTURES[0].rawText.replace(
      "IMPORTO COMPLESSIVO TOTALE A BASE D'ASTA: EUR 2.300.000,00",
      "IMPORTO COMPLESSIVO TOTALE A BASE D'ASTA: EUR 2.950.000,00"
    );
    const violationRes = await executeDeterministicPipeline({
      rawText: corruptedTenderText,
      documentTitle: "Corrupted Tender Math Check",
      simulateFaultOnAttempt1: false,
    });
    assert.equal(violationRes.status, "RULE_VIOLATION");
    const lotRule = violationRes.businessRules.find((r) => r.ruleId === "TENDER_LOT_SUM_INTEGRITY");
    assert.ok(lotRule && !lotRule.passed, "Expected TENDER_LOT_SUM_INTEGRITY to fail on corrupted total");

    console.log("[TEST 5/5] Verifying SQLite WAL Audit Persistence...");
    const auditHistory = listRecentAuditRuns(10);
    assert.equal(auditHistory.length, 4, "Expected 4 persisted runs in SQLite WAL audit log");

    console.log("ALL 5 DETERMINISTIC PIPELINE TESTS PASSED.");
  } finally {
    mock.server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error("TEST SUITE FAILED:", err);
  process.exit(1);
});
