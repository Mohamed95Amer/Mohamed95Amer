from odoo import api, fields, models

# Writes made by the mirror itself carry this key so the sync hooks know not
# to chase their own tail.
SYNC_CONTEXT = "majal_fm_sync"


class MajalFacilityMirror(models.AbstractModel):
    """Publishes one property record into the Facilities location tree.

    Publishing is deliberate rather than automatic. A unit is a Facilities
    object when somebody has to maintain it, which is at handover — not at
    data entry. Mirroring 900 off-plan units on create would fill every
    location picker, floor-plan target and PM route with rooms that do not
    exist yet.

    Once a record is published the link is live: renames and reparents
    follow, one way, property to Facilities. Nothing flows back.
    """

    _name = "majal.facility.mirror"
    _description = "Facilities Location Mirror"

    facility_location_id = fields.Many2one(
        "facility.location", string="Facilities Location",
        readonly=True, copy=False, ondelete="set null", index=True,
        help="Set once this record has been published to Facilities.")
    facility_published = fields.Boolean(
        compute="_compute_facility_published", store=True)

    @api.depends("facility_location_id")
    def _compute_facility_published(self):
        for record in self:
            record.facility_published = bool(record.facility_location_id)

    # --- to be supplied by each property model -----------------------------

    def _facility_location_type(self):
        """site | zone | building | floor | room."""
        raise NotImplementedError

    def _facility_parent_record(self):
        """The property record one level up, or an empty recordset."""
        raise NotImplementedError

    def _facility_location_code(self):
        return self.code if "code" in self._fields else False

    def _facility_development(self):
        """The development this record belongs to, for team stamping."""
        raise NotImplementedError

    # --- publishing --------------------------------------------------------

    def _facility_location_vals(self, parent_location):
        self.ensure_one()
        development = self._facility_development()
        return {
            "name": self.name,
            "code": self._facility_location_code() or False,
            "location_type": self._facility_location_type(),
            "parent_id": parent_location.id if parent_location else False,
            # facility.location defaults company to env.company and does not
            # follow its parent, but every FM record rule leads with a company
            # leaf — so it is set from the property record, explicitly.
            "company_id": self.company_id.id,
            "majal_development_id": development.id if development else False,
        }

    def _ensure_facility_location(self):
        """Publish this record, and its ancestors first, idempotently."""
        locations = self.env["facility.location"]
        for record in self:
            if record.facility_location_id:
                locations |= record.facility_location_id
                continue
            parent_record = record._facility_parent_record()
            parent_location = (
                parent_record._ensure_facility_location()
                if parent_record else self.env["facility.location"]
            )
            location = self.env["facility.location"].sudo().with_context(
                **{SYNC_CONTEXT: True}
            ).create(record._facility_location_vals(parent_location))
            record.sudo().with_context(**{SYNC_CONTEXT: True}).write(
                {"facility_location_id": location.id})
            record._facility_after_publish(location)
            locations |= location
        return locations

    def _facility_after_publish(self, location):
        """Hook for models that need to stamp more onto their mirror."""

    def action_publish_to_facilities(self):
        for record in self:
            record._ensure_facility_location()
            development = record._facility_development()
            if development:
                development._stamp_facility_team()
        return True

    # --- keeping the mirror honest -----------------------------------------

    def _facility_sync_fields(self):
        """Property fields whose change is worth pushing to the mirror."""
        return ("name", "code")

    def _facility_parent_fields(self):
        """Fields that decide where this record sits in the hierarchy.

        Watched separately from the display fields: moving a unit to another
        floor changes nothing about the unit's own name, so without these the
        mirror silently stays under the old floor and the location tree stops
        describing the building.
        """
        return ()

    def write(self, vals):
        result = super().write(vals)
        if self.env.context.get(SYNC_CONTEXT):
            return result
        watched = (
            set(self._facility_sync_fields())
            | set(self._facility_parent_fields())
            | {"active"}
        )
        if not watched & set(vals):
            return result
        for record in self.filtered("facility_location_id"):
            location = record.facility_location_id.sudo().with_context(
                **{SYNC_CONTEXT: True})
            updates = {}
            if "name" in vals:
                updates["name"] = record.name
            if "code" in vals:
                updates["code"] = record._facility_location_code() or False
            # A reparent on the property side has to move the mirror, or the
            # location tree quietly disagrees with the building it describes.
            parent_record = record._facility_parent_record()
            if parent_record and parent_record.facility_location_id:
                if location.parent_id != parent_record.facility_location_id:
                    updates["parent_id"] = parent_record.facility_location_id.id
            if updates:
                location.write(updates)
        return result

    def unlink(self):
        """Never delete the mirror.

        facility.location cascades on parent_id, so deleting a mirrored
        building would take every floor and room under it and orphan the
        assets and maintenance history hanging off them. The asset register
        is the system of record for that history and has to outlive the
        sales system's housekeeping.
        """
        for record in self.filtered("facility_location_id"):
            location = record.facility_location_id.sudo()
            has_history = bool(
                self.env["maintenance.equipment"].sudo().search_count(
                    [("facility_location_id", "child_of", location.id)])
                or self.env["maintenance.request"].sudo().search_count(
                    [("facility_location_id", "child_of", location.id)])
            )
            note = self.env._(
                "%s was removed from the property register.", record.display_name)
            if has_history:
                location.message_post(body=note)
            else:
                location.with_context(**{SYNC_CONTEXT: True}).write({"active": False})
                location.message_post(body=note)
        return super().unlink()
