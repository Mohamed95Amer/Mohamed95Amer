/**
 * Checks for the CSV product importer in src/lib/products/bulk.ts.
 *
 * Run with: npm test
 *
 * Two kinds of case matter here. The first is that a bad file is reported
 * precisely — right line, right column — because that is the only thing the
 * vendor can act on. The second, and the reason several cases look pedantic,
 * is that a mis-read number is not a visible failure: "1,25" read as 125 is a
 * ten-times price that lists, sells and is never questioned. So the coercion
 * rules are pinned on both sides: what must be accepted, and what must not.
 */
import { parseBulkProducts, bulkTemplateCsv, BULK_COLUMNS, BULK_MAX_ROWS } from "@/lib/products/bulk";
import { eq, section, report } from "./harness.ts";

const HEADER = "name,category,karat,weight_grams";
const row = (s: string) => HEADER + "\n" + s;

/** Just the products, for cases that are expected to be clean. */
function products(csv: string) {
  const r = parseBulkProducts(csv);
  eq("  (no issues)", r.issues, []);
  return r.rows.map((x) => x.product);
}
/** Just the issues, flattened to something readable in a diff. */
function issues(csv: string) {
  return parseBulkProducts(csv).issues.map((i) => [i.line, i.column, i.message]);
}
/** Line + column only, where the exact wording is not the point. */
function where(csv: string) {
  return parseBulkProducts(csv).issues.map((i) => [i.line, i.column]);
}

section("a good file");
eq(
  "minimal row gets defaults",
  products(row("Classic Bangle,bangle,22,12.5")),
  [{
    name: "Classic Bangle", description: null, category: "bangle", karat: 22,
    weight_grams: 12.5, making_charge: 0, stone_value: 0, vendor_premium: 0,
    quantity: 1, certificate_number: null, hallmark_info: null,
  }],
);
eq(
  "every column",
  products(
    "name,category,karat,weight_grams,quantity,making_charge,stone_value,vendor_premium," +
    "certificate_number,hallmark_info,description\n" +
    'Ring A,ring,18,3.250,4,120.50,80,15,CERT-1,"750 stamped","A ring, with a comma"',
  ),
  [{
    name: "Ring A", description: "A ring, with a comma", category: "ring", karat: 18,
    weight_grams: 3.25, making_charge: 120.5, stone_value: 80, vendor_premium: 15,
    quantity: 4, certificate_number: "CERT-1", hallmark_info: "750 stamped",
  }],
);
eq("the shipped template parses", parseBulkProducts(bulkTemplateCsv()).issues, []);
eq("many rows", parseBulkProducts(
  HEADER + "\n" + Array.from({ length: 50 }, (_, i) => `Item ${i},ring,22,1.5`).join("\n"),
).rows.length, 50);

section("headers");
eq("spreadsheet spellings accepted", products(
  "Product Name,Type,Purity,Weight (grams)\nBangle,bangle,22,10",
).length, 1);
eq("case and spacing ignored", products(" NAME , category ,KARAT,weight_grams\nRing B,ring,22,1").length, 1);
eq("aliases map to the same column", products("title,category,carat,grams\nRing B,ring,22,1").length, 1);
// A column nobody recognises is almost always a typo in a column that matters,
// so it is refused rather than dropped with the data in it.
eq("unknown column refused", where("name,category,karat,weight_grams,weigth\nRing B,ring,22,1,x"),
  [[1, "weigth"]]);
eq("duplicate column refused", where("name,name,category,karat,weight_grams\nRing A,Ring B,ring,22,1"),
  [[1, "name"]]);
eq("missing required column named", where("name,category,karat\nRing B,ring,22"),
  [[1, "weight_grams"]]);
eq("all missing required columns listed", where("name\nRing B"),
  [[1, "category"], [1, "karat"], [1, "weight_grams"]]);

section("the file as a whole");
eq("empty file", issues(""), [[null, null, "The file is empty."]]);
eq("header but no rows", issues(HEADER + "\n"), [[null, null, "The file has a header row but no products."]]);
eq("header but only blank rows", issues(HEADER + "\n\n\n"),
  [[null, null, "The file has a header row but no products."]]);
eq("over the row limit", parseBulkProducts(
  HEADER + "\n" + Array.from({ length: BULK_MAX_ROWS + 1 }, () => "Ring A,ring,22,1").join("\n"),
).issues.length, 1);
eq("at the row limit", parseBulkProducts(
  HEADER + "\n" + Array.from({ length: BULK_MAX_ROWS }, () => "Ring A,ring,22,1").join("\n"),
).issues, []);
// The file is unreadable past this point, so the line of the stray quote is
// the only useful thing to say.
eq("unclosed quote reported at its line", where(HEADER + '\nRing A,ring,22,1\n"Ring B,ring,22,1'), [[3, null]]);

section("row numbers match the spreadsheet");
eq("second data row is line 3", where(HEADER + "\nRing A,ring,22,1\nRing B,ring,99,1"), [[3, "karat"]]);
eq("blank lines do not shift the count", where(HEADER + "\nRing A,ring,22,1\n\n\nRing B,ring,99,1"), [[5, "karat"]]);
eq("an embedded newline shifts the count", where(
  'name,category,karat,weight_grams,description\nRing A,ring,22,1,"two\nlines"\nRing B,ring,99,1,',
), [[4, "karat"]]);
eq("every bad row is reported, not just the first", where(
  HEADER + "\nRing A,ring,99,1\nRing B,ring,22,0\nRing C,nope,22,1",
), [[2, "karat"], [3, "weight_grams"], [4, "category"]]);
eq("all bad columns in one row are reported", where(row("Ring A,nope,99,abc")),
  [[2, "category"], [2, "karat"], [2, "weight_grams"]]);
