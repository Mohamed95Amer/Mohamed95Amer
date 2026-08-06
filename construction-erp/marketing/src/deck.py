"""Majal pitch deck — fourteen 16:9 slides.

    01  cover
    02  the problem
    03  what Majal is
    04  who it is for
    05  how it works — the commercial spine
    06  the capability map
    07  the BIM story — before and after
    08  what BIM does, and where it stops
    09  control and audit
    10  mobile and the field
    11  after handover — facilities
    12  open source and self-hosting
    13  where it is going
    14  the ask

Slide surface is 960 x 540 pt, which is exactly 1920 x 1080 at 2x. Grounds
alternate between the marine ground and paper so the deck has a rhythm rather
than fourteen identical rectangles.
"""

import os

from reportlab.pdfgen import canvas as rl_canvas

from majal_brand import (
    AR, AR_B, AR_L, DISPLAY, DISPLAY_R, FACTS, MODULE_GROUPS, MONO, MONO_B,
    ROOT, SPINE, TEXT, TEXT_B, TEXT_I, Canvas, register_fonts, snap,
)
from posters import ar_headline, fit, headline

OUT = os.path.join(ROOT, "deck")

W, H = 960.0, 540.0
M = 54.0
X0, X1 = M, W - M
COLW = X1 - X0
GUT = 22.0
TOP = 46.0
FOOT = H - 40.0


class Slide:
    def __init__(self, cv, n, total, dark, title=""):
        self.cv = cv
        self.n = n
        self.total = total
        self.dark = dark
        self.title = title

    def ground(self):
        cv = self.cv
        if self.dark:
            cv.raking_light(0, 0, W, H, lift=0.17)
        else:
            cv.rect(0, 0, W, H, fill="page")

    def eyebrow(self, s):
        cv = self.cv
        cv.label(X0, TOP, s, size=6.8,
                 color="accent" if self.dark else "primary", track=2.6)
        cv.hline(X0, TOP + 10, COLW,
                 color="rule_dark" if self.dark else "rule_light", lw=0.6)
        return TOP + 10

    def rule_color(self):
        return "rule_dark" if self.dark else "rule_light"

    def ink(self):
        return "surface" if self.dark else "text"

    def read(self):
        return "accent_pale" if self.dark else "ink_soft"

    def quiet(self):
        return "muted" if self.dark else "muted"

    def foot(self, note=None):
        cv = self.cv
        cv.hline(X0, FOOT, COLW, color=self.rule_color(), lw=0.5)
        ms = 10.0
        cv.mark(X0, FOOT + 10, ms)
        cv.text(X0 + ms + 6, FOOT + 10 + ms * 0.74, "MAJAL", font=DISPLAY,
                size=ms * 1.02, color=self.ink(), track=ms * 0.045)
        note = note or self.title
        if note:
            cv.label(X0 + COLW / 2, FOOT + 14, note, size=6.0,
                     color=self.quiet(), track=1.6, align="center")
        cv.label(X1, FOOT + 14, "%02d / %02d" % (self.n, self.total), size=6.0,
                 color="accent" if self.dark else "primary", track=1.6,
                 align="right")

    def h1(self, y, lines, max_h=110.0, max_w=None):
        return headline(self.cv, X0, y, lines, max_w or COLW, max_h,
                        color=self.ink())

    def h2(self, y, s, size=28.0, max_w=None):
        return self.cv.para(X0, y, s, font=DISPLAY, size=size,
                            leading=snap(size * 0.92), color=self.ink(),
                            max_w=max_w or COLW)

    def lede(self, y, s, size=11.0, max_w=None, x=None):
        return self.cv.para(x if x is not None else X0, y, s, font=TEXT,
                            size=size, leading=snap(size * 1.62),
                            color=self.read(), max_w=max_w or COLW * 0.72)

    def anchor(self, blocks, bottom, top_min):
        """Bottom-anchor a band: given the heights of what is to be drawn and
        the rule it must sit above, return the top the band should start at.
        Empty space then collects under the headline, where it reads as a bay
        left open, instead of pooling above the folio where it reads as a
        page that ran out."""
        return max(top_min, bottom - max(blocks))

    def notes(self, x, y, rows, w, gap=72, size=8.8, step=None):
        """A run of labelled facts — the deck's one repeating notation."""
        cv = self.cv
        for k, v in rows:
            cv.label(x, y, k, size=6.3,
                     color="accent" if self.dark else "primary", track=1.7)
            last = cv.para(x + gap, y, v, font=TEXT, size=size,
                           leading=snap(size * 1.5), color=self.read(),
                           max_w=w - gap)
            y = snap(last + (step or 16))
        return y


