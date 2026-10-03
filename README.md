# GoldHub

UAE gold marketplace MVP — see `claude/goldhub-marketplace-mvp-2n9iy` for the implementation.

## Checks

```
npm run typecheck   # tsc
npm test            # CSV reader, product importer, bulk upload route
```

`npm test` runs the scripts in `scripts/` directly through node's TypeScript
support; there is no test framework. `scripts/harness.ts` is the whole runner.

## Bulk product upload

Vendors can create products from a spreadsheet at `/vendor/products/bulk`.

- `src/lib/csv.ts` — RFC 4180 reader. Records carry the file line they started
  on, so a validation message can quote the row number the vendor sees.
- `src/lib/products/bulk.ts` — header matching, value coercion and the error
  list. Bounds come from `bulkProductRowSchema`, which is derived from
  `productUpsertSchema` so the importer cannot accept what the single-product
  form rejects.
- `src/app/api/vendor/products/bulk/route.ts` — `GET` serves the template,
  `POST` validates and (with `commit: true`) inserts.

Two properties the route is expected to hold, both covered in
`scripts/route.test.ts`:

- **A dry run writes nothing.** `POST` without `commit` only reports.
- **Commit is all or nothing.** Any bad row blocks the whole file, and a good
  file is written in one statement, so an upload can never leave a vendor with
  half a catalogue and no way to tell which half.

Photos are not part of the CSV; they are added per product afterwards.
