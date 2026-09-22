import { z } from "zod";

export function validUaeIban(value: string): boolean {
  if (!/^AE\d{21}$/.test(value)) return false;
  const rearranged = value.slice(4) + "1014" + value.slice(2, 4);
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

export function normalizeUaeMobile(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^05\d{8}$/.test(compact)) return `+971${compact.slice(1)}`;
  if (/^9715\d{8}$/.test(compact)) return `+${compact}`;
  return compact;
}

export function validUaeMobile(value: string): boolean {
  return /^\+9715\d{8}$/.test(normalizeUaeMobile(value));
}

export const bankSettingsSchema = z.object({
  aani_enabled: z.boolean().default(false),
  aani_mobile: z.string().trim().max(24).default("").transform(normalizeUaeMobile),
  bank_transfer_enabled: z.boolean(),
  cash_enabled: z.boolean().default(true),
  card_enabled: z.boolean().default(false),
  delivery_mode: z.enum(["own_staff", "external_courier"]).default("own_staff"),
  courier_name: z.string().trim().max(120).default(""),
  delivery_fee_aed: z.number().min(0).max(60).nullable().default(null),
  bank_name: z.string().trim().max(120),
  beneficiary_name: z.string().trim().max(200),
  iban: z.string().transform(value => value.replace(/\s/g, "").toUpperCase()),
}).superRefine((value, ctx) => {
  if (value.delivery_mode === "external_courier" && !value.courier_name) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter your appointed courier." });
  if (value.bank_transfer_enabled && (!validUaeIban(value.iban) || value.bank_name.length < 2 || value.beneficiary_name.length < 2)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter the vendor's bank, beneficiary and a valid UAE IBAN." });
  }
  if (value.aani_enabled && !validUaeMobile(value.aani_mobile)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["aani_mobile"], message: "Enter the UAE mobile number registered with Aani." });
  }
});

export function proofMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return "image/png";
  if (new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-") return "application/pdf";
  return null;
}