# --------------------------------------------------------------------------

def s01_cover(sl):
    cv = sl.cv
    sl.ground()
    ms = 46.0
    cv.mark(X0, TOP + 6, ms)
    cv.text(X0 + ms + 18, TOP + 6 + ms * 0.58, "MAJAL", font=DISPLAY,
            size=ms * 0.60, color="surface", track=ms * 0.020)
    cv.label(X0 + ms + 18, TOP + 6 + ms * 0.58 + 14,
             "construction & facilities management ERP", size=7.0,
             color="accent", track=2.4)
    cv.ar_text(X1, TOP + 6 + ms * 0.58 + 14,
               "نظام إدارة المقاولات والمرافق", font=AR, size=10.0,
               color="accent_pale")

    r = TOP + 6 + ms + 30
    cv.hline(X0, r, COLW, color="rule_dark", lw=0.6)
    hb = sl.h1(r, ["THE COMMERCIAL SPINE", "OF A CONSTRUCTION", "BUSINESS."],
               max_h=170.0)
    sl.lede(snap(hb + 34),
            "Open source, on Odoo 18 Community. Bills of quantities, "
            "variations, payment certificates and cost value reconciliation on "
            "the same database as the RFIs, defects, permits and work orders "
            "that generate them.",
            size=11.4, max_w=COLW * 0.68)

    for i, (big, small) in enumerate([
            (FACTS["modules"], "Majal modules"),
            (FACTS["approval_wired"], "document types, one engine"),
            ("EN / AR", "bilingual, RTL"),
            (FACTS["licence"], "open source")]):
        cx = X0 + i * (COLW / 4)
        cv.text(cx, FOOT - 26, big, font=DISPLAY, size=22, color="accent")
        cv.text(cx, FOOT - 12, small, font=TEXT, size=7.6, color="muted")
    sl.foot()


