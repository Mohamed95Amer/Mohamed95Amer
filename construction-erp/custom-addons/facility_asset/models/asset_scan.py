from odoo import api, fields, models
from odoo.exceptions import UserError


class FacilityAssetScan(models.Model):
    _name = "facility.asset.scan"
    _description = "Asset Tag Scan"
    _order = "scanned_at desc, id desc"
    _rec_name = "equipment_id"

    equipment_id = fields.Many2one(
        "maintenance.equipment", required=True, readonly=True, index=True,
        ondelete="cascade")
    scanned_at = fields.Datetime(
        required=True, readonly=True, default=fields.Datetime.now, index=True)
    user_id = fields.Many2one(
        "res.users", required=True, readonly=True,
        default=lambda self: self.env.user, index=True)
    source = fields.Selection(
        [("qr", "QR code"), ("nfc", "NFC"), ("manual", "Manual")],
        required=True, readonly=True, default="manual", index=True)
    facility_location_id = fields.Many2one(
        "facility.location", readonly=True, index=True)
    company_id = fields.Many2one(
        related="equipment_id.company_id", store=True, readonly=True, index=True)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_uninstall(self):
        # Scan history is evidence. Normal users and managers receive no unlink
        # ACL; this also prevents accidental deletion through server actions.
        if not self.env.is_superuser():
            raise UserError(self.env._("Asset scan history is immutable."))
