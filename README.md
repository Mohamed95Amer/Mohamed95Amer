# Get Gold

Live-priced UAE gold marketplace for customers, verified vendors, delivery partners and platform administrators.

The active implementation is on `claude/goldhub-marketplace-mvp-pYHzs`. The Vercel project and
deployment URL still use the legacy `goldhub` infrastructure name until a Get Gold domain is connected.

## Bulk product upload

Vendors can create products from a spreadsheet at `/vendor/products/bulk`.

- `src/lib/csv.ts` — RFC 4180 reader. Records carry the file line they started
  on, so a validation message can quote the row number the vendor sees. Blank
  lines are dropped and a quoted value may span several, so a record's index is
  not its row number.
- `src/lib/products/bulk.ts` — header matching, value coercion and the error
  list. Bounds come from `bulkProductRowSchema`, which picks its fields from
  the same `productFields` object as `productUpsertSchema`, so the importer
  cannot accept what the single-product form rejects.
- `src/app/api/vendor/products/bulk/route.ts` — `GET` serves the template,
  `POST` validates and (with `commit: true`) inserts.

Three properties the route holds to, all covered in
`tests/products-bulk-route.test.cjs`:

- **A dry run writes nothing.** `POST` without `commit` only reports, so a
  vendor can check a file freely.
- **Commit is all or nothing.** Any bad row blocks the whole file, and a good
  file is written in one statement, so an upload can never leave a vendor with
  half a catalogue and no way to tell which half.
- **An import only ever creates drafts.** A CSV carries no photograph, and the
  `check_product_integrity` trigger on `products` raises on a
  `pending_approval` row that fails the integrity gate — which, in a
  single-statement insert, would abort the whole upload rather than one row.
  Photos, a description of 20+ characters and submission are per product.

Columns the file does not carry are left to the database defaults. That is
deliberate for `vat_rate_bps`: it defaults to 500 (5%), and zero-rating needs
an explicit confirmation that it suits the product and the business, so it is
not something to tick once for a whole file.
