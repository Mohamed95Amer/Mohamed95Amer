import base64

from odoo import api, fields, models
from odoo.exceptions import UserError


class FacilityFloorplan(models.Model):
    """A pinnable 2D floor plan (PDF) attached to a facility location. Assets,
    maintenance requests and notes are dropped as pins on the plan through the
    shared Plan Viewer — the CAFM counterpart of construction drawing pins."""

    _name = "facility.floorplan"
    _description = "Facility Floor Plan"
    _order = "location_id, sequence, id"

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    location_id = fields.Many2one(
        "facility.location", string="Location", required=True,
        ondelete="cascade", index=True)
    company_id = fields.Many2one(
        "res.company", related="location_id.company_id", store=True)
    active = fields.Boolean(default=True)
    note = fields.Text()

    attachment_id = fields.Many2one(
        "ir.attachment", string="PDF Attachment", ondelete="restrict",
        help="The floor-plan PDF rendered by the plan viewer.")
    sheet_file = fields.Binary(
        compute="_compute_sheet_file", inverse="_inverse_sheet_file",
        string="Floor Plan PDF", attachment=False,
        help="Upload the floor-plan PDF here — it is stored as the plan's "
             "attachment and rendered by the plan viewer.")
    sheet_filename = fields.Char()
    has_sheet = fields.Boolean(compute="_compute_has_sheet")

    pin_ids = fields.One2many("facility.pin", "floorplan_id")
    pin_count = fields.Integer(compute="_compute_pin_count")

    @api.depends("attachment_id")
    def _compute_sheet_file(self):
        for plan in self:
            plan.sheet_file = plan.attachment_id.datas

    @api.depends("attachment_id")
    def _compute_has_sheet(self):
        for plan in self:
            plan.has_sheet = bool(plan.attachment_id)

    @api.depends("pin_ids")
    def _compute_pin_count(self):
        for plan in self:
            plan.pin_count = len(plan.pin_ids)

    def _inverse_sheet_file(self):
        for plan in self:
            old = plan.attachment_id
            if plan.sheet_file:
                plan._check_pdf(base64.b64decode(plan.sheet_file))
                attachment = self.env["ir.attachment"].create({
                    "name": plan.sheet_filename
                    or f"{plan.display_name or 'floorplan'}.pdf",
                    "datas": plan.sheet_file,
                    "mimetype": "application/pdf",
                    "res_model": plan._name,
                    "res_id": plan.id,
                })
                plan.attachment_id = attachment
            else:
                plan.attachment_id = False
            if old and old != plan.attachment_id:
                old.sudo().unlink()

    @api.model
    def _check_pdf(self, data):
        if not data.startswith(b"%PDF"):
            raise UserError(
                self.env._("Only PDF files can be uploaded as floor plans."))

    def upload_sheet(self, filename, data_b64):
        """RPC used by the plan viewer's Upload button."""
        self.ensure_one()
        self.write(
            {"sheet_filename": filename or "floorplan.pdf",
             "sheet_file": data_b64})
        return {"attachment_id": self.attachment_id.id}

    def action_open_floorplan(self):
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "tag": "construction_plan_viewer",
            "name": self.env._("Floor Plan — %s", self.display_name),
            "params": {
                "pin_model": "facility.pin",
                "sheet_model": "facility.floorplan",
                "sheet_id": self.id,
            },
        }