def s02_problem(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("the problem")
    sl.h2(snap(y + 26), "Two systems that do not meet", size=32)

    col = (COLW - 2 * GUT) / 3.0
    cards = [
            ("Field tools know what happened",
             "Pins on drawings, snags, inspections, daily logs. Excellent at "
             "capture. They stop at the point where a record becomes money."),
            ("Finance knows what was invoiced",
             "A ledger, a customer invoice, a vendor bill. Excellent at "
             "recording. It has never heard of a bill of quantities."),
            ("Between them: the whole job",
             "The bill the work was priced from, the variations that moved it, "
             "the subcontracts that committed the cost, the reconciliation "
             "that says whether the margin survived.")]
    lead = snap(10.6 * 1.65)
    heights = [48 + lead + cv.para_h(b, TEXT, 10.6, lead, col) for _h, b in cards]
    ty = sl.anchor(heights, FOOT - 70, snap(y + 60))
    for i, (head, body) in enumerate(cards):
        cx = X0 + i * (col + GUT)
        cv.hline(cx, ty - 12, col, color="accent" if i == 2 else "rule_light",
                 lw=1.6 if i == 2 else 1.0)
        cv.para(cx, ty + 8, head, font=TEXT_B, size=14.4,
                leading=snap(14.4 * 1.3),
                color="text" if i < 2 else "primary_dark", max_w=col)
        cv.para(cx, ty + 48, body, font=TEXT, size=10.6,
                leading=lead, color="ink_soft", max_w=col)

    cv.hline(X0, FOOT - 52, COLW, color="rule_light", lw=0.5)
    cv.para(X0, FOOT - 32,
            "Re-keying is where the two numbers diverge — and the divergence "
            "is only discovered at month end, in the direction nobody wants.",
            font=TEXT_I, size=10.6, leading=snap(10.6 * 1.5), color="ink_soft",
            max_w=COLW * 0.78)
    sl.foot("problem")


def s03_what(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("what it is")
    sl.h2(snap(y + 26), "The middle layer, built as Odoo modules", size=30,
          max_w=COLW * 0.55)

    e = sl.lede(snap(y + 96),
                "So the accounting, purchasing, inventory and HR underneath it "
                "are already integrated rather than interfaced. A defect "
                "raised on a drawing can become a back-charge on a "
                "subcontractor's payment certificate. A variation approved by "
                "the board appends its lines to the bill and appears in the "
                "next certificate. Nothing is re-keyed.",
                size=10.8, max_w=COLW * 0.38)

    sl.notes(X0, snap(e + 30), [
        ("base", "Odoo 18.0 Community, pinned by commit"),
        ("reuse", "OCA modules pinned by revision; full accounting from a "
                  "free LGPL-3 community suite"),
        ("own", "%s Majal modules across construction, facilities and platform"
                % FACTS["modules"]),
    ], COLW * 0.38, gap=52, size=9.0, step=22)

    iw = COLW * 0.56
    ih = cv.img_h_for_w("dashboard", iw)
    cv.plate("dashboard", X1 - iw, snap(y + 60), w=iw, edge="rule_light",
             tick_color="primary")
    cv.caption(X1 - iw, snap(y + 60) + ih + 14,
               "The executive portfolio dashboard.", iw, size=7.8,
               color="muted")
    sl.foot("what it is")


def s04_who(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("who it is for")
    sl.h2(snap(y + 26), "Three readers, one database", size=32)

    col = (COLW - 2 * GUT) / 3.0
    cards = [
            ("Main contractors",
             "BOQ-priced work, interim payment certificates with retention, "
             "subcontract packages, variations, cost value reconciliation, and "
             "site records that stand up in a claim.",
             "boq · progress_billing · subcontractor · change_order · report"),
            ("Developers & consultants",
             "Drawing registers with revision control, RFIs and submittals "
             "with ball-in-court, tender packages levelled line by line, and "
             "portfolio-level commercial exposure.",
             "drawing · rfi · submittal · tender · dashboard"),
            ("Facilities operators",
             "Asset registry on a real location hierarchy, preventive "
             "maintenance that generates its own work orders, SLAs on a "
             "business calendar, spare parts from real stores.",
             "facility_asset · workorder · sla · contract · inventory")]
    ty = sl.anchor([160], FOOT - 74, snap(y + 60))
    for i, (who, what, mods) in enumerate(cards):
        cx = X0 + i * (col + GUT)
        cv.hline(cx, ty - 12, col, color="accent", lw=1.6)
        cv.para(cx, ty + 8, who, font=TEXT_B, size=13.0,
                leading=snap(13.0 * 1.3), color="text", max_w=col)
        cv.para(cx, ty + 34, what, font=TEXT, size=9.2,
                leading=snap(9.2 * 1.6), color="ink_soft", max_w=col)
        cv.para(cx, ty + 124, mods, font=MONO, size=6.4,
                leading=snap(6.4 * 1.6), color="muted", max_w=col)

    cv.hline(X0, FOOT - 46, COLW, color="rule_light", lw=0.5)
    cv.para(X0, FOOT - 26,
            "Subcontractors, clients and consultants arrive as free Odoo "
            "portal users — the people who only need to answer an RFI or "
            "accept a defect are not a per-seat line item.",
            font=TEXT_I, size=10.0, leading=snap(10.0 * 1.5), color="ink_soft",
            max_w=COLW * 0.76)
    sl.foot("audience")


def s05_spine(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("how it works")
    sl.h2(snap(y + 26), "Tender to reconciliation, on one ledger", size=30)

    # the spine runs horizontally here — the same diagram, turned
    # Each stage owns a full cell and sits at its centre, so the first and
    # last labels cannot run off the trim — the failure the guard caught.
    sy = snap(y + 120)
    n = len(SPINE)
    step = COLW / n
    cv.hline(X0 + step / 2, sy, COLW - step, color="accent", lw=0.9)

    notes = [
        "scope pulled from the bill; bids compared line by line",
        "priced lines with a budget split; locked on approval",
        "the winning price lands as committed cost",
        "approved variations append to the bill",
        "certify, withhold retention, invoice",
        "earned and forecast margin against tender",
    ]
    for i, ((name, mod), note) in enumerate(zip(SPINE, notes)):
        cx = X0 + (i + 0.5) * step
        cv.node(cx, sy, 3.0)
        cv.ring(cx, sy, 6.4, lw=0.6)
        cv.label(cx, sy - 22, "%02d" % (i + 1), size=6.4, color="accent",
                 track=1.6, align="center")
        cv.para(cx, sy + 26, name, font=TEXT_B, size=10.4,
                leading=snap(10.4 * 1.3), color="text", max_w=step * 0.88,
                align="center")
        cv.para(cx, sy + 58, note, font=TEXT, size=7.6,
                leading=snap(7.6 * 1.55), color="ink_soft",
                max_w=step * 0.88, align="center")
        cv.label(cx, sy + 106, mod, size=5.2, color="muted", track=0.6,
                 align="center")

    iw = COLW * 0.62
    ih = cv.img_h_for_w("boq", iw)
    py = FOOT - 26 - ih
    cv.plate("boq", X0, py, w=iw, edge="rule_light", tick_color="primary")
    cv.para(X0 + iw + GUT, py + 10,
            "The bill it starts in: contract amount against budget cost, "
            "margin, per-cent certified and the approval state — versioned, "
            "and locked once approved.",
            font=TEXT, size=8.8, leading=snap(8.8 * 1.55), color="ink_soft",
            max_w=X1 - X0 - iw - GUT)
    sl.foot("commercial spine")


def s06_map(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("capability map")
    sl.h2(snap(y + 26), "%s modules, five groups, one database"
          % FACTS["modules"], size=30)

    ty = snap(y + 92)
    n = len(MODULE_GROUPS)
    col = (COLW - (n - 1) * 12.0) / n
    for i, (grp, mods) in enumerate(MODULE_GROUPS):
        cx = X0 + i * (col + 12.0)
        cv.hline(cx, ty - 12, col, color="accent", lw=1.4)
        cv.para(cx, ty + 4, grp, font=TEXT_B, size=10.2,
                leading=snap(10.2 * 1.25), color="text", max_w=col)
        cv.label(cx, ty + 32, "%d modules" % len(mods), size=6.2,
                 color="primary", track=1.5)
        ry = ty + 50
        for mod, desc in mods:
            cv.rect(cx, ry - 7, 1.8, 9, fill="accent", alpha=0.55)
            cv.para(cx + 6, ry, desc, font=TEXT, size=7.6,
                    leading=snap(7.6 * 1.4), color="ink_soft", max_w=col - 6)
            ry += 20.0

    cv.hline(X0, FOOT - 34, COLW, color="rule_light", lw=0.5)
    cv.label(X0, FOOT - 18,
             "every module is shipped and installable; module names are the "
             "directories under custom-addons/", size=6.2, color="muted",
             track=1.4)
    sl.foot("capability map")


def s07_bim(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("the model")
    sl.h2(snap(y + 26), "Colour everything and you have said nothing",
          size=28, max_w=COLW * 0.60)

    gap = 16.0
    py = snap(y + 92)
    # room for the tag, the note, the closing rule and two lines under it
    avail = FOOT - 76 - py
    iw = min((COLW - 2 * gap) / 3.0, cv.img_w_for_h("bim-original", avail))
    ih = cv.img_h_for_w("bim-original", iw)
    px0 = X0 + (COLW - (3 * iw + 2 * gap)) / 2.0
    for i, (name, tag, note) in enumerate([
            ("bim-original", "original colours from the file",
             "The authoring tool describing itself."),
            ("bim-legend", "coloured by element class",
             "Useful once, for auditing an export."),
            ("bim-viewer", "shaded — one material",
             "The default in Majal.")]):
        cx = px0 + i * (iw + gap)
        cv.plate(name, cx, py, w=iw, edge="rule_dark",
                 tick_color="accent" if i == 2 else "rule_dark")
        cv.label(cx, py + ih + 15, tag, size=6.2,
                 color="accent" if i == 2 else "muted", track=1.4)
        cv.text(cx, py + ih + 30, note, font=TEXT_I, size=8.4,
                color="accent_pale" if i == 2 else "muted")

    cv.hline(X0, FOOT - 46, COLW, color="rule_dark", lw=0.5)
    cv.para(X0, FOOT - 30,
            "Colour is reserved for elements carrying an open item — an RFI, a "
            "defect, a task, a bill line — so the only thing that reads as "
            "coloured is the thing somebody has to act on. Same model, same "
            "camera, same crop.",
            font=TEXT, size=9.4, leading=snap(9.4 * 1.5), color="accent_pale",
            max_w=COLW * 0.86)
    sl.foot("BIM")


def s08_bim_limits(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("the model — what it does, and where it stops")
    sl.h2(snap(y + 26), "A record, not a picture", size=32)

    ty = snap(y + 104)
    half = (COLW - GUT * 2) / 2.0

    cv.label(X0, ty - 14, "what it does", size=6.6, color="primary", track=2.2)
    sl.notes(X0, ty + 4, [
        ("index", "a dependency-free STEP reader pulls elements, property sets "
                  "and quantities server-side — no geometry toolchain"),
        ("identity", "links are keyed on the IFC GlobalId, so an RFI raised "
                     "against a wall survives the model being re-issued"),
        ("viewer", "storey filtering, isolate/hide, live section cut, IFC "
                   "properties on selection, and 3D pins that create the "
                   "record they stand for"),
        ("4D", "a date slider driving visibility from the dates of the "
               "programme tasks elements are linked to"),
        ("exchange", "BCF 2.1 archives round-trip with Solibri, Navisworks, "
                     "BIMcollab and Revizto, matched on topic GUID"),
    ], half, gap=54, size=9.2, step=24)

    cv.label(X0 + half + GUT * 2, ty - 14, "where it stops", size=6.6,
             color="accent", track=2.2)
    cv.rect(X0 + half + GUT, ty - 24, 1.6, 250, fill="accent", alpha=0.5)
    sl.notes(X0 + half + GUT * 2, ty + 4, [
        ("clash", "bounding-box overlap, not triangle-precise — a duct passing "
                  "cleanly through a door opening will be reported"),
        ("cap", "clash results are capped at %s per run, and the count skipped "
                "is kept" % FACTS["clash_cap"]),
        ("units", "IfcUnitAssignment is not read; a model authored in "
                  "millimetres reports millimetres"),
        ("writing", "the module reads IFC and writes BCF; it never edits or "
                    "re-exports an IFC file"),
        ("formats", "DWG is not supported. Indexing is capped at %s per file."
                    % FACTS["ifc_cap"]),
    ], half, gap=54, size=9.2, step=24)

    cv.hline(X0, FOOT - 30, COLW, color="rule_light", lw=0.5)
    cv.label(X0, FOOT - 14,
             "these limits are published in docs/bim.md, not discovered on a job",
             size=6.4, color="muted", track=1.5)
    sl.foot("BIM limits")


def s09_control(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("control and audit")
    sl.h2(snap(y + 26), "The check is in the method", size=32,
          max_w=COLW * 0.55)

    e = sl.lede(snap(y + 82),
                "A groups attribute on a view hides a control; it does not "
                "stop the method being called. Majal checks the approval rule "
                "inside the action that commits the document, so it holds from "
                "a button, a script or RPC.",
                size=10.0, max_w=COLW * 0.42)

    sl.notes(X0, snap(e + 26), [
        ("rules", "kind, project and value band → a chain of signatures, "
                  "configured as data rather than code"),
        ("duties", "the person who raised a document cannot sign it"),
        ("order", "a chain cannot be signed from the bottom up"),
        ("reasons", "a rejection without one guarantees a second cycle"),
        ("delegation", "records whose authority was used, not who was logged in"),
    ], COLW * 0.42, gap=58, size=9.2, step=26)

    # --- the ladder, on the right ----------------------------------------
    lx = X0 + COLW * 0.52
    lw = X1 - lx
    ly = snap(y + 70)
    for i, (band, k, who) in enumerate([
            ("up to 50,000", 1, "Project manager"),
            ("50,000 – 250,000", 2, "Project manager, commercial manager"),
            ("above 250,000", 3, "Project manager, commercial manager, board")]):
        ry = ly + i * 54
        cv.hline(lx, ry, lw, color="rule_light", lw=0.5)
        cv.label(lx, ry + 15, band, size=7.4, color="text", track=1.4,
                 font=MONO_B)
        cv.text(lx, ry + 29, who, font=TEXT, size=8.2, color="ink_soft")
        for sgn in range(3):
            mx = X1 - 8 - (2 - sgn) * 18
            if sgn < k:
                cv.node(mx, ry + 18, 3.0)
                cv.ring(mx, ry + 18, 6.2, lw=0.6)
            else:
                cv.ring(mx, ry + 18, 6.2, color="rule_light", lw=0.6)
    cv.hline(lx, ly + 3 * 54, lw, color="rule_light", lw=0.5)
    cv.label(lx, ly + 3 * 54 + 14,
             "an example rule set for variation orders", size=6.2,
             color="muted", track=1.3)

    iw = lw
    ih = cv.img_h_for_w("approval-inbox", iw)
    py = snap(ly + 3 * 54 + 44)
    cv.plate("approval-inbox", lx, py, w=iw, edge="rule_light",
             tick_color="primary")
    cv.label(lx, py - 8, "one inbox across every wired document type", size=6.2,
             color="primary", track=1.5)
    sl.foot("control & audit")


def s10_field(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("mobile and the field")
    sl.h2(snap(y + 26), "A day that fits on a phone", size=32,
          max_w=COLW * 0.50)

    phone_h = FOOT - 24 - snap(y + 40)
    phone_w = cv.img_w_for_h("defect-mobile", phone_h)
    phone_x = X1 - phone_w
    tw = phone_x - 30 - X0

    e = sl.lede(snap(y + 84),
                "My Day collects everything assigned to one person — approvals "
                "waiting on them, their defects, inspections, tasks, RFIs and "
                "permits — on one screen, ordered by how much trouble it "
                "causes to ignore.",
                size=10.0, max_w=tw)

    e = sl.notes(X0, snap(e + 24), [
        ("measured", "at a real 390 px viewport, against a running instance — "
                     "not assumed"),
        ("pins", "sheet PDFs render on a canvas; three taps turn a point on a "
                 "drawing into a task, RFI, defect or note"),
        ("installable", "Odoo 18 ships a manifest and service worker; Majal "
                        "brands them"),
        ("offline", "deliberately bounded — draft, checklist and scan actions "
                    "work without signal; approvals, financial posting, "
                    "deletes and BIM stay online"),
    ], tw, gap=64, size=9.0, step=24)

    cv.plate("defect-mobile", phone_x, snap(y + 40), h=phone_h,
             edge="rule_dark", tick_color="accent")

    iw = tw * 0.98
    ih = cv.img_h_for_w("my-day", iw)
    py = FOOT - 24 - ih
    if py > e + 20:
        cv.plate("my-day", X0, py, w=iw, edge="rule_dark",
                 tick_color="rule_dark")
    sl.foot("field")


def s11_facilities(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("after handover")
    sl.h2(snap(y + 26), "CAFM that knows what a promise costs", size=30)

    col = (COLW - 3 * 16.0) / 4.0
    cards = [
            ("Assets that have a place",
             "A site → building → floor → room hierarchy with criticality, "
             "warranties, meters and readings, failure codes and downtime — "
             "plus QR and NFC tags with append-only scan events."),
            ("Maintenance that starts itself",
             "Job plans, and preventive-maintenance plans — calendar- and "
             "meter-based — that generate work orders by cron, each carrying "
             "a checklist copied from its job plan."),
            ("Promises with a clock",
             "SLAs matched from a policy matrix on priority, type, category "
             "and criticality, with both clocks measured on a business "
             "calendar so a promise does not burn overnight."),
            ("Contracts with a margin",
             "Annual maintenance contracts carry the SLA that was sold, keep "
             "absorbed and recoverable cost apart, and show a live margin "
             "against what they have invoiced.")]
    lead = snap(9.8 * 1.6)
    heights = [46 + lead + cv.para_h(b, TEXT, 9.8, lead, col) for _h, b in cards]
    ty = sl.anchor(heights, FOOT - 64, snap(y + 60))
    for i, (head, body) in enumerate(cards):
        cx = X0 + i * (col + 16.0)
        cv.hline(cx, ty - 12, col, color="accent", lw=1.4)
        cv.para(cx, ty + 8, head, font=TEXT_B, size=12.6,
                leading=snap(12.6 * 1.3), color="text", max_w=col)
        cv.para(cx, ty + 46, body, font=TEXT, size=9.8,
                leading=lead, color="ink_soft", max_w=col)

    cv.hline(X0, FOOT - 46, COLW, color="rule_light", lw=0.5)
    cv.para(X0, FOOT - 26,
            "Spare parts are held in real Odoo stores attached to facility "
            "locations and drawn down by work orders, so parts cost stops "
            "being a number somebody typed and becomes what left the shelf.",
            font=TEXT_I, size=9.8, leading=snap(9.8 * 1.5), color="ink_soft",
            max_w=COLW * 0.80)
    sl.foot("facilities")


def s12_open(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("open source and self-hosting")
    hb = sl.h1(y + 6, ["YOUR SERVER.", "YOUR DATABASE.", "YOUR SOURCE."],
               max_h=120.0, max_w=COLW * 0.44)

    e = sl.lede(snap(hb + 28),
                "Odoo 18 Community (LGPL-3) pinned by commit, OCA modules "
                "pinned by revision, and the Majal suite itself — 35 modules "
                "declared LGPL-3, two declared AGPL-3.",
                size=10.0, max_w=COLW * 0.44)

    sl.notes(X0, snap(e + 24), [
        ("deploy", "docker compose, or a bare-metal install from pinned "
                   "sources"),
        ("recover", "seven curated recovery slots, every archive verified with "
                    "SHA-256, restored by an audited two-step offline "
                    "procedure a live web process cannot trigger"),
        ("access", "six rank-checked client roles and twelve audited "
                   "capability tiers instead of raw permission grids"),
    ], COLW * 0.44, gap=54, size=9.0, step=24)

    # the accumulation, on the right
    gx = X0 + COLW * 0.50
    gw = X1 - gx
    flat = [m for _g, mods in MODULE_GROUPS for m in mods]
    cols = 3
    cell = gw / cols
    gy = snap(y + 34)
    cv.label(gx, gy - 10, "every module in the suite — %s in all"
             % FACTS["modules"], size=6.3, color="muted", track=1.8)
    for i, (mod, _d) in enumerate(flat):
        r, cc = divmod(i, cols)
        px = gx + cc * cell
        py = gy + r * 21.0
        cv.rect(px, py, 1.8, 13.0, fill="accent", alpha=0.26 + 0.10 * (i % 5))
        cv.label(px + 7, py + 9.5, mod, size=5.8, color="accent_pale",
                 track=0.45)
    sl.foot("open source")


def s13_roadmap(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("where it is going")
    sl.h2(snap(y + 26), "Shipped, in progress, and next", size=32)

    col = (COLW - 2 * GUT) / 3.0
    groups = [
        ("Shipped", "phases 0–3", "accent", [
            "Foundation: pinned Odoo core, pinned OCA and third-party addons",
            "Construction core: BOQ, drawings, RFIs, submittals",
            "Field: pins on plans, CPM programme, defects, daily logs, forms",
            "Commercial: subcontracts, variations, certificates, tender, CVR",
        ]),
        ("In progress", "phase 4", "primary", [
            "Facilities asset registry with a real location hierarchy",
            "Job plans and preventive-maintenance generation",
            "SLAs on a business calendar, and maintenance contracts",
            "Spare parts in real stores; occupant self-service portal",
        ]),
        ("Next", "phase 5", "muted", [
            "Drawing revision compare — side-by-side and overlay",
            "OCR title-block auto-naming on drawing upload",
            "Deeper analytics and dashboards",
            "Offline data capture beyond the bounded field workspace",
        ]),
    ]
    lead = snap(9.6 * 1.55)
    heights = [56 + sum(cv.para_h(it, TEXT, 9.6, lead, col - 11) + lead + 24
                        for it in g[3]) for g in groups]
    ty = sl.anchor(heights, FOOT - 52, snap(y + 56))
    for i, (head, phase, tone, items) in enumerate(groups):
        cx = X0 + i * (col + GUT)
        cv.hline(cx, ty - 12, col, color=tone if tone != "muted" else
                 "rule_light", lw=1.6 if tone != "muted" else 1.0)
        cv.text(cx, ty + 8, head, font=TEXT_B, size=13.0, color="text")
        cv.label(cx, ty + 24, phase, size=6.2,
                 color=tone if tone != "muted" else "muted", track=1.6)
        ry = ty + 56
        for it in items:
            cv.node(cx + 2, ry - 4, 1.5,
                    color=tone if tone != "muted" else "muted")
            last = cv.para(cx + 11, ry, it, font=TEXT, size=9.6,
                           leading=snap(9.6 * 1.55), color="ink_soft",
                           max_w=col - 11)
            ry = snap(last + 24)

    cv.hline(X0, FOOT - 34, COLW, color="rule_light", lw=0.5)
    cv.label(X0, FOOT - 18,
             "the full dependency spine and phase detail are in docs/roadmap.md",
             size=6.3, color="muted", track=1.5)
    sl.foot("roadmap")


def s14_ask(sl):
    cv = sl.cv
    sl.ground()
    y = sl.eyebrow("the ask")
    hb = sl.h1(y + 10, ["START WITH", "THE SOURCE."], max_h=150.0,
               max_w=COLW * 0.56)

    sl.lede(snap(hb + 32),
            "Read the code, read the limits, run it on your own server. "
            "Nothing here asks you to take a claim on trust.",
            size=11.6, max_w=COLW * 0.50)

    lx = X0 + COLW * 0.58
    ly = snap(y + 50)
    for i, (k, v) in enumerate([
            ("source", FACTS["source"]),
            ("site", FACTS["domain"]),
            ("docs", "docs.majalops.com"),
            ("licence", "LGPL-3 (two modules AGPL-3)"),
            ("run it", "docker compose up, self-hosted")]):
        ry = ly + i * 54
        cv.hline(lx, ry, X1 - lx, color="rule_dark", lw=0.5)
        cv.label(lx, ry + 16, k, size=6.4, color="accent", track=2.0)
        cv.text(lx, ry + 32, v, font=TEXT, size=10.6, color="surface")

    cv.hline(X0, FOOT - 40, COLW * 0.50, color="rule_dark", lw=0.5)
    cv.ar_text(X0 + COLW * 0.50, FOOT - 22,
               "الشيفرة المصدرية متاحة للاطلاع", font=AR, size=10.0,
               color="accent_pale")
    sl.foot("next step")


# --------------------------------------------------------------------------

SLIDES = [
    (s01_cover, True, ""),
    (s02_problem, False, "problem"),
    (s03_what, False, "what it is"),
    (s04_who, False, "audience"),
    (s05_spine, False, "commercial spine"),
    (s06_map, False, "capability map"),
    (s07_bim, True, "BIM"),
    (s08_bim_limits, False, "BIM limits"),
    (s09_control, False, "control & audit"),
    (s10_field, True, "field"),
    (s11_facilities, False, "facilities"),
    (s12_open, True, "open source"),
    (s13_roadmap, False, "roadmap"),
    (s14_ask, True, "next step"),
]


def build():
    register_fonts()
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "majal-pitch-deck-16x9.pdf")
    c = rl_canvas.Canvas(path, pagesize=(W, H))
    c.setTitle("Majal — construction & facilities management ERP")
    c.setAuthor("Majal")
    c.setSubject("Open-source construction and facilities ERP on Odoo 18 "
                 "Community")
    for i, (fn, dark, title) in enumerate(SLIDES):
        cv = Canvas(c, W, H)
        fn(Slide(cv, i + 1, len(SLIDES), dark, title))
        c.showPage()
    c.save()
    return [(path, len(SLIDES))]


if __name__ == "__main__":
    build()
