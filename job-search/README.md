# Job Search — Tracker & Materials

## Job_Application_Tracker.xlsx

88 real, currently-indexed postings compiled from LinkedIn, Indeed, and Naukrigulf, deduplicated and tiered by fit for a Senior Customer Success Manager / Account Manager background (SaaS/ERP, UAE/GCC/Remote).

- **Summary tab** — counts by tier, platform, and application status (live formulas: `COUNTIF`/`SUMPRODUCT`, no hardcoded numbers). Opens and calculates automatically in Excel, Google Sheets, or LibreOffice — standard behavior for any spreadsheet app.
- **Master Tracker tab** — every posting with Tier, Status (dropdown), Platform, Job Title, Company, Location, Apply Method (where known), Flags/Notes, URL(s), Date Applied, and a free Notes column. Color-coded by tier; sort/filter freely.

**Tiers:**
- 🟩 **Tier 1 (43)** — strongest fit: SaaS/ERP/tech CSM or AM roles, right seniority, real/current listing.
- 🟨 **Tier 2 (32)** — solid, transferable fit: adjacent industries (pharma, telecom, IT distribution, logistics) or slightly off-center seniority.
- 🟥 **Tier 3 (12)** — weaker fit or needs caution: lower seniority, vague/agency listings, or flagged as possibly stale.
- ⬛ **Tier 0 (1)** — excluded (nationality-restricted), kept only for visibility.

**Known limitations (read before applying):**
- All three job platforms blocked automated page fetches this pass, so most rows show **"Unknown – check listing"** for Apply Method. Click through each URL to confirm whether it's Easy Apply / Indeed Apply / an external company ATS before investing tailoring time.
- A few listings are flagged as possibly stale (dates inferred from search snippets / URL codes, not live "posted X days ago" reads) — verify the posting is still open first.
- Some postings didn't yield a direct, capturable URL (noted in the Flags column) — search the company name directly on that platform.
- Rows noting "same employer as [row]" or "found on both platforms" are cross-referenced so you don't double-apply to the same underlying job.

## Next: tailored materials

For each job you decide to pursue, pair this tracker with:
- `cv/Mohamed_Amer_Resume_MASTER_TEMPLATE.md` — tailor the resume
- `cv/Mohamed_Amer_Cover_Letter_MASTER_TEMPLATE.md` — tailor the cover letter
- `cv/Mohamed_Amer_CV_ATS.pdf` — upload as-is to Indeed/Naukrigulf profiles
- `cv/Indeed_Naukrigulf_Profile_Content.md` — paste into those platform profiles before applying

## What this doesn't do

Nothing here submits an application automatically — LinkedIn, Indeed, and Naukrigulf all prohibit automated/bot submissions in their terms of service, and this environment has no logged-in browser session to their platforms anyway. Every row still needs a human click to actually apply.
