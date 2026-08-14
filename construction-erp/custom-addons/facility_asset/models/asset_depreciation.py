"""What a facility asset is worth, and what it has cost so far.

facility_asset already recorded `purchase_value` and `expected_life_years`
and did nothing with either: a repo-wide search for depreciation, useful
life, salvage or residual returned nothing at all. So an FM manager could say
a chiller cost 400,000 and should last fifteen years, and the system could
not tell them what it was worth this year.

`om_account_asset` is already vendored and already installed through
`om_account_accountant`, and provides the whole schedule — linear and
degressive, depreciation lines, posting. It had no connection to
maintenance.equipment. This is that connection.

Deliberately a button rather than automatic. `account.asset.asset` requires
a category; a category requires a journal and three accounts; those require
a chart of accounts. On a fresh database none of that exists, so an asset
created automatically on equipment creation would fail every install and
every test that ever creates a piece of equipment. The register is populated
the moment somebody has configured accounting, and not before — which is the
honest shape of the dependency rather than a pretence that it isn't there.
"""

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class MaintenanceEquipment(models.Model):
    _inherit = "maintenance.equipment"

    asset_id = fields.Many2one(
        "account.asset.asset", string="Depreciating Asset",
        readonly=True, copy=False,
        help="The accounting asset this equipment is carried as. Created "
             "from the purchase value and expected life by the button on "
             "this form.")
    asset_category_id = fields.Many2one(
        "account.asset.category", string="Asset Type",
        help="Which depreciation rules apply — the accounts, the journal and "
             "the method. Configured in Accounting; a category has to exist "
             "before an asset can be created.")
    asset_state = fields.Selection(
        related="asset_id.state", string="Depreciation Status")
    asset_gross_value = fields.Monetary(
        related="asset_id.value", string="Gross Value",
        currency_field="currency_id")
    asset_book_value = fields.Monetary(
        related="asset_id.value_residual", string="Book Value",
        currency_field="currency_id",
        help="What it is still worth: the gross value less everything "
             "depreciated so far.")
    asset_depreciated_value = fields.Monetary(
        compute="_compute_asset_depreciated_value",
        string="Accumulated Depreciation", currency_field="currency_id")
    asset_in_service_date = fields.Date(
        string="In Service",
        help="When the asset was commissioned. Depreciation runs from this "
             "date, not from the day somebody typed the record in — a chiller "
             "bought in March and commissioned in September has not lost six "
             "months of value sitting in a crate.")
    asset_salvage_value = fields.Monetary(
        string="Residual Value", currency_field="currency_id",
        help="What it is expected to be worth at the end of its life. "
             "Depreciation is spread over the purchase value less this, so "
             "leaving it at zero writes plant down to nothing and overstates "
             "the annual charge.")
    asset_line_ids = fields.One2many(
        related="asset_id.depreciation_line_ids", string="Depreciation Schedule")
    asset_entry_count = fields.Integer(
        related="asset_id.entry_count", string="Posted Entries")
    asset_needs_disposal = fields.Boolean(
        compute="_compute_asset_needs_disposal",
        help="Retired equipment whose asset is still running. The schedule "
             "keeps posting until the asset is closed, which overstates the "
             "charge for every period after it left service.")

    @api.depends("tag_status", "asset_id.state")
    def _compute_asset_needs_disposal(self):
        for equipment in self:
            equipment.asset_needs_disposal = (
                equipment.tag_status == "retired"
                and equipment.asset_id.state == "open"
            )

    @api.depends("asset_id.value", "asset_id.value_residual")
    def _compute_asset_depreciated_value(self):
        for equipment in self:
            asset = equipment.asset_id
            equipment.asset_depreciated_value = (
                asset.value - asset.value_residual if asset else 0.0)

    def _asset_values(self):
        """What the accounting asset takes from the equipment."""
        self.ensure_one()
        return {
            "name": self.name,
            "category_id": self.asset_category_id.id,
            "value": self.purchase_value,
            "company_id": self.company_id.id or self.env.company.id,
            "currency_id": self.currency_id.id,
            # Straight-line over the stated life, a year at a time. Anything
            # cleverer is what the category is for — this only has two
            # numbers to work from and should not invent a third.
            "method_number": self.expected_life_years,
            "method_period": 12,
            # The commissioning date, falling back to today only when nobody
            # recorded one. Dating an asset from the day the record was typed
            # is the most common way a depreciation schedule ends up a few
            # months out from the year it should have started in.
            "date": self.asset_in_service_date or fields.Date.context_today(self),
            "salvage_value": self.asset_salvage_value,
        }

    def action_create_asset(self):
        """Put this equipment on the depreciation register.

        Every refusal below names the field that is missing rather than
        failing at the ORM, because "null value violates not-null constraint"
        tells an FM manager nothing about which box to fill in.
        """
        self.ensure_one()
        if self.asset_id:
            raise UserError(_(
                "%s is already on the depreciation register.", self.name))
        if not self.asset_category_id:
            raise UserError(_(
                "Choose an asset type first. It carries the accounts and the "
                "journal the depreciation is posted to, which is why it "
                "cannot be guessed from the equipment."))
        if self.purchase_value <= 0:
            raise UserError(_(
                "There is nothing to depreciate: %s has no purchase value.",
                self.name))
        if self.expected_life_years <= 0:
            raise UserError(_(
                "Set the expected life in years, so there is a period to "
                "spread the value over."))
        asset = self.env["account.asset.asset"].create(self._asset_values())
        # Creating it is not the same as running it, and the difference is the
        # whole feature. account.asset.asset.create() computes the schedule,
        # but the asset stays in draft — and _cron_generate_entries only looks
        # at assets in state 'open'. Left in draft the board looks right on
        # screen and nothing is ever posted to the ledger, which is worse than
        # no depreciation at all because it reads as done.
        asset.validate()
        self.asset_id = asset
        self.message_post(body=_(
            "Depreciation started: %(value)s over %(years)s years from "
            "%(date)s, residual %(salvage)s.",
            value=self.purchase_value, years=self.expected_life_years,
            date=asset.date, salvage=self.asset_salvage_value,
        ))
        return self.action_view_asset()

    def action_dispose_asset(self):
        """Stop the schedule when the equipment leaves service.

        Not automatic on retiring the equipment, deliberately. Closing an
        asset posts a disposal entry, and an accounting entry appearing
        because somebody changed a status field on a maintenance form is the
        kind of surprise that ends with the finance team distrusting the
        whole system. The form shows that it is needed; a person presses it.
        """
        self.ensure_one()
        if self.asset_id.state != "open":
            raise UserError(_(
                "%s has no running depreciation to close.", self.name))
        return self.asset_id.set_to_close()

    def action_view_depreciation_entries(self):
        self.ensure_one()
        if not self.asset_id:
            raise UserError(_("%s is not on the depreciation register.",
                              self.name))
        return self.asset_id.open_entries()

    def action_view_asset(self):
        self.ensure_one()
        if not self.asset_id:
            raise UserError(_("%s is not on the depreciation register.",
                              self.name))
        return {
            "type": "ir.actions.act_window",
            "name": _("Depreciating Asset"),
            "res_model": "account.asset.asset",
            "res_id": self.asset_id.id,
            "view_mode": "form",
        }
