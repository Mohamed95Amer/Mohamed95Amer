import { z } from "zod";

export const rateAlertSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  whatsapp: z.string().trim().max(24).optional(),
  karat: z.union([z.literal(24), z.literal(22), z.literal(21), z.literal(18)]),
  frequency: z.enum(["daily", "target"]),
  targetRateAed: z.number().positive().max(100_000).optional(),
  consent: z.literal(true),
  locale: z.enum(["en", "ar"]),
  sourcePath: z.string().max(200).optional(),
  website: z.string().max(200).optional(),
}).refine((value) => value.frequency === "daily" || value.targetRateAed != null, { path: ["targetRateAed"], message: "target_required" });

export type RateAlertInput = z.infer<typeof rateAlertSchema>;

/** Keeps a leading + and digits; returns null for anything implausible. */
export function normalizeWhatsapp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * Decides whether a subscriber is due a message. Daily subscribers get one
 * message per Dubai day; target subscribers get one alert when the karat rate
 * is at or below their target, then wait 24 hours before alerting again.
 */
export function isAlertDue(
  sub: { frequency: "daily" | "target"; target_rate_aed: number | null; last_sent_at: string | null },
  karatRate: number,
  now: Date,
): boolean {
  if (!(karatRate > 0)) return false;
  const lastSent = sub.last_sent_at ? new Date(sub.last_sent_at) : null;
  if (sub.frequency === "daily") {
    if (!lastSent) return true;
    return dubaiDay(lastSent) !== dubaiDay(now);
  }
  if (sub.target_rate_aed == null || karatRate > sub.target_rate_aed) return false;
  return !lastSent || now.getTime() - lastSent.getTime() >= 24 * 3_600_000;
}

export function dubaiDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
