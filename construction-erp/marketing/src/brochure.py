"""Majal brochure — six A4 pages, print-ready.

    1  cover — bilingual, the Arabic set genuinely right-to-left
    2  what it is, and who it is for
    3  the commercial spine, with the bill it starts in
    4  control and the field  (approvals, My Day, the phone)
    5  BIM and facilities, with the limits stated
    6  deployment, open-source posture, and the next step

Exported twice: a screen PDF in RGB, and a print PDF in CMYK with 3 mm bleed
and trim marks. Everything factual on these pages is traceable to the repo.
"""

import os

from reportlab.pdfgen import canvas as rl_canvas

from majal_brand import (
    AR, AR_B, AR_L, AR_SB, DISPLAY, DISPLAY_R, FACTS, MM, MODULE_GROUPS, MONO,
    MONO_B, ROOT, SPINE, TEXT, TEXT_B, TEXT_I, Canvas, ar, register_fonts, snap,
)
from posters import crop_marks, fit, headline, ar_headline

OUT = os.path.join(ROOT, "brochure")

TRIM_W, TRIM_H = 210 * MM, 297 * MM
MARGIN = 18 * MM
GUT = 7 * MM


class Page:
    """One A4 leaf. Holds the trim box and the column grid so every page in the
    document sits on the same measure."""

    def __init__(self, cv, bleed, n, total, dark=False):
        self.cv = cv
        self.b = bleed
        self.n = n
        self.total = total
        self.dark = dark
        self.x0 = bleed + MARGIN
        self.x1 = bleed + TRIM_W - MARGIN
        self.w = self.x1 - self.x0
        self.top = bleed + MARGIN
        self.bottom = bleed + TRIM_H - MARGIN
        self.col = (self.w - GUT) / 2.0

    def cx(self, i):
        return self.x0 + i * (self.col + GUT)

    def ground(self):
        cv = self.cv
        if self.dark:
            cv.raking_light(0, 0, cv.w, cv.h, lift=0.18)
        else:
            cv.rect(0, 0, cv.w, cv.h, fill="page")

    def eyebrow(self, s, rule=True):
        cv = self.cv
        cv.label(self.x0, self.top + 6, s, size=7.0,
                 color="accent" if self.dark else "primary", track=2.6)
        if rule:
            cv.hline(self.x0, self.top + 16, self.w,
                     color="rule_dark" if self.dark else "rule_light", lw=0.6)
        return self.top + 16

    def folio(self, note=""):
        """Running foot: page number, section note, and the mark on the last
        page only. Confidence reads at the bottom of the page."""
        cv = self.cv
        y = self.bottom
        cv.hline(self.x0, y, self.w,
                 color="rule_dark" if self.dark else "rule_light", lw=0.5)
        ink = "muted"
        cv.label(self.x0, y + 12, "majal · %s" % FACTS["domain"], size=6.0,
                 color=ink, track=1.6)
        if note:
            cv.label(self.x0 + self.w / 2, y + 12, note, size=6.0, color=ink,
                     track=1.6, align="center")
        cv.label(self.x1, y + 12, "%02d / %02d" % (self.n, self.total),
                 size=6.0, color="accent" if self.dark else "primary",
                 track=1.6, align="right")

    def h2(self, y, s, size=25.0, color=None):
        cv = self.cv
        col = color or ("surface" if self.dark else "text")
        end = cv.para(self.x0, y, s, font=DISPLAY, size=size,
                      leading=snap(size * 0.92), color=col, max_w=self.w)
        return end

    def body(self, x, y, s, w, size=9.4, color=None, font=TEXT):
        col = color or ("accent_pale" if self.dark else "ink_soft")
        return self.cv.para(x, y, s, font=font, size=size,
                            leading=snap(size * 1.62), color=col, max_w=w)

    def note(self, x, y, k, v, w, gap=64):
        """A labelled fact: mono key, reading-face value."""
        cv = self.cv
        cv.label(x, y, k, size=6.3, color="accent" if self.dark else "primary",
                 track=1.7)
        return cv.para(x + gap, y, v, font=TEXT, size=8.6,
                       leading=snap(8.6 * 1.5),
                       color="muted" if self.dark else "ink_soft",
                       max_w=w - gap)


