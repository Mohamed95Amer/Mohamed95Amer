import { z } from "zod";
export const campaignSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(2).max(600),
    title_ar: z.string().trim().max(120).default(""),
    body_ar: z.string().trim().max(600).default(""),
    href: z
      .string()
      .trim()
      .max(300)
      .regex(
        /^\/(?!\/)[a-zA-Z0-9/?#=&_%+.-]*$/,
        "Use a local website path such as /marketplace",
      ),
    audience: z.enum(["customers", "buyers", "new_customers"]),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
  })
  .refine(
    (v) =>
      Date.parse(v.ends_at) > Date.parse(v.starts_at) &&
      Date.parse(v.ends_at) - Date.parse(v.starts_at) <= 90 * 86400000,
    "Choose an end date within 90 days of the start",
  );
export type Campaign = z.infer<typeof campaignSchema> & {
  id: string;
  published_at: string | null;
  cancelled_at: string | null;
};
export function campaignStatus(
  c: Pick<Campaign, "published_at" | "cancelled_at" | "starts_at" | "ends_at">,
  now = Date.now(),
) {
  if (c.cancelled_at) return "Cancelled";
  if (!c.published_at) return "Draft";
  if (Date.parse(c.ends_at) <= now) return "Expired";
  return Date.parse(c.starts_at) > now ? "Scheduled" : "Live";
}
