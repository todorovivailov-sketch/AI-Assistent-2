// Vapi call deletion. Server-only (reads VAPI_PRIVATE_KEY / VAPI_API_KEY).
// DELETE /call/{id} removes the call record incl. its recording on Vapi.
const VAPI_BASE = "https://api.vapi.ai";

function vapiKey(): string {
  const key = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY;
  if (!key) throw new Error("VAPI key missing");
  return key;
}

/** Pure path builder (unit-tested). */
export function vapiDeleteCallPath(vapiCallId: string): string {
  return `/call/${encodeURIComponent(vapiCallId)}`;
}

/** Best-effort delete. Returns true on 2xx, false on any error — never throws. */
export async function deleteVapiCall(vapiCallId: string): Promise<boolean> {
  if (!vapiCallId) return false;
  try {
    const res = await fetch(`${VAPI_BASE}${vapiDeleteCallPath(vapiCallId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${vapiKey()}` },
    });
    return res.status < 300;
  } catch {
    return false;
  }
}