# --------------------------------------------------------------------------
# page 1 — cover
# --------------------------------------------------------------------------

def page_cover(pg):
    """Anchored layout. The mark holds the top, the standing facts hold the
    foot, and the two language blocks divide what is between them. Nothing on
    this page is positioned by accumulating from the block above it, because
    that is how a cover overflows."""
    cv = pg.cv
    pg.ground()

    # --- the mark, holding the top ---------------------------------------
    ms = 24 * MM
    cv.mark(pg.x0, pg.top, ms)
    cv.text(pg.x0 + ms + 9 * MM, pg.top + ms * 0.58, "MAJAL", font=DISPLAY,
            size=ms * 0.60, color="surface", track=ms * 0.020)
    cv.label(pg.x0 + ms + 9 * MM, pg.top + ms * 0.58 + 15,
             "construction & facilities ERP", size=7.2, color="accent",
             track=2.4)
    cv.ar_text(pg.x1, pg.top + ms * 0.58 + 15,
               "نظام إدارة المقاولات والمرافق", font=AR, size=9.6,
               color="accent_pale")

    # --- fixed horizontal rules that divide the sheet --------------------
    r1 = pg.top + ms + 16 * MM        # under the mark block
    r2 = pg.top + 148 * MM            # between English and Arabic
    r3 = pg.bottom - 52 * MM          # above the standing facts
    for r in (r1, r2, r3):
        cv.hline(pg.x0, r, pg.w, color="rule_dark", lw=0.6 if r == r1 else 0.5)

    # --- English block ----------------------------------------------------
    hb = headline(cv, pg.x0, r1,
                  ["THE COMMERCIAL", "SPINE OF A", "CONSTRUCTION BUSINESS."],
                  pg.w, 66 * MM)
    cv.para(pg.x0, snap(hb + 11 * MM),
            "Bills of quantities, variations, payment certificates and cost "
            "value reconciliation on the same database as the RFIs, defects, "
            "permits and work orders that generate them.",
            font=TEXT, size=10.6, leading=snap(10.6 * 1.62),
            color="accent_pale", max_w=pg.w * 0.82)

    # --- Arabic block, composed from the right edge -----------------------
    ah = ar_headline(cv, pg.x1, r2, ["العمود التجاري", "لشركة مقاولات"],
                     pg.w * 0.82, 30 * MM)
    cv.ar_para(pg.x1, snap(ah + 9 * MM),
               "جداول الكميات وأوامر التغيير وشهادات الدفع ومطابقة التكلفة "
               "والقيمة، على قاعدة البيانات نفسها.",
               font=AR_L, size=10.5, leading=snap(10.5 * 1.85),
               color="accent_pale", max_w=pg.w * 0.76)

    # --- the standing facts, hung off r3 ----------------------------------
    quarter = pg.w / 4.0
    for i, (big, small) in enumerate([
            (FACTS["modules"], "Majal modules"),
            (FACTS["approval_wired"], "document types, one approval engine"),
            ("EN / AR", "bilingual, RTL in the interface"),
            (FACTS["licence"], "open source, on Odoo 18 Community")]):
        cx = pg.x0 + i * quarter
        cv.text(cx, r3 + 26, big, font=DISPLAY, size=26, color="accent")
        cv.para(cx, r3 + 42, small, font=TEXT, size=8.0,
                leading=snap(8.0 * 1.5), color="muted", max_w=quarter - 10)

    pg.folio("cover")


# --------------------------------------------------------------------------
# page 2 — what it is, who it is for
# --------------------------------------------------------------------------

