import fs from "fs";
import path from "path";
import { PipelineExecutionResult } from "./schemas";

interface SQLiteStatement {
  run: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
}

interface SQLiteDriver {
  exec: (sql: string) => void;
  prepare: (sql: string) => SQLiteStatement;
}

let dbInstance: SQLiteDriver | null = null;

function getDbPath(): string {
  const configured = process.env.AUDIT_DB_PATH || "./data/pipeline-audit.sqlite";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function openSQLiteDriver(fullPath: string): SQLiteDriver {
  // 1. Try better-sqlite3 if its native C++ addon is compiled for the current Node ABI
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3") as new (filename: string) => {
      pragma: (str: string) => void;
      exec: (sql: string) => void;
      prepare: (sql: string) => SQLiteStatement;
    };
    const db = new BetterSqlite3(fullPath);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");
    return db;
  } catch {
    // 2. Fall back to Node.js built-in native SQLite (node:sqlite DatabaseSync)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (filename: string) => {
        exec: (sql: string) => void;
        prepare: (sql: string) => SQLiteStatement;
      };
    };
    const db = new DatabaseSync(fullPath);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    return db;
  }
}

function getDb(): SQLiteDriver {
  if (dbInstance) {
    return dbInstance;
  }

  const fullPath = getDbPath();
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = openSQLiteDriver(fullPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_audit_runs (
      run_id                   TEXT PRIMARY KEY,
      created_at               TEXT NOT NULL,
      document_title           TEXT NOT NULL,
      document_hash            TEXT NOT NULL,
      document_type            TEXT NOT NULL,
      status                   TEXT NOT NULL,
      model_used               TEXT NOT NULL,
      provider_mode            TEXT NOT NULL,
      total_latency_ms         REAL NOT NULL,
      total_tokens             INTEGER NOT NULL,
      retry_count              INTEGER NOT NULL,
      steps_json               TEXT NOT NULL,
      validation_attempts_json TEXT NOT NULL,
      business_rules_json      TEXT NOT NULL,
      extracted_payload_json   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON pipeline_audit_runs(created_at DESC);
  `);

  dbInstance = db;
  return db;
}

export function resetDbForTests(): void {
  dbInstance = null;
}

export function persistPipelineAuditRun(result: PipelineExecutionResult): {
  auditLatencyMs: number;
} {
  const start = performance.now();
  const db = getDb();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pipeline_audit_runs (
      run_id, created_at, document_title, document_hash, document_type,
      status, model_used, provider_mode, total_latency_ms, total_tokens,
      retry_count, steps_json, validation_attempts_json, business_rules_json,
      extracted_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    result.runId,
    result.createdAt,
    result.documentTitle,
    result.documentHash,
    result.documentType,
    result.status,
    result.modelUsed,
    result.providerMode,
    result.totalLatencyMs,
    result.totalTokens,
    result.retryCount,
    JSON.stringify(result.steps),
    JSON.stringify(result.validationAttempts),
    JSON.stringify(result.businessRules),
    result.extractedPayload ? JSON.stringify(result.extractedPayload) : null
  );

  const auditLatencyMs = Math.max(0.5, Number((performance.now() - start).toFixed(2)));
  return { auditLatencyMs };
}

export interface AuditRunSummary {
  runId: string;
  createdAt: string;
  documentTitle: string;
  documentHash: string;
  documentType: string;
  status: string;
  modelUsed: string;
  totalLatencyMs: number;
  totalTokens: number;
  retryCount: number;
}

export function listRecentAuditRuns(limit = 15): AuditRunSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        run_id AS runId,
        created_at AS createdAt,
        document_title AS documentTitle,
        document_hash AS documentHash,
        document_type AS documentType,
        status,
        model_used AS modelUsed,
        total_latency_ms AS totalLatencyMs,
        total_tokens AS totalTokens,
        retry_count AS retryCount
      FROM pipeline_audit_runs
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as AuditRunSummary[];

  return rows;
}
