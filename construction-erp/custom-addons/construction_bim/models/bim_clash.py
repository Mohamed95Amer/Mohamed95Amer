"""Clash tests between two sets of model elements.

The geometry lives in the browser, so the test runs there and the results are
recorded here. That is the same division as the rest of the module: the server
keeps the index and the record, the browser keeps the mesh.

What this detects is **axis-aligned bounding-box overlap** between elements of
two models, beyond a tolerance. That is a real clash test and it is how every
broad phase starts, but it is not triangle-precise: a duct passing cleanly
through a door opening has overlapping boxes and will be reported. The status
workflow exists precisely because some of what a clash test finds is not a
problem, and somebody has to say so once rather than every week.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError

# Navisworks' vocabulary, because the people reviewing these have used it for
# twenty years and "approved" already means "seen, and not a problem".
STATUSES = [
    ("new", "New"),
    ("active", "Active"),
    ("reviewed", "Reviewed"),
    ("approved", "Approved"),
    ("resolved", "Resolved"),
]
# Statuses a person set deliberately. A re-run must not undo them.
DECIDED = ("reviewed", "approved")

# A run that finds fifty thousand clashes has found nothing anybody can act on.
# The cap is on what is stored, and the count of what was skipped is kept.
MAX_RESULTS = 2000


class ConstructionBimClashTest(models.Model):
    """One named test between two models, re-runnable."""

    _name = "construction.bim.clash.test"
    _description = "BIM Clash Test"
    _inherit = ["mail.thread"]
    _order = "id desc"

    name = fields.Char(required=True, tracking=True)
    project_id = fields.Many2one(
        "project.project", required=True, index=True,
        domain=[("is_construction", "=", True)])
    model_a_id = fields.Many2one(
        "construction.bim.model", string="Model A", required=True,
        ondelete="cascade", domain="[('project_id', '=', project_id)]")
    model_b_id = fields.Many2one(
        "construction.bim.model", string="Model B", required=True,
        ondelete="cascade", domain="[('project_id', '=', project_id)]")
    tolerance = fields.Float(
        default=0.01, digits=(16, 4), required=True,
        help="Overlap below this is ignored, in the model's own units. A "
             "tolerance of zero reports every touching surface — two walls "
             "meeting at a corner are not a clash.")

    clash_ids = fields.One2many("construction.bim.clash", "test_id")
    clash_count = fields.Integer(compute="_compute_counts", store=True)
    open_count = fields.Integer(compute="_compute_counts", store=True)
    resolved_count = fields.Integer(compute="_compute_counts", store=True)
    last_run = fields.Datetime(readonly=True, tracking=True)
    last_run_skipped = fields.Integer(
        readonly=True,
        help="Results found but not stored, because the run hit the cap.")
    state = fields.Selection(
        [("draft", "Never run"), ("run", "Run")],
        compute="_compute_state", store=True)

    @api.depends("last_run")
    def _compute_state(self):
        for test in self:
            test.state = "run" if test.last_run else "draft"

    @api.depends("clash_ids.status")
    def _compute_counts(self):
        for test in self:
            clashes = test.clash_ids
            test.clash_count = len(clashes)
            test.resolved_count = len(
                clashes.filtered(lambda c: c.status == "resolved"))
            test.open_count = len(
                clashes.filtered(lambda c: c.status in ("new", "active")))

    @api.constrains("model_a_id", "model_b_id")
    def _check_two_models(self):
        for test in self:
            if test.model_a_id == test.model_b_id:
                raise UserError(self.env._(
                    "A clash test compares two models. Testing a model against "
                    "itself reports every element that touches its neighbour."))

    def action_open_viewer(self):
        """Run the test where the geometry is."""
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "tag": "construction_bim.viewer",
            "name": self.display_name,
            "params": {"model_id": self.model_a_id.id, "clash_test_id": self.id},
        }

    def action_view_clashes(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Clashes"),
            "res_model": "construction.bim.clash",
            "view_mode": "list,form",
            "domain": [("test_id", "=", self.id)],
            "context": {"default_test_id": self.id},
        }

    # ------------------------------------------------------------------
    # Called from the viewer
    # ------------------------------------------------------------------
    @api.model
    def test_payload(self, test_id):
        """What the browser needs to run the test."""
        test = self.browse(test_id).exists()
        if not test:
            return {}
        return {
            "id": test.id,
            "name": test.display_name,
            "tolerance": test.tolerance,
            "model_a": {
                "id": test.model_a_id.id,
                "name": test.model_a_id.display_name,
                "file_url": test.model_a_id._file_url(),
            },
            "model_b": {
                "id": test.model_b_id.id,
                "name": test.model_b_id.display_name,
                "file_url": test.model_b_id._file_url(),
            },
        }

    @api.model
    def record_results(self, test_id, results, skipped=0):
        """Store a run's findings.

        The point of a re-run is not to start again. A clash somebody has
        already looked at and approved must not come back as new, and one that
        has been designed out must close itself rather than waiting for a
        person to notice it is gone. So results are matched on the pair of
        GlobalIds: known pairs are updated, unseen pairs are created, and pairs
        that were there last time and are not now are resolved.
        """
        test = self.browse(test_id).exists()
        if not test:
            return {}
        clash_model = self.env["construction.bim.clash"]
        existing = {clash._pair_key(): clash for clash in test.clash_ids}

        seen = set()
        created = 0
        for result in results[:MAX_RESULTS]:
            key = clash_model._key_of(
                result.get("global_id_a"), result.get("global_id_b"))
            if not key:
                continue
            seen.add(key)
            values = test._clash_values(result)
            clash = existing.get(key)
            if clash:
                # Position and size are refreshed; the status a person set is
                # not. Something previously resolved that clashes again is
                # reopened, because it is news.
                if clash.status == "resolved":
                    values["status"] = "active"
                elif clash.status in DECIDED:
                    values.pop("status", None)
                clash.write(values)
            else:
                values.update(test._pair_identity(result))
                clash_model.create(values)
                created += 1

        gone = test.clash_ids.filtered(
            lambda c: c._pair_key() not in seen and c.status != "resolved")
        gone.write({"status": "resolved", "resolved_by_run": True})

        test.write({
            "last_run": fields.Datetime.now(),
            "last_run_skipped": skipped,
        })
        test.message_post(body=self.env._(
            "Clash test run: %(found)s found, %(created)s new, "
            "%(closed)s resolved since the last run.",
            found=len(results), created=created, closed=len(gone),
        ))
        return {
            "found": len(results),
            "created": created,
            "resolved": len(gone),
            "skipped": skipped,
        }

    def _clash_values(self, result):
        self.ensure_one()
        return {
            "status": "new",
            "pos_x": result.get("x") or 0.0,
            "pos_y": result.get("y") or 0.0,
            "pos_z": result.get("z") or 0.0,
            "overlap": result.get("overlap") or 0.0,
            "resolved_by_run": False,
        }

    def _pair_identity(self, result):
        """Everything that identifies the pair, resolved once at creation."""
        self.ensure_one()
        element_model = self.env["construction.bim.element"]
        element_a = element_model.search([
            ("model_id", "=", self.model_a_id.id),
            ("global_id", "=", result.get("global_id_a")),
        ], limit=1)
        element_b = element_model.search([
            ("model_id", "=", self.model_b_id.id),
            ("global_id", "=", result.get("global_id_b")),
        ], limit=1)
        return {
            "test_id": self.id,
            "global_id_a": result.get("global_id_a"),
            "global_id_b": result.get("global_id_b"),
            "element_a_id": element_a.id if element_a else False,
            "element_b_id": element_b.id if element_b else False,
            "name_a": element_a.name or result.get("name_a") or "",
            "name_b": element_b.name or result.get("name_b") or "",
        }


class ConstructionBimClash(models.Model):
    """One pair of elements that overlap."""

    _name = "construction.bim.clash"
    _description = "BIM Clash"
    _inherit = ["mail.thread"]
    # Biggest overlap first: on any real model the list is long, and the deepest
    # intersection is the one most likely to be a genuine collision rather than
    # two things meeting at a face.
    _order = "overlap desc, id"

    test_id = fields.Many2one(
        "construction.bim.clash.test", required=True, ondelete="cascade",
        index=True)
    project_id = fields.Many2one(
        related="test_id.project_id", store=True, index=True)
    name = fields.Char(compute="_compute_name", store=True)

    global_id_a = fields.Char(readonly=True, index=True)
    global_id_b = fields.Char(readonly=True, index=True)
    element_a_id = fields.Many2one(
        "construction.bim.element", ondelete="set null", string="Element A")
    element_b_id = fields.Many2one(
        "construction.bim.element", ondelete="set null", string="Element B")
    name_a = fields.Char(readonly=True, string="A")
    name_b = fields.Char(readonly=True, string="B")

    pos_x = fields.Float(digits=(16, 4), readonly=True)
    pos_y = fields.Float(digits=(16, 4), readonly=True)
    pos_z = fields.Float(digits=(16, 4), readonly=True)
    overlap = fields.Float(
        digits=(16, 4), readonly=True,
        help="Smallest overlap across the three axes, in the model's units. "
             "The depth of the intersection, not its volume.")

    status = fields.Selection(
        STATUSES, default="new", required=True, tracking=True,
        group_expand="_group_expand_status")
    assigned_user_id = fields.Many2one("res.users", string="Assigned To",
                                       tracking=True)
    note = fields.Text()
    resolved_by_run = fields.Boolean(
        readonly=True,
        help="Closed automatically because the last run no longer found it.")

    rfi_id = fields.Many2one("construction.rfi", ondelete="set null")
    pin_id = fields.Many2one("construction.bim.pin", ondelete="set null")

    @api.model
    def _group_expand_status(self, statuses, domain):
        return [status for status, _label in STATUSES]

    @api.depends("name_a", "name_b")
    def _compute_name(self):
        for clash in self:
            clash.name = f"{clash.name_a or '?'} × {clash.name_b or '?'}"

    @api.model
    def _key_of(self, global_id_a, global_id_b):
        """A pair's identity, order-independent.

        Which model was A and which was B is an accident of how the test was
        set up; the clash is the same clash either way.
        """
        if not global_id_a or not global_id_b:
            return None
        return tuple(sorted((global_id_a, global_id_b)))

    def _pair_key(self):
        self.ensure_one()
        return self._key_of(self.global_id_a, self.global_id_b)

    def action_activate(self):
        self.filtered(lambda c: c.status == "new").write({"status": "active"})

    def action_review(self):
        self.write({"status": "reviewed"})

    def action_approve(self):
        """Seen, and not a problem. Survives every future run."""
        self.write({"status": "approved"})

    def action_reopen(self):
        self.write({"status": "active", "resolved_by_run": False})

    def action_raise_rfi(self):
        """Turn the clash into the question somebody has to answer."""
        self.ensure_one()
        if self.rfi_id:
            return self._open_rfi()
        rfi = self.env["construction.rfi"].create({
            "name": self.env._("Clash: %s", self.name),
            "project_id": self.project_id.id,
            "question": self.env._(
                "%(a)s clashes with %(b)s by %(overlap).3f at "
                "(%(x).2f, %(y).2f, %(z).2f). Please confirm which moves.",
                a=self.name_a or self.global_id_a,
                b=self.name_b or self.global_id_b,
                overlap=self.overlap, x=self.pos_x, y=self.pos_y, z=self.pos_z,
            ),
        })
        pin = self.env["construction.bim.pin"].create({
            "model_id": self.test_id.model_a_id.id,
            "name": self.env._("Clash: %s", self.name),
            "note": self.env._("Raised from clash test %s.",
                               self.test_id.display_name),
            "pin_type": "rfi",
            "rfi_id": rfi.id,
            "global_id": self.global_id_a,
            "element_id": self.element_a_id.id,
            "storey": self.element_a_id.storey,
            "pos_x": self.pos_x, "pos_y": self.pos_y, "pos_z": self.pos_z,
        })
        self.write({"rfi_id": rfi.id, "pin_id": pin.id, "status": "active"})
        return self._open_rfi()

    def _open_rfi(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.rfi_id.display_name,
            "res_model": "construction.rfi",
            "res_id": self.rfi_id.id,
            "views": [[False, "form"]],
            "target": "current",
        }
