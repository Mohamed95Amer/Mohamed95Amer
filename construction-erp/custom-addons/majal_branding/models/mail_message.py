from markupsafe import Markup

from odoo import api, models


class MailMessage(models.Model):
    _inherit = "mail.message"

    @api.model
    def _majal_rebrand_assistant_messages(self):
        assistant = self.env.ref("base.partner_root")
        messages = self.sudo().search([
            ("author_id", "=", assistant.id),
            ("body", "ilike", "Odoo"),
        ])
        for message in messages:
            body = (
                str(message.body)
                .replace(
                    "Odoo's chat helps employees collaborate efficiently. "
                    "I'm here to help you discover its features.",
                    "Majal keeps project, site and facility conversations "
                    "together so decisions stay connected to the work.",
                )
                .replace("@OdooBot", "@Majal Assistant")
                .replace("OdooBot", "Majal Assistant")
                .replace("Enjoy discovering Odoo!", "Enjoy discovering Majal!")
                .replace(
                    "https://www.odoo.com/documentation",
                    "/majal/help",
                )
                .replace(
                    "https://www.odoo.com/slides",
                    "/majal/help",
                )
                .replace("Odoo", "Majal")
            )
            message.body = Markup(body)
        return True
