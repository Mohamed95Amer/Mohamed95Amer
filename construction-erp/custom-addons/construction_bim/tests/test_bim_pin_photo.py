"""A BIM pin can carry a photograph of what was actually built.

The element says what was designed. The photo says what is there. That gap is
most of what a site walk is for, and until now the pin could only describe it
in words.

The payload rule is the same as the drawing pins': pins_for_model returns
every pin on the model at once, so the flag travels and the picture does not.
"""

import base64
import io

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


def make_photo(width=40, height=30, fmt="PNG"):
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (18, 47, 61)).save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue())


@tagged("post_install", "-at_install")
class TestBimPinPhoto(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "BIM Photo Project", "is_construction": True})
        cls.model = cls.env["construction.bim.model"].create(
            {"name": "Tower", "project_id": cls.project.id})
        cls.Pin = cls.env["construction.bim.pin"]

    def _drop(self, photo=None):
        return self.Pin.drop_pin(self.model.id, {
            "name": "Rebar spacing wrong",
            "note": "third bay",
            "pin_type": "note",
            "pos_x": 1.0, "pos_y": 2.0, "pos_z": 3.0,
            "photo": photo,
        })

    def test_a_photo_dropped_with_the_pin_is_kept(self):
        payload = self._drop(photo=make_photo())
        pin = self.Pin.browse(payload["id"])
        self.assertTrue(pin.photo)
        self.assertTrue(pin.has_photo)
        self.assertTrue(payload["has_photo"])

    def test_a_pin_without_a_photo_still_works(self):
        payload = self._drop()
        self.assertFalse(payload["has_photo"])
        self.assertFalse(self.Pin.browse(payload["id"]).photo)

    def test_the_payload_carries_the_flag_and_not_the_bytes(self):
        self._drop(photo=make_photo())
        for pin in self.Pin.pins_for_model(self.model.id):
            self.assertIn("has_photo", pin)
            self.assertNotIn("photo", pin,
                             "image bytes are being sent for every pin")

    def test_a_non_image_is_refused(self):
        with self.assertRaises(ValidationError):
            self._drop(photo=base64.b64encode(b"not a photograph"))

    def test_the_position_and_the_photo_are_kept_together(self):
        """The point of a pin is where it is. A photo that arrived without its
        coordinates would be an attachment, not a pin."""
        payload = self._drop(photo=make_photo())
        pin = self.Pin.browse(payload["id"])
        self.assertEqual(
            (pin.pos_x, pin.pos_y, pin.pos_z), (1.0, 2.0, 3.0))
        self.assertTrue(pin.has_photo)
