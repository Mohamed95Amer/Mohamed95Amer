from odoo import api, fields, models
from odoo.exceptions import UserError

# Property runs a three-step priority, Facilities a four-step one. Mapped in
# one place, both directions, and only at creation: facility_sla re-stamps
# response and resolution deadlines on any write of priority, so a two-way
# sync would re-arm the SLA clock every time a leasing clerk touched the
# tenant's record.
PRIORITY_TO_FM = {"0": "0", "1": "1", "2": "2"}
PRIORITY_FROM_FM = {"0": "0", "1": "1", "2": "2", "3": "2"}


class MajalMaintenanceRequest(models.Model):
    _inherit = "majal.maintenance.request"

    maintenance_request_id = fields.Many2one(
        "maintenance.request", string="Work Order",
        readonly=True, copy=False, ondelete="set null",
        help="The Facilities work order raised to deal with this report.")

    def action_escalate_to_facilities(self):
        """Raise a work order for this report.

        The report stays the tenant's: a claim on the landlord. The work
        order is the labour and parts that answer it, and one report can
        need several. Keeping them apart is also what stops a tenant seeing
        contractor cost lines.
        """
        for request in self:
            if request.maintenance_request_id:
                raise UserError(
                    self.env._(
                        "%(request)s is already with Facilities as %(order)s.",
                        request=request.display_name,
                        order=request.maintenance_request_id.display_name,
                    )
                )
            unit = request.unit_id
            # There is no asset yet — just a flat with a problem in it — so
            # the work order is located directly. That only holds together
            # because the request's location is writable in its own right.
            location = unit.sudo()._ensure_facility_location()
            work_order = self.env["maintenance.request"].sudo().create({
                "name": request.name,
                "description": request.description,
                "maintenance_type": "corrective",
                "priority": PRIORITY_TO_FM.get(request.priority, "1"),
                "facility_location_id": location.id,
                "company_id": request.company_id.id,
                "majal_request_id": request.id,
            })
            request.maintenance_request_id = work_order
            if request.state == "new":
                request.state = "in_progress"
            request.message_post(body=self.env._(
                "Escalated to Facilities as %s.", work_order.display_name))
            work_order.message_post(body=self.env._(
                "Raised from tenant report %s on unit %s.",
                request.display_name, unit.display_name))
        return True

    def action_view_work_order(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Work Order"),
            "res_model": "maintenance.request",
            "res_id": self.maintenance_request_id.id,
            "view_mode": "form",
        }

    def action_done(self):
        """Two systems cannot both own the moment a job is finished."""
        for request in self:
            work_order = request.maintenance_request_id
            if work_order and not work_order.sudo().stage_id.done:
                raise UserError(
                    self.env._(
                        "Work order %s is still open in Facilities. Close it "
                        "there, or unlink it from this report first.",
                        work_order.display_name,
                    )
                )
        return super().action_done()

    def action_cancel(self):
        """A tenant withdrawing a complaint does not make a half-dismantled
        riser safe, so the work order is left for Facilities to judge."""
        result = super().action_cancel()
        for request in self.filtered("maintenance_request_id"):
            work_order = request.maintenance_request_id.sudo()
            if not work_order.stage_id.done:
                work_order.message_post(body=self.env._(
                    "The tenant report behind this work order was cancelled. "
                    "It has been left open for Facilities to decide."))
        return result


class MaintenanceRequest(models.Model):
    _inherit = "maintenance.request"

    majal_request_id = fields.Many2one(
        "majal.maintenance.request", string="Tenant Report",
        readonly=True, copy=False, ondelete="set null", index=True)
    majal_unit_id = fields.Many2one(
        "majal.unit", string="Unit",
        compute="_compute_majal_unit_id", store=True, readonly=False, index=True)
    majal_lease_id = fields.Many2one(
        related="majal_request_id.lease_id", store=True, readonly=True)
    majal_tenant_partner_id = fields.Many2one(
        related="majal_request_id.partner_id", store=True, readonly=True,
        string="Reported By")

    @api.depends("facility_location_id.majal_unit_id", "equipment_id.majal_unit_id")
    def _compute_majal_unit_id(self):
        for request in self:
            unit = (
                request.facility_location_id.majal_unit_id
                or request.equipment_id.majal_unit_id
            )
            if unit:
                request.majal_unit_id = unit

    def write(self, vals):
        """Facilities owns closure once a report has been escalated.

        maintenance.request has no state field — stage_id.done is the only
        truth — so the property record follows the stage, in both directions.
        """
        was_done = {request.id: request.stage_id.done for request in self}
        result = super().write(vals)
        if "stage_id" not in vals:
            return result
        for request in self.filtered("majal_request_id"):
            report = request.majal_request_id.sudo()
            now_done = request.stage_id.done
            if now_done and not was_done.get(request.id):
                if report.state != "done":
                    report.write({
                        "state": "done",
                        "closed_date": fields.Date.context_today(report),
                    })
                    report.message_post(body=self.env._(
                        "Closed: Facilities completed %s.", request.display_name))
            elif not now_done and was_done.get(request.id):
                report.write({"state": "in_progress", "closed_date": False})
                report.message_post(body=self.env._(
                    "Reopened: Facilities reopened %s.", request.display_name))
        return result

    def action_view_tenant_report(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Tenant Report"),
            "res_model": "majal.maintenance.request",
            "res_id": self.majal_request_id.id,
            "view_mode": "form",
        }
