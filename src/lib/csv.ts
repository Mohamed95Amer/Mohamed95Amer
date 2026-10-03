/**
 * A small RFC 4180 CSV reader.
 *
 * Written by hand rather than pulled in as a dependency: the app ships four
 * runtime packages, and the rules below are short enough to read in one go.
 * What it has to get right is the quoting — a field may contain commas,
 * newlines and quotes, and a parser that splits on "," turns one such row
 * into several wrong ones without ever failing.
 *
 * Checked by scripts/csv.test.ts (`npm run test:csv`).
 */

export class CsvError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = "CsvError";
    this.line = line;
  }
}

/** One record, with the 1-based file line it started on. */
export interface CsvRow {
  line: number;
  values: string[];
}

/**
 * Parse CSV text into records, each tagged with the line it began on.
 *
 * The line number is what makes a validation message usable: the person fixes
 * the file in a spreadsheet, so "row 14" has to mean the row numbered 14 on
 * their screen. Blank lines are dropped and quoted values may span several
 * lines, so a record's position in this array is not its line — hence the tag.
 *
 * Values are returned exactly as written: no trimming, no type guessing.
 * Interpreting them is the caller's job, because only the caller knows which
 * column meant what.
 */
export function parseCsvRows(input: string): CsvRow[] {
  // Excel writes a byte-order mark. Left in place it becomes part of the first
  // header, so "name" never matches and every row looks like it is missing it.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartedOnLine = 1;
  let quoteStartedOnLine = 1;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    // A row of one empty field is a blank line, not a record.
    if (!(row.length === 1 && row[0].trim() === "")) {
      rows.push({ line: rowStartedOnLine, values: row });
    }
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" inside a quoted field is a literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === "\n") line++;
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      quoteStartedOnLine = line;
      i++;
      continue;
    }

    if (ch === ",") {
      endField();
      i++;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++; // CRLF counts once
      endField();
      endRow();
      line++;
      rowStartedOnLine = line;
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (inQuotes) {
    // Silently accepting this would swallow the rest of the file into one
    // field, which reads downstream as "the file only had N rows".
    throw new CsvError(
      "A quoted value is never closed — check for a stray double quote.",
      quoteStartedOnLine,
    );
  }

  // No trailing newline: the last record is still a record.
  if (field !== "" || row.length > 0) {
    endField();
    endRow();
  }

  return rows;
}

/** As {@link parseCsvRows}, without the line tags. */
export function parseCsv(input: string): string[][] {
  return parseCsvRows(input).map((r) => r.values);
}

/**
 * Quote a value for writing. Only what needs quoting is quoted, so a plain
 * file stays readable in a text editor.
 */
export function toCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build CSV text from a header row and body rows. */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(toCsvValue).join(",")).join("\r\n");
}
