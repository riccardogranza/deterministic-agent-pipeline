import { DocumentCategory } from "@/fixtures/documents";

export interface LLMConfig {
  baseUrl: string;
  model: string;
  explicitModelConfigured: boolean;
  apiKey: string;
  timeoutMs: number;
}

export interface LLMExtractionCallInput {
  category: DocumentCategory;
  rawText: string;
  attempt: number;
  priorCandidateJson?: unknown;
  priorZodErrorFeedback?: string;
  simulateFaultOnAttempt1?: boolean;
}

export interface LLMExtractionCallOutput {
  rawJsonObject: unknown;
  modelUsed: string;
  providerMode: "LIVE_OPENAI_COMPATIBLE" | "DETERMINISTIC_FALLBACK_ENGINE";
  tokensUsed: number;
  latencyMs: number;
}

const PREFERRED_LOCAL_MODELS = [
  "qwen2.5:14b",
  "llama3.2:3b",
  "lfm2.5-2.6b-fast:latest",
  "dolphin-mistral:7b",
];

export function getLLMConfig(): LLMConfig {
  const explicitModel = (process.env.LLM_MODEL || "").trim();
  return {
    baseUrl: (process.env.LLM_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, ""),
    model: explicitModel || "qwen2.5:14b",
    explicitModelConfigured: explicitModel.length > 0,
    apiKey: process.env.LLM_API_KEY || "ollama-local",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 45000),
  };
}

function selectBestAvailableModel(models: string[], cfg: LLMConfig): {
  activeModel: string;
  configuredModelAvailable: boolean;
} {
  if (models.length === 0) {
    return {
      activeModel: cfg.model,
      configuredModelAvailable: false,
    };
  }

  if (cfg.explicitModelConfigured) {
    const exactMatch = models.find((m) => m === cfg.model);
    if (exactMatch) {
      return { activeModel: exactMatch, configuredModelAvailable: true };
    }
    const prefixMatch = models.find((m) => m.startsWith(cfg.model.split(":")[0]));
    if (prefixMatch) {
      return { activeModel: prefixMatch, configuredModelAvailable: true };
    }
    return { activeModel: cfg.model, configuredModelAvailable: false };
  }

  // Auto-select when LLM_MODEL is not explicitly set in env:
  // Prefer qwen2.5:14b if present, otherwise fall back to preferred fast models (e.g. llama3.2:3b) or first non-embedding model
  for (const preferred of PREFERRED_LOCAL_MODELS) {
    const match = models.find(
      (m) => m === preferred || m.startsWith(preferred.split(":")[0])
    );
    if (match) {
      return { activeModel: match, configuredModelAvailable: true };
    }
  }

  const nonEmbed = models.find((m) => !m.toLowerCase().includes("embed"));
  const chosen = nonEmbed || models[0];
  return { activeModel: chosen, configuredModelAvailable: true };
}

export async function probeOpenAICompatibleServer(): Promise<{
  reachable: boolean;
  configuredModelAvailable: boolean;
  availableModels: string[];
  activeModel: string;
  baseUrl: string;
}> {
  const cfg = getLLMConfig();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${cfg.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        reachable: false,
        configuredModelAvailable: false,
        availableModels: [],
        activeModel: cfg.model,
        baseUrl: cfg.baseUrl,
      };
    }

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const models = (data.data ?? []).map((m) => m.id);
    const selection = selectBestAvailableModel(models, cfg);

    return {
      reachable: true,
      configuredModelAvailable: selection.configuredModelAvailable,
      availableModels: models,
      activeModel: selection.activeModel,
      baseUrl: cfg.baseUrl,
    };
  } catch {
    return {
      reachable: false,
      configuredModelAvailable: false,
      availableModels: [],
      activeModel: cfg.model,
      baseUrl: cfg.baseUrl,
    };
  }
}

