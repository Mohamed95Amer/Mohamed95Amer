from datetime import timedelta

from odoo import api, fields, models

# How far ahead of a permit's expiry the holder is warned. Long enough to
# arrange an extension, short enough that the warning still means "today".
PERMIT_WARNING_HOURS = 4


class RfiWhatsapp(models.Model):
    """Tell the party holding the job up, on the channel they read.

    Ball-in-court already posts to the chatter and subscribes the partner. That
    reaches anyone who logs into Odoo, which on a construction job is the
    office. The consultant sitting on an RFI is not in the office.
    """

    _inherit = "construction.rfi"

    def _notify_ball_in_court(self):
        result = super()._notify_ball_in_court()
        for rfi in self.filtered("ball_in_court_id"):
            self.env["whatsapp.message"]._queue(
                "construction_whatsapp.template_rfi_ball_in_court",
                record=rfi, partner=rfi.ball_in_court_id,
            )
        return result


class DefectWhatsapp(models.Model):
    """A defect is only assigned once; that is the moment worth a message."""

    _inherit = "construction.defect"

    def write(self, vals):
        newly_assigned = self.env["construction.defect"]
        if vals.get("responsible_subcontractor_id"):
            newly_assigned = self.filtered(
                lambda d: d.responsible_subcontractor_id.id
                != vals["responsible_subcontractor_id"]
            )
        result = super().write(vals)
        for defect in newly_assigned:
            self.env["whatsapp.message"]._queue(
                "construction_whatsapp.template_defect_assigned",
                record=defect, partner=defect.responsible_subcontractor_id,
            )
        return result


class PermitWhatsapp(models.Model):
    """Warn before the window closes, not after it has.

    Expiring a permit is a control; warning the holder first is the courtesy
    that stops work quietly continuing under an expired authority because
    nobody was watching the clock.
    """

    _inherit = "construction.permit"

    whatsapp_expiry_warned = fields.Boolean(readonly=True, copy=False)

    @api.model
    def _cron_expire_permits(self):
        now = fields.Datetime.now()
        expiring = self.search([
            ("state", "in", ["approved", "active"]),
            ("whatsapp_expiry_warned", "=", False),
            ("valid_to", ">=", now),
            ("valid_to", "<=", now + timedelta(hours=PERMIT_WARNING_HOURS)),
        ])
        for permit in expiring:
            self.env["whatsapp.message"]._queue(
                "construction_whatsapp.template_permit_expiring",
                record=permit, partner=permit.contractor_id,
            )
        expiring.write({"whatsapp_expiry_warned": True})
        return super()._cron_expire_permits()


class MaintenanceRequestWhatsapp(models.Model):
    """An SLA that has degraded is worth a message; one that has not is noise.

    facility_sla already decides what counts as a degradation and posts it to
    the chatter, so this rides on that decision rather than inventing a second
    definition that could disagree with the first.
    """

    _inherit = "maintenance.request"

    def _notify_sla_change(self, previous, current):
        result = super()._notify_sla_change(previous, current)
        if "breached" not in current and "at_risk" not in current:
            return result
        partner = (self.user_id.partner_id if self.user_id
                   else self.maintenance_team_id.member_ids[:1].partner_id)
        if partner:
            self.env["whatsapp.message"]._queue(
                "construction_whatsapp.template_sla_alert",
                record=self, partner=partner,
            )
        return result


class MeetingActionWhatsapp(models.Model):
    """Chase the item nobody is doing.

    An action carried through several meetings and now past its date is the
    definition of stuck. It has already been raised in a room full of people
    without moving, so raising it in the room again is not the intervention.
    """

    _inherit = "construction.meeting.action"

    whatsapp_chased = fields.Boolean(readonly=True, copy=False)

    @api.model
    def _cron_chase_stuck_actions(self, min_carried=2):
        stuck = self.search([
            ("state", "!=", "closed"),
            ("is_overdue", "=", True),
            ("carried_count", ">=", min_carried),
            ("whatsapp_chased", "=", False),
        ])
        for action in stuck:
            partner = (action.owner_id.partner_id if action.owner_id
                       else action.owner_partner_id)
            if not partner:
                continue
            self.env["whatsapp.message"]._queue(
                "construction_whatsapp.template_action_stuck",
                record=action, partner=partner,
            )
        stuck.write({"whatsapp_chased": True})
        return len(stuck)


class ApprovalStepWhatsapp(models.Model):
    """Tell an approver, on the channel they read.

    An approval sitting in an inbox nobody opens is the single commonest way a
    variation takes two weeks. The message carries the value, because "please
    approve VO-0007" without a number is something people read later.

    Only the people who can act now are told: an approver at step two hearing
    about it before step one has signed learns nothing and stops reading.
    """

    _inherit = "construction.approval.step"

    @api.model_create_multi
    def create(self, vals_list):
        steps = super().create(vals_list)
        steps._notify_ready_approvers()
        return steps

    def _notify_ready_approvers(self):
        for step in self:
            if step.state != "pending":
                continue
            for user in step._approvers():
                if not step._can_be_signed_by(user):
                    continue
                self.env["whatsapp.message"]._queue(
                    "construction_whatsapp.template_approval_waiting",
                    record=step, partner=user.partner_id,
                )
        return True

    def _decide(self, decision, reason):
        result = super()._decide(decision, reason)
        # Whoever is next can act now, and did not know a moment ago.
        if decision == "approved":
            self.request_id.step_ids.filtered(
                lambda s: s.state == "pending")._notify_ready_approvers()
        return result
