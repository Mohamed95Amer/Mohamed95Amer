"""Majal posters and social pieces.

Six pieces, one idea each. Print items are exported CMYK with 3 mm bleed and
crop marks; screen items are exported at their exact pixel dimensions.
"""

import os

from reportlab.pdfgen import canvas as rl_canvas

from majal_brand import (
    AR, AR_B, AR_L, AR_SB, BASE, DISPLAY, DISPLAY_R, FACTS, MM, MONO, MONO_B,
    ROOT, SPINE, TEXT, TEXT_B, TEXT_I, Canvas, register_fonts, snap,
)

OUT = os.path.join(ROOT, "posters")


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def fit(cv, s, font, target_w, hi=400.0, track_ratio=0.0):
    """Largest point size at which `s` in `font` fits `target_w`."""
    lo = 4.0
    for _ in range(48):
        mid = (lo + hi) / 2
        if cv.width(s, font, mid, mid * track_ratio) <= target_w:
            lo = mid
        else:
            hi = mid
    return lo


def crop_marks(cv, bleed, page_w, page_h, color="rule_dark"):
    """Trim marks sitting in the bleed, 3 mm long, offset 1 mm from trim."""
    L, off = 3 * MM, 1 * MM
    tw, th = page_w - 2 * bleed, page_h - 2 * bleed
    for x in (bleed, bleed + tw):
        for y in (bleed, bleed + th):
            cv.hline(x - (L + off) if x == bleed else x + off, y, L,
                     color=color, lw=0.35)
            cv.vline(x, y - (L + off) if y == bleed else y + off, L,
                     color=color, lw=0.35)


def footer_dark(cv, x, y, w, right_note=None, tint="rule_dark"):
    """The system footer: mark, wordmark, source line, url. One rule above."""
    cv.hline(x, y, w, color=tint, lw=0.5)
    ms = 13.0
    cv.mark(x, y + 9, ms)
    cv.text(x + ms + 7, y + 9 + ms * 0.74, "MAJAL", font=DISPLAY, size=ms * 1.02,
            color="surface", track=ms * 0.045)
    cv.label(x + w, y + 9 + ms * 0.40, FACTS["domain"], size=7.0,
             color="accent", track=1.7, align="right")
    cv.label(x + w, y + 9 + ms * 0.40 + 11, right_note or
             "open source · %s · %s" % (FACTS["base"], FACTS["licence"]),
             size=6.0, color="muted", track=1.3, align="right")


# --------------------------------------------------------------------------
# 1 + 2. A3 — the commercial spine, English and Arabic RTL
# --------------------------------------------------------------------------

AR_SPINE = [
    ("المناقصة", "construction_tender"),
    ("جدول الكميات", "construction_boq"),
    ("عقد الباطن", "construction_subcontractor"),
    ("أمر التغيير", "construction_change_order"),
    ("شهادة الدفع", "construction_progress_billing"),
    ("مطابقة التكلفة والقيمة", "construction_report"),
]

SPINE_NOTE = [
    "Packages priced from the bill, compared line by line.",
    "Sections and priced lines, versioned and locked on approval.",
    "The winning price lands as committed cost.",
    "Approved variations append to the bill and move the contract value.",
    "Certify the work done, withhold retention, raise the invoice.",
    "Earned margin, forecast margin, and the movement against tender.",
]

AR_SPINE_NOTE = [
    "حزم مسعّرة من جدول الكميات، تُقارَن بندًا ببند.",
    "أقسام وبنود مسعّرة، بإصدارات وقفل عند الاعتماد.",
    "سعر العطاء الفائز يُسجّل كتكلفة ملتزم بها.",
    "أوامر التغيير المعتمدة تُضاف إلى الجدول وتُعدّل قيمة العقد.",
    "اعتماد الأعمال المنجزة، واستقطاع الضمان، ثم إصدار الفاتورة.",
    "الهامش المحقق والمتوقع، والفرق عن هامش العطاء.",
]


