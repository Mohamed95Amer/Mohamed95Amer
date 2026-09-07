"""Layout guard.

Renders every surface to a throwaway canvas and reports any line of type or
any screenshot that strays outside its safe area. Run before believing a page.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.pdfgen import canvas as rl_canvas

from majal_brand import MM, Canvas, register_fonts


def scan(label, pagesize, pages, safe):
    """pages: list of (fn, kwargs) each drawing onto a fresh Canvas."""
    bad = 0
    c = rl_canvas.Canvas(os.devnull, pagesize=pagesize)
    for i, draw in enumerate(pages):
        cv = Canvas(c, pagesize[0], pagesize[1])
        draw(cv)
        c.showPage()
        out = cv.overflows(*safe)
        if out:
            bad += 1
            print("  %s page %02d — %d stray mark(s)" % (label, i + 1, len(out)))
            for d, what, ax, ay, bx, by in out[:6]:
                print("      %6.1f pt outside  %-40s [%d,%d → %d,%d]"
                      % (d, what[:40], ax, ay, bx, by))
    return bad


def main():
    register_fonts()
    import deck
    import brochure
    import posters

    total = 0

    # ---- deck -----------------------------------------------------------
    def deck_pages():
        for i, (fn, dark, title) in enumerate(deck.SLIDES):
            yield (lambda cv, _f=fn, _i=i, _d=dark, _t=title:
                   _f(deck.Slide(cv, _i + 1, len(deck.SLIDES), _d, _t)))
    total += scan("deck", (deck.W, deck.H), list(deck_pages()),
                  (deck.M - 6, 18, deck.W - deck.M + 6, deck.H - 12))

    # ---- brochure -------------------------------------------------------
    BW, BH = brochure.TRIM_W, brochure.TRIM_H

    def bro_pages():
        for i, (fn, dark) in enumerate(brochure.PAGES):
            yield (lambda cv, _f=fn, _i=i, _d=dark:
                   _f(brochure.Page(cv, 0.0, _i + 1, len(brochure.PAGES), _d)))
    total += scan("brochure", (BW, BH), list(bro_pages()),
                  (brochure.MARGIN - 6, 18, BW - brochure.MARGIN + 6, BH - 12))

    if total:
        print("\n%d surface(s) with marks outside the safe area" % total)
    else:
        print("layout guard: every mark inside its safe area")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
