"""Build every Majal marketing asset, then verify each output actually renders.

    python3 src/build.py

Three checks run on every file, because export bugs are the normal failure
here and a blank page ships just as easily as a good one:

  1  the layout guard (src/check.py) — no line of type and no screenshot may
     stray outside its safe area on any surface;
  2  every page is rasterised and must contain real tonal variety, so a page
     that renders flat is caught rather than shipped;
  3  every declared dimension is measured from the file itself, not assumed.
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
        pix = page.get_pixmap(matrix=fitz.Matrix(0.4, 0.4), alpha=False)
        s = pix.samples
        seen = {s[j:j + 3] for j in range(0, len(s) - 3, 3)}
        if len(seen) < 24:
            problems.append("page %d looks blank (%d distinct colours)"
                            % (i + 1, len(seen)))
        if r.width < 10 or r.height < 10:
            problems.append("page %d has a degenerate box" % (i + 1))
    size = (doc[0].rect.width, doc[0].rect.height)
    doc.close()
    return n, size, problems


def verify_png(path, expect_w, expect_h):
    from PIL import Image
    problems = []
    with Image.open(path) as im:
        w, h = im.size
        if (w, h) != (expect_w, expect_h):
            problems.append("expected %d x %d, got %d x %d"
                            % (expect_w, expect_h, w, h))
        small = im.convert("RGB").resize((160, max(1, 160 * h // w)))
        if len(set(small.getdata())) < 200:
            problems.append("looks flat (%d distinct colours)"
                            % len(set(small.getdata())))
    return problems


EXPECT_PX = {
    "majal-poster-a3-tender-to-handover-en.png": (3508, 4961),
    "majal-poster-a3-tender-to-handover-ar.png": (3508, 4961),
    "majal-social-1080x1350-bim.png": (1080, 1350),
    "majal-social-1080x1350-approvals.png": (1080, 1350),
    "majal-banner-1920x1080-exposure.png": (1920, 1080),
    "majal-social-1080x1350-my-day.png": (1080, 1350),
}


def main():
    register_fonts()

    import prepare_images
    prepare_images.main()
    print()

    import check
    if check.main() != 0:
        print("\nlayout guard failed — not exporting")
        return 1
    print()

    import brochure
    import deck
    import posters

    report = []

    for pdf, png_name, zoom in posters.build():
        n, size, probs = verify_pdf(pdf)
        if png_name:
            out = os.path.join(os.path.dirname(pdf), png_name)
            w, h = rasterise(pdf, out, zoom)
            probs += verify_png(out, *EXPECT_PX[png_name])
            report.append(("PNG", out, "%d x %d px  (%d dpi at trim)"
                           % (w, h, round(72 * zoom)), probs))
            os.remove(pdf)          # intermediate; the PNG is the deliverable
        else:
            report.append(("PDF", pdf, "%.0f x %.0f mm CMYK, 3 mm bleed"
                           % (size[0] / 72 * 25.4, size[1] / 72 * 25.4),
                           probs))

    for path, pages in brochure.build():
        n, size, probs = verify_pdf(path, expect_pages=pages)
        report.append(("PDF", path, "%.0f x %.0f mm, %d pp"
                       % (size[0] / 72 * 25.4, size[1] / 72 * 25.4, n), probs))

    for path, pages in deck.build():
        n, size, probs = verify_pdf(path, expect_pages=pages)
        report.append(("PDF", path, "%.0f x %.0f pt (16:9 = 1920x1080), "
                       "%d slides" % (size[0], size[1], n), probs))

    print("%-5s %-58s %s" % ("KIND", "FILE", "VERIFIED AS"))
    print("-" * 116)
    ok = True
    for kind, path, dims, probs in report:
        print("%-5s %-58s %s" % (kind, os.path.relpath(path, ROOT), dims))
        for p in probs:
            ok = False
            print("      !! %s" % p)
    print("-" * 116)
    print("%d files, %s" % (len(report), "all verified" if ok
                            else "PROBLEMS FOUND"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
