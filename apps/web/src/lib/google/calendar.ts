import { createSign } from "crypto";

export type GoogleCalendarEvent = {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  htmlLink: string | null;
  privateProperties: Record<string, string>;
};

export type CreateGoogleCalendarEventInput = {
  calendarId: string | null;
  organizationId: string;
  appointmentId: string;
  summary: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
};

type JsonRecord = Record<string, unknown>;

type GoogleCalendarConfig = {
  calendarId: string;
  clientEmail: string;
  privateKey: string;
};

const googleCalendarScope = "https://www.googleapis.com/auth/calendar";
const googleTokenUrl = "https://oauth2.googleapis.com/token";

let cachedAccessToken: { token: string; expiresAtMs: number; cacheKey: string } | null = null;
let warnedAboutMissingGoogleConfig = false;

export function isGoogleCalendarConfigured(calendarId: string | null | undefined) {
  return Boolean(getGoogleCalendarConfig(calendarId));
}

export async function listGoogleCalendarEvents(input: {
  calendarId: string | null;
  timeMin: Date;
  timeMax: Date;
  timeZone: string;
}): Promise<GoogleCalendarEvent[]> {
  const config = getGoogleCalendarConfig(input.calendarId);

  if (!config) {
    return [];
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("timeMin", input.timeMin.toISOString());
  url.searchParams.set("timeMax", input.timeMax.toISOString());
  url.searchParams.set("timeZone", input.timeZone);

  const data = await googleCalendarFetch<JsonRecord>(config, url, { method: "GET" });
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item) => parseGoogleCalendarEvent(asRecord(item)))
    .filter((event): event is GoogleCalendarEvent => Boolean(event));
}

export async function createGoogleCalendarEvent(input: CreateGoogleCalendarEventInput) {
  const config = getGoogleCalendarConfig(input.calendarId);

  if (!config) {
    return null;
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`
  );
  url.searchParams.set("sendUpdates", "none");

  const data = await googleCalendarFetch<JsonRecord>(config, url, {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: {
        dateTime: input.startsAt.toISOString(),
        timeZone: input.timeZone,
      },
      end: {
        dateTime: input.endsAt.toISOString(),
        timeZone: input.timeZone,
      },
      extendedProperties: {
        private: {
          aiReceptionistAppointmentId: input.appointmentId,
          aiReceptionistOrganizationId: input.organizationId,
        },
      },
    }),
  });
  const id = readString(data.id);

  if (!id) {
    throw new Error("Google Calendar did not return an event id.");
  }

  return {
    id,
    htmlLink: readString(data.htmlLink),
  };
}

export type UpdateGoogleCalendarEventInput = {
  calendarId: string | null;
  eventId: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
};

// Patches an existing event so a dashboard reschedule/edit keeps Google Calendar in
// sync (otherwise the GCal->DB sync would revert the change). No-ops and returns null
// when Google Calendar is not configured, exactly like createGoogleCalendarEvent.
export async function updateGoogleCalendarEvent(input: UpdateGoogleCalendarEventInput) {
  const config = getGoogleCalendarConfig(input.calendarId);

  if (!config) {
    return null;
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(input.eventId)}`
  );
  url.searchParams.set("sendUpdates", "none");

  const data = await googleCalendarFetch<JsonRecord>(config, url, {
    method: "PATCH",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: {
        dateTime: input.startsAt.toISOString(),
        timeZone: input.timeZone,
      },
      end: {
        dateTime: input.endsAt.toISOString(),
        timeZone: input.timeZone,
      },
    }),
  });

  return {
    id: readString(data.id) ?? input.eventId,
    htmlLink: readString(data.htmlLink),
  };
}

function getGoogleCalendarConfig(calendarId: string | null | undefined): GoogleCalendarConfig | null {
  if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED !== "true") {
    return null;
  }

  const configuredCalendarId = readText(calendarId) ?? readEnv("GOOGLE_CALENDAR_DEFAULT_ID");
  const clientEmail = readEnv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL");
  const privateKey = normalizePrivateKey(process.env.GOOGLE_CALENDAR_PRIVATE_KEY);

  if (!configuredCalendarId || !clientEmail || !privateKey) {
    if (!warnedAboutMissingGoogleConfig) {
      warnedAboutMissingGoogleConfig = true;
      console.warn(
        "Google Calendar sync is enabled but missing calendar id, service account email, or private key."
      );
    }

    return null;
  }

  return {
    calendarId: configuredCalendarId,
    clientEmail,
    privateKey,
  };
}

async function googleCalendarFetch<T>(
  config: GoogleCalendarConfig,
  url: URL,
  init: RequestInit
): Promise<T> {
  const accessToken = await getGoogleAccessToken(config);
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await response.text();
  const body = text ? parseJson(text) : {};

  if (!response.ok) {
    throw new Error(`Google Calendar API ${response.status}: ${JSON.stringify(body)}`);
  }

  return body as T;
}

async function getGoogleAccessToken(config: GoogleCalendarConfig) {
  const cacheKey = config.clientEmail;
  const now = Date.now();

  if (cachedAccessToken && cachedAccessToken.cacheKey === cacheKey && cachedAccessToken.expiresAtMs > now + 60_000) {
    return cachedAccessToken.token;
  }

  const iat = Math.floor(now / 1000);
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      iss: config.clientEmail,
      scope: googleCalendarScope,
      aud: googleTokenUrl,
      iat,
      exp: iat + 3600,
    },
    config.privateKey
  );
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const text = await response.text();
  const body = text ? parseJson(text) : {};

  if (!response.ok) {
    throw new Error(`Google OAuth ${response.status}: ${JSON.stringify(body)}`);
  }

  const token = readString(asRecord(body).access_token);
  const expiresIn = readNumber(asRecord(body).expires_in) ?? 3600;

  if (!token) {
    throw new Error("Google OAuth did not return an access token.");
  }

  cachedAccessToken = {
    token,
    expiresAtMs: now + expiresIn * 1000,
    cacheKey,
  };

  return token;
}

function signJwt(header: JsonRecord, payload: JsonRecord, privateKey: string) {
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);

  return `${unsigned}.${base64Url(signature)}`;
}

function parseGoogleCalendarEvent(item: JsonRecord): GoogleCalendarEvent | null {
  const id = readString(item.id);
  const startsAt = parseGoogleDate(asRecord(item.start));
  const endsAt = parseGoogleDate(asRecord(item.end));

  if (!id || !startsAt || !endsAt || endsAt <= startsAt) {
    return null;
  }

  return {
    id,
    summary: readString(item.summary),
    description: readString(item.description),
    location: readString(item.location),
    startsAt,
    endsAt,
    htmlLink: readString(item.htmlLink),
    privateProperties: readStringRecord(asRecord(asRecord(item.extendedProperties).private)),
  };
}

function parseGoogleDate(value: JsonRecord) {
  const dateTime = readString(value.dateTime);

  if (dateTime) {
    const parsed = new Date(dateTime);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const date = readString(value.date);

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}

function readEnv(name: string, fallback?: string | null) {
  const value = process.env[name] ?? fallback ?? null;
  return readText(value);
}

function normalizePrivateKey(value: string | undefined) {
  if (!value || value.trim() === "") {
    return null;
  }

  return value
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/^'|'$/g, "")
    .replace(/\\n/g, "\n");
}

function base64UrlJson(value: JsonRecord) {
  return base64Url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
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
  return readText(value);
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readStringRecord(value: JsonRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
