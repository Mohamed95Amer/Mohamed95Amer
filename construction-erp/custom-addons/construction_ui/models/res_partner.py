from base64 import b64encode

from odoo import models
from odoo.tools import html_escape

# Deep enough that white initials clear WCAG AA at every one of them, and all
# drawn from the palette the rest of the back end already uses — an avatar is
# the most repeated graphic in the product, so a random hue is a random hue
# repeated four hundred times a day.
AVATAR_COLOURS = (
    "#173240",  # navy
    "#244657",  # navy, softer
    "#346d75",  # primary teal
    "#2f5d52",  # deep green-teal
    "#4a5a63",  # slate
    "#6b5326",  # brass, darkened to carry white text
)


class ResPartner(models.Model):
    _inherit = "res.partner"

    def _avatar_generate_svg(self):
        """The default avatar for anyone who has not uploaded a photo.

        Odoo draws one letter on a colour picked by hashing the name and the
        creation timestamp, which lands anywhere on the wheel — pastels, acid
        greens, a different family every time. Two initials on a fixed Majal
        palette stay recognisable as one product and still tell two people
        apart, which is the whole job of an avatar in a chatter thread.

        Only internal users reach this: res.partner routes everybody else to
        the placeholder image instead.
        """
        name = (self[self._avatar_name_field] or "").strip()
        if not name:
            return super()._avatar_generate_svg()

        words = [word for word in name.split() if word]
        initials = html_escape(
            (words[0][0] + words[-1][0]).upper() if len(words) > 1
            else words[0][0].upper()
        )
        # Deterministic, and deliberately not seeded on create_date: the same
        # person keeps the same colour after a database is restored.
        colour = AVATAR_COLOURS[sum(map(ord, name)) % len(AVATAR_COLOURS)]
        size = 60 if len(initials) > 1 else 84

        return b64encode((
            "<?xml version='1.0' encoding='UTF-8' ?>"
            "<svg height='180' width='180' xmlns='http://www.w3.org/2000/svg'>"
            f"<rect fill='{colour}' height='180' width='180'/>"
            f"<text fill='#ffffff' font-size='{size}' font-weight='600' "
            "text-anchor='middle' dominant-baseline='central' x='90' y='94' "
            "font-family='system-ui, -apple-system, Segoe UI, sans-serif' "
            f"letter-spacing='2'>{initials}</text>"
            "</svg>"
        ).encode())

    def _avatar_get_placeholder_path(self):
        """A Majal figure rather than Odoo's grey one, for the nameless."""
        if not self.is_company and self.type not in ("delivery", "invoice"):
            return "construction_ui/static/img/majal_avatar.png"
        return super()._avatar_get_placeholder_path()
