from odoo import models


class ConstructionRfiPortal(models.Model):
    _name = "construction.rfi"
    _inherit = ["construction.rfi", "portal.mixin"]

    def _compute_access_url(self):
        super()._compute_access_url()
        for rfi in self:
            rfi.access_url = f"/my/rfi/{rfi.id}"


class ConstructionDefectPortal(models.Model):
    _name = "construction.defect"
    _inherit = ["construction.defect", "portal.mixin"]

    def _compute_access_url(self):
        super()._compute_access_url()
        for defect in self:
            defect.access_url = f"/my/defect/{defect.id}"


class ConstructionSubcontractPortal(models.Model):
    _name = "construction.subcontract"
    _inherit = ["construction.subcontract", "portal.mixin"]

    def _compute_access_url(self):
        super()._compute_access_url()
        for sub in self:
            sub.access_url = f"/my/subcontract/{sub.id}"
