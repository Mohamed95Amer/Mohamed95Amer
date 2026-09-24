export interface VendorWorkingHour {
  day_of_week: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
}

export const DEFAULT_VENDOR_WORKING_HOURS: VendorWorkingHour[] = Array.from({ length: 7 }, (_, day) => ({
  day_of_week: day,
  is_open: true,
  opens_at: "10:00",
  closes_at: "22:00",
}));

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

function minutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

/**
 * UAE time has no daylight-saving changes.  Shifting by UTC+4 lets us use UTC
 * calendar methods without depending on the Vercel region's local timezone.
 */
export function vendorRequestTiming(rows: VendorWorkingHour[] | null | undefined, now = new Date()) {
  const schedule = rows?.length === 7 ? rows : DEFAULT_VENDOR_WORKING_HOURS;
  const byDay = new Map(schedule.map((row) => [row.day_of_week, row]));
  const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const dubaiMidnightUtc = Date.UTC(
    dubaiNow.getUTCFullYear(),
    dubaiNow.getUTCMonth(),
    dubaiNow.getUTCDate(),
  ) - DUBAI_OFFSET_MS;

  for (let offset = 0; offset < 14; offset += 1) {
    const day = (dubaiNow.getUTCDay() + offset) % 7;
    const row = byDay.get(day);
    if (!row?.is_open) continue;
    const localDayStart = dubaiMidnightUtc + offset * 86_400_000;
    const openAt = new Date(localDayStart + minutes(row.opens_at) * 60_000);
    const closeAt = new Date(localDayStart + minutes(row.closes_at) * 60_000);
    const currentlyOpen = offset === 0 && now >= openAt && now < closeAt;
    if (currentlyOpen) {
      return {
        isOpenNow: true,
        availableAt: now,
        requestExpiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      };
    }
    if (openAt > now) {
      return {
        isOpenNow: false,
        availableAt: openAt,
        requestExpiresAt: new Date(openAt.getTime() + 24 * 60 * 60_000),
      };
    }
  }

  throw new Error("store_has_no_working_hours");
}