def page_what(pg):
    cv = pg.cv
    pg.ground()
    y = pg.eyebrow("01 — what Majal is")

    pg.h2(snap(y + 22), "The layer nobody sells you", size=27)

    ty = snap(y + 60)
    e = pg.body(pg.x0, ty,
                "Field tools know what happened on site. Finance systems know "
                "what was invoiced. Between them sits the bill of quantities "
                "the job was priced from, the variations that moved it, the "
                "subcontracts that committed the cost, and the monthly "
                "reconciliation that says whether the margin the job was "
                "tendered at still exists.",
                pg.col, size=9.6)
    pg.body(pg.cx(1), ty,
            "Majal is that middle layer, built as Odoo modules so the "
            "accounting, purchasing, inventory and HR underneath it are "
            "already integrated rather than interfaced. A defect raised on a "
            "drawing can become a back-charge on a subcontractor's payment "
            "certificate. Nothing is re-keyed.",
            pg.col, size=9.6)

    # --- the evidence ----------------------------------------------------
    py = snap(e + 26)
    iw = pg.w
    ih = cv.img_h_for_w("dashboard", iw)
    cv.plate("dashboard", pg.x0, py, w=iw, edge="rule_light",
             tick_color="primary")
    cv.caption(pg.x0, py + ih + 14,
               "The executive portfolio dashboard: commercial, programme, "
               "quality, safety and material figures gathered for every "
               "project in one call, then compared across any selection of "
               "them.", pg.w, size=8.0, color="muted")

    # --- who it is for ---------------------------------------------------
    wy = max(snap(py + ih + 46), pg.bottom - 62 * MM)
    cv.hline(pg.x0, wy - 12, pg.w, color="rule_light", lw=0.5)
    cv.label(pg.x0, wy + 4, "who it is for", size=7.0, color="primary",
             track=2.4)

    ry = snap(wy + 26)
    third = (pg.w - 2 * GUT) / 3.0
    for i, (who, what) in enumerate([
            ("Main contractors",
             "BOQ-priced work, interim payment certificates with retention, "
             "subcontract packages, variations, CVR, and site records that "
             "stand up in a claim."),
            ("Developers & consultants",
             "Drawing registers with revision control, RFIs and submittals "
             "with ball-in-court, tender packages levelled line by line, and "
             "portfolio commercial exposure."),
            ("Facilities operators",
             "Asset registry on a real location hierarchy, preventive "
             "maintenance that generates its own work orders, SLAs on a "
             "business calendar, and contracts that show their margin."),
    ]):
        cx = pg.x0 + i * (third + GUT)
        cv.hline(cx, ry - 10, third, color="accent", lw=1.2)
        cv.para(cx, ry + 6, who, font=TEXT_B, size=10.2,
                leading=snap(10.2 * 1.35), color="text", max_w=third)
        cv.para(cx, ry + 34, what, font=TEXT, size=8.4,
                leading=snap(8.4 * 1.55), color="ink_soft", max_w=third)

    pg.folio("what it is")


# --------------------------------------------------------------------------
# page 3 — the commercial spine
# --------------------------------------------------------------------------

SPINE_NOTE = [
    "Packages pull their scope from the bill, so the budget travels with them; "
    "bids are compared line by line, because a bid with unpriced lines has not "
    "offered the whole scope.",
    "Hierarchical sections and priced lines, each split into material, labour, "
    "equipment, subcontract and overhead budget. Approval locks it; revisions "
    "are versioned.",
    "Awarding writes the winning price straight into a subcontract, so it "
    "lands in the reconciliation as committed cost rather than as a surprise.",
    "Change events become priced variation orders. On approval they append "
    "their lines to the bill — adjusting the contract value even when the bill "
    "is locked — and flow into the next certificate.",
    "Certify cumulative work done per line, withhold retention (a percentage, "
    "capped), and raise the net customer invoice.",
    "Contract and certified value against budget, committed and incurred cost: "
    "earned margin, forecast final margin, and the movement against the margin "
    "the job was tendered at.",
]


