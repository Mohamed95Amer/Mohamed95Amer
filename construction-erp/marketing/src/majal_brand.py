"""Majal collateral — shared design system.

One palette, one type system, one grid, used by every poster, the brochure and
the deck so the whole set reads as one company.

Philosophy: marketing/DESIGN-PHILOSOPHY.md ("Load Path").
"""

import os

from reportlab.lib.colors import Color, CMYKColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT_DIR = os.path.join(ROOT, "assets", "fonts")
IMG_DIR = os.path.join(ROOT, "assets", "img")

MM = 72.0 / 25.4  # points per millimetre


# --------------------------------------------------------------------------
# Palette — taken from the product itself (majal_branding / construction_ui).
# --------------------------------------------------------------------------

HEX = {
    "nav": "#173240",
    "primary": "#346d75",
    "primary_dark": "#295a61",
    "accent": "#c59b52",
    "page": "#f4f6f7",
    "surface": "#ffffff",
    "text": "#263842",
    "muted": "#687983",
}

# Derived working tones, all inside the CMYK gamut (no neon, no fluorescents).
HEX.update({
    "nav_deep": "#102833",      # icon gradient end — used for raking light
    "nav_lift": "#244657",      # icon gradient start
    "rule_dark": "#2c4a58",     # hairlines on the dark ground
    "rule_light": "#d5dcdf",    # hairlines on paper
    "accent_pale": "#e6d3ae",   # gold at low emphasis on dark grounds only
    "ink_soft": "#4d616c",      # secondary reading tone on paper
    "whisper": "#4a6a78",       # the quietest legible mark on the dark ground
})


def _rgb(h, alpha=1.0):
    h = h.lstrip("#")
    return Color(int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0,
                 int(h[4:6], 16) / 255.0, alpha=alpha)


# Hand-set CMYK equivalents for the print pieces. Kept slightly conservative so
# the teals do not slam to 100% and the gold stays a warm metal rather than
# mustard. Total ink coverage held under 300%.
CMYK = {
    "nav":          (0.82, 0.55, 0.40, 0.42),
    "nav_deep":     (0.86, 0.60, 0.44, 0.55),
    "nav_lift":     (0.80, 0.50, 0.35, 0.32),
    "primary":      (0.75, 0.32, 0.35, 0.10),
    "primary_dark": (0.80, 0.38, 0.38, 0.20),
    "accent":       (0.18, 0.36, 0.78, 0.03),
    "accent_pale":  (0.08, 0.15, 0.36, 0.00),
    "page":         (0.03, 0.01, 0.02, 0.00),
    "surface":      (0.00, 0.00, 0.00, 0.00),
    "text":         (0.72, 0.50, 0.40, 0.36),
    "muted":        (0.52, 0.32, 0.28, 0.10),
    "ink_soft":     (0.62, 0.40, 0.34, 0.22),
    "rule_dark":    (0.78, 0.50, 0.38, 0.30),
    "rule_light":   (0.10, 0.05, 0.06, 0.02),
    "whisper":      (0.68, 0.42, 0.34, 0.22),
}


class Palette:
    """Colour accessor. `print_mode=True` returns CMYK separations."""

    def __init__(self, print_mode=False):
        self.print_mode = print_mode

    def __call__(self, name, alpha=1.0):
        if self.print_mode and alpha >= 1.0 and name in CMYK:
            c, m, y, k = CMYK[name]
            return CMYKColor(c, m, y, k)
        return _rgb(HEX[name], alpha)


# --------------------------------------------------------------------------
# Type system — four voices, no more.
#   DISPLAY  Big Shoulders        condensed, architectural, set tight
#   TEXT     Instrument Sans      the reading register
#   MONO     IBM Plex Mono        reference markers, units, codes only
#   ARABIC   IBM Plex Sans Arabic the bilingual companion
# --------------------------------------------------------------------------

DISPLAY = "MajalDisplay"
DISPLAY_R = "MajalDisplayLight"
TEXT = "MajalText"
TEXT_B = "MajalTextBold"
TEXT_I = "MajalTextItalic"
MONO = "MajalMono"
MONO_B = "MajalMonoBold"
AR = "MajalAr"
AR_SB = "MajalArSemi"
AR_B = "MajalArBold"
AR_L = "MajalArLight"