// Two length/bound failures in one row take the schema path rather than the
// coercion path, and must also both be reported.
eq("all bound failures in one row are reported", where(
  "name,category,karat,weight_grams,description\nA,ring,22,1," + "x".repeat(2001),
), [[2, "name"], [2, "description"]]);

section("row shape");
eq("short row explains quoting", where(HEADER + "\nRing A,ring,22"), [[2, null]]);
eq("long row explains quoting", where(HEADER + "\nRing A,ring,22,1,extra"), [[2, null]]);
eq("quoted comma makes the row the right length", products(row('"Ring, large",ring,22,1')).length, 1);

section("numbers");
const weightOf = (s: string) => products(row(`Ring A,ring,22,${s}`))[0]?.weight_grams;
eq("decimal", weightOf("12.500"), 12.5);
eq("integer", weightOf("12"), 12);
eq("surrounding spaces", weightOf(" 12.5 "), 12.5);
eq("leading plus", weightOf("+12.5"), 12.5);
eq("grouped thousands", products(row('Ring A,ring,22,1,"1,250.50"').replace(
  HEADER, "name,category,karat,weight_grams,making_charge")).length, 1);
eq("AED prefix", parseBulkProducts(
  "name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,AED 150",
).rows[0].product.making_charge, 150);
// The ones that must NOT be guessed at:
eq("badly grouped commas refused, not stripped", where(
  'name,category,karat,weight_grams\nRing A,ring,22,"1,25"'), [[2, "weight_grams"]]);
eq("text refused", where(row("Ring A,ring,22,heavy")), [[2, "weight_grams"]]);
eq("negative refused", where(row("Ring A,ring,22,-5")), [[2, "weight_grams"]]);
eq("zero weight refused", where(row("Ring A,ring,22,0")), [[2, "weight_grams"]]);
eq("empty required number refused", where(row("Ring A,ring,22,")), [[2, "weight_grams"]]);
eq("trailing junk refused", where(row("Ring A,ring,22,12.5g")), [[2, "weight_grams"]]);
eq("two decimal points refused", where(row("Ring A,ring,22,1.2.3")), [[2, "weight_grams"]]);
eq("scientific notation refused", where(row("Ring A,ring,22,1e3")), [[2, "weight_grams"]]);
eq("blank optional charge becomes zero", products(
  "name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,")[0].making_charge, 0);
eq("mistyped optional charge still refused", where(
  "name,category,karat,weight_grams,making_charge\nRing A,ring,22,1,free"), [[2, "making_charge"]]);

section("quantity");
const qtyOf = (s: string) => products(
  `name,category,karat,weight_grams,quantity\nRing A,ring,22,1,${s}`)[0]?.quantity;
eq("whole number", qtyOf("7"), 7);
eq("blank defaults to 1", qtyOf(""), 1);
eq("zero allowed", qtyOf("0"), 0);
eq("fractional refused", where("name,category,karat,weight_grams,quantity\nRing A,ring,22,1,1.5"),
  [[2, "quantity"]]);

section("karat");
const karatOf = (s: string) => products(row(`Ring A,ring,${s},1`))[0]?.karat;
eq("plain", karatOf("22"), 22);
eq("with K", karatOf("22K"), 22);
eq("lowercase k", karatOf("18k"), 18);
eq("spelled out", karatOf("24 karat"), 24);
eq("unsupported purity refused", where(row("Ring A,ring,14,1")), [[2, "karat"]]);
eq("non-numeric refused", where(row("Ring A,ring,gold,1")), [[2, "karat"]]);

section("category");
const catOf = (s: string) => products(row(`Ring A,${s},22,1`))[0]?.category;
eq("exact", catOf("bangle"), "bangle");
eq("capitalised", catOf("Bangle"), "bangle");
eq("plural", catOf("rings"), "ring");
eq("spaced", catOf("ear ring"), "earring");
eq("hyphenated", catOf("ear-ring"), "earring");
eq("unknown refused", where(row("Ring A,watch,22,1")), [[2, "category"]]);
eq("empty refused", where(row("Ring A,,22,1")), [[2, "category"]]);

section("text fields");
eq("name is trimmed", products(row("  Bangle  ,ring,22,1"))[0].name, "Bangle");
eq("short name refused", where(row("A,ring,22,1")), [[2, "name"]]);
eq("over-long name refused", where(row("A".repeat(201) + ",ring,22,1")), [[2, "name"]]);
eq("blank optional text becomes null", products(
  "name,category,karat,weight_grams,certificate_number\nBangle,ring,22,1,")[0].certificate_number, null);
eq("over-long description refused", where(
  "name,category,karat,weight_grams,description\nBangle,ring,22,1," + "x".repeat(2001)),
  [[2, "description"]]);

section("template");
eq("template header is the documented columns", bulkTemplateCsv().split("\r\n")[0],
  BULK_COLUMNS.map((c) => c.key).join(","));

report();
