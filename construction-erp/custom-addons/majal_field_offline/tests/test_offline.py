from odoo import Command, fields
from odoo.tests.common import TransactionCase

from ..controllers.field_app import _construction_field_records


class TestMajalOfflineSync(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        field_role = cls.env["majal.access.role"].search(
            [("code", "=", "field_user")], limit=1
        )
        cls.field_user = cls.env["res.users"].sudo().with_context(
            no_reset_password=True, majal_role_application=True
        ).create(
            {
                "name": "Offline Field User",
                "login": "offline-field@majal.test",
                "company_id": cls.env.company.id,
                "company_ids": [Command.set([cls.env.company.id])],
                "majal_role_id": field_role.id,
                "majal_industry_scope": "construction",
                "groups_id": [
                    Command.set(
                        cls.env["res.users"]._majal_group_ids_for(
                            field_role, "construction"
                        )
                    )
                ],
            }
        )
        cls.project = cls.env["project.project"].sudo().create(
            {
                "name": "Offline Test Project",
                "is_construction": True,
                "project_code": "OFF-TEST",
                "company_id": cls.env.company.id,
                "majal_member_ids": [Command.set([cls.field_user.id])],
            }
        )

    def _sync(self, operations):
        return (
            self.env["majal.offline.operation"]
            .with_user(self.field_user)
            ._sync_batch(operations)
        )

    def test_idempotent_defect_draft(self):
        operation = {
            "client_uuid": "offline_defect_00000001",
            "kind": "defect.create",
            "payload": {
                "project_id": self.project.id,
                "name": "Offline ceiling defect",
                "description": "Recorded without connectivity",
                "location": "Level 3",
                "severity": "high",
            },
        }
        first = self._sync([operation])[0]
        second = self._sync([operation])[0]
        self.assertEqual(first["status"], "applied")
        self.assertTrue(second["duplicate"])
        self.assertEqual(
            self.env["construction.defect"].sudo().search_count(
                [("name", "=", "Offline ceiling defect")]
            ),
            1,
        )

    def test_stale_update_becomes_visible_conflict(self):
        defect = self.env["construction.defect"].sudo().create(
            {
                "name": "Conflict test defect",
                "project_id": self.project.id,
                "assigned_user_id": self.field_user.id,
            }
        )
        stale = fields.Datetime.subtract(defect.write_date, minutes=5)
        result = self._sync(
            [
                {
                    "client_uuid": "offline_conflict_000001",
                    "kind": "defect.progress",
                    "target_model": "construction.defect",
                    "target_id": defect.id,
                    "base_write_date": fields.Datetime.to_string(stale),
                    "payload": {"record_id": defect.id, "action": "start"},
                }
            ]
        )[0]
        self.assertEqual(result["status"], "conflict")
        self.assertEqual(defect.state, "open")

    def test_close_is_not_an_allowed_offline_transition(self):
        defect = self.env["construction.defect"].sudo().create(
            {
                "name": "Unsafe transition test",
                "project_id": self.project.id,
                "assigned_user_id": self.field_user.id,
            }
        )
        result = self._sync(
            [
                {
                    "client_uuid": "offline_no_close_000001",
                    "kind": "defect.progress",
                    "base_write_date": fields.Datetime.to_string(defect.write_date),
                    "payload": {"record_id": defect.id, "action": "close"},
                }
            ]
        )[0]
        self.assertEqual(result["status"], "failed")
        self.assertEqual(defect.state, "open")

    def test_facilities_user_does_not_probe_construction_models(self):
        field_role = self.env["majal.access.role"].search(
            [("code", "=", "field_user")], limit=1
        )
        facilities_user = self.env["res.users"].sudo().with_context(
            no_reset_password=True, majal_role_application=True
        ).create(
            {
                "name": "Facilities Field User",
                "login": "facilities-field@majal.test",
                "company_id": self.env.company.id,
                "company_ids": [Command.set([self.env.company.id])],
                "majal_role_id": field_role.id,
                "majal_industry_scope": "facilities",
                "groups_id": [
                    Command.set(
                        self.env["res.users"]._majal_group_ids_for(
                            field_role, "facilities"
                        )
                    )
                ],
            }
        )

        records = _construction_field_records(
            self.env.with_user(facilities_user), facilities_user
        )

        self.assertEqual(set(records), {"projects", "defects", "inspections", "drawings"})
        self.assertTrue(all(not recordset for recordset in records.values()))
