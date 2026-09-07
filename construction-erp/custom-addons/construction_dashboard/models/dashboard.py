from odoo import api, fields, models


class ConstructionDashboard(models.AbstractModel):
    """Server side of the executive dashboard.

    Everything the dashboard shows already exists on other models — the CVR,
    the CPM schedule, defects, RFIs, safety statistics, the material position.
    This gathers them per project in one call rather than letting the client
    fire a request per metric per project, which is what turns a portfolio view
    into a slow one as jobs are added.
    """

    _name = "construction.dashboard"
    _description = "Construction Dashboard Data"

    # Metrics are declared once so the client can lay out comparisons without
    # hard-coding which direction is good: a higher margin is healthy, a higher
    # waste rate is not, and the colouring has to follow the meaning.
    METRIC_DEFS = [
        {"key": "percent_complete", "label": "Certified", "group": "commercial",
         "unit": "percent", "better": "high"},
        {"key": "forecast_margin_percent", "label": "Forecast margin", "group": "commercial",
         "unit": "percent", "better": "high"},
        {"key": "margin_variance", "label": "Margin movement", "group": "commercial",
         "unit": "currency", "better": "high"},
        {"key": "programme_slip", "label": "Worst slip", "group": "programme",
         "unit": "days", "better": "low"},
        {"key": "critical_activities", "label": "Critical activities", "group": "programme",
         "unit": "count", "better": "low"},
        {"key": "open_defects", "label": "Open defects", "group": "quality",
         "unit": "count", "better": "low"},
        {"key": "overdue_rfis", "label": "Overdue RFIs", "group": "quality",
         "unit": "count", "better": "low"},
        {"key": "ltifr", "label": "LTIFR", "group": "safety",
         "unit": "rate", "better": "low"},
        {"key": "open_safety_actions", "label": "Open safety actions", "group": "safety",
         "unit": "count", "better": "low"},
        {"key": "waste_percent", "label": "Material waste", "group": "materials",
         "unit": "percent", "better": "low"},
    ]

    @api.model
    def get_metric_defs(self):
        return [dict(d, label=self.env._(d["label"])) for d in self.METRIC_DEFS]

    @api.model
    def get_dashboard_data(self, project_ids=None):
        """Return one record per construction project plus portfolio totals."""
        domain = [("is_construction", "=", True)]
        if project_ids:
            domain.append(("id", "in", project_ids))
        projects = self.env["project.project"].search(domain, order="name")

        # Counts are grouped across the whole portfolio in one query each
        # rather than asked per project. The loop version issued eight counts
        # per project, so a company with a hundred jobs paid eight hundred
        # round trips to draw one screen.
        counts = self._portfolio_counts(projects)
        rows = [self._project_row(project, counts) for project in projects]
        return {
            "projects": rows,
            "portfolio": self._portfolio(rows),
            "metrics": self.get_metric_defs(),
            "currency": self.env.company.currency_id.symbol or "",
        }

    def _grouped_count(self, model, domain, projects):
        """One count per project, in a single query."""
        groups = self.env[model]._read_group(
            [("project_id", "in", projects.ids)] + domain,
            ["project_id"], ["__count"],
        )
        return {project.id: count for project, count in groups}

    def _portfolio_counts(self, projects):
        return {
            "defects_open": self._grouped_count(
                "construction.defect",
                [("state", "in", ["open", "reopened", "in_progress"])], projects),
            "defects_high": self._grouped_count(
                "construction.defect",
                [("state", "!=", "closed"),
                 ("severity", "in", ["high", "critical"])], projects),
            "rfis_open": self._grouped_count(
                "construction.rfi", [("state", "!=", "closed")], projects),
            "rfis_overdue": self._grouped_count(
                "construction.rfi", [("is_overdue", "=", True)], projects),
            # Tasks are read in one sweep and bucketed in Python: the slip
            # figures need the records themselves, not just a count.
            "tasks": self._portfolio_tasks(projects),
        }

    def _portfolio_tasks(self, projects):
        tasks = self.env["project.task"].search(
            [("project_id", "in", projects.ids)])
        buckets = {project.id: self.env["project.task"] for project in projects}
        for task in tasks:
            if task.project_id.id in buckets:
                buckets[task.project_id.id] |= task
        return buckets

    def _project_row(self, project, counts=None):
        if counts is None:
            counts = self._portfolio_counts(project)

        defects_open = counts["defects_open"].get(project.id, 0)
        defects_high = counts["defects_high"].get(project.id, 0)
        rfis_open = counts["rfis_open"].get(project.id, 0)
        rfis_overdue = counts["rfis_overdue"].get(project.id, 0)

        tasks = counts["tasks"].get(project.id, self.env["project.task"])
        scheduled = tasks.filtered(lambda t: t.planned_start and t.planned_finish)
        slips = [t.finish_variance_days for t in scheduled if t.finish_variance_days > 0]

        return {
            "id": project.id,
            "name": project.name,
            "stage": dict(
                project._fields["construction_stage"].selection
            ).get(project.construction_stage, ""),
            # Commercial (CVR)
            "contract_value": project.cvr_contract_value,
            "certified_value": project.cvr_certified_value,
            "percent_complete": project.cvr_percent_complete,
            "budget_cost": project.cvr_budget_cost,
            "committed_cost": project.cvr_committed_cost,
            "forecast_margin": project.cvr_forecast_margin,
            "forecast_margin_percent": project.cvr_forecast_margin_percent,
            "margin_variance": project.cvr_margin_variance,
            # Programme
            "activities": len(scheduled),
            "critical_activities": len(scheduled.filtered("is_critical")),
            "slipping_activities": len(slips),
            "programme_slip": max(slips) if slips else 0,
            # Quality
            "open_defects": defects_open,
            "high_defects": defects_high,
            "open_rfis": rfis_open,
            "overdue_rfis": rfis_overdue,
            # Safety
            "ltifr": project.hse_ltifr,
            "lti_count": project.hse_lti_count,
            "manhours": project.hse_manhours,
            "days_since_lti": project.hse_days_since_lti,
            "open_safety_actions": project.hse_open_action_count,
            "live_permits": project.hse_live_permit_count,
            # Materials
            "material_budget": project.material_budget_value,
            "material_consumed": project.material_consumed_value,
            "material_waste": project.material_waste_value,
            "waste_percent": project.material_waste_percent,
            "materials_over_budget": project.material_over_budget_count,
        }

    def _portfolio(self, rows):
        """Portfolio totals. Rates are re-derived from their own components
        rather than averaged: the mean of two projects' waste rates is not the
        portfolio's waste rate unless both consumed the same amount."""
        total = lambda key: sum(r[key] for r in rows)  # noqa: E731
        contract = total("contract_value")
        certified = total("certified_value")
        material_consumed = total("material_consumed")
        material_waste = total("material_waste")
        manhours = total("manhours")
        ltis = total("lti_count")
        # Summed from each row's own cvr_forecast_margin rather than re-derived
        # from summed inputs. CVR's real formula nets committed cost against
        # only the budget it actually covers (project_cvr.py); the naive
        # contract - max(budget, committed) used here previously was always
        # the cruder fallback, so the portfolio total silently diverged from
        # the sum of the rows above it whenever any subcontract line mapped to
        # a BOQ line — the normal, well-configured case.
        forecast_margin = total("forecast_margin")

        return {
            "projects": len(rows),
            "contract_value": contract,
            "certified_value": certified,
            "percent_complete": (certified / contract * 100) if contract else 0.0,
            "forecast_margin": forecast_margin,
            "forecast_margin_percent": (
                forecast_margin / contract * 100) if contract else 0.0,
            "at_risk": len([r for r in rows if r["margin_variance"] < 0]),
            "open_defects": total("open_defects"),
            "overdue_rfis": total("overdue_rfis"),
            "slipping": len([r for r in rows if r["programme_slip"] > 0]),
            "worst_slip": max([r["programme_slip"] for r in rows], default=0),
            "ltifr": (ltis * 1_000_000 / manhours) if manhours else 0.0,
            "lti_count": ltis,
            "manhours": manhours,
            "open_safety_actions": total("open_safety_actions"),
            "material_waste": material_waste,
            "waste_percent": (
                material_waste / (material_consumed + material_waste) * 100
            ) if (material_consumed + material_waste) else 0.0,
        }
