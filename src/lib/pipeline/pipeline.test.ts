import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DOCUMENT_FIXTURES } from "../../fixtures/documents";
import { executeDeterministicPipeline } from "./index";
import { listRecentAuditRuns } from "./db";

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "b2b-pipeline-test-"));
  process.env.AUDIT_DB_PATH = path.join(tmpDir, "test-audit.sqlite");
  process.env.LLM_FORCE_DETERMINISTIC = "true";

  console.log("[TEST 1/5] Verifying Italian Public Procurement Tender (PUBLIC_TENDER)...");
  const tenderRes = await executeDeterministicPipeline({
    rawText: DOCUMENT_FIXTURES[0].rawText,
    documentTitle: DOCUMENT_FIXTURES[0].title,
    simulateFaultOnAttempt1: true,
  });
  assert.equal(tenderRes.documentType, "PUBLIC_TENDER");
  assert.equal(tenderRes.status, "VERIFIED");
  assert.equal(tenderRes.retryCount, 1, "Expected 1 self-healing retry when fault is injected");
  assert.equal(tenderRes.validationAttempts.length, 2);
  assert.equal(tenderRes.validationAttempts[0].status, "ZOD_SCHEMA_ERROR");
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

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("ALL 5 DETERMINISTIC PIPELINE TESTS PASSED.");
}

runTests().catch((err) => {
  console.error("TEST SUITE FAILED:", err);
  process.exit(1);
});
