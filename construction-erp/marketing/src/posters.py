"""Majal posters and social pieces.

Six pieces, one idea each. Print items are exported CMYK with 3 mm bleed and
crop marks; screen items are exported at their exact pixel dimensions.

    1  A3   the commercial spine, tender to handover        (print + 300dpi PNG)
    2  A3   the same spine in Arabic, composed right-to-left (print + 300dpi PNG)
    3  1080 x 1350   the BIM before/after                   (real screenshots)
    4  1080 x 1350   approvals — the check is in the method  (real screenshot)
    5  1920 x 1080   waiting for a signature                 (real screenshot)
    6  1080 x 1350   My Day / the field                      (real screenshot)

Every screenshot placed here is a real capture of the running product, cropped
but never redrawn, retouched or distorted.
"""

import os

from reportlab.pdfgen import canvas as rl_canvas

from majal_brand import (
    AR, AR_B, AR_L, AR_SB, BASE, DISPLAY, DISPLAY_R, FACTS, MM, MONO, MONO_B,
    ROOT, SPINE, TEXT, TEXT_B, TEXT_I, Canvas, ar, register_fonts, snap,
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


def footer_dark(cv, x, y, w, right_note=None, tint="rule_dark", ms=13.0):
    """The system footer: mark, wordmark, source line, url. One rule above."""
    cv.hline(x, y, w, color=tint, lw=0.5)
    cv.mark(x, y + 9, ms)
    cv.text(x + ms + 7, y + 9 + ms * 0.74, "MAJAL", font=DISPLAY, size=ms * 1.02,
            color="surface", track=ms * 0.045)
    cv.label(x + w, y + 9 + ms * 0.40, FACTS["domain"], size=7.0,
             color="accent", track=1.7, align="right")
    cv.label(x + w, y + 9 + ms * 0.40 + 11, right_note or
             "open source · %s · %s" % (FACTS["base"], FACTS["licence"]),
             size=6.0, color="muted", track=1.3, align="right")


CAP = 0.72          # BigShoulders cap height as a fraction of point size


def headline(cv, x, y, lines, max_w, max_h, color="surface", align="left",
             ratio=0.86, track=0.012, pad=None):
    """The display voice.

    One size for the whole block, constrained by BOTH the measure and a height
    budget — a display face set only to a width will happily grow until it eats
    the page, which is exactly the failure this system must not have. `y` is the
    rule the block hangs from; the cap line sits `pad` below it. Returns the
    last baseline.
    """
    n = len(lines)
    by_w = min(fit(cv, l, DISPLAY, max_w, track_ratio=track) for l in lines)
    # cap top -> last baseline = CAP*size + (n-1)*ratio*size
    by_h = max_h / (CAP + (n - 1) * ratio)
    size = min(by_w, by_h)
    lead = size * ratio
    pad = size * 0.20 if pad is None else pad
    first = y + pad + size * CAP
    for i, l in enumerate(lines):
        cv.text(x, first + i * lead, l, font=DISPLAY, size=size, color=color,
                track=size * track, align=align)
    return first + (n - 1) * lead


def ar_headline(cv, x, y, lines, max_w, max_h, color="surface", ratio=1.12,
                pad=None, font=None):
    """The Arabic display voice, composed from the right edge. Same two-way
    constraint; Arabic needs looser leading because the script carries marks
    above and below the line."""
    font = font or AR_B
    n = len(lines)
    by_w = min(fit(cv, ar(l), font, max_w) for l in lines)
    by_h = max_h / (0.74 + (n - 1) * ratio)
    size = min(by_w, by_h)
    lead = size * ratio
    pad = size * 0.24 if pad is None else pad
    first = y + pad + size * 0.74
    for i, l in enumerate(lines):
        cv.ar_text(x, first + i * lead, l, font=font, size=size, color=color)
    return first + (n - 1) * lead


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
               else "مجال — نظام واحد من المناقصة إلى التسليم")
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
    HEAD_H = 62 * MM                 # the display block's height budget
    if rtl:
        head_bottom = ar_headline(cv, lead_edge, top + 20,
                                  ["نظام واحد", "من المناقصة", "إلى التسليم"],
                                  colw * 0.92, HEAD_H)
    else:
        head_bottom = headline(cv, lead_edge, top + 20,
                               ["ONE SYSTEM", "FROM TENDER", "TO HANDOVER"],
                               colw, HEAD_H)

    # --- standfirst ------------------------------------------------------
    sy = snap(head_bottom + 16 * MM)
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
    # the Arabic sheet carries the evidence plate; the English one carries the
    # register the spine begins in. Both reserve the same band.
    plate_name = "rtl-tiles" if rtl else "exposure-tiles"
    plate_w = colw
    plate_h = cv.img_h_for_w(plate_name, plate_w)
    plate_y = snap(foot_y - 22 * MM - plate_h)

    spine_top = snap(sy + 26 * MM)
    spine_bot = snap(plate_y - 30 * MM)
    step = (spine_bot - spine_top) / (len(stages) - 1)

    sx = (x1 - 4 * MM) if rtl else (x0 + 4 * MM)
    cv.vline(sx, spine_top, spine_bot - spine_top, color="accent", lw=0.9)
    # the line runs on past the last node, into the plate: a load path does not
    # stop where the diagram stops
    cv.vline(sx, spine_bot, plate_y - spine_bot, color="accent", lw=0.9,
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
                 color="whisper", track=1.2,
                 align="left" if rtl else "right")

    # --- the evidence ----------------------------------------------------
    cv.plate(plate_name, x0, plate_y, w=plate_w)
    if rtl:
        cv.ar_text(x1, plate_y - 9, "من المنتج نفسه — الانكشاف التجاري بالعربية",
                   font=AR, size=9.0, color="muted")
    else:
        cv.label(x0, plate_y - 9,
                 "from the product — portfolio commercial exposure",
                 size=6.8, color="muted", track=1.6)

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
# 3. 1080 x 1350 — the BIM before/after
# --------------------------------------------------------------------------

