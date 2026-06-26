const toneMap: Record<string, string> = {
  active: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200",
  lead: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  appointment: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  support: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  completed: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200",
  unknown: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  spam: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  wrong_number: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  new: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  booked: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200",
  qualified: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  requested: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  confirmed: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200",
  quoted: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  approved: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200",
  in_progress: "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200",
  high: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  emergency: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  normal: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  low: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
};

const labelMap: Record<string, string> = {
  active: "активно",
  lead: "заявка",
  appointment: "час",
  support: "инфо",
  completed: "завършен",
  unknown: "неясно",
  spam: "спам",
  wrong_number: "грешен номер",
  new: "нова",
  booked: "записан",
  qualified: "квалифициран",
  requested: "заявено",
  confirmed: "потвърдено",
  quoted: "оферта",
  approved: "одобрено",
  in_progress: "в ход",
  high: "спешно",
  emergency: "аварийно",
  normal: "нормално",
  low: "ниско",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-xs font-medium ${
        toneMap[value] ?? toneMap.normal
      }`}
    >
      {labelMap[value] ?? value}
    </span>
  );
}
