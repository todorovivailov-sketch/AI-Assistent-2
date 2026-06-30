import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export function buildOwnerLeadEmail(lead: LeadInsert, orgName: string | null) {
  const name = lead.name ?? "Без име";
  const phone = lead.phone ?? "—";
  const service = lead.service_type ?? "—";
  const city = lead.city ?? "—";
  const isUrgent = lead.urgency === "emergency" || lead.urgency === "high";
  const subject = `${isUrgent ? "🔴 Спешна заявка" : "Нова заявка"} — ${name} (${service})`;
  const lines = [
    `Нова заявка от телефонния асистент${orgName ? ` за ${orgName}` : ""}.`,
    `Клиент: ${name}`,
    `Телефон: ${phone}`,
    `Услуга: ${service}`,
    `Локация: ${city}`,
    lead.preferred_time_text ? `Предпочитано време: ${lead.preferred_time_text}` : null,
    lead.ai_summary ? `Резюме: ${lead.ai_summary}` : null,
  ].filter(Boolean) as string[];
  return {
    subject,
    text: lines.join("\n"),
    html: `<div>${lines.map((line) => `<p>${line}</p>`).join("")}</div>`,
  };
}

export async function sendOwnerLeadEmail(input: {
  to: string | null;
  lead: LeadInsert;
  orgName: string | null;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = input.to ?? process.env.OWNER_NOTIFICATION_EMAIL ?? null;

  if (!apiKey || !to) {
    console.warn("Owner email skipped: missing RESEND_API_KEY or recipient");
    return { sent: false };
  }

  const { subject, text, html } = buildOwnerLeadEmail(input.lead, input.orgName);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.OWNER_NOTIFICATION_FROM ?? "AI Receptionist <onboarding@resend.dev>",
        to,
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      console.error("Owner email failed", res.status, await res.text());
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error("Owner email threw", error);
    return { sent: false };
  }
}
