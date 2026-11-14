import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

export const ISO8601DateString = z
  .string()
  .regex(isoDateRegex, "Must be a strict ISO-8601 date or timestamp (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)");

// 1. PUBLIC_TENDER Schema (D.Lgs. 36/2023)
export const TenderLotSchema = z.object({
  lot_number: z.number().int().positive(),
  lot_cig: z.string().min(5),
  title: z.string().min(5),
  category_code: z.string().min(2),
  amount_eur: z.number().positive(),
  safety_costs_eur: z.number().nonnegative(),
});

export const PublicTenderExtractionSchema = z.object({
  document_type: z.literal("PUBLIC_TENDER"),
  contracting_authority: z.string().min(5),
  cig: z
    .string()
    .regex(/^[A-Z0-9]{10}$/, "CIG must be an exact 10-character uppercase alphanumeric ANAC code"),
  cup: z
    .string()
    .regex(/^[A-Z0-9]{15}$/, "CUP must be an exact 15-character uppercase alphanumeric CIPE code"),
  rup_name: z.string().min(3),
  award_criterion: z.string().min(3),
  currency: z.literal("EUR"),
  lots: z.array(TenderLotSchema).min(1),
  total_base_amount_eur: z.number().positive(),
  provisional_guarantee_pct: z.number().positive().max(10),
  provisional_guarantee_eur: z.number().nonnegative(),
  max_subcontracting_pct: z.number().positive().max(100),
  mandatory_certifications: z.array(z.string().min(3)).min(1),
  minimum_three_year_turnover_eur: z.number().nonnegative(),
  clarification_deadline_iso: ISO8601DateString,
  submission_deadline_iso: ISO8601DateString,
  opening_session_iso: ISO8601DateString,
  contract_duration_months: z.number().int().positive(),
});

// 2. B2B_INVOICE Schema (FatturaPA TD01)
export const InvoiceLineItemSchema = z.object({
  line_number: z.number().int().positive(),
  sku_code: z.string().min(2),
  description: z.string().min(3),
  quantity: z.number().positive(),
  unit_price_eur: z.number().positive(),
  discount_pct: z.number().min(0).max(100),
  line_total_eur: z.number().positive(),
});

export const B2BInvoiceExtractionSchema = z.object({
  document_type: z.literal("B2B_INVOICE"),
  invoice_number: z.string().min(3),
  sdi_identifier: z.string().min(5),
  issue_date_iso: ISO8601DateString,
  due_date_iso: ISO8601DateString,
  currency: z.literal("EUR"),
  supplier_name: z.string().min(3),
  supplier_vat_id: z.string().regex(/^[A-Z]{2}[0-9A-Z]{8,13}$/, "Invalid EU VAT ID format"),
  customer_name: z.string().min(3),
  customer_vat_id: z.string().regex(/^[A-Z]{2}[0-9A-Z]{8,13}$/, "Invalid EU VAT ID format"),
  sdi_recipient_code: z.string().length(7),
  purchase_order_ref: z.string().min(3),
  line_items: z.array(InvoiceLineItemSchema).min(1),
  subtotal_net_eur: z.number().positive(),
  vat_rate_pct: z.number().min(0).max(50),
  vat_amount_eur: z.number().nonnegative(),
  total_gross_eur: z.number().positive(),
  beneficiary_iban: z
    .string()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, "Invalid ISO-13616 IBAN format"),
});

// 3. VENDOR_CONTRACT Schema (Enterprise MSA & SLA)
export const SLACreditTierSchema = z.object({
  tier_name: z.string().min(2),
  uptime_range_description: z.string().min(3),
  credit_pct: z.number().positive().max(100),
});

export const VendorContractExtractionSchema = z.object({
  document_type: z.literal("VENDOR_CONTRACT"),
  contract_reference: z.string().min(3),
  vendor_name: z.string().min(3),
  vendor_vat_id: z.string().min(5),
  customer_name: z.string().min(3),
  customer_vat_id: z.string().min(5),
  effective_date_iso: ISO8601DateString,
  expiration_date_iso: ISO8601DateString,
  term_years: z.number().int().positive(),
  currency: z.literal("EUR"),
  annual_license_fee_eur: z.number().positive(),
  onboarding_fee_eur: z.number().nonnegative(),
  total_contract_value_eur: z.number().positive(),
  non_renewal_notice_days: z.number().int().positive(),
  guaranteed_uptime_pct: z.number().min(90).max(100),
  rto_minutes: z.number().int().positive(),
  rpo_minutes: z.number().int().positive(),
  sla_credit_tiers: z.array(SLACreditTierSchema).min(1),
  liability_cap_multiplier: z.number().positive(),
  liability_cap_eur: z.number().positive(),
  gdpr_breach_notification_hours: z.number().int().positive().max(168),
  eu_data_residency_enforced: z.boolean(),
});

export type PublicTenderExtraction = z.infer<typeof PublicTenderExtractionSchema>;
export type B2BInvoiceExtraction = z.infer<typeof B2BInvoiceExtractionSchema>;
export type VendorContractExtraction = z.infer<typeof VendorContractExtractionSchema>;

export type ExtractedDocumentPayload =
  | PublicTenderExtraction
  | B2BInvoiceExtraction
  | VendorContractExtraction;

export interface ValidationAttemptTrace {
  attempt: number;
  status: "VALID" | "ZOD_SCHEMA_ERROR";
  latencyMs: number;
  zodErrors: Array<{
    path: string;
    message: string;
    received?: unknown;
  }>;
  repairFeedbackPrompt?: string;
}

export interface BusinessRuleAuditItem {
  ruleId: string;
  ruleName: string;
  formula: string;
  expectedValue: string;
  actualValue: string;
  passed: boolean;
  severity: "CRITICAL" | "HIGH";
  details: string;
}

export interface PipelineStepMetric {
  stepNumber: number;
  stepId: "CLASSIFIER_CHUNKER" | "ZOD_SELF_HEALING_EXTRACTOR" | "DETERMINISTIC_VERIFIER" | "SQLITE_WAL_AUDIT";
  stepName: string;
  status: "PASS" | "REPAIRED" | "FAIL";
  latencyMs: number;
  tokensUsed: number;
  summary: string;
}

export interface PipelineExecutionResult {
  runId: string;
  createdAt: string;
  documentTitle: string;
  documentHash: string;
  documentType: "PUBLIC_TENDER" | "B2B_INVOICE" | "VENDOR_CONTRACT";
  language: "IT" | "EN";
  confidence: number;
  chunksDetected: number;
  estimatedInputTokens: number;
  status: "VERIFIED" | "RULE_VIOLATION" | "MANUAL_REVIEW_REQUIRED";
  modelUsed: string;
  providerMode: "LIVE_OPENAI_COMPATIBLE" | "DETERMINISTIC_FALLBACK_ENGINE";
  totalLatencyMs: number;
  totalTokens: number;
  retryCount: number;
  steps: PipelineStepMetric[];
  validationAttempts: ValidationAttemptTrace[];
  businessRules: BusinessRuleAuditItem[];
  extractedPayload: ExtractedDocumentPayload | null;
}

export function getSchemaForCategory(category: "PUBLIC_TENDER" | "B2B_INVOICE" | "VENDOR_CONTRACT") {
  switch (category) {
    case "PUBLIC_TENDER":
      return PublicTenderExtractionSchema;
    case "B2B_INVOICE":
      return B2BInvoiceExtractionSchema;
    case "VENDOR_CONTRACT":
      return VendorContractExtractionSchema;
  }
}