def page_spine(pg):
    cv = pg.cv
    pg.ground()
    y = pg.eyebrow("02 — the commercial spine")

    pg.h2(snap(y + 22), "Tender to reconciliation, on one ledger", size=27)

    e = pg.body(pg.x0, snap(y + 66),
                "Six stages, six shipped modules, one contract value that only "
                "ever moves for a reason somebody signed.",
                pg.w * 0.66, size=10.2)

    sy = snap(e + 26)
    rows = len(SPINE)
    rowh = 30 * MM
    sx = pg.x0 + 3 * MM
    cv.vline(sx, sy, (rows - 1) * rowh + 6 * MM, color="accent", lw=0.9)

    tx = sx + 12 * MM
    for i, ((name, mod), note) in enumerate(zip(SPINE, SPINE_NOTE)):
        yy = sy + i * rowh
        cv.hline(sx, yy, 12 * MM - 2.4, color="accent", lw=0.5, alpha=0.55)
        cv.node(sx, yy, 2.4)
        cv.ring(sx, yy, 5.0, lw=0.5)
        cv.label(tx, yy - 8, "%02d" % (i + 1), size=6.4, color="accent",
                 track=1.6)
        cv.text(tx, yy + 5, name, font=TEXT_B, size=13.0, color="text")
        cv.para(tx, yy + 20, note, font=TEXT, size=8.5,
                leading=snap(8.5 * 1.55), color="ink_soft",
                max_w=pg.x1 - tx - 46 * MM)
        cv.label(pg.x1, yy + 5, mod, size=6.2, color="muted", track=1.1,
                 align="right")

    # --- the bill it starts in -------------------------------------------
    py = snap(sy + (rows - 1) * rowh + 22 * MM)
    ih = cv.img_h_for_w("boq", pg.w)
    cv.plate("boq", pg.x0, py, w=pg.w, edge="rule_light", tick_color="primary")
    cv.caption(pg.x0, py + ih + 14,
               "The bill of quantities register: contract amount against "
               "budget cost, margin, per-cent certified and the approval "
               "state, per version.", pg.w, size=8.0, color="muted")

    pg.folio("commercial control")


# --------------------------------------------------------------------------
# page 4 — control and the field
# --------------------------------------------------------------------------

def page_control(pg):
    cv = pg.cv
    pg.ground()
    y = pg.eyebrow("03 — control, and the field")

    pg.h2(snap(y + 22), "Enforced in the method. Answered on a phone.",
          size=25)

    ty = snap(y + 72)
    e1 = pg.body(pg.x0, ty,
                 "A groups attribute on a view hides a control; it does not "
                 "stop the method being called. Majal checks the approval rule "
                 "inside the action that commits the document, so it holds "
                 "from a button, a script or RPC. Rules match a document's "
                 "kind, project and value band to a chain of signatures — "
                 "configured as data, not code.",
                 pg.col, size=9.4)
    e1 = cv.para(pg.x0, snap(e1 + 34),
                 "Segregation of duties stops the raiser signing their own "
                 "document. Steps are ordered. Rejections require a reason. "
                 "Delegation records whose authority was used rather than who "
                 "was logged in — and because each step is a record, "
                 "“waiting for me” is one inbox across every wired document "
                 "type.",
                 font=TEXT, size=9.4, leading=snap(9.4 * 1.62),
                 color="ink_soft", max_w=pg.col)

    e2 = pg.body(pg.cx(1), ty,
                 "My Day collects everything assigned to one person — "
                 "approvals waiting on them, their defects, inspections, "
                 "tasks, RFIs and permits — on one screen, ordered by how much "
                 "trouble it causes to ignore. It was measured at a real "
                 "390 px viewport rather than assumed.",
                 pg.col, size=9.4)
    e2 = cv.para(pg.cx(1), snap(e2 + 34),
                 "Sheet PDFs render on a canvas with status-coloured pins; "
                 "three taps turn a point on a drawing into a task, RFI, "
                 "defect or note. Offline is deliberately bounded: draft, "
                 "checklist and scan actions work without signal; approvals, "
                 "financial posting, deletes and BIM stay online.",
                 font=TEXT, size=9.4, leading=snap(9.4 * 1.62),
                 color="ink_soft", max_w=pg.col)

    # --- two real screens -------------------------------------------------
    # The band is anchored to the foot and the plates are bottom-aligned to
    # each other, so the three artefacts sit on one line rather than drifting.
    phone_w = pg.col * 0.46
    phone_h = cv.img_h_for_w("defect-mobile", phone_w)
    left_w = pg.w - phone_w - GUT
    band_bottom = pg.bottom - 16 * MM
    py = snap(max(max(e1, e2) + 30, band_bottom - phone_h - 50))

    ih1 = cv.img_h_for_w("my-day", left_w)
    cv.plate("my-day", pg.x0, py, w=left_w, edge="rule_light",
             tick_color="primary")
    cv.caption(pg.x0, py + ih1 + 14,
               "My Day. Approvals waiting on the reader come first — somebody "
               "else is stopped until they are done.", left_w, size=8.0,
               color="muted")

    ih2 = cv.img_h_for_w("approval-inbox", left_w)
    py2 = snap(py + phone_h - ih2)
    cv.plate("approval-inbox", pg.x0, py2, w=left_w, edge="rule_light",
             tick_color="primary")
    cv.caption(pg.x0, py2 + ih2 + 14,
               "“Waiting for me”: one query over approval steps, grouped by "
               "document type, totalled by value.", left_w, size=8.0,
               color="muted")

    cv.plate("defect-mobile", pg.x1 - phone_w, py, w=phone_w,
             edge="rule_light", tick_color="primary")
    cv.caption(pg.x1 - phone_w, py + phone_h + 14,
               "Raising a defect at a 390 px viewport: photo, location, "
               "severity, and the subcontractor who has to fix it.",
               phone_w, size=8.0, color="muted")

    pg.folio("control & field")


