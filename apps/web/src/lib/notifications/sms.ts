import { createHash, createHmac } from "crypto";

const ZADARMA_API = "https://api.zadarma.com";
const SMS_METHOD = "/v1/sms/send/";

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.ZADARMA_API_KEY && process.env.ZADARMA_API_SECRET && process.env.ZADARMA_SMS_SENDER
  );
}

// Byte-compatible with PHP urlencode() / http_build_query(..., PHP_QUERY_RFC1738).
export function phpUrlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!~*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// ksort + http_build_query, matching the Zadarma PHP client exactly.
export function buildParamsString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${phpUrlencode(k)}=${phpUrlencode(params[k])}`)
    .join("&");
}

export function zadarmaAuthHeader(
  methodPath: string,
  paramsString: string,
  key: string,
  secret: string
): string {
  const md5hex = createHash("md5").update(paramsString).digest("hex");
  const hmacHex = createHmac("sha1", secret).update(methodPath + paramsString + md5hex).digest("hex");
  const signature = Buffer.from(hmacHex).toString("base64");
  return `${key}:${signature}`;
}

export function normalizeMsisdn(phone: string): string {
  let n = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0")) n = "359" + n.slice(1);
  return n;
}

export async function sendSms(input: {
  to: string;
  text: string;
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (!isSmsConfigured()) {
    console.warn("SMS skipped: Zadarma env not configured");
    return { sent: false, skipped: true };
  }
  const key = process.env.ZADARMA_API_KEY as string;
  const secret = process.env.ZADARMA_API_SECRET as string;
  const sender = process.env.ZADARMA_SMS_SENDER as string;

  const params: Record<string, string> = {
    number: normalizeMsisdn(input.to),
    message: input.text,
    caller_id: sender,
    format: "json",
  };
  const paramsString = buildParamsString(params);
  const authHeader = zadarmaAuthHeader(SMS_METHOD, paramsString, key, secret);

  try {
    const res = await fetch(`${ZADARMA_API}${SMS_METHOD}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: paramsString,
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
    if (!res.ok || json.status !== "success") {
      const error = json.message || `HTTP ${res.status}`;
      console.error("Zadarma SMS failed", error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (error) {
    console.error("Zadarma SMS threw", error);
    return { sent: false, error: String(error) };
  }
}
