from dateutil.relativedelta import relativedelta

from odoo import api, fields, models


class MaintenanceEquipment(models.Model):
    _inherit = "maintenance.equipment"

    facility_location_id = fields.Many2one(
        "facility.location", string="Facility Location", index=True)
    parent_id = fields.Many2one(
        "maintenance.equipment", string="Parent Asset", ondelete="set null")
    child_ids = fields.One2many("maintenance.equipment", "parent_id")
    criticality = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High"),
         ("critical", "Critical")],
        default="medium", tracking=True)
    barcode = fields.Char(copy=False)
    purchase_value = fields.Monetary(currency_field="currency_id")
    currency_id = fields.Many2one(
        related="company_id.currency_id")
    expected_life_years = fields.Integer(string="Expected Life (years)")
    warranty_active = fields.Boolean(
        compute="_compute_warranty_active", search="_search_warranty_active")
    meter_ids = fields.One2many("facility.asset.meter", "equipment_id")
    spare_line_ids = fields.One2many("facility.spare.line", "equipment_id")
    asset_count_children = fields.Integer(compute="_compute_children_count")

    @api.depends("warranty_date")
    def _compute_warranty_active(self):
        today = fields.Date.context_today(self)
        for eq in self:
            eq.warranty_active = bool(
                eq.warranty_date and eq.warranty_date >= today)

    def _search_warranty_active(self, operator, value):
        today = fields.Date.context_today(self)
        domain = [("warranty_date", ">=", today)]
        if (operator == "=" and value) or (operator == "!=" and not value):
            return domain
        return ["|", ("warranty_date", "<", today), ("warranty_date", "=", False)]

    def _compute_children_count(self):
        for eq in self:
            eq.asset_count_children = len(eq.child_ids)

    @api.model
    def _cron_warranty_alerts(self):
        """Notify responsible users of assets whose warranty expires soon."""
        today = fields.Date.context_today(self)
        horizon = today + relativedelta(days=30)
        expiring = self.search([
            ("warranty_date", ">=", today), ("warranty_date", "<=", horizon)])
        for eq in expiring:
            user = eq.technician_user_id or eq.owner_user_id or self.env.user
            eq.activity_schedule(
                "mail.mail_activity_data_todo",
                summary=self.env._("Warranty expiring: %s", eq.name),
                note=self.env._("Warranty ends on %s.", eq.warranty_date),
                user_id=user.id)
        return True