_FONTS = {
    DISPLAY: "BigShoulders-Bold.ttf",
    DISPLAY_R: "BigShoulders-Regular.ttf",
    TEXT: "InstrumentSans-Regular.ttf",
    TEXT_B: "InstrumentSans-Bold.ttf",
    TEXT_I: "InstrumentSans-Italic.ttf",
    MONO: "IBMPlexMono-Regular.ttf",
    MONO_B: "IBMPlexMono-Bold.ttf",
    AR: "IBMPlexSansArabic-Regular.ttf",
    AR_SB: "IBMPlexSansArabic-SemiBold.ttf",
    AR_B: "IBMPlexSansArabic-Bold.ttf",
    AR_L: "IBMPlexSansArabic-Light.ttf",
}

_registered = False


def register_fonts():
    global _registered
    if _registered:
        return
    for name, filename in _FONTS.items():
        pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, filename)))
    _registered = True


# --------------------------------------------------------------------------
# Arabic shaping. ReportLab does not shape or reorder; we do it up front and
# hand it presentation forms in visual order.
# --------------------------------------------------------------------------

import arabic_reshaper  # noqa: E402
from bidi.algorithm import get_display  # noqa: E402

def ar(text):
    """Arabic logical string -> shaped, visually ordered string."""
    return get_display(arabic_reshaper.reshape(text))


# --------------------------------------------------------------------------
# Grid. Everything vertical is an integer multiple of BASE.
# --------------------------------------------------------------------------

BASE = 6.0  # points


def snap(v, base=BASE):
    return round(v / base) * base


