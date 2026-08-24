import base64

from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalDemoEnvironment(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.contracting = cls.env["res.company"].search(
            [("name", "=", "Majal Demo Contracting LLC")], limit=1
        )
        cls.facilities = cls.env["res.company"].search(
            [("name", "=", "Majal Demo Facilities LLC")], limit=1
        )
        cls.property_company = cls.env["res.company"].search(
            [("name", "=", "Majal Demo Properties LLC")], limit=1
        )

    def test_enterprise_records_feed_the_real_workspaces(self):
        self.assertTrue(self.contracting)
        self.assertGreaterEqual(
            self.env["project.project"].sudo().search_count(
                [("company_id", "=", self.contracting.id), ("is_construction", "=", True)]
            ),
            8,
        )
        bim = self.env["construction.bim.model"].sudo().search(
            [("name", "=", "Tower A - Federated Coordination Model")], limit=1
        )
        self.assertGreater(bim.element_count, 100)
        self.assertGreaterEqual(len(bim.pin_ids), 3)

    def test_property_portfolio_is_large_and_operational(self):
        self.assertTrue(self.property_company)
        domain = [("company_id", "=", self.property_company.id)]
        self.assertEqual(self.env["majal.development"].sudo().search_count(domain), 3)
        self.assertEqual(self.env["majal.unit"].sudo().search_count(domain), 48)
        self.assertEqual(self.env["majal.lead"].sudo().search_count(domain), 12)
        self.assertGreaterEqual(self.env["majal.lease"].sudo().search_count(domain), 1)

    def test_real_plan_files_and_comparison_revisions_exist(self):
        drawing = self.env["construction.drawing"].sudo().search(
            [("number", "=", "A-101"), ("project_id.company_id", "=", self.contracting.id)],
            limit=1,
        )
        self.assertEqual(set(drawing.revision_ids.mapped("revision")), {"A", "C"})
        for revision in drawing.revision_ids:
            self.assertTrue(base64.b64decode(revision.attachment_id.datas).startswith(b"%PDF"))
        floorplan = self.env["facility.floorplan"].sudo().search(
            [("name", "=", "Tower One — Level 3 Operations Plan")], limit=1
        )
        self.assertTrue(base64.b64decode(floorplan.sheet_file).startswith(b"%PDF"))
        self.assertGreaterEqual(len(floorplan.pin_ids), 2)

    def test_documents_mapping_signing_and_spreadsheets_are_demonstrable(self):
        mapped = self.env["majal.document.template"].sudo().search(
            [("code", "=", "DEMO-HOT-WORKS-MAP")], limit=1
        )
        self.assertTrue(mapped.source_file)
        self.assertTrue(mapped.mapped_form_template_id)
        self.assertEqual(len(mapped.mapped_form_template_id.question_ids), 3)
        self.assertTrue(
            self.env["majal.sign.request"].sudo().search(
                [("state", "=", "pending"), ("document_id.company_id", "=", self.contracting.id)],
                limit=1,
            )
        )
        self.assertEqual(
            self.env["spreadsheet.spreadsheet"].sudo().search_count(
                [("name", "in", [
                    "Construction Cost Control",
                    "Facilities PPM Planner",
                    "Property Collections Tracker",
                ])]
            ),
            3,
        )

    def test_personas_have_isolated_scopes_and_intelligence_home(self):
        intelligence = self.env.ref("majal_ai.action_ai_workspace")
        expected = {
            "demo.pm@majal.local": "construction",
            "demo.tech@majal.local": "facilities",
            "demo.property.agent@majal.local": "real_estate",
            "demo.property.ops@majal.local": "property_facilities",
        }
        for login, scope in expected.items():
            user = self.env["res.users"].sudo().search([("login", "=", login)], limit=1)
            self.assertEqual(user.majal_industry_scope, scope)
            # Compare ids. res.users.action_id is a Many2one to
            # ir.actions.actions, so it reads back as ir.actions.actions(id,)
            # while env.ref gives ir.actions.client(id,), and Odoo's
            # BaseModel.__eq__ compares _name as well as ids. The same
            # comparison in majal_ai's test was fixed in cf5b512; this is the
            # second copy of it.
            self.assertEqual(user.action_id.id, intelligence.id)
        self.assertEqual(
            self.env["project.project"].with_user(
                self.env["res.users"].sudo().search(
                    [("login", "=", "demo.property.agent@majal.local")], limit=1
                )
            ).search_count([( "is_construction", "=", True)]),
            0,
        )

    def test_approval_cycles_and_private_demo_ai_are_ready(self):
        rules = self.env["construction.approval.rule"].sudo().search(
            [("name", "in", [
                "Demo project commercial approval",
                "Demo executive commercial approval",
            ])]
        )
        self.assertEqual(sorted(rules.mapped(lambda rule: len(rule.step_ids))), [2, 3])
        providers = self.env["majal.ai.provider"].sudo().search(
            [("code", "=", "demo"), ("company_id", "in", [
                self.contracting.id, self.facilities.id, self.property_company.id,
            ])]
        )
        self.assertEqual(len(providers), 3)
        self.assertTrue(all(provider.is_ready for provider in providers))
