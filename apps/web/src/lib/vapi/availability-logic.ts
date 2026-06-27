export type AvailabilityWindow = {
  startsAt: Date;
  endsAt: Date;
};

export type IntervalAvailabilityReason = "too_soon" | "outside_business_hours" | "conflict";

export type IntervalAvailabilityResult =
  | {
      available: true;
    }
  | {
      available: false;
      reason: IntervalAvailabilityReason;
    };

export function getIntervalAvailability(input: {
  startsAt: Date;
  endsAt: Date;
  workingWindows: AvailabilityWindow[];
  existing: AvailabilityWindow[];
  bufferMinutes: number;
  minNoticeAt: Date;
}): IntervalAvailabilityResult {
  if (input.startsAt < input.minNoticeAt) {
    return { available: false, reason: "too_soon" };
  }

  const insideWorkingWindow = input.workingWindows.some(
    (window) => input.startsAt >= window.startsAt && input.endsAt <= window.endsAt
  );

  if (!insideWorkingWindow) {
    return { available: false, reason: "outside_business_hours" };
  }

  if (hasBufferedConflict(input.existing, input.startsAt, input.endsAt, input.bufferMinutes)) {
    return { available: false, reason: "conflict" };
  }

  return { available: true };
}

export function hasBufferedConflict(
  existing: AvailabilityWindow[],
  startsAt: Date,
  endsAt: Date,
  bufferMinutes: number
) {
  const bufferedStart = new Date(startsAt.getTime() - bufferMinutes * 60 * 1000);
  const bufferedEnd = new Date(endsAt.getTime() + bufferMinutes * 60 * 1000);

  return existing.some((appointment) => appointment.startsAt < bufferedEnd && appointment.endsAt > bufferedStart);
}
