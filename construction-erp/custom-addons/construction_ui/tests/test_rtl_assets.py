from pathlib import Path

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalRtlAssets(TransactionCase):
    """Keep directional custom controls mirrored in the Arabic bundle."""

    @classmethod
    def _asset(cls, *parts):
        return (Path(__file__).resolve().parents[1] / "static" / "src").joinpath(
            *parts
        ).read_text(encoding="utf-8")

    @classmethod
    def _addon_asset(cls, addon, *parts):
        return (
            Path(__file__).resolve().parents[2]
            / addon
            / "static"
            / "src"
            / Path(*parts)
        ).read_text(encoding="utf-8")

    def test_sidebar_caret_uses_rtl_open_direction(self):
        css = self._asset("sidebar", "majal_sidebar.scss")
        self.assertIn(
            '.o_majal_item[aria-expanded="true"] .o_majal_caret', css
        )
        self.assertIn("transform: rotate(-90deg);", css)

    def test_gantt_caret_is_mirrored_without_reversing_time(self):
        css = self._addon_asset(
            "construction_planning", "gantt", "gantt.scss"
        )
        self.assertIn(
            ".o_prog_twisty .fa-caret-right { transform: scaleX(-1); }", css
        )
        self.assertIn("direction: ltr;", css)