# --------------------------------------------------------------------------
# page 5 — BIM and facilities
# --------------------------------------------------------------------------

def page_bim(pg):
    cv = pg.cv
    pg.ground()
    y = pg.eyebrow("04 — the model, and what follows handover")

    pg.h2(snap(y + 22), "A model that is a record, not a picture", size=26)

    e = pg.body(pg.x0, snap(y + 62),
                "IFC files are indexed server-side by a dependency-free STEP "
                "reader — elements, property sets and quantities — with no "
                "third-party library and no geometry toolchain on the server. "
                "Links are keyed on the GlobalId, the one identity IFC keeps "
                "stable across exports, so an RFI raised against a wall "
                "survives the model being re-issued. An element that "
                "disappears while carrying records is flagged, never silently "
                "deleted.",
                pg.w * 0.72, size=9.6)

    # --- before / after --------------------------------------------------
    py = snap(e + 26)
    gap = 6 * MM
    iw = (pg.w - 2 * gap) / 3.0
    ih = cv.img_h_for_w("bim-original", iw)
    for i, (name, tag) in enumerate([
            ("bim-original", "original colours from the file"),
            ("bim-legend", "coloured by element class"),
            ("bim-viewer", "shaded, one material")]):
        cx = pg.x0 + i * (iw + gap)
        cv.plate(name, cx, py, w=iw, edge="rule_light",
                 tick_color="accent" if i == 2 else "rule_light")
        cv.label(cx, py + ih + 14, tag, size=6.2,
                 color="primary" if i == 2 else "muted", track=1.3)
    cv.caption(pg.x0, py + ih + 30,
               "The same model, the same camera, three shading modes. Majal's "
               "default is the third: colour is reserved for the elements that "
               "carry an open item, so the only thing that reads as coloured "
               "is the thing somebody has to act on.", pg.w, size=8.0,
               color="muted")

    # --- capability / limit table ----------------------------------------
    ty = snap(py + ih + 62)
    cv.hline(pg.x0, ty - 12, pg.w, color="rule_light", lw=0.5)
    rows = [("viewer", "storey filtering, isolate/hide, live section cut, "
                       "IFC properties on selection, 3D pins that create the "
                       "record they stand for"),
            ("4D", "a date slider driving element visibility from the dates of "
                   "the programme tasks elements are linked to"),
            ("exchange", "BCF 2.1 archives round-trip with Solibri, "
                         "Navisworks, BIMcollab and Revizto, matched on topic "
                         "GUID"),
            ("quantities", "model quantity and variance beside the billed one "
                           "on every BOQ line linked to elements"),
            ("limits", "clash testing is bounding-box, not triangle-precise, "
                       "and capped at 2000 results per run; units are not read "
                       "from IfcUnitAssignment; there is no IFC writing and no "
                       "DWG support")]
    ry = ty + 6
    for k, v in rows:
        hot = (k == "limits")
        cv.label(pg.x0, ry, k, size=6.4,
                 color="accent" if hot else "primary", track=1.7)
        last = cv.para(pg.x0 + 60, ry, v, font=TEXT, size=8.5,
                       leading=snap(8.5 * 1.5),
                       color="text" if hot else "ink_soft",
                       max_w=pg.w - 60)
        ry = snap(last + 16)

    # --- facilities ------------------------------------------------------
    fy = max(snap(ry + 14), pg.bottom - 56 * MM)
    cv.hline(pg.x0, fy - 12, pg.w, color="rule_light", lw=0.5)
    cv.label(pg.x0, fy + 4, "after handover — CAFM", size=7.0, color="primary",
             track=2.4)
    cv.para(pg.x0, fy + 24,
            "Assets sit in a site → building → floor → room hierarchy with "
            "criticality, warranties, meters, failure codes and downtime. "
            "Preventive maintenance plans generate work orders by cron, each "
            "carrying a checklist copied from its job plan.",
            font=TEXT, size=8.8, leading=snap(8.8 * 1.55), color="ink_soft",
            max_w=pg.col)
    cv.para(pg.cx(1), fy + 24,
            "SLAs are matched from a policy matrix and measured on a business "
            "calendar, so a promise does not burn overnight. Annual "
            "maintenance contracts carry the SLA that was sold, keep absorbed "
            "and recoverable cost apart, and show a live margin.",
            font=TEXT, size=8.8, leading=snap(8.8 * 1.55), color="ink_soft",
            max_w=pg.col)

    pg.folio("BIM & facilities")