function buildCategorySystemPrompt(category: DocumentCategory): string {
  const commonRules = [
    "You are a deterministic B2B structured document extraction engine.",
    "Return ONLY a single valid JSON object matching the exact schema below. Do not wrap in markdown fences or add commentary.",
    "CRITICAL NUMERIC RULE: Every monetary amount, percentage, quantity, and count MUST be a raw JSON number (e.g. 2300000 or 22 or 99.95), NEVER a formatted string with currency symbols ('EUR', '€', '%'), thousands separators ('.' or ','), or units.",
    "CRITICAL DATE RULE: Every date/timestamp field ending in _iso MUST be a strict ISO-8601 string ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ssZ'), NEVER DD/MM/YYYY or DD-MM-YYYY.",
  ].join("\n");

  if (category === "PUBLIC_TENDER") {
    return `${commonRules}

Required JSON Schema for document_type = "PUBLIC_TENDER":
{
  "document_type": "PUBLIC_TENDER",
  "contracting_authority": string (full official name of the contracting authority),
  "cig": string (exact 10-character uppercase alphanumeric ANAC CIG code, e.g. "B4F92A108E"),
  "cup": string (exact 15-character uppercase alphanumeric CUP code, e.g. "J49I26000480001"),
  "rup_name": string (full name and title of the Responsabile Unico del Progetto, excluding email),
  "award_criterion": string (e.g. "OEPV (Offerta Economicamente Più Vantaggiosa 75/25)"),
  "currency": "EUR",
  "lots": [
    {
      "lot_number": number (integer 1, 2, ...),
      "lot_cig": string (lot-level CIG code, e.g. "B4F92A108E-L1"),
      "title": string (lot description/title),
      "category_code": string (SOA/technical category code, e.g. "OS30" or "OS19"),
      "amount_eur": number (numeric lot base amount in EUR, e.g. 1450000),
      "safety_costs_eur": number (numeric non-discountable safety costs in EUR, e.g. 28000)
    }
  ],
  "total_base_amount_eur": number (numeric total auction base amount in EUR across all lots, e.g. 2300000),
  "provisional_guarantee_pct": number (numeric percentage, e.g. 2.0),
  "provisional_guarantee_eur": number (numeric provisional guarantee amount in EUR, e.g. 46000),
  "max_subcontracting_pct": number (numeric maximum subcontracting percentage, e.g. 45.0),
  "mandatory_certifications": string[] (array of required ISO/SOA certification strings),
  "minimum_three_year_turnover_eur": number (numeric minimum 3-year specific turnover in EUR, e.g. 4600000),
  "clarification_deadline_iso": string (strict ISO-8601 timestamp, e.g. "2027-01-12T12:00:00Z"),
  "submission_deadline_iso": string (strict ISO-8601 timestamp, e.g. "2027-01-25T18:00:00Z"),
  "opening_session_iso": string (strict ISO-8601 timestamp, e.g. "2027-01-28T10:00:00Z"),
  "contract_duration_months": number (integer duration in months, e.g. 36)
}`;
  }

  if (category === "B2B_INVOICE") {
    return `${commonRules}

Required JSON Schema for document_type = "B2B_INVOICE":
{
  "document_type": "B2B_INVOICE",
  "invoice_number": string (exact document number, e.g. "INV-2026/0842"),
  "sdi_identifier": string (SdI identifier digits as string, e.g. "10948274910"),
  "issue_date_iso": string (strict ISO-8601 date "YYYY-MM-DD", e.g. "2026-11-10"),
  "due_date_iso": string (strict ISO-8601 date "YYYY-MM-DD", e.g. "2026-12-31"),
  "currency": "EUR",
  "supplier_name": string (legal name of supplier / cedente),
  "supplier_vat_id": string (EU VAT ID starting with 2-letter country code, e.g. "IT09482710964"),
  "customer_name": string (legal name of customer / cessionario),
  "customer_vat_id": string (EU VAT ID starting with 2-letter country code, e.g. "IT04829100968"),
  "sdi_recipient_code": string (exact 7-character SDI recipient code, e.g. "M5UXCR1"),
  "purchase_order_ref": string (purchase order reference code, e.g. "PO-2026-99412"),
  "line_items": [
    {
      "line_number": number (integer 1, 2, 3, 4),
      "sku_code": string (article code, e.g. "ENG-ARCH-01"),
      "description": string (service description),
      "quantity": number (numeric quantity, e.g. 120),
      "unit_price_eur": number (numeric unit price in EUR, e.g. 180),
      "discount_pct": number (numeric discount percentage 0..100, e.g. 0 or 10),
      "line_total_eur": number (numeric net line total in EUR, e.g. 21600)
    }
  ],
  "subtotal_net_eur": number (numeric Totale Imponibile Netto in EUR, e.g. 68400),
  "vat_rate_pct": number (numeric VAT percentage rate, e.g. 22),
  "vat_amount_eur": number (numeric Totale Imposta IVA in EUR, e.g. 15048),
  "total_gross_eur": number (numeric TOTALE LORDO FATTURA in EUR, e.g. 83448),
  "beneficiary_iban": string (27-character Italian SEPA IBAN without spaces, e.g. "IT60X0542811101000000123456")
}`;
  }

  return `${commonRules}

Required JSON Schema for document_type = "VENDOR_CONTRACT":
{
  "document_type": "VENDOR_CONTRACT",
  "contract_reference": string (e.g. "MSA-2026-8841-EU"),
  "vendor_name": string (legal name of vendor),
  "vendor_vat_id": string (vendor VAT ID, e.g. "DE319482710"),
  "customer_name": string (legal name of customer),
  "customer_vat_id": string (customer VAT ID, e.g. "IT01829400351"),
  "effective_date_iso": string (strict ISO-8601 date "YYYY-MM-DD", e.g. "2026-12-01"),
  "expiration_date_iso": string (strict ISO-8601 date "YYYY-MM-DD", e.g. "2029-11-30"),
  "term_years": number (integer initial commitment term in years, e.g. 3),
  "currency": "EUR",
  "annual_license_fee_eur": number (numeric annual platform subscription fee in EUR, e.g. 180000),
  "onboarding_fee_eur": number (numeric one-time onboarding engineering fee in EUR, e.g. 25000),
  "total_contract_value_eur": number (numeric Total Committed Contract Value TCV in EUR, e.g. 565000),
  "non_renewal_notice_days": number (integer notice window in days, e.g. 60),
  "guaranteed_uptime_pct": number (numeric monthly availability percentage between 90 and 100, e.g. 99.95),
  "rto_minutes": number (integer maximum RTO in minutes, e.g. 15),
  "rpo_minutes": number (integer maximum RPO in minutes, e.g. 5),
  "sla_credit_tiers": [
    {
      "tier_name": string (e.g. "Tier 1", "Tier 2", "Tier 3"),
      "uptime_range_description": string (e.g. "99.50% - 99.94%", "99.00% - 99.49%", "< 99.00%"),
      "credit_pct": number (numeric service credit percentage in ascending order, e.g. 10, 25, 50)
    }
  ],
  "liability_cap_multiplier": number (numeric multiplier of annual fee, e.g. 2.0),
  "liability_cap_eur": number (numeric aggregate liability cap amount in EUR, e.g. 360000),
  "gdpr_breach_notification_hours": number (integer incident notification SLA in hours, e.g. 24),
  "eu_data_residency_enforced": boolean (true if 100% EU sovereign data residency is enforced)
}`;
}

