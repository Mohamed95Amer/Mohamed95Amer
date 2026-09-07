"""Hand-written RTL rules must be fenced, and fenced in the form that survives.

Two failures hide behind each other here, and both are silent.

Without rtlcss on the server, Odoo still serves a bundle named .rtl.min.css —
it is simply the left-to-right sheet under a right-to-left name. Arabic text
then sits in an English layout and nothing logs an error. That is provisioned
in the Dockerfile and in CI; this file guards the half that lives in the
source tree.

With rtlcss present, every directional declaration is mirrored — including the
hand-written `[dir=rtl]` blocks, which are already written the way they should
appear in Arabic. Mirroring those a second time returns them to the layout
they exist to replace. They therefore have to be fenced.

And the fence has to use the bang form. SCSS strips a plain `/* rtl:ignore */`
during compilation, so the directive never reaches rtlcss and the block is
mirrored anyway — the fence looks present in the source and does nothing.
Odoo's own stylesheets use `/*!rtl:begin:ignore*/` for exactly this reason.
"""

import re
from pathlib import Path

from odoo.tests import TransactionCase, tagged

ADDONS = Path(__file__).resolve().parents[2]

# Selectors that mean "this rule only applies to a right-to-left screen".
RTL_SELECTOR = re.compile(r'(\[dir=["\']?rtl|:dir\(rtl\)|\bo_rtl\b)')

BANG_OPEN = "/*!rtl:begin:ignore*/"
BANG_CLOSE = "/*!rtl:end:ignore*/"


def _stylesheets():
    for path in sorted(ADDONS.glob("*/static/src/**/*.scss")):
        yield path, path.read_text(encoding="utf-8")


@tagged("post_install", "-at_install")
class TestRtlFences(TransactionCase):
    def test_every_rtl_scoped_rule_is_fenced(self):
        """An unfenced hand-written RTL rule is mirrored back to LTR."""
        unfenced = []
        for path, text in _stylesheets():
            lines = text.splitlines()
            depth = 0          # how many bang-fences are open at this line
            for number, line in enumerate(lines, start=1):
                if BANG_OPEN in line:
                    depth += 1
                if BANG_CLOSE in line:
                    depth = max(0, depth - 1)
                if depth:
                    continue
                # Only selector lines matter; a declaration inside an already
                # fenced block is covered by the counter above.
                if RTL_SELECTOR.search(line) and "{" in line:
                    unfenced.append(
                        f"{path.relative_to(ADDONS)}:{number}: {line.strip()[:70]}")

        self.assertFalse(unfenced, (
            "These right-to-left rules are not inside a /*!rtl:begin:ignore*/ "
            "fence, so rtlcss will mirror them a second time and undo them:\n"
            + "\n".join(unfenced)))

    def test_the_fences_use_the_form_that_survives_compilation(self):
        """A plain /* rtl:ignore */ is stripped by SCSS before rtlcss sees it,
        so it reads as a fence in the source and is not one in the bundle."""
        plain = []
        for path, text in _stylesheets():
            for match in re.finditer(r"/\*(?!!)\s*rtl:(?:begin|end):ignore", text):
                line = text[:match.start()].count("\n") + 1
                plain.append(f"{path.relative_to(ADDONS)}:{line}")
        self.assertFalse(plain, (
            "Use /*!rtl:begin:ignore*/ — with the bang — or SCSS removes the "
            "directive during compilation and the fence silently does "
            "nothing:\n" + "\n".join(plain)))

    def test_every_fence_is_closed(self):
        unbalanced = []
        for path, text in _stylesheets():
            opens = text.count(BANG_OPEN)
            closes = text.count(BANG_CLOSE)
            if opens != closes:
                unbalanced.append(
                    f"{path.relative_to(ADDONS)}: {opens} open, {closes} closed")
        self.assertFalse(unbalanced, "; ".join(unbalanced))
