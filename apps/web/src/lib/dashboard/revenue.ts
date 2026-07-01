// Pure revenue math for the Reports page. No DB, no network — unit-tested via scripts/test-revenue.mjs.

export type RevenueServiceInput = {
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
};

export type RevenueBookingInput = {
  serviceType: string | null;
  callStartedAt: string | null; // ISO instant of the call that booked this appointment
};

export type RevenueBusinessHour = {
  weekday: number; // 0=Sunday … 6=Saturday
  opensAt: string | null; // "HH:MM[:SS]"
  closesAt: string | null;
  isClosed: boolean;
};

export type RevenueInput = {
  bookings: RevenueBookingInput[]; // already filtered to isBooking()===true, within range
  leadsCount: number;
  services: RevenueServiceInput[];
  businessHours: RevenueBusinessHour[];
};

export type RevenueSummary = {
  currency: string | null;
  bookedValue: number;
  pipelineValue: number | null;
  afterHoursValue: number | null;
  avgBookingValue: number | null;
  bookedCount: number;
  pricedBookings: number;
  unpricedBookings: number;
  afterHoursCountable: boolean;
};

export type PriceIndex = { currency: string | null; priceByName: Map<string, number> };

export function servicePrice(service: RevenueServiceInput): number | null {
  const min = typeof service.priceMin === "number" && service.priceMin > 0 ? service.priceMin : null;
  const max = typeof service.priceMax === "number" && service.priceMax > 0 ? service.priceMax : null;
  if (min !== null && max !== null) return (min + max) / 2;
  return min ?? max ?? null;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("bg");
}

export function dominantCurrency(services: RevenueServiceInput[]): string | null {
  const counts = new Map<string, number>();
  for (const service of services) {
    if (servicePrice(service) === null) continue;
    const currency = (service.currency ?? "").trim();
    if (!currency) continue;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = currency;
    }
  }
  return best;
}

// Price lookup by service name, restricted to the dominant currency (off-currency services excluded).
export function buildPriceIndex(services: RevenueServiceInput[]): PriceIndex {
  const currency = dominantCurrency(services);
  const priceByName = new Map<string, number>();
  for (const service of services) {
    const price = servicePrice(service);
    if (price === null) continue;
    if (currency && (service.currency ?? "").trim() !== currency) continue;
    const key = normalizeName(service.name);
    if (key) priceByName.set(key, price);
  }
  return { currency, priceByName };
}

export function priceForServiceType(serviceType: string | null, index: PriceIndex): number | null {
  const key = normalizeName(serviceType);
  if (!key) return null;
  return index.priceByName.get(key) ?? null;
}

// Sofia-local weekday + minutes-since-midnight for an ISO instant (mirrors calendar-tools conventions).
export function sofiaMoment(startedAtISO: string): { weekday: number; minutes: number } | null {
  const date = new Date(startedAtISO);
  if (!Number.isFinite(date.getTime())) return null;
  const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Sofia", weekday: "short" }).format(date);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[weekdayName];
  if (weekday === undefined) return null;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!match) return null;
  return { weekday, minutes: Number(match[1]) * 60 + Number(match[2]) };
}

function toMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isOutsideWorkingHours(startedAtISO: string | null, hours: RevenueBusinessHour[]): boolean {
  if (!startedAtISO) return false;
  const moment = sofiaMoment(startedAtISO);
  if (!moment) return false;
  const day = hours.find((hour) => hour.weekday === moment.weekday);
  if (!day) return true;
  if (day.isClosed) return true;
  const opens = toMinutes(day.opensAt);
  const closes = toMinutes(day.closesAt);
  if (opens === null || closes === null) return true;
  return moment.minutes < opens || moment.minutes >= closes;
}

export function calculateRevenue(input: RevenueInput): RevenueSummary {
  const services = input.services ?? [];
  const bookings = input.bookings ?? [];
  const businessHours = input.businessHours ?? [];
  const index = buildPriceIndex(services);
  const hoursConfigured = businessHours.length > 0;

  let bookedValue = 0;
  let pricedBookings = 0;
  let afterHoursValue = 0;

  for (const booking of bookings) {
    const value = priceForServiceType(booking.serviceType, index);
    if (value === null) continue;
    bookedValue += value;
    pricedBookings += 1;
    if (hoursConfigured && isOutsideWorkingHours(booking.callStartedAt, businessHours)) {
      afterHoursValue += value;
    }
  }

  const bookedCount = bookings.length;
  const unpricedBookings = bookedCount - pricedBookings;

  let avgBookingValue: number | null = null;
  if (pricedBookings > 0) {
    avgBookingValue = bookedValue / pricedBookings;
  } else {
    const catalog = [...index.priceByName.values()];
    if (catalog.length > 0) {
      avgBookingValue = catalog.reduce((sum, price) => sum + price, 0) / catalog.length;
    }
  }

  return {
    currency: index.currency,
    bookedValue: Math.round(bookedValue),
    pipelineValue: avgBookingValue === null ? null : Math.round(input.leadsCount * avgBookingValue),
    afterHoursValue: hoursConfigured ? Math.round(afterHoursValue) : null,
    avgBookingValue: avgBookingValue === null ? null : Math.round(avgBookingValue),
    bookedCount,
    pricedBookings,
    unpricedBookings,
    afterHoursCountable: hoursConfigured,
  };
}

export function emptyRevenue(): RevenueSummary {
  return {
    currency: null,
    bookedValue: 0,
    pipelineValue: null,
    afterHoursValue: null,
    avgBookingValue: null,
    bookedCount: 0,
    pricedBookings: 0,
    unpricedBookings: 0,
    afterHoursCountable: false,
  };
}