function mutateAttempt1OutputForFaultDemo(
  realLlmObj: Record<string, unknown>,
  category: DocumentCategory
): Record<string, unknown> {
  const mutated: Record<string, unknown> = structuredClone(realLlmObj);
  if (category === "PUBLIC_TENDER") {
    mutated.total_base_amount_eur = "EUR 2.300.000,00";
    mutated.submission_deadline_iso = "25/01/2027 18:00";
  } else if (category === "B2B_INVOICE") {
    mutated.total_gross_eur = "€ 83.448,00";
    mutated.due_date_iso = "31-12-2026";
  } else {
    mutated.total_contract_value_eur = "EUR 565,000.00";
    mutated.guaranteed_uptime_pct = "99.95%";
  }
  return mutated;
}

export async function invokeStructuredExtractorLLM(
  input: LLMExtractionCallInput
): Promise<LLMExtractionCallOutput> {
  const start = performance.now();
  const cfg = getLLMConfig();
  const probe = await probeOpenAICompatibleServer();

  if (!probe.reachable) {
    throw new Error(
      `OpenAI-compatible LLM endpoint at ${cfg.baseUrl} is unreachable. Ensure Ollama or your configured provider is running.`
    );
  }

  const targetModel = probe.activeModel || cfg.model;
  const systemPrompt = buildCategorySystemPrompt(input.category);

  const userPrompt =
    input.attempt > 1 && input.priorZodErrorFeedback
      ? [
          `Your previous JSON extraction on Attempt ${input.attempt - 1} failed strict Zod schema validation.`,
          `Prior candidate JSON:\n${JSON.stringify(input.priorCandidateJson ?? {}, null, 2)}`,
          `Exact Zod schema validation errors:\n${input.priorZodErrorFeedback}`,
          `Source document text:\n${input.rawText}`,
          "Fix every listed Zod validation error (convert formatted currency/percentage strings to raw JSON numbers and dates to strict ISO-8601 strings) and return the complete corrected JSON object.",
        ].join("\n\n")
      : `Extract the complete structured JSON object for document_type="${input.category}" from the following B2B document:\n\n${input.rawText}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to invoke LLM chat completions at ${cfg.baseUrl}/chat/completions (model=${targetModel}): ${reason}`
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `LLM endpoint ${cfg.baseUrl}/chat/completions returned HTTP ${response.status} for model "${targetModel}": ${errBody.slice(0, 300)}`
    );
  }

  const body = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };

  const rawContent = body.choices?.[0]?.message?.content ?? "";
  const cleaned = rawContent
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  if (!cleaned) {
    throw new Error(
      `LLM model "${targetModel}" returned an empty completion payload on attempt ${input.attempt}.`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (parseErr) {
    const reason = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(
      `LLM model "${targetModel}" returned malformed JSON on attempt ${input.attempt}: ${reason}`
    );
  }

  if (
    input.simulateFaultOnAttempt1 &&
    input.attempt === 1 &&
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    !Array.isArray(parsedJson)
  ) {
    parsedJson = mutateAttempt1OutputForFaultDemo(
      parsedJson as Record<string, unknown>,
      input.category
    );
  }

  const elapsed = Number((performance.now() - start).toFixed(2));
  const tokensUsed =
    body.usage?.total_tokens ??
    Math.ceil((systemPrompt.length + userPrompt.length + cleaned.length) / 3.8);

  return {
    rawJsonObject: parsedJson,
    modelUsed: body.model || targetModel,
    providerMode: "LIVE_OPENAI_COMPATIBLE",
    tokensUsed,
    latencyMs: elapsed,
  };
}
