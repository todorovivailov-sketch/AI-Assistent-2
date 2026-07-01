import { NextResponse } from "next/server";

import { toCsv } from "@/lib/dashboard/csv";
import { getReportsExportRows } from "@/lib/dashboard/data";
import { parseReportsRange } from "@/lib/dashboard/reports-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const range = parseReportsRange({
    range: params.get("range") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const rows = await getReportsExportRows({ from: range.from, to: range.to });
  const header = ["Име", "Телефон", "Услуга", "Дата/час", "Статус", "Стойност", "Валута"];
  const body = rows.map((row) => [
    row.customerName,
    row.customerPhone,
    row.serviceType,
    row.startsAt ?? "",
    row.status,
    row.estimatedValue ?? "",
    row.currency ?? "",
  ]);
  const csv = toCsv(header, body);

  const fromLabel = range.from.toISOString().slice(0, 10);
  const toLabel = range.to.toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${fromLabel}-${toLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
