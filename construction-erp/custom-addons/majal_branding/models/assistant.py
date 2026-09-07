from markupsafe import Markup

from odoo import _, fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    odoobot_state = fields.Selection(string="Assistant Status")

    def _init_odoobot(self):
        self.ensure_one()
        assistant_id = self.env["ir.model.data"]._xmlid_to_res_id(
            "base.partner_root"
        )
        channel = self.env["discuss.channel"].channel_get(
            [assistant_id, self.partner_id.id]
        )
        message = Markup("%s<br/>%s<br/><b>%s</b>") % (
            _("Hello,"),
            _(
                "Majal keeps project, site and facility conversations together "
                "so decisions stay connected to the work."
            ),
            _("Ask for help at any time, or open Help & Support from your profile."),
        )
        channel.sudo().message_post(
            author_id=assistant_id,
            body=message,
            message_type="comment",
            silent=True,
            subtype_xmlid="mail.mt_comment",
        )
        self.sudo().odoobot_state = "idle"
        return channel


class MailBot(models.AbstractModel):
    _inherit = "mail.bot"

    def _get_style_dict(self):
        values = super()._get_style_dict()
        values.update({
            "document_link_start": Markup(
                "<a href='/majal/help' target='_blank'>"
            ),
            "slides_link_start": Markup(
                "<a href='/majal/help' target='_blank'>"
            ),
        })
        return values

    def _get_answer(self, record, body, values, command=False):
        answer = super()._get_answer(record, body, values, command)
        if not answer:
            return answer
        return Markup(
            str(answer)
            .replace("@OdooBot", "@Majal Assistant")
            .replace("OdooBot", "Majal Assistant")
            .replace("Odoo", "Majal")
        )