class Canvas:
    """Thin drawing surface over a reportlab canvas.

    Holds the palette, the baseline unit, and every primitive the system uses.
    Coordinates are top-left origin (design convention) and flipped on the way
    into reportlab, which makes every layout routine read the way the page does.
    """

    def __init__(self, c, width, height, print_mode=False, unit=BASE):
        self.c = c
        self.w = width
        self.h = height
        self.unit = unit
        self.pal = Palette(print_mode)
        # Every mark this canvas makes is recorded, so a layout can be checked
        # against its own safe area instead of being checked by eye. The class
        # of bug this catches — a block that grew past the footer — is the one
        # that ruins an otherwise finished page.
        self.ink = []

    def _seen(self, x, y, w=0.0, h=0.0, what=""):
        self.ink.append((x, y, x + w, y + h, what))

    def bounds(self):
        if not self.ink:
            return None
        return (min(i[0] for i in self.ink), min(i[1] for i in self.ink),
                max(i[2] for i in self.ink), max(i[3] for i in self.ink))

    def overflows(self, x0, y0, x1, y1, tol=0.75, kinds=("text:", "image:")):
        """Marks that stray outside the safe area, worst first. Grounds and
        full-bleed fields are excluded by default — they are meant to run off
        the edge; type and screenshots are not."""
        out = []
        for ax, ay, bx, by, what in self.ink:
            if kinds and not what.startswith(kinds):
                continue
            d = max(x0 - ax, ay and (y0 - ay) or 0, bx - x1, by - y1)
            if d > tol:
                out.append((round(d, 1), what, round(ax), round(ay),
                            round(bx), round(by)))
        return sorted(out, reverse=True)

    # -- coordinate helpers -------------------------------------------------
    def y(self, top_y):
        return self.h - top_y

    # -- fills --------------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, stroke=None, lw=0.5, alpha=1.0):
        c = self.c
        c.saveState()
        if fill:
            c.setFillColor(self.pal(fill, alpha) if isinstance(fill, str) else fill)
        if stroke:
            c.setStrokeColor(self.pal(stroke, alpha) if isinstance(stroke, str) else stroke)
            c.setLineWidth(lw)
        c.rect(x, self.y(y + h), w, h, fill=1 if fill else 0, stroke=1 if stroke else 0)
        c.restoreState()
        self._seen(x, y, w, h, "rect")

    def raking_light(self, x, y, w, h, base="nav", steps=44, lift=0.16):
        """A single slow rake of light across the ground, as if it fell once
        across concrete. Drawn as banded overlays — subtle enough that a viewer
        registers only that the surface feels physical."""
        self.rect(x, y, w, h, fill=base)
        band = h / steps
        for i in range(steps):
            t = i / (steps - 1)
            a = lift * (1.0 - t) ** 1.7
            if a < 0.004:
                continue
            self.rect(x, y + i * band, w, band + 0.6,
                      fill=_rgb(HEX["nav_lift"], a))

    # -- lines --------------------------------------------------------------
    def hline(self, x, y, w, color="rule_light", lw=0.5, alpha=1.0):
        c = self.c
        c.saveState()
        c.setStrokeColor(self.pal(color, alpha) if isinstance(color, str) else color)
        c.setLineWidth(lw)
        c.line(x, self.y(y), x + w, self.y(y))
        c.restoreState()

    def vline(self, x, y, h, color="rule_light", lw=0.5, alpha=1.0):
        c = self.c
        c.saveState()
        c.setStrokeColor(self.pal(color, alpha) if isinstance(color, str) else color)
        c.setLineWidth(lw)
        c.line(x, self.y(y), x, self.y(y + h))
        c.restoreState()

    def path(self, pts, color="accent", lw=0.9, alpha=1.0, cap=1):
        c = self.c
        c.saveState()
        c.setStrokeColor(self.pal(color, alpha) if isinstance(color, str) else color)
        c.setLineWidth(lw)
        c.setLineCap(cap)
        c.setLineJoin(1)
        p = c.beginPath()
        p.moveTo(pts[0][0], self.y(pts[0][1]))
        for px, py in pts[1:]:
            p.lineTo(px, self.y(py))
        c.drawPath(p, stroke=1, fill=0)
        c.restoreState()

    def node(self, x, y, r=1.7, color="accent"):
        """A load point. One diameter across the entire system."""
        c = self.c
        c.saveState()
        c.setFillColor(self.pal(color))
        c.circle(x, self.y(y), r, fill=1, stroke=0)
        c.restoreState()

    def ring(self, x, y, r=3.0, color="accent", lw=0.7):
        c = self.c
        c.saveState()
        c.setStrokeColor(self.pal(color))
        c.setLineWidth(lw)
        c.circle(x, self.y(y), r, fill=0, stroke=1)
        c.restoreState()

    # -- the one non-rectilinear gesture -----------------------------------
    def gable(self, cx, y, w, h, color="accent", lw=None, alpha=1.0):
        """The roofline from the product icon: a shallow gable over an implied
        volume. The system's single recurring non-rectilinear mark."""
        lw = lw if lw is not None else max(0.9, w * 0.035)
        self.path([(cx - w / 2, y + h), (cx, y), (cx + w / 2, y + h)],
                  color=color, lw=lw, alpha=alpha)

    def mark(self, x, y, size, on_dark=True):
        """The Majal mark: gold gable over a white structure on a dark ground.
        Redrawn from custom-addons/majal_branding/static/description/icon.svg,
        proportions preserved (128-unit artboard)."""
        s = size / 128.0
        c = self.c
        c.saveState()
        c.translate(x, self.y(y + size))
        c.scale(s, -s)
        c.translate(0, -128)

        # ground plate
        c.setFillColor(self.pal("nav_deep") if on_dark else self.pal("nav"))
        c.roundRect(0, 0, 128, 128, 28, fill=1, stroke=0)
        # faint lift so the plate is not a flat sticker
        c.setFillColor(_rgb(HEX["nav_lift"], 0.55))
        c.roundRect(0, 64, 128, 64, 28, fill=1, stroke=0)
        c.setFillColor(_rgb(HEX["nav_lift"], 0.55))
        c.rect(0, 60, 128, 20, fill=1, stroke=0)

        c.setLineCap(1)
        c.setLineJoin(1)
        # gold roofline
        c.setStrokeColor(self.pal("accent"))
        c.setLineWidth(9)
        p = c.beginPath()
        p.moveTo(25, 128 - 92)
        p.lineTo(25, 128 - 46)
        p.lineTo(64, 128 - 24)
        p.lineTo(103, 128 - 46)
        p.lineTo(103, 128 - 92)
        c.drawPath(p, stroke=1, fill=0)
        # white structure
        c.setStrokeColor(self.pal("surface"))
        c.setLineWidth(8)
        p = c.beginPath()
        p.moveTo(42, 128 - 92)
        p.lineTo(42, 128 - 56)
        p.lineTo(86, 128 - 56)
        p.lineTo(86, 128 - 92)
        c.drawPath(p, stroke=1, fill=0)
        c.line(20, 128 - 99, 108, 128 - 99)
        c.line(64, 128 - 56, 64, 128 - 92)
        c.restoreState()

    # -- type ---------------------------------------------------------------
    def text(self, x, y, s, font=TEXT, size=9, color="text", track=0.0,
             align="left", alpha=1.0):
        """Draw a single line. `y` is the BASELINE, measured from the top."""
        c = self.c
        c.saveState()
        col = self.pal(color, alpha) if isinstance(color, str) else color
        w = pdfmetrics.stringWidth(s, font, size) + track * max(0, len(s) - 1)
        if align == "right":
            x -= w
        elif align == "center":
            x -= w / 2
        t = c.beginText()
        t.setTextOrigin(x, self.y(y))
        t.setFont(font, size)
        t.setFillColor(col)
        if track:
            t.setCharSpace(track)
        t.textOut(s)
        c.drawText(t)
        c.restoreState()
        # a line of type occupies from roughly its ascender to its descender
        self._seen(x, y - size * 0.78, w, size * 1.02, "text:" + s[:34])
        return w

    def width(self, s, font=TEXT, size=9, track=0.0):
        return pdfmetrics.stringWidth(s, font, size) + track * max(0, len(s) - 1)

    def label(self, x, y, s, size=6.4, color="muted", track=1.5, align="left",
              font=MONO, alpha=1.0):
        """Reference marker / systematic notation. Always uppercase, always
        tracked open, always small. Confidence reads at the bottom of the page."""
        return self.text(x, y, s.upper(), font=font, size=size, color=color,
                         track=track, align=align, alpha=alpha)

    # -- paragraphs ---------------------------------------------------------
    def wrap(self, s, font, size, max_w, track=0.0):
        words, lines, cur = s.split(), [], ""
        for wd in words:
            trial = (cur + " " + wd).strip()
            if self.width(trial, font, size, track) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = wd
        if cur:
            lines.append(cur)
        return lines

    def para(self, x, y, s, font=TEXT, size=9, leading=None, color="text",
             max_w=200, align="left", track=0.0, alpha=1.0, max_lines=None):
        """Set a block on the baseline grid. Returns the baseline y after the
        last line. `y` is the FIRST baseline."""
        leading = leading or snap(size * 1.55, self.unit)
        lines = self.wrap(s, font, size, max_w, track)
        if max_lines:
            lines = lines[:max_lines]
        for i, ln in enumerate(lines):
            self.text(x, y + i * leading, ln, font=font, size=size,
                      color=color, align=align, track=track, alpha=alpha)
        return y + (len(lines) - 1) * leading

    def para_h(self, s, font, size, leading, max_w, track=0.0):
        """Height a paragraph will occupy, without drawing it."""
        return (len(self.wrap(s, font, size, max_w, track)) - 1) * leading

    # -- Arabic -------------------------------------------------------------
    def ar_text(self, x, y, s, font=AR, size=10, color="text", align="right",
                alpha=1.0):
        """Draw an Arabic line. Default alignment is right — in an RTL layout
        `x` is the leading edge, so `align="right"` is the natural setting."""
        return self.text(x, y, ar(s), font=font, size=size, color=color,
                         align=align, alpha=alpha)

    def ar_para(self, x, y, s, font=AR, size=10, leading=None, color="text",
                max_w=200, alpha=1.0):
        """Wrap Arabic. Wrapping is done on the logical string so words break
        correctly, then each line is shaped and reordered for display, then set
        flush to the right edge at `x`."""
        leading = leading or snap(size * 1.7, self.unit)
        words, lines, cur = s.split(), [], ""
        for wd in words:
            trial = (cur + " " + wd).strip()
            if self.width(ar(trial), font, size) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = wd
        if cur:
            lines.append(cur)
        for i, ln in enumerate(lines):
            self.text(x, y + i * leading, ar(ln), font=font, size=size,
                      color=color, align="right", alpha=alpha)
        return y + (len(lines) - 1) * leading

    # -- real product screenshots ------------------------------------------
    def img_size(self, name):
        """Native pixel size of a prepared screenshot."""
        from PIL import Image
        with Image.open(os.path.join(IMG_DIR, name + ".png")) as im:
            return im.size

    def img_h_for_w(self, name, w):
        iw, ih = self.img_size(name)
        return w * ih / float(iw)

    def img_w_for_h(self, name, h):
        iw, ih = self.img_size(name)
        return h * iw / float(ih)

    def image(self, name, x, y, w=None, h=None):
        """Place a real screenshot. Exactly one of w/h is given; the other is
        derived from the file, so nothing is ever distorted. Returns (w, h)."""
        iw, ih = self.img_size(name)
        if w is None and h is None:
            raise ValueError("give a width or a height")
        if w is None:
            w = h * iw / float(ih)
        if h is None:
            h = w * ih / float(iw)
        self.c.drawImage(os.path.join(IMG_DIR, name + ".png"),
                         x, self.y(y + h), width=w, height=h,
                         preserveAspectRatio=True, anchor="nw", mask=None)
        self._seen(x, y, w, h, "image:" + name)
        return w, h

    def plate(self, name, x, y, w=None, h=None, edge="rule_dark", ticks=True,
              tick_color="accent", lw=0.6):
        """A screenshot set squarely on the ground inside a hairline, with
        drafting registration ticks at the corners. No device frames, no tilt,
        no drop shadow — a real artefact placed square and allowed to be itself.
        """
        w, h = self.image(name, x, y, w, h)
        self.rect(x, y, w, h, stroke=edge, lw=lw)
        if ticks:
            t = min(w, h) * 0.045
            for (cx, cy, dx, dy) in ((x, y, 1, 1), (x + w, y, -1, 1),
                                     (x, y + h, 1, -1), (x + w, y + h, -1, -1)):
                self.hline(cx if dx > 0 else cx - t, cy, t,
                           color=tick_color, lw=0.9)
                self.vline(cx, cy if dy > 0 else cy - t, t,
                           color=tick_color, lw=0.9)
        return w, h

    def caption(self, x, y, s, max_w, color="muted", size=7.4, align="left",
                font=None):
        """Figure caption. Italic reading face, small, on the baseline grid."""
        return self.para(x, y, s, font=font or TEXT_I, size=size,
                         leading=snap(size * 1.5, self.unit), color=color,
                         max_w=max_w, align=align)

    # -- screenshot placeholder --------------------------------------------
    def screenshot_slot(self, x, y, w, h, slot_id, caption, on_dark=False,
                        target=""):
        """An honest empty frame. Never a drawn pretend interface.

        The brief for what goes here is recorded in marketing/SCREENSHOT-SLOTS.md.
        """
        edge = "rule_dark" if on_dark else "rule_light"
        ink = "accent" if on_dark else "primary"
        soft = "muted" if not on_dark else "muted"

        self.rect(x, y, w, h, fill="nav_deep" if on_dark else "page")
        self.rect(x, y, w, h, stroke=edge, lw=0.6)

        # corner ticks — drafting registration, not decoration
        t = min(w, h) * 0.05
        for (cx, cy, dx, dy) in ((x, y, 1, 1), (x + w, y, -1, 1),
                                 (x, y + h, 1, -1), (x + w, y + h, -1, -1)):
            self.hline(cx if dx > 0 else cx - t, cy, t, color=ink, lw=0.9)
            self.vline(cx, cy if dy > 0 else cy - t, t, color=ink, lw=0.9)

        self.gable(x + w / 2, y + h / 2 - min(w, h) * 0.10,
                   min(w, h) * 0.20, min(w, h) * 0.085,
                   color=ink, lw=1.1, alpha=0.75)

        cap_size = max(5.6, min(8.0, h * 0.045))
        base = y + h / 2 + cap_size * 0.6
        self.label(x + w / 2, base, "screenshot " + slot_id,
                   size=cap_size * 0.82, color=ink, track=1.7, align="center")
        lines = self.wrap(caption, TEXT_I, cap_size, w * 0.72)
        for i, ln in enumerate(lines[:3]):
            self.text(x + w / 2, base + (i + 1.55) * cap_size * 1.5, ln,
                      font=TEXT_I, size=cap_size, color=soft, align="center")
        if target:
            self.label(x + w / 2, y + h - cap_size * 1.1, target,
                       size=cap_size * 0.74, color=soft, track=1.2,
                       align="center")


