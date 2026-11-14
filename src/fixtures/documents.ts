export type DocumentCategory = "PUBLIC_TENDER" | "B2B_INVOICE" | "VENDOR_CONTRACT";

export interface DocumentFixture {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  expectedCategory: DocumentCategory;
  jurisdiction: string;
  rawText: string;
}

export const DOCUMENT_FIXTURES: DocumentFixture[] = [
  {
    id: "it-public-tender-2026",
    code: "FIX-01",
    title: "Bando di Gara D.Lgs. 36/2023 — Infrastruttura Cloud & Telemetria",
    subtitle: "Italian Public Procurement Tender (ANAC CIG / CUP / Multi-Lot / SOA)",
    expectedCategory: "PUBLIC_TENDER",
    jurisdiction: "IT / EU (D.Lgs. 36/2023)",
    rawText: `REPUBBLICA ITALIANA — MINISTERO DELLE INFRASTRUTTURE E DEI TRASPORTI
PROVVEDITORATO INTERREGIONALE PER LE OPERE PUBBLICHE LOMBARDIA ED EMILIA-ROMAGNA
Sede Legale: Corso Monforte 36, 20122 Milano (MI) — C.F. 80014890154 — PEC: oopp.lombardia@pec.mit.gov.it

DISCIPLINARE DI GARA TELEMATICA A PROCEDURA APERTA
(ai sensi degli artt. 71 e 108 del Decreto Legislativo 31 marzo 2023, n. 36 - Codice dei Contratti Pubblici)

1. OGGETTO DELL'APPALTO E CODICI IDENTIFICATIVI
Procedura aperta sopra soglia comunitaria per l'affidamento della progettazione esecutiva, fornitura e gestione triennale dell'Infrastruttura Cloud Sovrana Zero-Trust e della Piattaforma di Telemetria IoT per il monitoraggio strutturale della rete viaria nazionale.
- Codice Identificativo Gara (CIG): B4F92A108E
- Codice Unico di Progetto (CUP): J49I26000480001
- Responsabile Unico del Progetto (RUP): Ing. Alessandro Valenti (alessandro.valenti@mit.gov.it)
- Criterio di Aggiudicazione: Offerta Economicamente Più Vantaggiosa (OEPV: Max 75 punti Offerta Tecnica, Max 25 punti Offerta Economica)

2. SUDDIVISIONE IN LOTTI E QUADRO ECONOMICO A BASE D'ASTA (IVA ESCLUSA)
L'appalto è suddiviso in n. 2 (due) lotti funzionali aggiudicabili congiuntamente:
  * LOTTO 1 [CIG: B4F92A108E-L1] — Infrastruttura Cloud Ibrida, Nodi Kubernetes HA e Sicurezza Zero-Trust (Cat. Prevalente: OS30 / Servizi ICT):
    Importo a base di gara: EUR 1.450.000,00 (inclusi EUR 28.000,00 per oneri della sicurezza non soggetti a ribasso)
  * LOTTO 2 [CIG: B4F92A108E-L2] — Rete Sensori IoT Edge, Gateway LoRaWAN e Telemetria Strutturale (Cat. Prevalente: OS19):
    Importo a base di gara: EUR 850.000,00 (inclusi EUR 17.000,00 per oneri della sicurezza non soggetti a ribasso)

  >> IMPORTO COMPLESSIVO TOTALE A BASE D'ASTA: EUR 2.300.000,00 (duemilionitrecentomila/00 euro) oltre IVA di legge.

3. GARANZIA PROVVISORIA E SUBAPPALTO (ARTT. 106 E 119 D.LGS. 36/2023)
- Garanzia Provvisoria richiesta a corredo dell'offerta: pari esattamente al 2,00% (due per cento) dell'importo complessivo a base d'asta, ovvero EUR 46.000,00.
- Quota massima subappaltabile per le prestazioni prevalenti: non superiore al 45,0% dell'importo complessivo del contratto.

4. REQUISITI DI CAPACITÀ TECNICO-PROFESSIONALE ED CERTIFICAZIONI OBBLIGATORIE
I concorrenti devono possedere, a pena di esclusione, le seguenti certificazioni in corso di validità:
  [REQ-01] Certificazione ISO/IEC 27001:2022 per la gestione della sicurezza delle informazioni;
  [REQ-02] Certificazione ISO/IEC 27017 e ISO/IEC 27018 per servizi Cloud qualificati ACN (Agenzia per la Cybersicurezza Nazionale - Livello QC2);
  [REQ-03] Attestazione SOA in categoria OS30 (Classifica IV o superiore) e categoria OS19 (Classifica III);
  [REQ-04] Fatturato globale specifico nel triennio 2023-2025 non inferiore a EUR 4.600.000,00.

5. CRONOPROGRAMMA E TERMINI PERENTORI DI SCADENZA (FUSO ORARIO EUROPE/ROME)
- Termine ultimo per la presentazione di quesiti e richieste di chiarimento: 2027-01-12T12:00:00Z
- Termine perentorio per il caricamento delle offerte telematiche: 2027-01-25T18:00:00Z
- Data prima seduta pubblica telematica di apertura buste amministrative: 2027-01-28T10:00:00Z
- Durata contrattuale dell'esecuzione: 36 mesi decorrenti dal verbale di avvio dell'esecuzione.`
  },
  {
    id: "b2b-invoice-sdi-2026",
    code: "FIX-02",
    title: "Fattura Elettronica B2B (TD01) — Servizi Ingegneria & AI",
    subtitle: "B2B Technical Services Invoice (Line Items / Discounts / 22% VAT / IBAN)",
    expectedCategory: "B2B_INVOICE",
    jurisdiction: "IT / SDI FatturaPA (DPR 633/72)",
    rawText: `FATTURA ELETTRONICA B2B — FORMATO FATTURAPA 1.2.2 (TIPO DOCUMENTO: TD01)
Identificativo SdI: 10948274910 — Data Emissione: 2026-11-10 — Scadenza Pagamento: 2026-12-31 (60 gg D.F.F.M.)
Numero Documento: INV-2026/0842 — Valuta: EUR

CEDENTE / PRESTATORE (FORNITORE):
Ragione Sociale: Aetheris Distributed Systems S.r.l.
Sede: Via Monte Napoleone 8, 20121 Milano (MI), Italia
Partita IVA: IT09482710964 — Codice Fiscale: 09482710964 — REA: MI-2591840

CESSIONARIO / COMMITTENTE (CLIENTE):
Ragione Sociale: Prysmian Industrial Grid Automation S.p.A.
Sede: Viale Sarca 222, 20126 Milano (MI), Italia
Partita IVA: IT04829100968 — Codice Destinatario SDI: M5UXCR1
Ordine di Acquisto (OdA) Rif.: PO-2026-99412 del 2026-09-15

DETTAGLIO RIGHE DI FATTURAZIONE (IMPONIBILI ANALITICI):
---------------------------------------------------------------------------------------------------------
Riga | Codice Art.   | Descrizione Prestazione Tecnica        | Q.tà | Prezzo Unit. | Sconto | Totale Netto
---------------------------------------------------------------------------------------------------------
 01  | ENG-ARCH-01   | Architettura Pipeline Dati Real-Time   |  120 | EUR   180,00 |   0,0% | EUR 21.600,00
 02  | AI-EXTR-02    | Sviluppo Estrattore Deterministico LLM |  160 | EUR   200,00 |  10,0% | EUR 28.800,00
 03  | SEC-AUDIT-03  | Hardening Cluster Kubernetes & mTLS    |   80 | EUR   150,00 |   0,0% | EUR 12.000,00
 04  | OPS-RETAIN-04 | Canone Trimestrale SRE & Telemetria    |    1 | EUR 6.000,00 |   0,0% | EUR  6.000,00
---------------------------------------------------------------------------------------------------------

RIEPILOGO FISCALE E TOTALI DOCUMENTO (ART. 21 DPR 633/72):
- Totale Imponibile Netto (Somma Righe 01..04) : EUR 68.400,00
- Aliquota IVA Applicata (Ordinaria)           : 22,00%
- Totale Imposta IVA (22% su EUR 68.400,00)    : EUR 15.048,00
- TOTALE LORDO FATTURA DA CORRISPONDERE        : EUR 83.448,00 (Esigibilità IVA: I - Immediata)

COORDINATE BANCARIE PER BONIFICO SEPA:
Istituto di Credito: Intesa Sanpaolo S.p.A. — Filiale Imprese Milano Centro
IBAN Beneficiario: IT60X0542811101000000123456 — BIC/SWIFT: BCITITMM`
  },
  {
    id: "vendor-contract-msa-2026",
    code: "FIX-03",
    title: "Enterprise SaaS Master Subscription & SLA Agreement",
    subtitle: "B2B Vendor Contract (TCV Commitment / Uptime SLA Tiers / Liability Cap / GDPR)",
    expectedCategory: "VENDOR_CONTRACT",
    jurisdiction: "EU / GDPR (Reg. 2016/679)",
    rawText: `MASTER CLOUD SUBSCRIPTION & DATA PROCESSING AGREEMENT
Contract Reference: MSA-2026-8841-EU
Effective Date: 2026-12-01
Expiration Date: 2029-11-30 (Initial Commitment Term: 3 Years / 36 Months)

PARTIES TO THE AGREEMENT:
1. VENDOR: Hyperion Core Infrastructure GmbH, Friedrichstraße 114A, 10117 Berlin, Germany (VAT ID: DE319482710)
2. CUSTOMER: Credito Emiliano Digital Platforms S.p.A., Via Emilia San Pietro 4, 42121 Reggio Emilia, Italy (VAT ID: IT01829400351)

SECTION 1 — COMMERCIAL SCHEDULE & COMMITTED CONTRACT VALUE
1.1 Annual Platform Subscription Fee: EUR 180,000.00 per contract year (billed annually in advance).
1.2 Initial Subscription Term: 3 years (36 consecutive calendar months).
1.3 One-Time Dedicated KMS & HSM Onboarding Engineering Fee: EUR 25,000.00 (invoiced upon Effective Date).
1.4 Total Committed Contract Value (TCV): EUR 565,000.00 (calculated as 3 years * EUR 180,000.00 + EUR 25,000.00 onboarding fee).
1.5 Non-Renewal Notice Window: Either party must provide written notice at least 60 days prior to the Expiration Date.

SECTION 2 — SERVICE LEVEL AGREEMENT (SLA) & UPTIME GUARANTEES
2.1 Guaranteed Monthly System Availability: 99.95% across all multi-AZ European production clusters (eu-central-1, eu-south-1).
2.2 Maximum RTO (Recovery Time Objective): 15 minutes; Maximum RPO (Recovery Point Objective): 5 minutes.
2.3 Monthly Service Credit Schedule:
    - Tier 1: Monthly Uptime between 99.50% and 99.94% -> 10% Service Credit of monthly pro-rata fee
    - Tier 2: Monthly Uptime between 99.00% and 99.49% -> 25% Service Credit of monthly pro-rata fee
    - Tier 3: Monthly Uptime below 99.00%              -> 50% Service Credit of monthly pro-rata fee

SECTION 3 — LIMITATION OF LIABILITY & DATA PROTECTION (GDPR ART. 28 / ART. 33)
3.1 Aggregate Liability Cap Multiplier: 2.0x (two times) the Annual Platform Subscription Fee.
3.2 Aggregate Liability Cap Amount: EUR 360,000.00 per contract year.
3.3 Security Incident & Personal Data Breach Notification SLA: Vendor shall notify Customer CISO within 24 hours of confirming any unauthorized access or security incident (strictly within the 72-hour statutory ceiling under GDPR Article 33).
3.4 Data Residency & Sub-processors: 100% EU sovereign residency; zero transfer outside EEA without prior written consent.`
  }
];
