import type { Database, Json } from "@/types/database";

type JsonRecord = Record<string, unknown>;
type CallInsert = Database["public"]["Tables"]["calls"]["Insert"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export type VapiMessage = {
  type: string;
  call: JsonRecord;
  payload: JsonRecord;
};

export type OrganizationResolution = {
  organizationId: string;
  phoneNumberId: string | null;
  assistantId: string | null;
};

export function getVapiMessage(payload: unknown): VapiMessage {
  const root = asRecord(payload);
  const message = asRecord(root.message ?? root);
  const call = asRecord(message.call);
  const type = readString(message.type) ?? "unknown";

  return { type, call, payload: root };
}

export function getExternalEventId(message: VapiMessage): string | null {
  const explicit =
    readString(message.payload.id) ??
    readString(asRecord(message.payload.message).id) ??
    readString(message.call.id);

  if (explicit && message.type !== "unknown") {
    return `${message.type}:${explicit}`;
  }

  const timestamp =
    readString(message.payload.timestamp) ?? readString(asRecord(message.payload.message).timestamp);

  if (timestamp) {
    return `${message.type}:${timestamp}`;
  }

  return null;
}

export function getPhoneNumberCandidates(message: VapiMessage): {
  e164: string | null;
  vapiPhoneNumberId: string | null;
} {
  const rootPhoneNumber = asRecord(message.payload.phoneNumber);
  const messagePhoneNumber = asRecord(asRecord(message.payload.message).phoneNumber);
  const callPhoneNumber = asRecord(message.call.phoneNumber);

  return {
    e164:
      normalizeE164(readString(rootPhoneNumber.number)) ??
      normalizeE164(readString(messagePhoneNumber.number)) ??
      normalizeE164(readString(callPhoneNumber.number)) ??
      normalizeE164(readString(message.call.phoneNumberNumber)),
    vapiPhoneNumberId:
      readString(rootPhoneNumber.id) ??
      readString(messagePhoneNumber.id) ??
      readString(callPhoneNumber.id) ??
      readString(message.call.phoneNumberId),
  };
}

export function getAssistantCandidate(message: VapiMessage): string | null {
  const rootAssistant = asRecord(message.payload.assistant);
  const messageAssistant = asRecord(asRecord(message.payload.message).assistant);
  const callAssistant = asRecord(message.call.assistant);

  return (
    readString(rootAssistant.id) ??
    readString(messageAssistant.id) ??
    readString(callAssistant.id) ??
    readString(message.call.assistantId)
  );
}

export function buildCallInsert(
  message: VapiMessage,
  resolution: OrganizationResolution
): CallInsert | null {
  const callId = readString(message.call.id) ?? readString(asRecord(message.payload.message).callId);

  if (!callId) {
    return null;
  }

  const webhookMessage = asRecord(message.payload.message);
  const artifact = asRecord(webhookMessage.artifact ?? message.payload.artifact);
  const analysis = asRecord(webhookMessage.analysis ?? message.call.analysis);
  const baseStructuredData = asRecord(analysis.structuredData ?? analysis.structured_data);
  const recording = asRecord(artifact.recording);
  const startedAt = readDateString(message.call.startedAt) ?? readDateString(message.call.createdAt);
  const endedAt =
    readDateString(message.call.endedAt) ??
    readDateString(webhookMessage.endedAt) ??
    readDateString(webhookMessage.timestamp);
  const callerNumber = getCallerNumber(message);
  const transcript = readString(artifact.transcript) ?? readString(webhookMessage.transcript);
  const structuredData = inferStructuredData(baseStructuredData, transcript, callerNumber);
  const summary =
    readString(analysis.summary) ??
    readString(webhookMessage.summary) ??
    buildTranscriptSummary(transcript, structuredData, callerNumber);

  return {
    organization_id: resolution.organizationId,
    phone_number_id: resolution.phoneNumberId,
    assistant_id: resolution.assistantId,
    vapi_call_id: callId,
    caller_number: callerNumber,
    direction: normalizeDirection(readString(message.call.type)),
    status: message.type === "end-of-call-report" ? "completed" : normalizeStatus(readString(message.call.status)),
    disposition: inferDisposition(structuredData),
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: getDurationSeconds(message, startedAt, endedAt),
    cost_amount: readNumber(message.call.cost) ?? readNumber(webhookMessage.cost),
    cost_currency: readString(message.call.costCurrency) ?? "USD",
    recording_url:
      readString(recording.url) ??
      readString(recording.stereoUrl) ??
      readString(artifact.recordingUrl) ??
      null,
    transcript,
    summary,
    structured_data: structuredData as Json,
    raw_payload: message.payload as Json,
  };
}

export function buildLeadInsert(callId: string, callInsert: CallInsert): LeadInsert | null {
  const data = asRecord(callInsert.structured_data);
  const name = readString(data.name) ?? readString(data.customerName) ?? readString(data.customer_name);
  const phone =
    normalizeE164(readString(data.phone)) ??
    normalizeE164(readString(data.customerPhone)) ??
    normalizeE164(readString(data.customer_phone)) ??
    callInsert.caller_number ??
    null;
  const serviceType =
    readString(data.serviceType) ??
    readString(data.service_type) ??
    readString(data.service) ??
    null;
  const city = formatLocation(data);
  const address =
    readString(data.address) ?? readString(data.district) ?? readString(data.neighborhood);
  const summary = callInsert.summary ?? null;

  if (!name && !phone && !serviceType && !city && !summary) {
    return null;
  }

  return {
    organization_id: callInsert.organization_id,
    call_id: callId,
    status: callInsert.disposition === "appointment" ? "booked" : "new",
    name: name ?? null,
    phone,
    email: readString(data.email) ?? null,
    city: city ?? null,
    address: address ?? null,
    service_type: serviceType,
    urgency: normalizeUrgency(readString(data.urgency)),
    source: "phone",
    preferred_time_text:
      readString(data.preferredTime) ??
      readString(data.preferred_time) ??
      readString(data.preferredSlot) ??
      null,
    ai_summary: summary,
  };
}

function getCallerNumber(message: VapiMessage): string | null {
  const customer = asRecord(message.call.customer);
  const rootCustomer = asRecord(message.payload.customer);
  const messageCustomer = asRecord(asRecord(message.payload.message).customer);

  return (
    normalizeE164(readString(customer.number)) ??
    normalizeE164(readString(rootCustomer.number)) ??
    normalizeE164(readString(messageCustomer.number)) ??
    normalizeE164(readString(message.call.customerNumber)) ??
    normalizeE164(readString(message.call.from)) ??
    null
  );
}

function getDurationSeconds(message: VapiMessage, startedAt: string | null, endedAt: string | null): number | null {
  const explicit =
    readNumber(message.call.durationSeconds) ??
    readNumber(message.call.duration) ??
    readNumber(asRecord(message.payload.message).durationSeconds);

  if (explicit !== null) {
    return Math.max(0, Math.round(explicit));
  }

  if (!startedAt || !endedAt) {
    return null;
  }

  const diff = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff / 1000)) : null;
}

