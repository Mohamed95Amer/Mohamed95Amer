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

## Tailored_Applications_Tier1.md

Ready-to-submit materials for all **43 Tier-1 jobs**: resume headline + bullets to feature, a full company-specific cover letter, and screening-question answers (salary AED 20,000/month, 30-day notice period, UAE Employment Visa confirmed) — one section per job, indexed at the top.

Two resume variants back every entry (both in `cv/`):
- **`Mohamed_Amer_CV_ATS_CSM.pdf`** — Customer Success emphasis (retention/onboarding/QBRs). Used for 24 jobs.
- **`Mohamed_Amer_CV_ATS_AM.pdf`** — Account/Key Account Management emphasis (growth/expansion). Used for 19 jobs.

The tracker's **Resume Variant** and **Tailored Materials** columns (added to each Tier-1 row) point to exactly which PDF and which numbered section to use — no need to cross-reference manually.

**Read before applying:**
- 4 jobs (Botpress, Alaan Enterprise, Dataiku, IDG) ask for more years of experience than the profile has — the cover letters address this head-on rather than hiding it. Worth a quick read before submitting these.
- KSA-based roles: the profile holds a **UAE** Employment Visa only. Every cover letter for a Saudi role says this plainly and notes relocation would need employer-sponsored KSA sponsorship — stay consistent with this in any follow-up interview.
- Swvl, Oracle, and Adobe listings couldn't be independently confirmed as still live — each has a note on what to verify first.
- Alaan and Bayut each appear twice under genuinely different, non-duplicate roles (flagged inline).

## Other tailoring resources

For Tier 2/3 jobs, or to tailor further by hand, pair the tracker with:
- `cv/Mohamed_Amer_Resume_MASTER_TEMPLATE.md` — tailor the resume from scratch
- `cv/Mohamed_Amer_Cover_Letter_MASTER_TEMPLATE.md` — tailor the cover letter from scratch
- `cv/Mohamed_Amer_CV_ATS.pdf` — general-purpose version; upload as-is to Indeed/Naukrigulf profiles
- `cv/Indeed_Naukrigulf_Profile_Content.md` — paste into those platform profiles before applying

## What this doesn't do

Nothing here submits an application automatically — LinkedIn, Indeed, and Naukrigulf all prohibit automated/bot submissions in their terms of service, and this environment has no logged-in browser session to their platforms anyway. Every row still needs a human click to actually apply.