# --------------------------------------------------------------------------
# Verified product facts. Every number here was read out of the repository;
# nothing is estimated, extrapolated or inferred. Sources noted inline.
# --------------------------------------------------------------------------

FACTS = {
    # `ls -d custom-addons/*/ | wc -l`
    "modules": "37",
    # grep -rhoE '^\s+def test_[a-zA-Z0-9_]+' custom-addons --include='*.py' | wc -l
    "tests": "512",
    # find custom-addons -name 'test_*.py' | wc -l
    "test_files": "44",
    # ls custom-addons/*/i18n/ar_001.po | wc -l
    "ar_modules": "35",
    # README.md, NOTICE.md
    "base": "Odoo 18.0 Community",
    "licence": "LGPL-3",
    # docs/administration-and-recovery.md
    "recovery_slots": "7",
    "roles": "6",
    "capability_tiers": "12",
    # docs/approvals.md
    "approval_wired": "6",
    # docs/majal-intelligence.md
    "ai_providers": "5",
    # docs/bim.md
    "bcf": "BCF 2.1",
    "clash_cap": "2000",
    "ifc_cap": "300 MB",
    "domain": "majalops.com",
    "source": "github.com/Mohamed95Amer/Mohamed95Amer",
}

# The commercial spine — every stage is a shipped module (README.md).
SPINE = [
    ("Tender", "construction_tender"),
    ("Bill of quantities", "construction_boq"),
    ("Subcontract", "construction_subcontractor"),
    ("Variation order", "construction_change_order"),
    ("Payment certificate", "construction_progress_billing"),
    ("Cost value reconciliation", "construction_report"),
]