function inferStructuredData(data: JsonRecord, transcript: string | null, callerNumber: string | null): JsonRecord {
  const inferred: JsonRecord = { ...data };

  if (!readString(inferred.phone) && callerNumber) {
    inferred.phone = callerNumber;
  }

  if (!transcript) {
    return inferred;
  }

  if (!readString(inferred.name)) {
    const name = findUserResponseAfterAiQuestion(transcript, ["име"]);
    if (name) {
      inferred.name = cleanRepeatedAnswer(name);
    }
  }

  if (!readString(inferred.service) && !readString(inferred.serviceType) && !readString(inferred.service_type)) {
    const service = inferServiceFromTranscript(transcript);
    if (service) {
      inferred.service = service;
    }
  }

  if (!readString(inferred.city) && !readString(inferred.town)) {
    const city = inferCityFromTranscript(transcript);
    if (city) {
      inferred.city = city;
    }
  }

  if (!readString(inferred.district) && !readString(inferred.neighborhood)) {
    const district = inferDistrictFromTranscript(transcript);
    if (district) {
      inferred.district = district;
    }
  }

  return inferred;
}

function buildTranscriptSummary(
  transcript: string | null,
  data: JsonRecord,
  callerNumber: string | null
): string | null {
  if (!transcript) {
    return null;
  }

  const name = readString(data.name);
  const service =
    readString(data.service) ?? readString(data.serviceType) ?? readString(data.service_type);
  const phone = readString(data.phone) ?? callerNumber;
  const location = formatLocation(data);
  const parts = [
    name ? `Клиент: ${name}` : null,
    service ? `Услуга: ${service}` : null,
    location ? `Локация: ${location}` : null,
    phone ? `Телефон: ${phone}` : null,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(". ");
  }

  const firstUserLine = getTranscriptTurns(transcript).find((turn) => turn.speaker === "user")?.text;
  return firstUserLine ? `Обаждане: ${firstUserLine}` : "Обаждането има записан транскрипт.";
}

function findUserResponseAfterAiQuestion(transcript: string, questionTokens: string[]): string | null {
  const turns = getTranscriptTurns(transcript);

  for (let index = 0; index < turns.length - 1; index += 1) {
    const current = turns[index];
    const next = turns[index + 1];
    const currentText = current.text.toLowerCase();

    if (
      current.speaker === "ai" &&
      next.speaker === "user" &&
      questionTokens.some((token) => currentText.includes(token))
    ) {
      return next.text;
    }
  }

  return null;
}