def poster_a3(path, rtl=False, print_mode=False, bleed_mm=0.0):
    bleed = bleed_mm * MM
    tw, th = 297 * MM, 420 * MM
    pw, ph = tw + 2 * bleed, th + 2 * bleed

    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — one system from tender to handover" if not rtl
               else "Majal — poster (Arabic)")
    cv = Canvas(c, pw, ph, print_mode=print_mode)

    # ground: full bleed, one slow rake of light
    cv.raking_light(0, 0, pw, ph, lift=0.20)

    M = 26 * MM                      # margin from trim
    x0 = bleed + M
    x1 = bleed + tw - M
    colw = x1 - x0
    top = bleed + 24 * MM
    lead_edge = x1 if rtl else x0    # the edge type is set from
    align = "right" if rtl else "left"

    # --- eyebrow ---------------------------------------------------------
    if rtl:
        cv.ar_text(lead_edge, top + 8,
                   "مجال — نظام إدارة المقاولات والمرافق",
                   font=AR_SB, size=11.5, color="accent")
    else:
        cv.label(lead_edge, top + 8,
                 "Majal — construction & facilities ERP",
                 size=8.6, color="accent", track=3.0, align=align)
    cv.hline(x0, top + 20, colw, color="rule_dark", lw=0.6)

    # --- headline --------------------------------------------------------
    if rtl:
        ar_lines = [
            "نظام واحد",
            "من المناقصة",
            "إلى التسليم",
        ]
        size = min(fit(cv, __import__("majal_brand").ar(l), AR_B, colw * 0.94)
                   for l in ar_lines)
        lead = snap(size * 1.16)
        y = top + 20 + snap(size * 0.98)
        for i, l in enumerate(ar_lines):
            cv.ar_text(lead_edge, y + i * lead, l, font=AR_B, size=size,
                       color="surface")
        head_bottom = y + (len(ar_lines) - 1) * lead
    else:
        lines = ["ONE SYSTEM", "FROM TENDER", "TO HANDOVER"]
        size = min(fit(cv, l, DISPLAY, colw, track_ratio=0.012) for l in lines)
        lead = snap(size * 0.84)
        y = top + 20 + snap(size * 0.76)
        for i, l in enumerate(lines):
            cv.text(lead_edge, y + i * lead, l, font=DISPLAY, size=size,
                    color="surface", track=size * 0.012, align=align)
        head_bottom = y + (len(lines) - 1) * lead

    # --- standfirst ------------------------------------------------------
    sy = snap(head_bottom + 30 * MM)
    if rtl:
        cv.ar_para(lead_edge, sy,
                   "دفتر واحد يربط العطاء بالجدول، والجدول بعقود الباطن، "
                   "والتغييرات بشهادات الدفع.",
                   font=AR_L, size=13.5, leading=snap(13.5 * 1.75),
                   color="accent_pale", max_w=colw * 0.72)
    else:
        cv.para(lead_edge, sy,
                "One ledger carries the tender into the bill, the bill into the "
                "subcontracts, and every variation into the next certificate.",
                font=TEXT, size=12.5, leading=snap(12.5 * 1.62),
                color="accent_pale", max_w=colw * 0.70)

    # --- the load path ---------------------------------------------------
    stages = AR_SPINE if rtl else SPINE
    notes = AR_SPINE_NOTE if rtl else SPINE_NOTE

    foot_y = bleed + th - 26 * MM
    spine_top = snap(sy + 26 * MM)
    spine_bot = snap(foot_y - 30 * MM)
    step = (spine_bot - spine_top) / (len(stages) - 1)

    sx = (x1 - 4 * MM) if rtl else (x0 + 4 * MM)
    cv.vline(sx, spine_top, spine_bot - spine_top, color="accent", lw=0.9)
    # the line runs on past the last node, into the footer rule: a load path
    # does not stop where the diagram stops
    cv.vline(sx, spine_bot, foot_y - spine_bot, color="accent", lw=0.9,
             alpha=0.32)

    tx = sx - 11 * MM if rtl else sx + 11 * MM
    text_w = (tx - x0) if rtl else (x1 - tx)

    for i, (name, mod) in enumerate(stages):
        yy = spine_top + i * step
        cv.hline(sx if not rtl else tx, yy, 11 * MM - 2.2, color="accent",
                 lw=0.5, alpha=0.55)
        cv.node(sx, yy, 2.6)
        cv.ring(sx, yy, 5.4, lw=0.5)

        cv.label(tx, yy - 8.5, "%02d" % (i + 1), size=6.6, color="accent",
                 track=1.6, align=align)
        if rtl:
            cv.ar_text(tx, yy + 5.5, name, font=AR_SB, size=17,
                       color="surface")
            cv.ar_para(tx, yy + 22, notes[i], font=AR_L, size=9.4,
                       leading=snap(9.4 * 1.7), color="muted",
                       max_w=text_w * 0.90)
        else:
            cv.text(tx, yy + 5.5, name, font=TEXT_B, size=15.5,
                    color="surface", align=align)
            cv.para(tx, yy + 21, notes[i], font=TEXT, size=9.2,
                    leading=snap(9.2 * 1.55), color="muted",
                    max_w=text_w * 0.86, align=align)
        cv.label(x1 if not rtl else x0, yy + 5.0, mod, size=6.4,
                 color="rule_dark", track=1.2,
                 align="left" if rtl else "right")

    # --- footer ----------------------------------------------------------
    cv.hline(x0, foot_y, colw, color="rule_dark", lw=0.5)
    ms = 16.0
    if rtl:
        cv.mark(x1 - ms, foot_y + 12, ms)
        cv.text(x1 - ms - 8, foot_y + 12 + ms * 0.74, "MAJAL", font=DISPLAY,
                size=ms * 1.02, color="surface", track=ms * 0.045,
                align="right")
        cv.ar_text(x0, foot_y + 12 + ms * 0.32,
                   "واجهة عربية كاملة من اليمين إلى اليسار",
                   font=AR, size=9.2, color="accent", align="left")
        cv.ar_text(x0, foot_y + 12 + ms * 0.32 + 13,
                   "مفتوح المصدر · مبني على Odoo 18 Community · LGPL-3",
                   font=AR_L, size=8.0, color="muted", align="left")
        cv.label(x0, foot_y + 12 + ms * 0.32 + 26, FACTS["domain"], size=7.4,
                 color="muted", track=1.6, align="left")
    else:
        cv.mark(x0, foot_y + 12, ms)
        cv.text(x0 + ms + 8, foot_y + 12 + ms * 0.74, "MAJAL", font=DISPLAY,
                size=ms * 1.02, color="surface", track=ms * 0.045)
        cv.label(x1, foot_y + 12 + ms * 0.32, FACTS["domain"], size=8.4,
                 color="accent", track=2.0, align="right")
        cv.label(x1, foot_y + 12 + ms * 0.32 + 13,
                 "%s custom modules · %s · %s"
                 % (FACTS["modules"], FACTS["base"], FACTS["licence"]),
                 size=7.0, color="muted", track=1.3, align="right")
        cv.label(x1, foot_y + 12 + ms * 0.32 + 26,
                 "english & arabic, right-to-left throughout",
                 size=7.0, color="muted", track=1.3, align="right")

    if bleed:
        crop_marks(cv, bleed, pw, ph)

    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# 3. 1080 x 1350 — BIM
