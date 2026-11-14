# Deterministic B2B Document Extraction & Verification Pipeline

A full-stack TypeScript / Next.js (App Router) engineering platform that ingests unstructured B2B documents (Italian Public Procurement Tenders under `D.Lgs. 36/2023`, `FatturaPA TD01` Electronic Invoices, and Enterprise `SaaS MSA/SLA` Contracts) and executes a 4-stage deterministic extraction, self-healing `Zod` validation, and pure-TypeScript mathematical verification pipeline backed by SQLite WAL audit persistence.

![Dashboard Preview](./docs/dashboard.png)

---

## Core Engineering Architecture

1. **OpenAI-Compatible Local & Cloud Provider Abstraction (`src/lib/llm.ts`):**
   Connects seamlessly to local self-hosted inference servers (**Ollama** `http://localhost:11434/v1`, **LM Studio** `http://localhost:1234/v1`, **vLLM**) or cloud endpoints via `LLM_BASE_URL` and `LLM_MODEL` (defaulting to `qwen2.5:14b`), with an automatic deterministic grammatical fallback engine so the pipeline runs out of the box on any machine.
2. **Stage 1 — Document Classifier & Structural Chunker (`src/lib/pipeline/classifier.ts`):**
   Computes a cryptographic `SHA-256` document fingerprint, segments structural blocks, estimates token footprint, and classifies documents into `PUBLIC_TENDER`, `B2B_INVOICE`, or `VENDOR_CONTRACT`.
3. **Stage 2 — Self-Healing `Zod` Validation Loop (`src/lib/pipeline/extractor.ts`):**
   Enforces strict domain schemas (`ANAC CIG/CUP`, `ISO-13616 IBAN`, `EU VAT`, `ISO-8601` timestamps, numeric bounds). When an extraction attempt fails `schema.safeParse()`, the pipeline captures the exact `ZodIssue` path and received value, injects the structured diff back into the repair prompt (up to 3 retries), and halts with `MANUAL_REVIEW_REQUIRED` if convergence fails.
4. **Stage 3 — Pure-TypeScript Deterministic Business-Rule Engine (`src/lib/pipeline/verifier.ts`):**
   Cross-checks extracted financial and regulatory invariants independently of the LLM:
   - **Public Tenders (`D.Lgs. 36/2023`):** Multi-lot sum reconciliation, Art. 106 `2.0%` provisional bond math, chronological deadline chain, Art. 119 subcontracting cap (`< 50%`), and Art. 100 turnover proportionality (`<= 2.0x`).
   - **B2B Invoices (`FatturaPA TD01`):** Line-item quantity $\times$ unit price $\times$ discount extensions, net taxable base (`Imponibile`) sum, `22%` VAT calculation, gross payable total, and 27-char Italian SEPA IBAN verification.
   - **Enterprise Contracts (`MSA & SLA`):** Multi-year TCV commitment math, aggregate liability super-cap multiplier (`2.0x`), monotonic SLA service credit tiers, and `GDPR Art. 33` breach notification ceiling (`<= 72h`).
5. **Stage 4 — SQLite WAL Audit Persistence (`src/lib/pipeline/db.ts`):**
   Persists every execution trace, step latency, token count, retry diff, and rule verification matrix to `./data/pipeline-audit.sqlite` in `WAL` mode via `better-sqlite3`.

---

## Quickstart

### 1. Install Dependencies & Configure Environment

```bash
cp .env.example .env
npm install
```

### 2. Run Automated Pipeline & Verification Tests

```bash
npm test
```

### 3. Build & Run Production Server

```bash
npm run build
npm run start
```

Open `http://localhost:3000` in your browser to access the Engineering Observability Dashboard.

---

## Pipeline Execution Metrics

Measured on **Apple M3 (8 cores, 24.0 GB RAM, `darwin/arm64`)** running against live local **Ollama (`http://localhost:11434/v1`, `llama3.2:3b`)** with SQLite WAL audit persistence (`run_c0025be9dea8`, Fixture `FIX-01`: *Bando di Gara D.Lgs. 36/2023 — Infrastruttura Cloud & Telemetria*, `3,296 bytes`, SHA-256 `49f8a901ce35b1d6`):

