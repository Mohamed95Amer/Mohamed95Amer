/**
 * Turning a vendor's spreadsheet into product rows.
 *
 * The whole value of this file is in the error messages. A vendor who uploads
 * 200 rows and gets back "invalid input" has no way forward; what they need is
 * the line, the column and what was wrong with it, so they can fix the file in
 * the spreadsheet they already have open. So every rejection below carries all
 * three, and nothing is ever quietly dropped or guessed at.
 *
 * Checked by scripts/bulk.test.ts (`npm run test:bulk`).
 */
import { parseCsvRows, CsvError, toCsv } from "@/lib/csv";
import { bulkProductRowSchema } from "@/lib/validation/schemas";
import type { z } from "zod";

export type BulkProductRow = z.infer<typeof bulkProductRowSchema>;

/** A file bigger than this is almost certainly a mistake, and is slow to echo
 *  back with per-row errors. Mirrors the bound in bulkProductUploadSchema. */
export const BULK_MAX_BYTES = 1_000_000;
/** One statement inserts the lot, so this bounds the statement, not a loop. */
export const BULK_MAX_ROWS = 500;

export interface BulkIssue {
  /** 1-based line in the uploaded file, as a spreadsheet numbers it. Null for
   *  problems with the file as a whole. */
  line: number | null;
  /** Column header the problem belongs to, when it belongs to one. */
  column: string | null;
  message: string;
}

export interface BulkParsedRow {
  line: number;
  product: BulkProductRow;
}

export interface BulkParseResult {
  rows: BulkParsedRow[];
  issues: BulkIssue[];
}

const CATEGORIES = [
  "ring", "necklace", "bracelet", "earring", "bangle", "chain", "pendant", "bar", "coin", "other",
] as const;

const KARATS = [12, 14, 16, 18, 21, 22, 24] as const;

interface ColumnSpec {
  /** Header as written in the template. */
  key: string;
  required: boolean;
  /** Shown in the template's second row and in the UI's column reference. */
  example: string;
  hint: string;
}

/**
 * The columns, in template order. Required ones have no sensible default: a
 * product without a weight has no price, so guessing one would be inventing
 * inventory.
 */
export const BULK_COLUMNS: ColumnSpec[] = [
  { key: "name", required: true, example: "22K Classic Bangle", hint: "2–200 characters" },
  { key: "category", required: true, example: "bangle", hint: CATEGORIES.join(", ") },
  { key: "karat", required: true, example: "22", hint: KARATS.join(", ") },
  { key: "weight_grams", required: true, example: "12.500", hint: "grams, greater than 0" },
  { key: "quantity", required: false, example: "1", hint: "whole number, defaults to 1" },
  { key: "making_charge", required: false, example: "150", hint: "AED per item, defaults to 0" },
  {
    key: "making_charge_discount_percent",
    required: false,
    example: "0",
    hint: "0–100, defaults to 0; needs a making charge above 0",
  },
  { key: "certificate_fee", required: false, example: "0", hint: "AED, defaults to 0; needs a certificate number" },
  { key: "stone_value", required: false, example: "0", hint: "AED, defaults to 0" },
  { key: "certificate_number", required: false, example: "", hint: "optional, up to 120 characters" },
  { key: "hallmark_info", required: false, example: "", hint: "optional, up to 200 characters" },
  // Not optional in practice: the catalogue integrity gate wants at least 20
  // characters before a product can be submitted, so a blank description here
  // means more work per product later.
  { key: "description", required: false, example: "", hint: "up to 2000 characters; 20+ needed before submitting" },
];

const COLUMN_KEYS = new Set(BULK_COLUMNS.map((c) => c.key));

/** Defaults for columns a vendor may leave out of the file entirely. */
const DEFAULTS: Record<string, string> = {
  quantity: "1",
  making_charge: "0",
  making_charge_discount_percent: "0",
  certificate_fee: "0",
  stone_value: "0",
};

/** The file to hand a vendor as a starting point. */
export function bulkTemplateCsv(): string {
  return toCsv(
    BULK_COLUMNS.map((c) => c.key),
    [BULK_COLUMNS.map((c) => c.example)],
  );
}

/**
 * Normalise a header cell. Spreadsheets produce "Weight (grams)", "weight
 * grams" and "Weight_Grams" from the same intent, and rejecting those would
 * be pedantry rather than safety.
 */
function normaliseHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")   // "weight (grams)" -> "weight"
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Headers people write for the columns above, beyond the canonical name. */
const HEADER_ALIASES: Record<string, string> = {
  product_name: "name",
  title: "name",
  type: "category",
  purity: "karat",
  carat: "karat",
  k: "karat",
  weight: "weight_grams",
  weight_g: "weight_grams",
  grams: "weight_grams",
  gram: "weight_grams",
  gross_weight: "weight_grams",
  qty: "quantity",
  stock: "quantity",
  making: "making_charge",
  making_charges: "making_charge",
  labour: "making_charge",
  labour_charge: "making_charge",
  stone: "stone_value",
  stones: "stone_value",
  stone_charge: "stone_value",
  discount: "making_charge_discount_percent",
  making_discount: "making_charge_discount_percent",
  making_charge_discount: "making_charge_discount_percent",
  certificate_charge: "certificate_fee",
  certification_fee: "certificate_fee",
  certificate: "certificate_number",
  certificate_no: "certificate_number",
  cert: "certificate_number",
  hallmark: "hallmark_info",
  notes: "description",
  details: "description",
};

function resolveHeader(raw: string): string | null {
  const n = normaliseHeader(raw);
  if (COLUMN_KEYS.has(n)) return n;
  const alias = HEADER_ALIASES[n];
  return alias ?? null;
}

type Coerced<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Read a number the way a price sheet writes one. "AED 1,250.00" is accepted;
 * "1,25" is not. Thousands separators are only honoured when they are grouped
 * correctly, because stripping every comma would read "1,25" as 125 — an
 * off-by-ten-times price that nothing downstream could detect.
 */
function coerceNumber(raw: string): Coerced<number> {
  let s = raw.trim().replace(/^aed\s*/i, "").replace(/\s*aed$/i, "").replace(/^\+/, "").trim();
  if (s === "") return { ok: false, message: "is empty" };
  if (s.startsWith("-")) return { ok: false, message: `cannot be negative (got "${raw.trim()}")` };
  if (/^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$/.test(s)) s = s.replace(/,/g, "");
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) {
    return { ok: false, message: `is not a number (got "${raw.trim()}")` };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, message: `is not a number (got "${raw.trim()}")` };
  return { ok: true, value: n };
}

function coerceInteger(raw: string): Coerced<number> {
  const n = coerceNumber(raw);
  if (!n.ok) return n;
  if (!Number.isInteger(n.value)) {
    return { ok: false, message: `must be a whole number (got "${raw.trim()}")` };
  }
  return n;
}

function coerceKarat(raw: string): Coerced<number> {
  const s = raw.trim().replace(/\s*(k|kt|karat|carat)$/i, "").trim();
  const n = coerceInteger(s);
  if (!n.ok) return n;
  if (!(KARATS as readonly number[]).includes(n.value)) {
    return { ok: false, message: `must be one of ${KARATS.join(", ")} (got "${raw.trim()}")` };
  }
  return n;
}

function coerceCategory(raw: string): Coerced<string> {
  let s = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if ((CATEGORIES as readonly string[]).includes(s)) return { ok: true, value: s };
  // "rings" and "earrings" are what people actually type.
  if (s.endsWith("s") && (CATEGORIES as readonly string[]).includes(s.slice(0, -1))) {
    return { ok: true, value: s.slice(0, -1) };
  }
  if (s === "") return { ok: false, message: "is empty" };
  return {
    ok: false,
    message: `must be one of ${CATEGORIES.join(", ")} (got "${raw.trim()}")`,
  };
}

/**
 * Parse and validate a whole file. Never throws for bad content — a bad file
 * is a result, not an exception, because every problem in it has to be
 * reported at once rather than one upload at a time.
 */
