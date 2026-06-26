import { CalendarCheck, ClipboardList, PhoneCall, Users } from "lucide-react";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

type JsonRecord = Record<string, Json | undefined>;

export type DashboardCall = {
  id: string;
  time: string;
  caller: string;
  type: string;
  city: string;
  duration: string;
  status: string;
  summary: string;
};

export type DashboardLead = {
  id: string;
  name: string;
  phone: string;
  service: string;
  city: string;
  urgency: string;
  status: string;
  summary: string;
};

export async function getRecentCalls(limit = 10): Promise<DashboardCall[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("calls")
    .select("id, caller_number, disposition, status, started_at, duration_seconds, summary, structured_data")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Could not load calls", error);
    return [];
  }

  return data.map((call) => {
    const details = asRecord(call.structured_data);
    const service = readString(details.service) ?? readString(details.service_type) ?? readString(details.serviceType);
    const city = formatLocation(details);

    return {
      id: call.id,
      time: formatTime(call.started_at),
      caller: call.caller_number ?? "Няма номер",
      type: service ?? call.disposition ?? "Обаждане",
      city: city ?? "Няма град",
      duration: formatDuration(call.duration_seconds),
      status: call.disposition ?? call.status ?? "unknown",
      summary: call.summary ?? "Има записан разговор, но все още няма резюме.",
    };
  });
}

export async function getRecentLeads(limit = 10): Promise<DashboardLead[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, city, service_type, urgency, status, ai_summary")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Could not load leads", error);
    return [];
  }

  return data.map((lead) => ({
    id: lead.id,
    name: lead.name ?? "Без име",
    phone: lead.phone ?? "Няма телефон",
    service: lead.service_type ?? "Няма услуга",
    city: lead.city ?? "Няма град",
    urgency: lead.urgency ?? "normal",
    status: lead.status,
    summary: lead.ai_summary ?? "Няма резюме.",
  }));
}

export async function getDashboardMetrics() {
  const supabase = getSupabaseServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [callsResult, leadsResult, appointmentsResult, ordersResult] = await Promise.all([
    supabase.from("calls").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).in("status", ["requested", "confirmed"]),
    supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["approved", "in_progress"]),
  ]);

  return [
    {
      label: "Обаждания 24ч",
      value: String(callsResult.count ?? 0),
      delta: "реални данни",
      icon: PhoneCall,
      tone: "teal",
    },
    {
      label: "Нови заявки",
      value: String(leadsResult.count ?? 0),
      delta: "от разговори",
      icon: Users,
      tone: "blue",
    },
    {
      label: "Записани часове",
      value: String(appointmentsResult.count ?? 0),
      delta: "предстои calendar",
      icon: CalendarCheck,
      tone: "amber",
    },
    {
      label: "Поръчки в ход",
      value: String(ordersResult.count ?? 0),
      delta: "предстои CRM",
      icon: ClipboardList,
      tone: "red",
    },
  ];
}

function formatTime(value: string | null): string {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function readString(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function formatLocation(data: JsonRecord): string | null {
  const city = readString(data.city) ?? readString(data.town);
  const district = readString(data.district) ?? readString(data.neighborhood);

  if (city && district) return `${city}, ${district}`;
  return city ?? district ?? readString(data.address);
}

function asRecord(value: Json): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
