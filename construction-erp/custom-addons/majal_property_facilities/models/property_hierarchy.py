from odoo import api, fields, models

from .facility_mirror import SYNC_CONTEXT


class MajalDevelopment(models.Model):
    _name = "majal.development"
    _inherit = ["majal.development", "majal.facility.mirror"]

    # majal_administration builds every facilities record rule out of exact
    # paths on facility.location — manager_user_id and member_user_ids, with
    # no hierarchy traversal. A mirrored room with both empty is invisible to
    # every technician below manager rank, so the FM team is named here and
    # stamped down the whole published subtree.
    facility_manager_user_id = fields.Many2one(
        "res.users", string="Facilities Manager",
        domain="[('share', '=', False)]",
        help="Given access to every location published from this development.")
    facility_member_user_ids = fields.Many2many(
        "res.users", "majal_development_facility_member_rel",
        "development_id", "user_id", string="Facilities Team",
        domain="[('share', '=', False)]")
    facility_auto_publish = fields.Boolean(
        string="Publish to Facilities automatically",
        help="Mirror buildings, floors and units into Facilities as they are "
             "created, instead of waiting for handover.")
    facility_location_count = fields.Integer(compute="_compute_facility_location_count")

    def _facility_location_type(self):
        return "site"

    def _facility_parent_record(self):
        return self.browse()

    def _facility_development(self):
        return self

    def _compute_facility_location_count(self):
        for development in self:
            development.facility_location_count = (
                self.env["facility.location"].sudo().search_count(
                    [("majal_development_id", "=", development.id)])
            )

    def _mirrored_locations(self):
        """Only locations this bridge created.

        The filter is the whole safety of the stamping below: an FM team
        nesting their own plant room under a published site must never have
        its access rewritten by a property record.
        """
        self.ensure_one()
        return self.env["facility.location"].sudo().search(
            [("majal_development_id", "=", self.id)])

    def _stamp_facility_team(self):
        """Give the published locations an FM team, or nobody can see them.

        Known overlap: where majal_workforce is installed it also owns
        member_user_ids on facility.location, rewriting it from allocations
        across the whole subtree. On such an install an allocation change
        under a published site will overwrite what is stamped here. The
        stamping is still required — without workforce there is nothing else
        populating the field — but naming the FM team through an allocation
        is the more durable answer where both modules are present.
        """
        # The assignment fields belong to majal_administration, not to
        # facility_asset. A customer running Property and Facilities without
        # the governance app has no per-location rules to satisfy, and
        # writing fields that do not exist would break handover for them.
        Location = self.env["facility.location"]
        if not {"manager_user_id", "member_user_ids"} <= set(Location._fields):
            return True

        for development in self:
            locations = development._mirrored_locations()
            if not locations:
                continue
            # Never hand a portal user an FM assignment.
            members = development.facility_member_user_ids.filtered(
                lambda user: not user.share)
            manager = development.facility_manager_user_id
            locations.with_context(**{SYNC_CONTEXT: True}).write({
                "manager_user_id": manager.id if manager and not manager.share else False,
                "member_user_ids": [(6, 0, members.ids)],
            })
        return True

    def write(self, vals):
        result = super().write(vals)
        if {"facility_manager_user_id", "facility_member_user_ids"} & set(vals):
            self._stamp_facility_team()
        return result

    def action_view_facility_locations(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Facilities Locations"),
            "res_model": "facility.location",
            "view_mode": "list,form",
            "domain": [("majal_development_id", "=", self.id)],
        }


class MajalCommunity(models.Model):
    _name = "majal.community"
    _inherit = ["majal.community", "majal.facility.mirror"]

    # "zone" is the one location_type that fits a cluster of buildings inside
    # a site without pretending to be a site of its own.
    def _facility_location_type(self):
        return "zone"

    def _facility_parent_record(self):
        return self.development_id

    def _facility_development(self):
        return self.development_id

    def _facility_parent_fields(self):
        return ("development_id",)


class MajalBuilding(models.Model):
    _name = "majal.building"
    _inherit = ["majal.building", "majal.facility.mirror"]

    def _facility_location_type(self):
        return "building"

    def _facility_parent_record(self):
        return self.community_id or self.development_id

    def _facility_development(self):
        return self.development_id

    def _facility_parent_fields(self):
        return ("development_id", "community_id")

    @api.model_create_multi
    def create(self, vals_list):
        buildings = super().create(vals_list)
        buildings._facility_auto_publish_if_enabled()
        return buildings

    def _facility_auto_publish_if_enabled(self):
        for record in self:
            development = record._facility_development()
            if development and development.facility_auto_publish:
                record._ensure_facility_location()
                development._stamp_facility_team()
        return True


class MajalFloor(models.Model):
    _name = "majal.floor"
    _inherit = ["majal.floor", "majal.facility.mirror"]

    def _facility_location_type(self):
        return "floor"

    def _facility_parent_record(self):
        return self.building_id

    def _facility_development(self):
        return self.building_id.development_id

    def _facility_parent_fields(self):
        return ("building_id",)

    def _facility_location_code(self):
        return str(self.number) if self.number else False

    @api.model_create_multi
    def create(self, vals_list):
        floors = super().create(vals_list)
        floors._facility_auto_publish_if_enabled()
        return floors

    def _facility_auto_publish_if_enabled(self):
        for record in self:
            development = record._facility_development()
            if development and development.facility_auto_publish:
                record._ensure_facility_location()
                development._stamp_facility_team()
        return True


class MajalUnit(models.Model):
    _name = "majal.unit"
    _inherit = ["majal.unit", "majal.facility.mirror"]

    def _facility_location_type(self):
        return "room"

    def _facility_parent_record(self):
        return self.floor_id

    def _facility_development(self):
        return self.development_id

    def _facility_parent_fields(self):
        return ("floor_id",)

    def _facility_location_code(self):
        return self.name

    def _facility_after_publish(self, location):
        # The back-link is what lets an asset in this room know which unit it
        # belongs to, and therefore who owns and occupies it.
        location.with_context(**{SYNC_CONTEXT: True}).write({
            "majal_unit_id": self.id,
            "majal_building_id": self.building_id.id,
        })

    @api.model_create_multi
    def create(self, vals_list):
        units = super().create(vals_list)
        for unit in units:
            development = unit._facility_development()
            if development and development.facility_auto_publish:
                unit._ensure_facility_location()
                development._stamp_facility_team()
        return units


class MajalHandover(models.Model):
    _inherit = "majal.handover"

    def action_complete(self):
        """Handover is the moment a unit becomes somebody's to maintain, so
        it is the moment it belongs in the Facilities tree."""
        result = super().action_complete()
        for handover in self:
            handover.unit_id._ensure_facility_location()
            development = handover.unit_id.development_id
            if development:
                development._stamp_facility_team()
        return result
