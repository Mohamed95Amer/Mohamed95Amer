# The ICP rubric, and the weight that looks wrong

Scores are computed in
`construction-erp/custom-addons/majal_sales_ops/models/crm_lead.py`. The weights
are module-level dictionaries rather than logic buried in a compute, so they can
be read and argued with without reading the code around them.

## Weights — 100 points

| Input | Points |
|---|---|
| **Market** — AE, SA, EG | 30 each; anywhere else 0 |
| **Segment** — main contractor | 25 |
| developer | 20 |
| subcontractor | 15 |
| consultant | 12 |
| facilities management | 10 |
| **Size** — 20–99 staff | 25 |
| 100–499 staff | 25 |
| 500+ staff | **12** |
| under 20 staff | 10 |
| **Contact role** — owner / MD | 20 |
| commercial / QS | 18 |
| project director / PM | 12 |
| IT | 5 |

Tiers: A ≥ 75 · B ≥ 55 · C ≥ 35 · D below.

## Why large firms score below small ones

This is the entry people try to "fix". It is deliberate.

A 500-plus contractor has a procurement process measured in quarters, an
incumbent system with switching costs, and a committee. A 60-person contractor
has an owner who can decide in one meeting. Majal's sales operation is one
person with a day job. Chasing the large firm is not a bigger prize, it is a
quarter spent on something that was never going to close this year.

`test_smb_outranks_enterprise_on_purpose` asserts this. If the ranking is
changed, that test should be changed knowingly, not deleted.

## Why the owner outranks IT

IT is where an ERP conversation goes to be evaluated for eighteen months. The
commercial manager feels the pain — variations and valuations leaking margin —
and the owner can act on it. Sell to the pain and the signature; involve IT
after there is a decision to implement.

## Changing the weights

Only on evidence from the Analyst: reply rates by tier that contradict the
weighting. Change the dicts, run the tests, and state what evidence justified
it. Never tune on a hunch mid-campaign — you lose the ability to tell what
changed the numbers.