# The full module list, grouped. Names and one-line summaries are the
# `name`/`summary` fields of each custom-addons/*/__manifest__.py.
MODULE_GROUPS = [
    ("Commercial control", [
        ("construction_boq", "Bill of Quantities"),
        ("construction_tender", "Tendering & bid leveling"),
        ("construction_subcontractor", "Subcontracts & back-charges"),
        ("construction_change_order", "Change events & variations"),
        ("construction_progress_billing", "Interim payment certificates"),
        ("construction_report", "Cost value reconciliation"),
        ("construction_dashboard", "Executive portfolio dashboard"),
    ]),
    ("Project controls", [
        ("construction_base", "Groups, projects, approval engine"),
        ("construction_planning", "WBS, CPM & Gantt"),
        ("construction_drawing", "Drawing register & revisions"),
        ("construction_submittal", "Submittal review cycles"),
        ("construction_rfi", "RFIs with ball-in-court"),
        ("construction_meeting", "Meetings & carried actions"),
        ("construction_material", "Site stores & waste"),
    ]),
    ("Site & quality", [
        ("construction_pin", "Pins on drawing sheets"),
        ("construction_defect", "Punch lists & DLP defects"),
        ("construction_form", "Checklists & inspections"),
        ("construction_daily_log", "Digital site diary"),
        ("construction_hse", "Permits, incidents, LTIFR"),
        ("construction_bim", "IFC index, 3D/4D, BCF, clash"),
        ("construction_portal", "Free subcontractor portal"),
    ]),
    ("Facilities / CAFM", [
        ("facility_asset", "Asset registry & QR/NFC tags"),
        ("facility_workorder", "Job plans & preventive maintenance"),
        ("facility_sla", "Response & resolution SLAs"),
        ("facility_contract", "Maintenance contracts & margin"),
        ("facility_inventory", "Spare parts in real stores"),
        ("facility_floorplan", "Pin-on-plan for facilities"),
        ("facility_portal", "Occupant self-service"),
    ]),
    ("Platform", [
        ("majal_branding", "Brand system & PWA"),
        ("majal_security", "Password policy, passkeys, MFA"),
        ("majal_administration", "Client roles & verified recovery"),
        ("majal_documents", "Controlled documents & sheets"),
        ("majal_field_offline", "Bounded offline field workspace"),
        ("majal_ai", "Bilingual read-only copilot"),
        ("construction_ui", "Workspaces & My Day"),
        ("construction_whatsapp", "WhatsApp Cloud API alerts"),
        ("majal_demo", "Acceptance dataset & personas"),
    ]),
]
