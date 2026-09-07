"""The commercial position, in the terms a board asks about it.

A dashboard of counts answers "how busy are we". This answers "what are we
exposed to": how much of the contract has been given away in variations, how
much cash is being held as retention, how much has been certified and not yet
invoiced, and what is sitting above somebody's signature threshold right now.

Every figure is a sum over records that already exist. Nothing here is a new
number; the point is that no screen put them next to each other, so the answer
took a morning and a spreadsheet.
"""

from odoo import api, fields, models


class ConstructionExposure(models.AbstractModel):
    _name = "construction.exposure"
    _description = "Commercial Exposure"

    @api.model
    def _projects(self):
        return self.env["project.project"].search([
            ("is_construction", "=", True),
            ("construction_stage", "not in", ("closed",)),
        ])

    @api.model
    def exposure(self):
        """One payload: portfolio totals, then the same per project."""
        projects = self._projects()
        rows = [self._project_row(project) for project in projects]
        rows.sort(key=lambda row: row["variation_percent"], reverse=True)
        return {
            "currency": self.env.company.currency_id.symbol,
            "totals": self._totals(rows),
            "projects": rows,
            "awaiting": self._awaiting_signature(),
        }

    @api.model
    def _project_row(self, project):
        claims = self.env["construction.progress.claim"].search([
            ("project_id", "=", project.id),
            ("state", "in", ("certified", "invoiced")),
        ], order="sequence_no desc")
        latest = claims[:1]

        variations = self.env["construction.change.order"].search([
            ("project_id", "=", project.id), ("state", "=", "approved"),
        ])
        approved_variations = sum(variations.mapped("amount_sell_total"))
        # Variations still waiting on somebody. A board wants the exposure it
        # has already taken *and* the exposure about to arrive.
        pending = self.env["construction.change.order"].search([
            ("project_id", "=", project.id), ("state", "=", "submitted"),
        ])

        # The current contract value, not the figure typed in once at kickoff.
        # project.contract_value is a plain field nothing keeps in sync — not
        # the BOQ, not an approved variation, nothing — so on any project with
        # approved variations it quietly goes stale while this screen keeps
        # showing it next to the Executive Dashboard, which already reads the
        # BOQ-derived value below. Two board screens naming the same figure
        # from two sources is exactly the class of bug that made the
        # portfolio forecast-margin total disagree with its own rows; this is
        # the same mistake at the most basic number either screen shows.
        contract = project.cvr_contract_value or 0.0
        # Variations as a share of what was originally agreed, not of the
        # already-varied total — the current contract value already has
        # approved_variations baked into it (variations append to the BOQ),
        # so dividing by it would understate every job with a history of
        # change. Subtracting them back out recovers the baseline.
        baseline = contract - approved_variations
        certified = latest.amount_work_done_cumulative if latest else 0.0
        retention = latest.retention_cumulative if latest else 0.0
        uninvoiced = sum(
            claims.filtered(lambda c: c.state == "certified")
            .mapped("amount_due"))

        return {
            "id": project.id,
            "name": project.display_name,
            "stage": project.construction_stage,
            "contract": contract,
            "variations": approved_variations,
            "variations_pending": sum(pending.mapped("amount_sell_total")),
            "variation_percent": (
                approved_variations / baseline * 100 if baseline else 0.0),
            "certified": certified,
            "certified_percent": certified / contract * 100 if contract else 0.0,
            "retention": retention,
            "uninvoiced": uninvoiced,
        }

    @api.model
    def _totals(self, rows):
        def total(key):
            return sum(row[key] for row in rows)

        contract = total("contract")
        variations = total("variations")
        certified = total("certified")
        baseline = contract - variations
        return {
            "projects": len(rows),
            "contract": contract,
            "variations": variations,
            "variations_pending": total("variations_pending"),
            "variation_percent": (
                variations / baseline * 100 if baseline else 0.0),
            "certified": certified,
            "certified_percent": certified / contract * 100 if contract else 0.0,
            "retention": total("retention"),
            "uninvoiced": total("uninvoiced"),
        }

    @api.model
    def _awaiting_signature(self):
        """What is sitting above a threshold, and for how long.

        The one thing on this screen a chief executive can act on this
        afternoon: everything else is a consequence of decisions already taken.
        """
        steps = self.env["construction.approval.step"].search([
            ("state", "=", "pending"),
            ("request_id.state", "=", "pending"),
        ], order="amount desc", limit=25)
        return [
            {
                "id": step.id,
                "document": step.record_reference,
                "model": step.res_model,
                "project": step.project_id.display_name,
                "step": step.name,
                "amount": step.amount,
                "days": step.waiting_days,
            }
            for step in steps
        ]

    @api.model
    def action_exposure(self):
        return {
            "type": "ir.actions.client",
            "tag": "construction_report.exposure",
            "name": self.env._("Commercial Exposure"),
        }
