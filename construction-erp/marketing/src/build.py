"""Build every Majal marketing asset and verify each output actually renders.

    python3 src/build.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fitz  # PyMuPDF — rasterises the screen pieces and verifies every PDF

from majal_brand import ROOT, register_fonts


def rasterise(pdf_path, png_path, zoom):
    doc = fitz.open(pdf_path)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(png_path)
    doc.close()
    return pix.width, pix.height


def verify_pdf(path, expect_pages=None):
    doc = fitz.open(path)
    n = len(doc)
    problems = []
    if expect_pages and n != expect_pages:
        problems.append("expected %d pages, found %d" % (expect_pages, n))
    for i, page in enumerate(doc):
        r = page.rect
        # a page that renders to a single flat colour is a page that failed
        pix = page.get_pixmap(matrix=fitz.Matrix(0.35, 0.35), alpha=False)
        colors = len(set(pix.samples[i:i + 3] for i in range(0, len(pix.samples), 3)))
        if colors < 6:
            problems.append("page %d looks blank (%d distinct colours)"
                            % (i + 1, colors))
        # anything drawn outside the page box would be clipped away silently
        if r.width < 10 or r.height < 10:
            problems.append("page %d has a degenerate box" % (i + 1))
    size = (doc[0].rect.width, doc[0].rect.height)
    doc.close()
    return n, size, problems


def main():
    register_fonts()
    import posters
    import brochure
    import deck

    report = []

    # ---- posters --------------------------------------------------------
    for pdf, png_name, zoom in posters.build():
        n, size, probs = verify_pdf(pdf)
        if png_name:
            out = os.path.join(os.path.dirname(pdf), png_name)
            w, h = rasterise(pdf, out, zoom)
            report.append(("PNG", out, "%d × %d px" % (w, h), probs))
            os.remove(pdf)          # intermediate; the PNG is the deliverable
        else:
            report.append(("PDF", pdf, "%.1f × %.1f mm, %d pp"
                           % (size[0] / 72 * 25.4, size[1] / 72 * 25.4, n),
                           probs))

    # ---- brochure -------------------------------------------------------
    b = brochure.build()
    for path, pages in b:
        n, size, probs = verify_pdf(path, expect_pages=pages)
        report.append(("PDF", path, "%.0f × %.0f mm, %d pp"
                       % (size[0] / 72 * 25.4, size[1] / 72 * 25.4, n), probs))

    # ---- deck -----------------------------------------------------------
    d = deck.build()
    for path, pages in d:
        n, size, probs = verify_pdf(path, expect_pages=pages)
        report.append(("PDF", path, "%.0f × %.0f pt (16:9), %d slides"
                       % (size[0], size[1], n), probs))

    print("\n%-5s %-62s %s" % ("KIND", "FILE", "DIMENSIONS"))
    print("-" * 108)
    ok = True
    for kind, path, dims, probs in report:
        rel = os.path.relpath(path, ROOT)
        print("%-5s %-62s %s" % (kind, rel, dims))
        for p in probs:
            ok = False
            print("      !! %s" % p)
    print("-" * 108)
    print("%d files, %s" % (len(report), "all verified" if ok else "PROBLEMS"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
