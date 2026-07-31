"""Crop the real product screenshots into placement-ready assets.

Source: construction-erp/website/assets/img/  (copied, never linked across)
Output: construction-erp/marketing/assets/img/

Every crop preserves the source aspect ratio of the region taken — nothing is
stretched. Crops exist only to remove dead space below the content, never to
remove a caveat or change what the screen says.
"""

import os
import shutil

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.abspath(os.path.join(ROOT, "..", "website", "assets", "img"))
RAW = os.path.join(ROOT, "assets", "img", "raw")
OUT = os.path.join(ROOT, "assets", "img")

# name -> (source, crop box in source pixels or None for the whole frame)
# Boxes were chosen after opening each source file and looking at it.
CROPS = {
    # Executive dashboard: hero band + the six portfolio KPI tiles + the top
    # row of "choose a dashboard" cards. Cuts the fold, keeps the substance.
    "dashboard": ("shot-dashboard.png", (0, 0, 2880, 1500)),
    # Commercial exposure: everything down to the end of the by-project table.
    "exposure": ("shot-exposure.png", (0, 0, 2880, 1480)),
    # Just the four portfolio tiles + the unapproved-variations banner.
    "exposure-tiles": ("shot-exposure.png", (270, 255, 2620, 660)),
    # "Waiting for a signature" table on its own.
    "exposure-waiting": ("shot-exposure.png", (270, 680, 2620, 1030)),
    # Approval inbox: header, search facet and the grouped row. Below that the
    # screen is empty, so the crop stops there.
    "approval-inbox": ("shot-approval-inbox.png", (0, 0, 2880, 500)),
    # My Day: greeting, count line and the one live row.
    "my-day": ("shot-my-day.png", (0, 0, 2880, 450)),
    # BOQ register: header bar and both bills.
    "boq": ("shot-boq.png", (0, 0, 2880, 500)),
    # BIM: the 3D canvas plus the class legend, identical box in all three so
    # the before/after pair is genuinely comparable.
    "bim-original": ("shot-bim-original.png", (330, 320, 800, 800)),
    "bim-viewer": ("shot-bim-viewer.png", (330, 320, 800, 800)),
    "bim-legend": ("shot-bim-legend.png", (330, 320, 800, 800)),
    # BIM viewer with its own chrome — toolbar, mode control, side panel.
    "bim-full": ("shot-bim-viewer.png", (0, 45, 1440, 900)),
    # Arabic RTL, full frame down to the end of the by-project table.
    "rtl-arabic": ("shot-rtl-arabic.png", (0, 0, 2880, 1480)),
    # Arabic KPI tiles alone — reads at poster scale.
    "rtl-tiles": ("shot-rtl-arabic.png", (270, 120, 2620, 530)),
    # The phone. Full frame; it is already a 390 px viewport capture.
    "defect-mobile": ("shot-defect-mobile.png", None),
}

# NOT USED, and why. shot-asset-tag.png does not show an asset record with its
# QR/NFC tag — it shows an Odoo "Missing Action" error dialog for
# facility_asset.action_facility_equipment. Placing it would be showing a
# broken screen, so the asset-tag story is carried by typography instead.
UNUSED = {
    "shot-asset-tag.png": "shows a Missing Action error dialog, not an asset record",
}


def main():
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    for fn in sorted(os.listdir(SRC)):
        if fn.endswith(".png"):
            shutil.copy2(os.path.join(SRC, fn), os.path.join(RAW, fn))

    for name, (src, box) in CROPS.items():
        im = Image.open(os.path.join(RAW, src)).convert("RGB")
        if box:
            im = im.crop(box)
        out = os.path.join(OUT, name + ".png")
        im.save(out, optimize=True)
        print("%-16s %-24s %s" % (name, "%d x %d" % im.size, src))

    for fn, why in UNUSED.items():
        print("SKIPPED  %-24s %s" % (fn, why))


if __name__ == "__main__":
    main()
