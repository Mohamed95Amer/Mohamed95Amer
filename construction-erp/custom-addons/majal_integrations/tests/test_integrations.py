import os
from unittest.mock import patch

from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("at_install", "-post_install")
class TestMajalIntegrationFoundation(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.provider = cls.env["majal.integration.provider"].create({
            "name": "Test Property Portal",
            "code": "test-property-portal",
            "company_id": cls.env.company.id,
            "service": "property_portal",
            "secret_env_var": "MAJAL_TEST_PORTAL_SECRET",
        })

    def test_secret_is_read_from_environment_not_database(self):
        with patch.dict(os.environ, {"MAJAL_TEST_PORTAL_SECRET": "private-value"}):
            self.assertEqual(self.provider._get_secret(), "private-value")
            self.assertTrue(self.provider.has_secret)
        self.assertNotIn("private-value", str(self.provider.read()))

    def test_endpoint_and_secret_reference_are_validated(self):
        with self.assertRaises(ValidationError):
            self.provider.endpoint = "http://example.com/api"
        with self.assertRaises(ValidationError):
            self.provider.secret_env_var = "unsafe-secret-name"

    def test_activation_fails_closed_without_adapter(self):
        with patch.dict(os.environ, {"MAJAL_TEST_PORTAL_SECRET": "private-value"}):
            with self.assertRaises(UserError):
                self.provider.action_activate()
        self.assertEqual(self.provider.state, "disabled")

    def test_enqueue_is_idempotent(self):
        jobs = self.env["majal.integration.job"]
        first = jobs._enqueue(self.provider, "listing-1-v1", "listing.publish", {"id": 1})
        second = jobs._enqueue(self.provider, "listing-1-v1", "listing.publish", {"id": 2})
        self.assertEqual(first, second)
        self.assertEqual(first.payload, {"id": 1})

    def test_disabled_provider_is_not_processed(self):
        job = self.env["majal.integration.job"]._enqueue(
            self.provider, "listing-2-v1", "listing.publish", {"id": 2})
        self.assertEqual(self.env["majal.integration.job"]._process_batch(), 0)
        self.assertEqual(job.state, "pending")
