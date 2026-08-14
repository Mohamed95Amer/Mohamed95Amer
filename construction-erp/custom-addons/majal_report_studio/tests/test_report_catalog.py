from odoo.tests.common import TransactionCase


class TestMajalReportCatalog(TransactionCase):
    def test_seed_is_idempotent_and_catalogue_has_source(self):
        catalog = self.env["majal.report.catalog"]
        catalog.seed_from_report_actions()
        first_count = catalog.search_count([])
        catalog.seed_from_report_actions()
        self.assertEqual(catalog.search_count([]), first_count)
        if first_count:
            entry = catalog.search([], limit=1)
            self.assertTrue(entry.report_action_id.model)
            action = entry.action_open_source_records()
            self.assertEqual(action["res_model"], entry.report_action_id.model)
