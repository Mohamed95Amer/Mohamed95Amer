from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionMaterialIssue(models.Model):
    """Materials issued from the site store into the works.

    This is the document a storekeeper raises when concrete, steel or blockwork
    leaves the store for a given activity. Confirming it books real stock moves
    out of the site location into a consumption location, so the quantity is
    gone from stock the same way any other issue would be — the register and
    the inventory cannot drift apart because they are the same records.
    """

    _name = "construction.material.issue"
    _description = "Site Material Issue"
    _inherit = ["construction.document.mixin", "mail.thread", "mail.activity.mixin"]
    _doc_prefix = "MI"
    _order = "id desc"

    issue_date = fields.Date(
        required=True, default=fields.Date.context_today, tracking=True)
    issued_to_id = fields.Many2one(
        "res.partner", string="Issued To",
        help="Subcontractor or crew receiving the materials.")
    task_id = fields.Many2one(
        "project.task", string="Activity",
        domain="[('project_id', '=', project_id)]",
        help="Programme activity the materials were consumed on.")
    requested_by_id = fields.Many2one(
        "res.users", string="Storekeeper", default=lambda self: self.env.user)
    currency_id = fields.Many2one(related="project_id.currency_id", store=True)
    note = fields.Text()

    state = fields.Selection(
        [("draft", "Draft"), ("done", "Issued"), ("cancelled", "Cancelled")],
        default="draft", tracking=True, group_expand="_group_expand_state",
    )
    line_ids = fields.One2many(
        "construction.material.issue.line", "issue_id", copy=True)
    move_ids = fields.One2many(
        "stock.move", "construction_issue_id", readonly=True)
    total_value = fields.Monetary(
        compute="_compute_total_value", store=True, currency_field="currency_id")

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    @api.depends("line_ids.value")
    def _compute_total_value(self):
        for issue in self:
            issue.total_value = sum(issue.line_ids.mapped("value"))

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state == "draft"

    def action_confirm(self):
        """Book the issue as stock moves out of the site store."""
        for issue in self:
            if issue.state != "draft":
                raise UserError(self.env._("Only a draft issue can be confirmed."))
            if not issue.line_ids:
                raise UserError(self.env._("Add the materials being issued."))
            zero = issue.line_ids.filtered(lambda line: line.quantity <= 0)
            if zero:
                raise UserError(self.env._(
                    "Every line needs a quantity greater than zero: %s",
                    ", ".join(zero.mapped("product_id.display_name")),
                ))
            issue.project_id.ensure_site_location()
            issue._create_moves()
            issue.state = "done"

    def _consumption_location(self):
        return self.env.ref("construction_material.location_site_consumption")

    def _create_moves(self):
        self.ensure_one()
        move_model = self.env["stock.move"]
        source = self.project_id.site_location_id
        destination = self._consumption_location()
        # Fall back to the store's company: a project may carry none, and
        # stock.move requires one.
        company = self.project_id.company_id or source.company_id or self.env.company
        moves = move_model
        for line in self.line_ids:
            moves |= move_model.create({
                "name": f"{self.reference or self.name}: {line.product_id.display_name}",
                "product_id": line.product_id.id,
                "product_uom_qty": line.quantity,
                "product_uom": line.uom_id.id,
                "location_id": source.id,
                "location_dest_id": destination.id,
                "construction_issue_id": self.id,
                "company_id": company.id,
            })
        moves._action_confirm()
        moves._action_assign()
        for move in moves:
            # Issue what was actually taken, not what stock thinks is reserved:
            # a store hands over the quantity on the docket even when the
            # system's on-hand figure lags behind reality.
            move.quantity = move.product_uom_qty
            move.picked = True
        moves._action_done()
        return moves

    @api.model
    def _demo_receive_stock(self, project_id, product_id, quantity):
        """Put stock into a project's site store.

        Demo helper only: a realistic material position needs deliveries to
        have happened, and expressing an inventory adjustment in XML data is
        far less readable than one call. Real deliveries arrive through
        purchase receipts into the same location.
        """
        project = self.env["project.project"].browse(project_id)
        project.ensure_site_location()
        self.env["stock.quant"].with_context(inventory_mode=True).create({
            "product_id": product_id,
            "location_id": project.site_location_id.id,
            "inventory_quantity": quantity,
        })._apply_inventory()

    def action_cancel(self):
        for issue in self:
            if issue.state == "done":
                raise UserError(self.env._(
                    "A confirmed issue has already moved stock. Reverse it with "
                    "a stock adjustment rather than cancelling the record."
                ))
            issue.state = "cancelled"

    def action_reset(self):
        self.filtered(lambda i: i.state == "cancelled").state = "draft"


class ConstructionMaterialIssueLine(models.Model):
    _name = "construction.material.issue.line"
    _description = "Site Material Issue Line"
    _order = "issue_id, sequence, id"

    issue_id = fields.Many2one(
        "construction.material.issue", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    product_id = fields.Many2one(
        "product.product", required=True,
        domain=[("type", "=", "consu")])
    boq_line_id = fields.Many2one(
        "construction.boq.line", string="BOQ Item",
        domain="[('project_id', '=', parent.project_id)]",
        help="Bill item this material was consumed against, so consumption can "
             "be measured against the quantity that was priced.")
    quantity = fields.Float(required=True, default=1.0)
    uom_id = fields.Many2one(
        "uom.uom", string="UoM", compute="_compute_uom",
        store=True, readonly=False)
    unit_cost = fields.Monetary(
        compute="_compute_value", store=True, readonly=False,
        currency_field="currency_id")
    value = fields.Monetary(
        compute="_compute_value", store=True, currency_field="currency_id")
    currency_id = fields.Many2one(related="issue_id.currency_id")
    qty_on_hand = fields.Float(
        compute="_compute_qty_on_hand", compute_sudo=True, string="On Site",
        help="Quantity of this product currently in the site store.")

    @api.depends("product_id")
    def _compute_uom(self):
        for line in self:
            line.uom_id = line.product_id.uom_id

    @api.depends("product_id", "quantity")
    def _compute_value(self):
        for line in self:
            if not line.unit_cost:
                line.unit_cost = line.product_id.standard_price
            line.value = line.quantity * line.unit_cost

    @api.depends("product_id", "issue_id.project_id.site_location_id")
    def _compute_qty_on_hand(self):
        for line in self:
            location = line.issue_id.project_id.site_location_id
            if not location or not line.product_id:
                line.qty_on_hand = 0.0
                continue
            line.qty_on_hand = line.product_id.with_context(
                location=location.id
            ).qty_available
