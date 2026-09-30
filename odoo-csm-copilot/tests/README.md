# Forecast Check tests

Run with Node (no dependencies):

    node test-forecast.mjs      # unit: parsing, mapping, cross-check cases
    node test-regressions.mjs   # audit regressions + role-aware direction
    node test-e2e.mjs           # real .xlsx round-trip through the pipeline

The `.tmp.mjs` / `test.xlsx` files they create are scratch output.