export function parseBulkProducts(csvText: string): BulkParseResult {
  const issues: BulkIssue[] = [];

  let records;
  try {
    records = parseCsvRows(csvText);
  } catch (e) {
    if (e instanceof CsvError) {
      return { rows: [], issues: [{ line: e.line, column: null, message: e.message }] };
    }
    throw e;
  }

  if (records.length === 0) {
    return { rows: [], issues: [{ line: null, column: null, message: "The file is empty." }] };
  }

  // --- header ---------------------------------------------------------------
  const headerRecord = records[0];
  const headers: (string | null)[] = headerRecord.values.map(resolveHeader);

  headerRecord.values.forEach((raw, i) => {
    if (headers[i] === null) {
      issues.push({
        line: headerRecord.line,
        column: raw.trim() || `column ${i + 1}`,
        message:
          `Unrecognised column "${raw.trim()}". Remove it, or rename it to one of: ` +
          `${BULK_COLUMNS.map((c) => c.key).join(", ")}.`,
      });
    }
  });

  const seen = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h === null) return;
    const first = seen.get(h);
    if (first !== undefined) {
      issues.push({
        line: headerRecord.line,
        column: h,
        message: `Column "${h}" appears twice (columns ${first + 1} and ${i + 1}). Remove one.`,
      });
    } else {
      seen.set(h, i);
    }
  });

  for (const col of BULK_COLUMNS) {
    if (col.required && !seen.has(col.key)) {
      issues.push({
        line: headerRecord.line,
        column: col.key,
        message: `Required column "${col.key}" is missing from the header row.`,
      });
    }
  }

  // Without a usable header the row numbers below would be meaningless.
  if (issues.length > 0) return { rows: [], issues };

  // --- body -----------------------------------------------------------------
  const body = records.slice(1);
  if (body.length === 0) {
    return {
      rows: [],
      issues: [{ line: null, column: null, message: "The file has a header row but no products." }],
    };
  }
  if (body.length > BULK_MAX_ROWS) {
    return {
      rows: [],
      issues: [{
        line: null,
        column: null,
        message: `The file has ${body.length} products; the limit is ${BULK_MAX_ROWS} per upload. ` +
          `Split it into smaller files.`,
      }],
    };
  }

  const rows: BulkParsedRow[] = [];

  for (const record of body) {
    const line = record.line;
    if (record.values.length !== headerRecord.values.length) {
      issues.push({
        line,
        column: null,
        message:
          `This row has ${record.values.length} value(s) but the header has ` +
          `${headerRecord.values.length}. A comma inside a value needs the value in "quotes".`,
      });
      continue;
    }

    const cell = (key: string): string => {
      const i = seen.get(key);
      const raw = i === undefined ? DEFAULTS[key] : record.values[i];
      return raw ?? "";
    };

    const rowIssues: BulkIssue[] = [];
    const push = (column: string, message: string) => rowIssues.push({ line, column, message });

    const category = coerceCategory(cell("category"));
    if (!category.ok) push("category", `category ${category.message}`);
    const karat = coerceKarat(cell("karat"));
    if (!karat.ok) push("karat", `karat ${karat.message}`);
    const weight = coerceNumber(cell("weight_grams"));
    if (!weight.ok) push("weight_grams", `weight_grams ${weight.message}`);

    const numeric: Record<string, number> = {};
    for (const key of ["making_charge", "certificate_fee", "stone_value"] as const) {
      const raw = cell(key).trim();
      // An omitted optional charge is zero; a mistyped one is an error.
      const parsed = raw === "" ? ({ ok: true, value: 0 } as const) : coerceNumber(raw);
      if (!parsed.ok) push(key, `${key} ${parsed.message}`);
      else numeric[key] = parsed.value;
    }

    const qtyRaw = cell("quantity").trim();
    const quantity = qtyRaw === "" ? ({ ok: true, value: 1 } as const) : coerceInteger(qtyRaw);
    if (!quantity.ok) push("quantity", `quantity ${quantity.message}`);

    const discountRaw = cell("making_charge_discount_percent").trim();
    const discount = discountRaw === ""
      ? ({ ok: true, value: 0 } as const)
      : coerceInteger(discountRaw);
    if (!discount.ok) push("making_charge_discount_percent", `making_charge_discount_percent ${discount.message}`);

    const optional = (key: string): string | null => {
      const v = cell(key).trim();
      return v === "" ? null : v;
    };

    if (rowIssues.length > 0) {
      issues.push(...rowIssues);
      continue;
    }

    // Bounds and lengths come from the shared schema, so the importer cannot
    // accept something the single-product form would reject.
    const candidate = {
      name: cell("name").trim(),
      description: optional("description"),
      category: category.ok ? category.value : "",
      karat: karat.ok ? karat.value : 0,
      weight_grams: weight.ok ? weight.value : 0,
      making_charge: numeric.making_charge,
      making_charge_discount_percent: discount.ok ? discount.value : 0,
      certificate_fee: numeric.certificate_fee,
      stone_value: numeric.stone_value,
      quantity: quantity.ok ? quantity.value : 0,
      certificate_number: optional("certificate_number"),
      hallmark_info: optional("hallmark_info"),
    };

    const parsed = bulkProductRowSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = typeof issue.path[0] === "string" ? issue.path[0] : null;
        issues.push({ line, column, message: column ? `${column}: ${issue.message}` : issue.message });
      }
      continue;
    }

    rows.push({ line, product: parsed.data });
  }

  return { rows, issues };
}