def poster_bim(path):
    pw, ph = 540.0, 675.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — colour everything and you have said nothing")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.18)

    M = 38.0
    x0, x1 = M, pw - M
    colw = x1 - x0

    cv.label(x0, 44, "Majal — BIM", size=7.4, color="accent", track=3.0)
    cv.hline(x0, 54, colw, color="rule_dark", lw=0.6)

    hb = headline(cv, x0, 54, ["COLOUR", "EVERYTHING,", "SAY NOTHING."],
                  colw, 112.0)

    end = cv.para(x0, snap(hb + 30),
                  "The authoring tool's colours describe the model. They do not "
                  "describe your job. Majal's default is one neutral material "
                  "and a set of edges, so the only thing that reads as coloured "
                  "is the thing somebody has to act on.",
                  font=TEXT, size=9.8, leading=snap(9.8 * 1.6),
                  color="accent_pale", max_w=colw * 0.97)

    # --- the pair --------------------------------------------------------
    # The plate is sized from the space that is actually left, not from the
    # measure — a picture sized only to a column is how a page overflows.
    foot_y = ph - 64
    gap = 14.0
    py = snap(end + 34)
    facts_h = 2 * 30 + 30            # two rows of notation plus its rule
    avail_h = foot_y - 22 - facts_h - 44 - py
    iw = min((colw - gap) / 2, cv.img_w_for_h("bim-original", avail_h))
    ih = cv.img_h_for_w("bim-original", iw)
    px0 = x0 + (colw - (2 * iw + gap)) / 2.0

    for i, (name, tag, note) in enumerate([
            ("bim-original", "original colours from the file",
             "Every class shouting at once."),
            ("bim-viewer", "shaded — one material",
             "The default in Majal."),
    ]):
        px = px0 + i * (iw + gap)
        cv.label(px, py - 8, "%02d" % (i + 1), size=6.4, color="accent",
                 track=1.6)
        cv.plate(name, px, py, w=iw,
                 tick_color="accent" if i else "rule_dark")
        cv.label(px, py + ih + 15, tag, size=6.3,
                 color="accent" if i else "muted", track=1.3)
        cv.text(px, py + ih + 28, note, font=TEXT_I, size=8.2, color="muted")

    # the two frames are the same crop of the same model at the same camera
    cv.label(px0, py + ih + 44,
             "same model · same camera · same crop · rev A",
             size=6.0, color="whisper", track=1.6)

    # --- what it is for, and where it stops. Limits are set in the same type
    # as capabilities; a specification that hides its edges is not one.
    fy = snap(py + ih + 68)
    cv.hline(x0, fy - 14, colw, color="rule_dark", lw=0.5)
    half = colw / 2
    for i, (k, v) in enumerate([
            ("keyed on", "IFC GlobalId — links survive re-issue"),
            ("index", "elements, property sets, quantities"),
            ("exchange", "%s round-trip · no IFC writing" % FACTS["bcf"]),
            ("limits", "bounding-box clash, not triangle-precise · "
                       "DWG is not supported"),
    ]):
        col, row_i = (0, i) if i < 2 else (1, i - 2)
        cx = x0 + col * half
        row = fy + row_i * 30
        cv.label(cx, row, k, size=6.3, color="accent", track=1.7)
        cv.para(cx, row + 12, v, font=TEXT, size=8.2,
                leading=snap(8.2 * 1.45), color="muted", max_w=half - 16)

    footer_dark(cv, x0, foot_y, colw,
                right_note="docs/bim.md states every limit")
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

    M = 38.0
    x0, x1 = M, pw - M
    colw = x1 - x0

    cv.label(x0, 44, "Majal — delegation of authority", size=7.4,
             color="accent", track=3.0)
    cv.hline(x0, 54, colw, color="rule_dark", lw=0.6)

    hb = headline(cv, x0, 54, ["THE CHECK", "IS IN THE", "METHOD."], colw,
                  112.0)

    end = cv.para(x0, snap(hb + 30),
                  "A groups attribute on a button hides the control. It does "
                  "not stop the method being called. Majal checks the approval "
                  "rule inside the action that commits the document — so it "
                  "holds from a button, a script or the RPC console.",
                  font=TEXT, size=10.0, leading=snap(10.0 * 1.6),
                  color="accent_pale", max_w=colw * 0.97)

    # --- the ladder ------------------------------------------------------
    ly = snap(end + 34)
    bands = [("up to 50,000", 1, "Project manager"),
             ("50,000 – 250,000", 2, "Project manager, commercial manager"),
             ("above 250,000", 3, "Project manager, commercial manager, board")]
    rowh = 54.0
    for i, (band, n, who) in enumerate(bands):
        ry = ly + i * rowh
        cv.hline(x0, ry, colw, color="rule_dark", lw=0.5)
        cv.label(x0, ry + 16, band, size=7.6, color="surface", track=1.5,
                 font=MONO_B)
        cv.text(x0, ry + 31, who, font=TEXT, size=8.4, color="muted")
        for s in range(3):
            mx = x1 - 11 - (2 - s) * 19
            if s < n:
                cv.node(mx, ry + 19, 3.2)
                cv.ring(mx, ry + 19, 6.6, lw=0.6)
            else:
                cv.ring(mx, ry + 19, 6.6, color="rule_dark", lw=0.5)
        cv.label(x1, ry + 37, "%d signature%s" % (n, "" if n == 1 else "s"),
                 size=6.2, color="accent", track=1.3, align="right")
    cv.hline(x0, ly + 3 * rowh, colw, color="rule_dark", lw=0.5)
    cv.label(x0, ly + 3 * rowh + 14,
             "an example rule set for variation orders · rules are data, not code",
             size=6.2, color="muted", track=1.2)

    # --- the consequence, shown ------------------------------------------
    py = snap(ly + 3 * rowh + 42)
    pw_img = colw
    ph_img = cv.img_h_for_w("approval-inbox", pw_img)
    cv.plate("approval-inbox", x0, py, w=pw_img)
    cv.caption(x0, py + ph_img + 16,
               "Because every step is a record, “waiting for me” is one query "
               "rather than a tour of every register — one inbox across every "
               "wired document type.",
               max_w=colw, size=8.0)

    footer_dark(cv, x0, ph - 64, colw,
                right_note="%s document types wired to the approval engine"
                           % FACTS["approval_wired"])
    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# 5. 1920 x 1080 — waiting for a signature