# --------------------------------------------------------------------------

def poster_bim(path):
    pw, ph = 540.0, 675.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — an RFI can point at a wall")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.18)

    M = 40.0
    x0, x1 = M, pw - M
    colw = x1 - x0

    cv.label(x0, 46, "Majal — BIM coordination", size=7.4, color="accent",
             track=3.0)
    cv.hline(x0, 56, colw, color="rule_dark", lw=0.6)

    lines = ["AN RFI CAN", "POINT AT", "A WALL."]
    size = min(fit(cv, l, DISPLAY, colw, track_ratio=0.012) for l in lines)
    lead = snap(size * 0.83)
    y = 56 + snap(size * 0.78)
    for i, l in enumerate(lines):
        cv.text(x0, y + i * lead, l, font=DISPLAY, size=size, color="surface",
                track=size * 0.012)
    hb = y + 2 * lead

    # --- the element field -----------------------------------------------
    # An abstract axonometric lattice: patient repetition, one marked element.
    fy = snap(hb + 40)
    fh = 210.0
    cols, rows = 11, 7
    cw, ch = colw / cols, fh / rows
    skew = 0.42
    mark_c, mark_r = 7, 3

    for r in range(rows):
        for cx in range(cols):
            px = x0 + cx * cw + (rows - 1 - r) * skew * cw * 0.42
            py = fy + r * ch
            w_, h_ = cw * 0.62, ch * 0.50
            hot = (cx == mark_c and r == mark_r)
            if px + w_ > x1 + 0.5:
                continue
            cv.rect(px, py, w_, h_, stroke="accent" if hot else "rule_dark",
                    lw=1.0 if hot else 0.45)
            if hot:
                cv.rect(px, py, w_, h_, fill="accent", alpha=0.16)

    # the link: node on the element, leader out to the record
    hx = x0 + mark_c * cw + (rows - 1 - mark_r) * skew * cw * 0.42 + cw * 0.31
    hy = fy + mark_r * ch + ch * 0.25
    cv.node(hx, hy, 2.4)
    cv.ring(hx, hy, 5.6, lw=0.6)
    lx = x0 + 14
    ly = fy + fh + 30
    cv.path([(hx, hy + 5.6), (hx, ly), (lx, ly)], color="accent", lw=0.7,
            alpha=0.8)
    cv.node(lx, ly, 2.0)
    cv.label(lx + 10, ly + 3.0, "globalid  ·  2o2gzsjxd6chvyzvj9$k1w",
             size=6.6, color="accent", track=1.1)

    # --- standfirst ------------------------------------------------------
    sy = snap(ly + 34)
    end = cv.para(x0, sy,
                  "Every element in an IFC file carries a GlobalId. Majal keys "
                  "its links on that identity, so an RFI, a defect, a task or a "
                  "bill item stays attached to the element it was raised "
                  "against — through re-issue after re-issue.",
                  font=TEXT, size=10.4, leading=snap(10.4 * 1.62),
                  color="accent_pale", max_w=colw * 0.94)

    cy = snap(end + 30)
    cv.hline(x0, cy - 12, colw, color="rule_dark", lw=0.5)
    for i, (k, v) in enumerate([
            ("index", "property sets & quantities"),
            ("exchange", FACTS["bcf"] + " round-trip"),
            ("4d", "dates from the programme"),
            ("clash", "bounding-box, stated as such")]):
        col = x0 + (colw / 2) * (i % 2)
        row = cy + (i // 2) * 30
        cv.label(col, row, k, size=6.4, color="accent", track=1.8)
        cv.text(col, row + 13, v, font=TEXT, size=8.6, color="muted")

    footer_dark(cv, x0, ph - 84, colw,
                right_note="docs/bim.md states the limits")
    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# 4. 1080 x 1350 — approvals
# --------------------------------------------------------------------------

def poster_approvals(path):
    pw, ph = 540.0, 675.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — the check is in the method")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.18)

    M = 40.0
    x0, x1 = M, pw - M
    colw = x1 - x0

    cv.label(x0, 46, "Majal — delegation of authority", size=7.4,
             color="accent", track=3.0)
    cv.hline(x0, 56, colw, color="rule_dark", lw=0.6)

    lines = ["THE CHECK", "IS IN THE", "METHOD."]
    size = min(fit(cv, l, DISPLAY, colw, track_ratio=0.012) for l in lines)
    lead = snap(size * 0.83)
    y = 56 + snap(size * 0.78)
    for i, l in enumerate(lines):
        cv.text(x0, y + i * lead, l, font=DISPLAY, size=size, color="surface",
                track=size * 0.012)
    hb = y + 2 * lead

    sy = snap(hb + 34)
    end = cv.para(x0, sy,
                  "A groups attribute on a button hides the control. It does not "
                  "stop the method being called. Majal checks the approval rule "
                  "inside the action that commits the document — so it holds "
                  "from a button, a script or the RPC console.",
                  font=TEXT, size=10.4, leading=snap(10.4 * 1.62),
                  color="accent_pale", max_w=colw * 0.94)

    # --- the ladder ------------------------------------------------------
    ly = snap(end + 42)
    bands = [("up to 50,000", 1, "Project manager"),
             ("50,000 – 250,000", 2, "Project manager, commercial manager"),
             ("above 250,000", 3, "Project manager, commercial manager, board")]
    rowh = 62.0
    for i, (band, n, who) in enumerate(bands):
        ry = ly + i * rowh
        cv.hline(x0, ry, colw, color="rule_dark", lw=0.5)
        cv.label(x0, ry + 17, band, size=8.0, color="surface", track=1.6,
                 font=MONO_B)
        cv.text(x0, ry + 33, who, font=TEXT, size=8.8, color="muted")
        # signatures required, as marks
        for s in range(3):
            mx = x1 - 12 - (2 - s) * 20
            if s < n:
                cv.node(mx, ry + 20, 3.4)
                cv.ring(mx, ry + 20, 7.0, lw=0.6)
            else:
                cv.ring(mx, ry + 20, 7.0, color="rule_dark", lw=0.5)
        cv.label(x1, ry + 40, "%d signature%s" % (n, "" if n == 1 else "s"),
                 size=6.4, color="accent", track=1.4, align="right")
    cv.hline(x0, ly + 3 * rowh, colw, color="rule_dark", lw=0.5)

    cv.label(x0, ly + 3 * rowh + 16,
             "example rule set, shipped as demo data · variation orders",
             size=6.4, color="muted", track=1.3)

    cv.para(x0, snap(ly + 3 * rowh + 42),
            "Segregation of duties, ordered steps, a captured reason, and "
            "delegation that records whose authority was used — with one "
            "“waiting for me” inbox across every kind of document.",
            font=TEXT, size=9.2, leading=snap(9.2 * 1.6), color="accent_pale",
            max_w=colw * 0.94)

    footer_dark(cv, x0, ph - 84, colw,
                right_note="%s document types wired to the approval engine"
                           % FACTS["approval_wired"])
    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# 5. 1920 x 1080 — open source
# --------------------------------------------------------------------------

def banner_open_source(path):
    pw, ph = 960.0, 540.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — 37 modules, one database")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.16)

    M = 58.0
    x0, x1 = M, pw - M
    split = x0 + (x1 - x0) * 0.545

    cv.label(x0, 60, "Majal — construction & facilities ERP", size=7.6,
             color="accent", track=3.0)
    cv.hline(x0, 70, x1 - x0, color="rule_dark", lw=0.6)

    lines = ["%s MODULES." % FACTS["modules"], "ONE DATABASE."]
    size = min(fit(cv, l, DISPLAY, split - x0 - 26, track_ratio=0.010)
               for l in lines)
    lead = snap(size * 0.84)
    y = 70 + snap(size * 0.78)
    for i, l in enumerate(lines):
        cv.text(x0, y + i * lead, l, font=DISPLAY, size=size, color="surface",
                track=size * 0.010)
    hb = y + lead

    end = cv.para(x0, snap(hb + 40),
                  "Tender, bill of quantities, programme, drawings, snags, "
                  "permits, BIM, payment certificates and the facilities work "
                  "orders that follow handover — all in one Odoo 18 Community "
                  "database, under an open-source licence you can read.",
                  font=TEXT, size=10.6, leading=snap(10.6 * 1.62),
                  color="accent_pale", max_w=split - x0 - 30)

    fy = snap(end + 40)
    for i, (k, v) in enumerate([
            ("licence", "%s (two modules AGPL-3)" % FACTS["licence"]),
            ("deploy", "docker compose, self-hosted"),
            ("tests", "%s automated tests" % FACTS["tests"]),
            ("languages", "english + arabic (RTL)")]):
        row = fy + i * 26
        cv.label(x0, row, k, size=6.4, color="accent", track=1.8)
        cv.text(x0 + 78, row, v, font=TEXT, size=9.0, color="muted")

    # --- the accumulation: one tick per module ---------------------------
    gx = split + 34
    gw = x1 - gx
    cols = 7
    cell = gw / cols
    from majal_brand import MODULE_GROUPS
    flat = [(g, m) for g, mods in MODULE_GROUPS for m in mods]
    gy = 108.0
    cv.label(gx, gy - 16, "every module in the suite", size=6.4,
             color="muted", track=1.8)
    for i, (grp, (mod, _desc)) in enumerate(flat):
        r, cc = divmod(i, cols)
        px = gx + cc * cell
        py = gy + r * 30
        cv.rect(px, py, cell - 7, 20, stroke="rule_dark", lw=0.45)
        cv.rect(px, py, 2.4, 20, fill="accent",
                alpha=0.30 + 0.14 * (i % 5))
    n_rows = (len(flat) + cols - 1) // cols
    ly = gy + n_rows * 30 + 6
    cv.hline(gx, ly, gw - 7, color="rule_dark", lw=0.5)
    for i, (grp, mods) in enumerate(MODULE_GROUPS):
        cv.label(gx, ly + 18 + i * 15, "%s — %d" % (grp, len(mods)),
                 size=6.6, color="accent_pale", track=1.4, font=MONO)

    footer_dark(cv, x0, ph - 78, x1 - x0,
                right_note=FACTS["source"])
    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# 6. 1080 x 1080 — My Day / field
# --------------------------------------------------------------------------

def poster_my_day(path):
    pw, ph = 540.0, 540.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — everything that is yours, on one screen")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.18)

    M = 38.0
    x0, x1 = M, pw - M
    right_w = 168.0
    split = x1 - right_w - 26

    cv.label(x0, 44, "Majal — My Day", size=7.4, color="accent", track=3.0)
    cv.hline(x0, 54, x1 - x0, color="rule_dark", lw=0.6)

    lines = ["EVERYTHING", "THAT IS", "YOURS."]
    size = min(fit(cv, l, DISPLAY, split - x0, track_ratio=0.012)
               for l in lines)
    lead = snap(size * 0.83)
    y = 54 + snap(size * 0.80)
    for i, l in enumerate(lines):
        cv.text(x0, y + i * lead, l, font=DISPLAY, size=size, color="surface",
                track=size * 0.012)
    hb = y + 2 * lead

    end = cv.para(x0, snap(hb + 30),
                  "Approvals waiting on you, your defects, inspections, tasks, "
                  "RFIs and permits — on one screen, ordered by how much "
                  "trouble it causes to ignore them.",
                  font=TEXT, size=9.8, leading=snap(9.8 * 1.6),
                  color="accent_pale", max_w=split - x0)

    fy = snap(end + 30)
    for i, (k, v) in enumerate([
            ("measured at", "390 × 664 viewport"),
            ("row height", "64 px — a thumb, in gloves"),
            ("empty day", "says so, rather than five zeroes")]):
        row = fy + i * 26
        cv.label(x0, row, k, size=6.2, color="accent", track=1.7)
        cv.text(x0, row + 12, v, font=TEXT, size=8.8, color="muted")

    # phone-proportioned slot, 390 x 664 aspect
    slot_x = split + 26
    slot_h = ph - 108 - 84
    slot_w = slot_h * 390.0 / 664.0
    if slot_w > right_w:
        slot_w = right_w
        slot_h = slot_w * 664.0 / 390.0
    cv.screenshot_slot(x1 - slot_w, 82, slot_w, slot_h, "S-01",
                       "My Day on a phone, top of list",
                       on_dark=True, target="1170 × 1992 px")

    footer_dark(cv, x0, ph - 66, x1 - x0,
                right_note="installable to the home screen")
    c.showPage()
    c.save()


# --------------------------------------------------------------------------

def build():
    register_fonts()
    os.makedirs(OUT, exist_ok=True)
    made = []

    # A3, screen-RGB (rasterised to PNG) and print-CMYK with bleed + marks
    for rtl, tag in ((False, "en"), (True, "ar")):
        base = "majal-poster-a3-tender-to-handover-%s" % tag
        rgb = os.path.join(OUT, base + ".rgb.pdf")
        poster_a3(rgb, rtl=rtl, print_mode=False, bleed_mm=0)
        pr = os.path.join(OUT, base + "-print.pdf")
        poster_a3(pr, rtl=rtl, print_mode=True, bleed_mm=3)
        made.append((rgb, base + ".png", 300.0 / 72.0))
        made.append((pr, None, None))

    screen = [
        (poster_bim, "majal-social-1080x1350-bim", 2.0),
        (poster_approvals, "majal-social-1080x1350-approvals", 2.0),
        (banner_open_source, "majal-banner-1920x1080-open-source", 2.0),
        (poster_my_day, "majal-social-1080x1080-my-day", 2.0),
    ]
    for fn, name, zoom in screen:
        p = os.path.join(OUT, name + ".rgb.pdf")
        fn(p)
        made.append((p, name + ".png", zoom))
    return made


if __name__ == "__main__":
    build()
