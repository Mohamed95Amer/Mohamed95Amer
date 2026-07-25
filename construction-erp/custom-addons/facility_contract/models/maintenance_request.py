from odoo import api, fields, models


class MaintenanceRequestContract(models.Model):
    """Bind a work order to the maintenance contract it falls under.

    Without this, every work order looks the same and the question an FM
    manager is actually asked — "is this one already paid for?" — has to be
    answered by hand from a contract register. Matching it on the asset
    answers it as the request is raised, which is also the only moment at
    which it can still change what gets billed.
    """

    _inherit = "maintenance.request"

    facility_contract_id = fields.Many2one(
        "contract.contract",
        string="Maintenance Contract",
        compute="_compute_facility_contract",
        store=True,
        readonly=False,
        index=True,
        domain=[("is_amc", "=", True)],
        help="Matched from the asset and the request date. Override it when "
             "work is carried out under a different agreement.",
    )
    contract_covered = fields.Boolean(
        string="Covered by Contract",
        compute="_compute_contract_covered",
        store=True,
        help="The contract's scope includes this kind of work, so its cost is "
             "absorbed by the fee.",
    )
    contract_chargeable = fields.Boolean(
        string="Chargeable",
        compute="_compute_contract_covered",
        store=True,
        help="Work under a contract but outside its scope — recoverable from "
             "the client on top of the fee.",
    )

    @api.depends("equipment_id", "request_date")
    def _compute_facility_contract(self):
        contract_model = self.env["contract.contract"]
        for request in self:
            match = contract_model._match_for_equipment(
                request.equipment_id, request.request_date)
            # Falling back to nothing would wipe a deliberate override every
            # time an unrelated field moved, so an empty match leaves whatever
            # was set by hand alone.
            if match or not request.facility_contract_id:
                request.facility_contract_id = match

    @api.depends(
        "facility_contract_id", "maintenance_type",
        "facility_contract_id.covers_preventive",
        "facility_contract_id.covers_corrective",
    )
    def _compute_contract_covered(self):
        for request in self:
            contract = request.facility_contract_id
            request.contract_covered = bool(
                contract and contract._covers(request))
            request.contract_chargeable = bool(
                contract and not request.contract_covered)


class FacilitySlaPolicyContract(models.Model):
    """A contract's SLA outranks the standing matrix.

    The matrix is what the business does by default; the contract is what it
    sold and can be held to. Where the two disagree, the signed number is the
    one that has to be measured.
    """

    _inherit = "facility.sla.policy"

    @api.model
    def _match(self, request):
        contract = request.facility_contract_id
        if contract and contract.sla_policy_id:
            return contract.sla_policy_id
        return super()._match(request)
