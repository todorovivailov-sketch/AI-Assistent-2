export const SHORT_CALL_SECONDS = 15;

export const DEFAULT_MISSED_CALL_TEMPLATE =
  "Пропуснахме обаждането Ви до {business}. Обадете се пак, когато Ви е удобно — насреща сме!";

// Vapi endedReason strings are long/dotted (e.g. "call.in-progress.error-...").
// Match by substring; treat ANY reason containing "error" as a miss.
const MISS_REASON_TOKENS = [
  "silence-timed-out",
  "did-not-answer",
  "no-answer",
  "customer-busy",
  "voicemail",
  "did-not-receive-customer-audio",
];

export function isMissEndedReason(reason: string | null): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  if (r.includes("error")) return true;
  return MISS_REASON_TOKENS.some((t) => r.includes(t));
}

// BG mobile numbers are 08X nationally -> +3598XXXXXXXX (9 digits after +359,
// first is 8). Landlines are +3592.../+35932... etc. Foreign numbers are
// skipped (cost-safety for a BG service business).
export function isLikelyBgMobile(e164: string | null): boolean {
  return !!e164 && /^\+3598\d{8}$/.test(e164);
}

export type MissedCallInput = {
  callerNumber: string | null;
  endedReason: string | null;
  durationSeconds: number | null;
  disposition: string | null; // calls.disposition (post phone-injection)
  capturedIntent: boolean; // real content (name/service/city/appointment), NOT phone
};

export function classifyMissedCall(i: MissedCallInput): { isMiss: boolean; reason: string } {
  if (!isLikelyBgMobile(i.callerNumber)) return { isMiss: false, reason: "no_mobile" };
  if (i.disposition === "spam" || i.disposition === "wrong_number")
    return { isMiss: false, reason: `disposition_${i.disposition}` };
  if (i.capturedIntent) return { isMiss: false, reason: "captured_intent" };
  if (isMissEndedReason(i.endedReason)) return { isMiss: true, reason: "ended_reason" };
  if (typeof i.durationSeconds === "number" && i.durationSeconds < SHORT_CALL_SECONDS)
    return { isMiss: true, reason: "short_call" };
  return { isMiss: false, reason: "engaged_no_capture" };
}

export function buildMissedCallSms(template: string | null, vars: { business: string }): string {
  const base = (template && template.trim()) || DEFAULT_MISSED_CALL_TEMPLATE;
  return base.replace(/\{business\}/g, vars.business);
}

export function missDedupeKey(e164: string, sofiaDate: string): string {
  return `miss:${e164}:${sofiaDate}`;
}
