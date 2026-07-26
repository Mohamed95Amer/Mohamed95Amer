import secrets
from urllib.parse import quote, quote_plus

from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import AccessError


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
    tag_token = fields.Char(
        copy=False, index=True, readonly=True, default=lambda self: self._new_tag_token())
    tag_status = fields.Selection(
        [("active", "Active"), ("missing", "Missing"), ("retired", "Retired")],
        default="active", required=True, tracking=True)
    nfc_uid = fields.Char(
        string="NFC Tag UID", copy=False, tracking=True,
        help="Optional hardware UID read from the physical NFC tag.")
    qr_tag_url = fields.Char(compute="_compute_tag_urls")
    nfc_tag_url = fields.Char(compute="_compute_tag_urls")
    qr_tag_encoded_url = fields.Char(compute="_compute_tag_urls")
    scan_ids = fields.One2many(
        "facility.asset.scan", "equipment_id", string="Tag Scan History")
    scan_count = fields.Integer(compute="_compute_scan_count")
    last_scan_at = fields.Datetime(copy=False, readonly=True)
    last_scan_user_id = fields.Many2one(
        "res.users", copy=False, readonly=True)
    last_scan_source = fields.Selection(
        [("qr", "QR code"), ("nfc", "NFC"), ("manual", "Manual")],
        copy=False, readonly=True)
    purchase_value = fields.Monetary(currency_field="currency_id")
    currency_id = fields.Many2one(
        related="company_id.currency_id")
    expected_life_years = fields.Integer(string="Expected Life (years)")
    warranty_active = fields.Boolean(
        compute="_compute_warranty_active", search="_search_warranty_active")
    meter_ids = fields.One2many("facility.asset.meter", "equipment_id")
    spare_line_ids = fields.One2many("facility.spare.line", "equipment_id")
    asset_count_children = fields.Integer(compute="_compute_children_count")

    _sql_constraints = [
        ("facility_asset_tag_token_unique", "unique(tag_token)",
         "Every asset must have a unique secure tag token."),
        ("facility_asset_barcode_unique", "unique(barcode)",
         "The asset code must be unique."),
    ]

    @api.model
    def _new_tag_token(self):
        return secrets.token_urlsafe(24)

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"]
        for values in vals_list:
            values.setdefault(
                "barcode", sequence.next_by_code("facility.asset.tag") or _("New"))
            values.setdefault("tag_token", self._new_tag_token())
        return super().create(vals_list)

    @api.depends("tag_token")
    def _compute_tag_urls(self):
        base_url = self.env["ir.config_parameter"].sudo().get_param(
            "web.base.url", "").rstrip("/")
        db_name = self.env.cr.dbname
        for asset in self:
            root = f"/majal/asset/{asset.tag_token}" if asset.tag_token else ""

            # A phone scanning a physical tag will usually have no Majal
            # session yet.  Enter through /web/login with an explicit database
            # and a same-site return path; this selects the locked database,
            # authenticates the technician and then resumes the secure scan.
            def login_url(source):
                landing = f"{root}/{source}"
                return (
                    f"{base_url}/web/login?db={quote(db_name)}"
                    f"&redirect={quote(landing, safe='')}"
                )

            asset.qr_tag_url = login_url("qr") if root else ""
            asset.nfc_tag_url = login_url("nfc") if root else ""
            asset.qr_tag_encoded_url = (
                quote_plus(asset.qr_tag_url) if asset.qr_tag_url else "")

    def _compute_scan_count(self):
        grouped = self.env["facility.asset.scan"]._read_group(
            [("equipment_id", "in", self.ids)],
            ["equipment_id"], ["__count"])
        counts = {asset.id: count for asset, count in grouped}
        for asset in self:
            asset.scan_count = counts.get(asset.id, 0)

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

    def record_tag_scan(self, source="manual"):
        """Record an authenticated physical-tag interaction.

        Read access is checked before the small sudo write that maintains the
        summary fields. This lets read-only technicians scan assets without
        granting them general edit rights on the equipment register.
        """
        self.ensure_one()
        self.check_access("read")
        if source not in {"qr", "nfc", "manual"}:
            source = "manual"
        if self.tag_status != "active":
            raise AccessError(_("This asset tag is not active."))
        scan = self.env["facility.asset.scan"].create({
            "equipment_id": self.id,
            "source": source,
            "facility_location_id": self.facility_location_id.id,
        })
        self.sudo().write({
            "last_scan_at": scan.scanned_at,
            "last_scan_user_id": scan.user_id.id,
            "last_scan_source": scan.source,
        })
        return scan

    def action_rotate_tag_token(self):
        if not self.env.user.has_group("maintenance.group_equipment_manager"):
            raise AccessError(_("Only facility managers can replace asset tags."))
        for asset in self:
            asset.tag_token = self._new_tag_token()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Asset tag replaced"),
                "message": _("Old QR and NFC links no longer work. Print and program the new tag."),
                "type": "warning",
                "sticky": True,
            },
        }

    def action_open_tag_landing(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_url",
            "url": self.qr_tag_url,
            "target": "new",
        }

    def action_view_scans(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id(
            "facility_asset.action_asset_scan")
        action["domain"] = [("equipment_id", "=", self.id)]
        action["context"] = {"default_equipment_id": self.id}
        return action

    @api.model
    def _backfill_secure_asset_tags(self):
        """Give pre-existing assets unique codes and tokens during upgrades."""
        seen_tokens = set()
        sequence = self.env["ir.sequence"]
        for asset in self.search([], order="id"):
            values = {}
            token = asset.tag_token
            if not token or token in seen_tokens:
                token = self._new_tag_token()
                while token in seen_tokens:
                    token = self._new_tag_token()
                values["tag_token"] = token
            seen_tokens.add(token)
            if not asset.barcode:
                values["barcode"] = (
                    sequence.next_by_code("facility.asset.tag") or _("New"))
            if values:
                asset.write(values)
        return True

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