# --------------------------------------------------------------------------
# page 6 — deployment, open source, next step
# --------------------------------------------------------------------------

def page_close(pg):
    """Also anchored. The call to action owns a fixed band at the foot and the
    module accumulation is given the space that is left, not the other way
    round."""
    cv = pg.cv
    pg.ground()
    y = pg.eyebrow("05 — running it")

    # --- fixed anchors ----------------------------------------------------
    cta_top = pg.bottom - 40 * MM      # the call to action owns this band
    cols_top = pg.bottom - 96 * MM     # deploy / recover / read
    grid_top = pg.top + 94 * MM        # the module accumulation

    hb = headline(cv, pg.x0, y + 8,
                  ["YOUR SERVER.", "YOUR DATABASE.", "YOUR SOURCE."],
                  pg.w * 0.70, 46 * MM)

    cv.para(pg.x0, snap(hb + 26),
            "Odoo 18 Community (LGPL-3) pinned by commit, OCA modules pinned "
            "by revision, and the Majal suite itself — 35 modules declared "
            "LGPL-3, two declared AGPL-3. Portal accounts for subcontractors, "
            "clients and consultants are free Odoo portal users, so the people "
            "who only need to answer an RFI do not arrive as a per-seat line "
            "item.",
            font=TEXT, size=9.8, leading=snap(9.8 * 1.62),
            color="accent_pale", max_w=pg.w * 0.80)

    # --- the accumulation: one indexed mark per module --------------------
    cv.hline(pg.x0, grid_top - 14, pg.w, color="rule_dark", lw=0.5)
    cv.label(pg.x0, grid_top, "every module in the suite — %s in all"
             % FACTS["modules"], size=6.4, color="muted", track=2.0)

    flat = [m for _g, mods in MODULE_GROUPS for m in mods]
    cols = 5
    cell = pg.w / cols
    ty = grid_top + 15
    rowh = 16.0
    for i, (mod, _desc) in enumerate(flat):
        r, cc = divmod(i, cols)
        px = pg.x0 + cc * cell
        py = ty + r * rowh
        cv.rect(px, py, 2.0, 11.5, fill="accent", alpha=0.26 + 0.10 * (i % 5))
        cv.label(px + 6, py + 8.6, mod, size=5.0, color="accent_pale",
                 track=0.30)

    n_rows = (len(flat) + cols - 1) // cols
    gy2 = ty + n_rows * rowh + 12
    parts = " · ".join("%s %d" % (g.lower(), len(m)) for g, m in MODULE_GROUPS)
    cv.label(pg.x0, gy2, parts, size=5.8, color="whisper", track=1.1)

    # --- deploy / recover / read ------------------------------------------
    cv.hline(pg.x0, cols_top - 14, pg.w, color="rule_dark", lw=0.5)
    third = (pg.w - 2 * GUT) / 3.0
    for i, (head, lines) in enumerate([
            ("Deploy it", [
                "docker compose up — Postgres and Odoo, self-hosted",
                "or a bare-metal install from pinned sources",
                "the model index works without the viewer libraries",
            ]),
            ("Recover it", [
                "seven recovery slots, database and filestore",
                "every archive verified with SHA-256",
                "restore is an audited two-step offline procedure",
            ]),
            ("Read it", [
                "public source; the licence is in every manifest",
                "documentation states limits as plainly as features",
                "design notes name what each competitor does better",
            ]),
    ]):
        cx = pg.x0 + i * (third + GUT)
        cv.hline(cx, cols_top, third, color="accent", lw=1.2)
        cv.text(cx, cols_top + 17, head, font=TEXT_B, size=10.4,
                color="surface")
        ry = cols_top + 32
        for ln in lines:
            cv.node(cx + 1.6, ry - 3, 1.3)
            last = cv.para(cx + 9, ry, ln, font=TEXT, size=7.8,
                           leading=snap(7.8 * 1.5), color="muted",
                           max_w=third - 9)
            ry = snap(last + 13)

    # --- the next step ----------------------------------------------------
    cv.hline(pg.x0, cta_top, pg.w, color="rule_dark", lw=0.7)
    ms = 13 * MM
    cv.mark(pg.x0, cta_top + 12, ms)
    tx = pg.x0 + ms + 7 * MM
    cv.text(tx, cta_top + 12 + ms * 0.42, "Start with the source.",
            font=DISPLAY, size=22, color="surface")
    cv.label(tx, cta_top + 12 + ms * 0.42 + 15, FACTS["source"], size=7.2,
             color="accent", track=1.5)
    cv.label(tx, cta_top + 12 + ms * 0.42 + 28,
             "%s · docs.majalops.com" % FACTS["domain"], size=6.8,
             color="muted", track=1.5)
    cv.ar_text(pg.x1, cta_top + 12 + ms * 0.42 + 28,
               "الشيفرة المصدرية متاحة للاطلاع", font=AR, size=9.0,
               color="accent_pale")

    pg.folio("open source")