### Stage-by-Stage Telemetry (`run_c0025be9dea8`)

| Stage | Component | Status | Latency (`ms`) | Tokens | Execution Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | `Classifier & Chunker` | **Passed** | `0.40 ms` | `0` | `Type=PUBLIC_TENDER` (`99.8%` conf), `8` structural chunks, `~864` est. input tokens |
| **02** | `Zod Extractor` | **Repaired · 1 retry** | `1,730.13 ms` | `1,358` | Caught Attempt #1 Zod errors (`15.56 ms`); self-healed on Attempt #2 (`1,714.57 ms`) via live `llama3.2:3b` |
| **03** | `Rule Verifier` | **Passed · 5/5** | `0.60 ms` | `0` | `5/5` pure-TypeScript mathematical & statutory invariants verified |
| **04** | `WAL Persistence` | **Passed** | `0.50 ms` | `0` | Committed immutable audit record `run_c0025be9dea8` to `./data/pipeline-audit.sqlite` |
| **Total** | **End-to-End Pipeline** | **VERIFIED** | **`1,731.63 ms`** | **`1,358`** | **1 Self-Healing Retry / 1.50 ms Total Deterministic Verification Overhead** |

### Deterministic Business-Rule Verification Matrix (`PUBLIC_TENDER`)

| Invariant Rule | Mathematical / Statutory Formula | Expected | Computed | Audit |
| :--- | :--- | :--- | :--- | :--- |
| **Multi-Lot Base Amount Reconciliation** (`TENDER_LOT_SUM_INTEGRITY`) | `SUM(lots[].amount_eur) == total_base_amount_eur` | `EUR 2,300,000.00` | `EUR 2,300,000.00` | **VERIFIED** |
| **Provisional Guarantee Statutory Ratio (Art. 106)** (`DLGS36_ART106_DEPOSIT_MATH`) | `total_base_amount_eur * (provisional_guarantee_pct / 100) == provisional_guarantee_eur` | `EUR 46,000.00 (2.00%)` | `EUR 46,000.00` | **VERIFIED** |
| **Chronological Procurement Timeline Check** (`TEMPORAL_DEADLINE_CHAIN`) | `now < clarification_deadline < submission_deadline < opening_session` | `2027-01-12 < 2027-01-25 < 2027-01-28` | `STRICT_MONOTONIC_FUTURE` | **VERIFIED** |
| **Prevailing Category Subcontracting Ceiling (Art. 119)** (`DLGS36_ART119_SUBCONTRACT_CAP`) | `0 < max_subcontracting_pct < 50.0%` | `< 50.0% of contract value` | `45.0%` | **VERIFIED** |
| **3-Year Turnover Proportionality Cap (Art. 100)** (`DLGS36_ART100_TURNOVER_CAP`) | `minimum_three_year_turnover_eur <= 2.0 * total_base_amount_eur` | `<= EUR 4,600,000.00` | `EUR 4,600,000.00` | **VERIFIED** |

### Multi-Fixture Benchmark Summary (Persisted in SQLite WAL Audit Log)

| Run ID | Document Category | SHA-256 Prefix | Zod Retries | Total Latency | Audit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `run_c0025be9dea8` | `PUBLIC_TENDER` (`D.Lgs. 36/2023`) | `49f8a901ce` | `1` (`Repaired`) | `1,731.6 ms` | **VERIFIED** |
| `run_2111fc92...` | `VENDOR_CONTRACT` (`SaaS MSA & SLA`) | `41c0274893` | `1` (`Repaired`) | `1,277.4 ms` | **VERIFIED** |
| `run_4da76b06...` | `B2B_INVOICE` (`FatturaPA TD01`) | `3531ca1704` | `1` (`Repaired`) | `3,218.6 ms` | **VERIFIED** |

---

## Architecture Deep Dive

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a technical analysis of why raw LLM JSON mode fails in B2B financial workflows and how bounded self-healing retry loops + deterministic verification eliminate silent data corruption.
