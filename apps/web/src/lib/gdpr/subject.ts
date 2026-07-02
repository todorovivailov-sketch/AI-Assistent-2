// Pure GDPR helpers: phone normalization + the exact column patches used to
// anonymize/scrub PII. No I/O — unit-tested via scripts/test-gdpr.mjs.

/** Normalize a raw phone to E.164 for BG, else null. Conservative: refuses ambiguous input. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = String(raw).trim().startsWith("+");
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) {
    // already international; digits holds the country code onward
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 10) {
    digits = "359" + digits.slice(1); // BG national mobile 0XXXXXXXXX
  } else if (digits.startsWith("359")) {
    // bare country code without +
  } else {
    return null; // cannot confidently normalize
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

/** Trailing 8 digits — cheap SQL `ilike '%<suffix>'` prefilter before a JS normalized-equal check. */
export function phoneMatchSuffix(e164: string): string {
  return e164.replace(/\D/g, "").slice(-8);
}

/** calls: clear raw/PII, keep aggregate stats. Used by retention AND erasure. */
export function callAnonymizePatch(anonymizedAtIso: string) {
  return {
    caller_number: null,
    transcript: null,
    recording_url: null,
    summary: null,
    structured_data: {},
    raw_payload: {},
    anonymized_at: anonymizedAtIso,
  };
}

/** leads: clear direct identifiers, keep non-identifying fields (city/service_type/status). */
export function leadScrubPatch() {
  return {
    name: null,
    phone: null,
    email: null,
    address: null,
    preferred_time_text: null,
    ai_summary: null,
    notes: null,
  };
}

/** appointments: clear identifiers; title is NOT NULL so genericize it. */
export function appointmentScrubPatch() {
  return {
    customer_name: null,
    customer_phone: null,
    location: null,
    notes: null,
    title: "Анонимизиран запис",
  };
}

/** orders: clear free-text that may carry PII. */
export function orderScrubPatch() {
  return { description: null, notes: null };
}
