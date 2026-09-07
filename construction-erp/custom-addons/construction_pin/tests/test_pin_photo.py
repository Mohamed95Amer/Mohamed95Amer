"""A pin can carry a photograph of what it points at.

On site the picture usually *is* the observation — a crack, a missing
handrail, the wrong fitting — and a written note is a poor substitute. So the
photo travels with the pin from the moment it is dropped, including from a
phone camera, and comes back through the record's own access rules rather than
as bytes attached to every pin on the sheet.

The three things worth pinning down here: that the picture survives the round
trip, that a busy drawing does not pay for photographs it is not showing, and
that a user who may not read the pin cannot read its photograph either.
"""

import base64
import io

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


def make_photo(width=40, height=30, fmt="PNG"):
    """A real image, because fields.Image runs everything through PIL."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (18, 47, 61)).save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue())


@tagged("post_install", "-at_install")
class TestPinPhoto(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Pin Photo Project", "is_construction": True})
        cls.drawing = cls.env["construction.drawing"].create(
            {"name": "Plan", "number": "A-02", "project_id": cls.project.id})
        cls.revision = cls.env["construction.drawing.revision"].create(
            {"drawing_id": cls.drawing.id, "revision": "A"})
        cls.Pin = cls.env["construction.pin"]

    def _drop(self, photo=None, name="Cracked tile at C3"):
        return self.Pin.create_pin_with_target(
            self.revision.id, 0.4, 0.6, "note", name, "seen on walk", photo)

    def test_a_photo_taken_with_the_pin_is_stored_with_it(self):
        payload = self._drop(photo=make_photo())
        pin = self.Pin.browse(payload["id"])
        self.assertTrue(pin.photo)
        self.assertTrue(pin.has_photo)

    def test_a_pin_without_a_photo_is_still_a_pin(self):
        """The picture is optional. It was asked for as an option and the
        common case on a busy drawing is still a bare marker."""
        payload = self._drop()
        pin = self.Pin.browse(payload["id"])
        self.assertFalse(pin.photo)
        self.assertFalse(pin.has_photo)

    def test_the_plan_payload_carries_the_flag_and_never_the_bytes(self):
        """get_plan_data returns every pin on the sheet. Shipping each
        photograph would make opening a busy drawing cost more than looking at
        the pictures one at a time — which is what the viewer actually does."""
        self._drop(photo=make_photo())
        data = self.Pin.get_plan_data(self.revision.id)

        self.assertTrue(data["pins"])
        for pin in data["pins"]:
            self.assertIn("has_photo", pin)
            self.assertNotIn("photo", pin,
                             "the image bytes are in the plan payload")
        self.assertTrue(data["pins"][0]["has_photo"])

    def test_an_oversized_photo_is_refused_with_something_readable(self):
        self.env["ir.config_parameter"].sudo().set_param(
            "construction_pin.max_photo_mb", "0.001")
        with self.assertRaises(ValidationError):
            self._drop(photo=make_photo(width=800, height=600))

    def test_a_file_that_is_not_an_image_is_refused_before_pil_complains(self):
        """fields.Image would raise anyway, but with a traceback about PIL
        rather than a sentence a site engineer can act on."""
        with self.assertRaises(ValidationError):
            self._drop(photo=base64.b64encode(b"this is not a photograph"))

    def test_the_photo_is_reachable_only_by_someone_who_may_read_the_pin(self):
        """The viewer fetches the image from /web/image, which runs the
        record's own rules — so this asserts the rule, which is the thing the
        URL depends on."""
        from odoo.exceptions import AccessError
        from odoo.tests import new_test_user

        outsider = new_test_user(
            self.env, login="pin-photo-outsider", groups="base.group_portal",
            password="pin-photo-outsider-pw")
        payload = self._drop(photo=make_photo())
        pin = self.Pin.browse(payload["id"])

        with self.assertRaises(AccessError):
            pin.with_user(outsider).read(["photo"])

    def test_a_jpeg_from_a_phone_is_accepted_too(self):
        """Phones produce JPEG, not PNG. Worth an explicit case: the guard
        decodes the image to validate it, and a format-specific mistake there
        would reject every photograph taken on site."""
        payload = self._drop(photo=make_photo(fmt="JPEG"))
        self.assertTrue(self.Pin.browse(payload["id"]).has_photo)