# --------------------------------------------------------------------------

def banner_exposure(path):
    pw, ph = 960.0, 540.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — the board's question, not the site's")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.16)

    M = 50.0
    x0, x1 = M, pw - M
    foot_y = ph - 62

    # The screen sets the right-hand column and the whole composition is hung
    # off it: text measure is whatever is left, not the other way round.
    gy = 84.0
    gx = x0 + 234.0
    gw = x1 - gx
    gh = cv.img_h_for_w("exposure", gw)
    tw = gx - 26 - x0

    cv.label(x0, 54, "Majal — commercial exposure", size=7.4, color="accent",
             track=2.6)
    cv.hline(x0, 64, x1 - x0, color="rule_dark", lw=0.6)

    hb = headline(cv, x0, 64, ["WAITING", "FOR A", "SIGNATURE."], tw, 118.0)

    end = cv.para(x0, snap(hb + 24),
                  "A dashboard of counts answers how busy you are. This answers "
                  "what you are exposed to.",
                  font=TEXT, size=9.6, leading=snap(9.6 * 1.6),
                  color="accent_pale", max_w=tw)

    fy = snap(end + 26)
    row = fy
    for k, v in [
            ("measures", "contract value, approved variations against it, "
                         "retention held, certified but not invoiced"),
            ("ordered by", "how far variations have moved the contract"),
            ("actionable", "pending approval steps, worst value first")]:
        cv.label(x0, row, k, size=6.2, color="accent", track=1.7)
        last = cv.para(x0, row + 13, v, font=TEXT, size=8.4,
                       leading=snap(8.4 * 1.5), color="muted", max_w=tw)
        row = snap(last + 20)

    cv.label(gx, gy - 9, "commercial exposure · portfolio view", size=6.2,
             color="whisper", track=1.6)
    cv.plate("exposure", gx, gy, w=gw)
    cv.label(gx, gy + gh + 14,
             "three live projects · the shipped demo dataset",
             size=6.0, color="whisper", track=1.5)

    footer_dark(cv, x0, foot_y, x1 - x0,
                right_note="%s custom modules · one database" % FACTS["modules"])
    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# 6. 1080 x 1350 — My Day / the field