# --------------------------------------------------------------------------

PAGES = [
    (page_cover, True),
    (page_what, False),
    (page_spine, False),
    (page_control, False),
    (page_bim, False),
    (page_close, True),
]


def render(path, print_mode=False, bleed_mm=0.0):
    bleed = bleed_mm * MM
    pw, ph = TRIM_W + 2 * bleed, TRIM_H + 2 * bleed
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — construction & facilities management ERP")
    c.setAuthor("Majal")
    c.setSubject("Open-source construction and facilities ERP on Odoo 18 "
                 "Community")

    for i, (fn, dark) in enumerate(PAGES):
        cv = Canvas(c, pw, ph, print_mode=print_mode)
        pg = Page(cv, bleed, i + 1, len(PAGES), dark=dark)
        fn(pg)
        if bleed:
            crop_marks(cv, bleed, pw, ph,
                       color="rule_dark" if dark else "rule_light")
        c.showPage()
    c.save()
    return len(PAGES)


def build():
    register_fonts()
    os.makedirs(OUT, exist_ok=True)
    out = []
    p1 = os.path.join(OUT, "majal-brochure-a4.pdf")
    out.append((p1, render(p1)))
    p2 = os.path.join(OUT, "majal-brochure-a4-print-cmyk-3mm-bleed.pdf")
    out.append((p2, render(p2, print_mode=True, bleed_mm=3)))
    return out


if __name__ == "__main__":
    build()