function inferServiceFromTranscript(transcript: string): string | null {
  const serviceMap: Array<[string, string]> = [
    ["монтаж", "Монтаж"],
    ["ремонт", "Ремонт"],
    ["профилактика", "Профилактика"],
    ["термопомпа", "Термопомпа"],
    ["оферта", "Оферта"],
  ];
  const userText = getTranscriptTurns(transcript)
    .filter((turn) => turn.speaker === "user")
    .map((turn) => turn.text.toLowerCase())
    .join("\n");

  return serviceMap.find(([token]) => userText.includes(token))?.[1] ?? null;
}

function inferCityFromTranscript(transcript: string): string | null {
  const cityMap: Array<[string, string]> = [
    ["софия", "София"],
    ["пловдив", "Пловдив"],
    ["варна", "Варна"],
    ["бургас", "Бургас"],
    ["русе", "Русе"],
    ["стара загора", "Стара Загора"],
    ["плевен", "Плевен"],
    ["добрич", "Добрич"],
    ["сливен", "Сливен"],
    ["шумен", "Шумен"],
    ["перник", "Перник"],
    ["банкя", "Банкя"],
  ];
  const userText = getTranscriptTurns(transcript)
    .filter((turn) => turn.speaker === "user")
    .map((turn) => turn.text.toLowerCase())
    .join("\n");

  return cityMap.find(([token]) => userText.includes(token))?.[1] ?? null;
}

function inferDistrictFromTranscript(transcript: string): string | null {
  const districtMap: Array<[string, string]> = [
    ["красно село", "Красно село"],
    ["люлин", "Люлин"],
    ["младост", "Младост"],
    ["дружба", "Дружба"],
    ["надежда", "Надежда"],
    ["овча купел", "Овча купел"],
    ["лозенец", "Лозенец"],
    ["център", "Център"],
    ["обеля", "Обеля"],
    ["хаджи димитър", "Хаджи Димитър"],
    ["студентски град", "Студентски град"],
    ["враждебна", "Враждебна"],
    ["горна баня", "Горна баня"],
    ["драгалевци", "Драгалевци"],
    ["бояна", "Бояна"],
    ["симеоново", "Симеоново"],
  ];
  const userText = getTranscriptTurns(transcript)
    .filter((turn) => turn.speaker === "user")
    .map((turn) => turn.text.toLowerCase())
    .join("\n");
  const knownDistrict = districtMap.find(([token]) => userText.includes(token))?.[1];

  if (knownDistrict) {
    return knownDistrict;
  }

  const answer = findUserResponseAfterAiQuestion(transcript, ["квартал", "адрес"]);
  return answer ? cleanLocationAnswer(answer) : null;
}

function formatLocation(data: JsonRecord): string | null {
  const city = readString(data.city) ?? readString(data.town);
  const district = readString(data.district) ?? readString(data.neighborhood);

  if (city && district) return `${city}, ${district}`;
  return city ?? district ?? readString(data.address);
}

function cleanLocationAnswer(value: string): string {
  return value
    .replace(/[.!?]+$/g, "")
    .replace(/^само\s+/i, "")
    .trim();
}

function cleanRepeatedAnswer(value: string): string {
  const parts = value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }

  return value.trim();
}

function getTranscriptTurns(transcript: string): Array<{ speaker: "ai" | "user"; text: string }> {
  return transcript
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(AI|User):\s*(.+)$/i.exec(line.trim());
      if (!match) {
        return null;
      }

      return {
        speaker: match[1].toLowerCase() === "ai" ? "ai" : "user",
        text: match[2].trim(),
      } as { speaker: "ai" | "user"; text: string };
    })
    .filter((turn): turn is { speaker: "ai" | "user"; text: string } => Boolean(turn));
}

function inferDisposition(data: JsonRecord): CallInsert["disposition"] {
  const status = `${readString(data.disposition) ?? ""} ${readString(data.outcome) ?? ""}`.toLowerCase();

  if (status.includes("appointment") || status.includes("book")) return "appointment";
  if (status.includes("spam")) return "spam";
  if (status.includes("support")) return "support";
  if (status.includes("wrong")) return "wrong_number";

  const hasLeadData =
    readString(data.name) ||
    readString(data.phone) ||
    readString(data.service) ||
    readString(data.serviceType) ||
    readString(data.city);

  return hasLeadData ? "lead" : "unknown";
}

function normalizeDirection(value: string | null): string {
  if (value === "outbound") return "outbound";
  return "inbound";
}

function normalizeStatus(value: string | null): string {
  if (!value) return "completed";
  if (value === "in-progress") return "in_progress";
  if (value === "no-answer") return "no_answer";
  if (["queued", "ringing", "completed", "failed", "missed", "no_answer"].includes(value)) return value;
  return "completed";
}

function normalizeUrgency(value: string | null): LeadInsert["urgency"] {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["low", "normal", "high", "emergency"].includes(normalized)) return normalized;
  if (normalized.includes("спеш") || normalized.includes("urgent")) return "emergency";
  return "normal";
}

function normalizeE164(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[^\d+]/g, "");

  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("359")) return `+${compact}`;

  return null;
}

function readDateString(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