# --------------------------------------------------------------------------

def poster_my_day(path):
    pw, ph = 540.0, 675.0
    c = rl_canvas.Canvas(path, pagesize=(pw, ph))
    c.setTitle("Majal — a day that fits on a phone")
    cv = Canvas(c, pw, ph)
    cv.raking_light(0, 0, pw, ph, lift=0.18)

    M = 38.0
    x0, x1 = M, pw - M
    colw = x1 - x0

    # the phone sits on the right and sets the column for everything else
    foot_y = ph - 64
    phone_top = 92.0
    phone_h = foot_y - 26 - phone_top
    phone_w = cv.img_w_for_h("defect-mobile", phone_h)
    phone_x = x1 - phone_w
    tw = phone_x - 22 - x0

    cv.label(x0, 44, "Majal — the field", size=7.4, color="accent", track=3.0)
    cv.hline(x0, 54, colw, color="rule_dark", lw=0.6)

    hb = headline(cv, x0, 54, ["A DAY", "THAT FITS", "ON A", "PHONE."],
                  tw, 132.0)

    end = cv.para(x0, snap(hb + 24),
                  "Raise a defect where you found it: photo, location, "
                  "severity, and the subcontractor who has to fix it — "
                  "on the screen you already have in your hand.",
                  font=TEXT, size=9.4, leading=snap(9.4 * 1.6),
                  color="accent_pale", max_w=tw)

    fy = snap(end + 28)
    row = fy
    for k, v in [
            ("measured at", "a real 390 px viewport"),
            ("my day", "approvals first — somebody else is stopped"),
            ("then", "defects, inspections, tasks, RFIs, permits"),
            ("offline", "draft, checklist and scan actions only; "
                        "approvals and financial posting stay online")]:
        cv.label(x0, row, k, size=6.2, color="accent", track=1.7)
        last = cv.para(x0, row + 13, v, font=TEXT, size=8.4,
                       leading=snap(8.4 * 1.5), color="muted", max_w=tw)
        row = snap(last + 20)

    cv.plate("defect-mobile", phone_x, phone_top, h=phone_h)
    cv.label(phone_x, phone_top - 9, "raising a defect · 390 px", size=6.2,
             color="whisper", track=1.5)

    footer_dark(cv, x0, foot_y, colw,
                right_note="installable to the home screen")
    c.showPage()
    c.save()


# --------------------------------------------------------------------------

def build():
    register_fonts()
    os.makedirs(OUT, exist_ok=True)
    made = []

    # A3, screen-RGB (rasterised to a 300 dpi PNG) and print-CMYK with bleed
    for rtl, tag in ((False, "en"), (True, "ar")):
        base = "majal-poster-a3-tender-to-handover-%s" % tag
        rgb = os.path.join(OUT, base + ".rgb.pdf")
        poster_a3(rgb, rtl=rtl, print_mode=False, bleed_mm=0)
        pr = os.path.join(OUT, base + "-print-cmyk-3mm-bleed.pdf")
        poster_a3(pr, rtl=rtl, print_mode=True, bleed_mm=3)
        made.append((rgb, base + ".png", 300.0 / 72.0))
        made.append((pr, None, None))

    screen = [
        (poster_bim, "majal-social-1080x1350-bim", 2.0),
        (poster_approvals, "majal-social-1080x1350-approvals", 2.0),
        (banner_exposure, "majal-banner-1920x1080-exposure", 2.0),
        (poster_my_day, "majal-social-1080x1350-my-day", 2.0),
    ]
    for fn, name, zoom in screen:
        p = os.path.join(OUT, name + ".rgb.pdf")
        fn(p)
        made.append((p, name + ".png", zoom))
    return made


if __name__ == "__main__":
    build()
