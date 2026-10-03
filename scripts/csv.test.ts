/**
 * Checks for the hand-rolled CSV reader in src/lib/csv.ts.
 *
 * Run with: npm test
 *
 * The parser is the one piece of the bulk upload that cannot be eyeballed:
 * quoting rules are small but every one of them has a failure mode that looks
 * like valid data rather than an error — a row split in two, a file that
 * reports half its rows, an error pointing at the wrong line. So each rule
 * below has a case, including the ones whose only visible effect is the line
 * number in an error message.
 */
import { parseCsv, parseCsvRows, CsvError, toCsv } from "@/lib/csv";
import { eq, report } from "./harness.ts";


// --- shape of the file -----------------------------------------------------
eq("plain", parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
eq("CRLF line ends", parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
eq("trailing newline", parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
eq("no trailing newline", parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
// Excel writes a BOM; left in place the first header never matches.
eq("BOM stripped", parseCsv("﻿name,x\nv,1"), [["name", "x"], ["v", "1"]]);
eq("header only", parseCsv("a,b\n"), [["a", "b"]]);
eq("empty input", parseCsv(""), []);

// --- quoting ---------------------------------------------------------------
eq("quoted comma stays one field", parseCsv('a,b\n"Ring, 22K",2'), [["a", "b"], ["Ring, 22K", "2"]]);
eq("doubled quote is a literal quote", parseCsv('a\n"He said ""hi"""'), [["a"], ['He said "hi"']]);
eq("newline inside quotes", parseCsv('a,b\n"line1\nline2",2'), [["a", "b"], ["line1\nline2", "2"]]);
eq("CRLF inside quotes kept verbatim", parseCsv('a\n"l1\r\nl2"'), [["a"], ["l1\r\nl2"]]);
eq("empty quoted field", parseCsv('a,b\n"",2'), [["a", "b"], ["", "2"]]);
eq("quote mid-field is literal", parseCsv('a\n12"x'), [["a"], ['12"x']]);

// --- values are returned untouched ----------------------------------------
eq("empty fields", parseCsv("a,b,c\n1,,3"), [["a", "b", "c"], ["1", "", "3"]]);
eq("trailing comma means empty last field", parseCsv("a,b\n1,"), [["a", "b"], ["1", ""]]);
eq("surrounding spaces preserved", parseCsv("a,b\n 1 , 2 "), [["a", "b"], [" 1 ", " 2 "]]);
// Ragged rows are the caller's problem to report, with the row number.
eq("short row kept as-is", parseCsv("a,b,c\n1,2"), [["a", "b", "c"], ["1", "2"]]);

// --- blank lines -----------------------------------------------------------
eq("blank lines dropped", parseCsv("a,b\n\n1,2\n\n"), [["a", "b"], ["1", "2"]]);
eq("whitespace-only line dropped", parseCsv("a,b\n   \n1,2"), [["a", "b"], ["1", "2"]]);

// --- errors ----------------------------------------------------------------
function lineOf(input: string): string {
  try {
    parseCsv(input);
    return "no throw";
  } catch (e) {
    return e instanceof CsvError ? String(e.line) : "wrong error type";
  }
}
// An unclosed quote must fail loudly: accepting it swallows the rest of the
// file into one field, which reads downstream as "the file only had N rows".
eq("unterminated quote throws", lineOf('a,b\n"unclosed,2'), "2");
// The line must be the one the person counts in their spreadsheet. Getting
// CRLF wrong here doubles the count without changing any parsed row.
eq("error line, LF", lineOf('a,b\n1,2\n"oops,3'), "3");
eq("error line, CRLF", lineOf('a,b\r\n1,2\r\n"oops,3'), "3");
eq("error line, after an embedded newline", lineOf('a,b\n"x\ny",2\n"oops,3'), "4");

// --- line tags -------------------------------------------------------------
// A record's index is not its line: blank lines are dropped and a quoted
// value may span several. The tag is what an error message quotes back.
const lines = (input: string) => parseCsvRows(input).map((r) => r.line);
eq("lines, simple", lines("a,b\n1,2\n3,4"), [1, 2, 3]);
eq("lines, CRLF", lines("a,b\r\n1,2\r\n3,4"), [1, 2, 3]);
eq("lines skip blank lines", lines("a,b\n\n\n1,2"), [1, 4]);
eq("lines count an embedded newline", lines('a,b\n"x\ny",2\n3,4'), [1, 2, 4]);
eq("lines, leading blank line", lines("\na,b\n1,2"), [2, 3]);
eq("row values still available", parseCsvRows("a,b\n1,2")[1].values, ["1", "2"]);

// --- writing ---------------------------------------------------------------
eq("only what needs quoting is quoted", toCsv(["a", "b"], [["x", "y"]]), "a,b\r\nx,y");
const rt = toCsv(["a", "b"], [["Ring, 22K", 'say "hi"'], ["l1\nl2", ""]]);
eq("round trip", parseCsv(rt), [["a", "b"], ["Ring, 22K", 'say "hi"'], ["l1\nl2", ""]]);

report();
