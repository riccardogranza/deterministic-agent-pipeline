# Architecture: Deterministic B2B Document Extraction & Verification Pipeline

## 1. Why Raw LLM "JSON Mode" Fails in Production B2B Systems

Most enterprise document pipelines equate **syntactic JSON validity** (`response_format: { type: "json_object" }`) with **semantic and financial correctness**. In B2B procurement, invoicing, and legal contract workflows, raw LLM JSON mode exhibits three systemic failure classes that cause silent downstream data corruption:

1. **Syntactic Validity Without Domain Type Safety:**
   An LLM in JSON mode can emit `"total_base_amount_eur": "EUR 2.300.000,00"` or `"submission_deadline_iso": "25/01/2027 18:00"` instead of an IEEE-754 float (`2300000`) and a strict ISO-8601 UTC timestamp (`"2027-01-25T18:00:00Z"`). Standard JSON parsers (`JSON.parse`) accept these values without error, causing silent `NaN` propagation or locale-dependent date inversions in downstream ERP/SQL databases.
2. **Arithmetic Hallucination & OCR Drift:**
   Autoregressive token sampling does not execute floating-point arithmetic. When extracting multi-lot public tenders or multi-line invoices with percentage discounts, an LLM can misread a single digit (`EUR 1.450.000,00` vs `EUR 1.400.000,00`) while copying the document's summary total (`EUR 2.300.000,00`). Schema validation alone (`z.number().positive()`) passes both numbers, committing an internally inconsistent ledger entry.
3. **Unbounded or Blind Retry Loops:**
   Retrying an entire prompt when parsing fails without feeding back the exact structural error trace (`ZodIssue.path`, expected constraint, and received token value) wastes token budget and rarely fixes localized formatting errors.

---

## 2. Four-Stage Deterministic Pipeline Topology

```text
+---------------------------------------------------------------------------------------------------+
|                        RAW UNSTRUCTURED B2B DOCUMENT (TENDER / INVOICE / MSA)                     |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| STAGE 01: DOCUMENT CLASSIFIER & CHUNKER (src/lib/pipeline/classifier.ts)                          |
| - Computes SHA-256 content hash for immutable audit lineage                                       |
| - Segments structural paragraphs/tables & estimates token footprint                               |
| - Classifies into PUBLIC_TENDER | B2B_INVOICE | VENDOR_CONTRACT with confidence & language tag    |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| STAGE 02: SELF-HEALING ZOD STRUCTURED EXTRACTOR (src/lib/pipeline/extractor.ts)                   |
|                                                                                                   |
|   +-----------------------------------------+          +--------------------------------------+   |
|   | OpenAI-Compatible LLM Provider          |          | Strict Category Zod Schema           |   |
|   | (Ollama / LM Studio / vLLM / Cloud API) |--------->| - Regex: ANAC CIG, CUP, EU VAT, IBAN |   |
|   +-----------------------------------------+          | - Strict ISO-8601 & numeric bounds   |   |
|                        ^                               +------------------+-------------------+   |
|                        |                                                  |                       |
|                        |  If safeParse() fails (Attempt <= 3):            | If safeParse()        |
|                        +--Inject exact ZodError path + received value-----+ succeeds:             |
|                                                                           |                       |
|   * If retries > 3 -> Route immediately to MANUAL_REVIEW_REQUIRED         |                       |
+---------------------------------------------------------------------------|-----------------------+
                                                                            |
                                                                            v
+---------------------------------------------------------------------------------------------------+
| STAGE 03: DETERMINISTIC BUSINESS-RULE VERIFIER (src/lib/pipeline/verifier.ts)                     |
| Pure TypeScript engine executing domain math & statutory invariants independently of the LLM:     |
| - PUBLIC_TENDER : SUM(lots[].amount_eur) == total_base_amount_eur                                 |
|                   total_base * (guarantee_pct / 100) == provisional_guarantee_eur (Art. 106)      |
|                   now < clarification_deadline < submission_deadline < opening_session            |
| - B2B_INVOICE   : qty * unit_price * (1 - discount/100) == line_total                             |
|                   SUM(line_total) == subtotal_net && subtotal_net + vat == total_gross            |
| - VENDOR_MSA    : (annual_fee * term_years) + onboarding == total_contract_value                  |
|                   credit_pct[tier_1] < credit_pct[tier_2] < credit_pct[tier_3] & GDPR <= 72h      |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| STAGE 04: SQLITE WAL AUDIT TRAIL PERSISTENCE (src/lib/pipeline/db.ts)                             |
| Persists run_id, document_hash, stage latencies, token count, Zod repair diff, and rule results   |
| into ./data/pipeline-audit.sqlite (PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL).       |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Bounded Self-Healing Validation Loop

Instead of trusting the first JSON response from the model, `runSelfHealingExtractor()` enforces a bounded state machine ($k \in \{1, 2, 3, 4\}$):

1. On attempt $k$, the raw candidate object is validated via `schema.safeParse(rawJsonObject)`.
2. If validation fails, the engine extracts every `ZodIssue` from `parsed.error.issues` and constructs a deterministic repair directive:
   ```text
   [1] Field "total_base_amount_eur": Expected number, received string (received: "EUR 2.300.000,00")
   [2] Field "submission_deadline_iso": Must be a strict ISO-8601 date or timestamp (received: "25/01/2027 18:00")
   ```
3. This targeted error trace is appended to the user prompt on attempt $k+1$, allowing the model to repair only the malformed fields without re-hallucinating the rest of the document.
4. If the schema remains invalid after `MAX_RETRIES = 3`, execution halts prior to downstream ingestion and persists `status = "MANUAL_REVIEW_REQUIRED"` in the SQLite audit log.

---

## 4. Separation of Probabilistic Extraction and Deterministic Verification

The core architectural invariant of this system is that **the LLM is never trusted to verify its own math**.

Even after Stage 2 guarantees 100% conformance to the TypeScript static type and `Zod` schema, Stage 3 (`verifyExtractedPayload`) runs pure TypeScript predicates over the typed AST:
- If an invoice line item states `160 units * EUR 200.00 with 10% discount`, Stage 3 independently computes `160 * 200 * 0.90 = 28,800.00` and asserts `|computed - extracted| <= 0.01`.
- If a procurement tender declares Lot 1 (`EUR 1,450,000.00`) and Lot 2 (`EUR 850,000.00`), Stage 3 asserts `1,450,000 + 850,000 == 2,300,000.00` and verifies that the provisional bid bond (`EUR 46,000.00`) equals the statutory `2.00%` under Italian Public Contracts Code (`D.Lgs. 36/2023 Art. 106`).
- Any discrepancy transitions the pipeline status from `VERIFIED` to `RULE_VIOLATION`, preventing corrupted financial records from entering downstream systems of record.
