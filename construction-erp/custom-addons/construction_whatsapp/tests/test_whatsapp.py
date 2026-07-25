import hashlib
import hmac
import json
from datetime import timedelta
from unittest.mock import patch

from odoo import fields
from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged

SEND_PATH = ("odoo.addons.construction_whatsapp.models.whatsapp_account"
             ".WhatsappAccount._perform_request")


@tagged("post_install", "-at_install")
class TestWhatsapp(TransactionCase):
    """The network is never touched.

    `_perform_request` is the only method in the module that reaches out, and
    every test replaces it. A test suite that quietly depends on Meta being up
    is not a test suite.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.account = cls.env["whatsapp.account"].create({
            "name": "Test number",
            "phone_number_id": "1234567890",
            "access_token": "test-token",
            "webhook_verify_token": "verify-me",
            "app_secret": "app-secret-value",
        })
        cls.project = cls.env["project.project"].create(
            {"name": "WhatsApp Project", "is_construction": True,
             "project_code": "WA01"})
        cls.consultant = cls.env["res.partner"].create({
            "name": "Design Consultant", "mobile": "+971 50 123 4567"})
        cls.subcontractor = cls.env["res.partner"].create({
            "name": "Al Waha Subcontractor", "mobile": "+971501112222"})
        cls.template = cls.env["whatsapp.template"].create({
            "name": "Test template",
            "template_name": "test_alert",
            "model_id": cls.env["ir.model"]._get_id("construction.rfi"),
            "body_params": "reference,project_id.name",
        })

    def _rfi(self, **vals):
        values = {
            "name": "Clarify rebar lap",
            "project_id": self.project.id,
            "question": "Which lap length applies at grid F?",
        }
        values.update(vals)
        return self.env["construction.rfi"].create(values)

    @staticmethod
    def _ok(_self, _path, _payload):
        return {"messages": [{"id": "wamid.TEST123"}]}

    # ------------------------------------------------------------------
    # Phone handling
    # ------------------------------------------------------------------
    def test_numbers_are_reduced_to_digits(self):
        """Meta wants country code first and nothing else."""
        Message = self.env["whatsapp.message"]
        self.assertEqual(Message._normalise_phone("+971 50 123 4567"), "971501234567")
        self.assertEqual(Message._normalise_phone("(971) 50-123-4567"), "971501234567")
        self.assertEqual(Message._normalise_phone("00971501234567"), "971501234567")
        self.assertEqual(Message._normalise_phone(""), "")

    def test_a_recipient_with_no_number_is_skipped_not_fatal(self):
        """A missing mobile must never block the work that triggered the alert."""
        silent = self.env["res.partner"].create({"name": "No phone"})
        rfi = self._rfi()
        message = self.env["whatsapp.message"]._queue(
            self.template, record=rfi, partner=silent)
        self.assertFalse(message)

    # ------------------------------------------------------------------
    # Templates
    # ------------------------------------------------------------------
    def test_parameters_follow_relations(self):
        rfi = self._rfi()
        values = self.template._resolve_params(rfi)
        self.assertEqual(values, [rfi.reference, "WhatsApp Project"])

    def test_an_unknown_field_is_reported_not_swallowed(self):
        self.template.body_params = "reference,project_id.nonexistent"
        with self.assertRaises(UserError):
            self.template._resolve_params(self._rfi())

    def test_empty_values_render_as_a_dash(self):
        """A blank placeholder would be rejected by Meta."""
        self.template.body_params = "date_required"
        values = self.template._resolve_params(self._rfi())
        self.assertEqual(values, ["—"])

    def test_payload_matches_the_cloud_api_shape(self):
        rfi = self._rfi()
        payload = self.template._payload(rfi, "971501234567")
        self.assertEqual(payload["messaging_product"], "whatsapp")
        self.assertEqual(payload["to"], "971501234567")
        self.assertEqual(payload["template"]["name"], "test_alert")
        params = payload["template"]["components"][0]["parameters"]
        self.assertEqual([p["text"] for p in params],
                         [rfi.reference, "WhatsApp Project"])

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------
    def test_a_queued_message_is_sent_and_stamped(self):
        rfi = self._rfi()
        message = self.env["whatsapp.message"]._queue(
            self.template, record=rfi, partner=self.consultant)
        self.assertEqual(message.state, "queued")

        with patch(SEND_PATH, self._ok):
            self.assertTrue(message._dispatch())

        self.assertEqual(message.state, "sent")
        self.assertEqual(message.wa_message_id, "wamid.TEST123")
        self.assertTrue(message.sent_on)
        self.assertEqual(message.attempts, 1)

    def test_a_failure_is_recorded_rather_than_raised(self):
        """The cron sends in batches; one bad number must not stop the rest."""
        def boom(_self, _path, _payload):
            raise UserError("Recipient not on WhatsApp")

        message = self.env["whatsapp.message"]._queue(
            self.template, record=self._rfi(), partner=self.consultant)
        with patch(SEND_PATH, boom):
            self.assertFalse(message._dispatch())
        self.assertEqual(message.state, "failed")
        self.assertIn("not on WhatsApp", message.error)

        message.action_retry()
        self.assertEqual(message.state, "queued")

    def test_the_cron_sends_the_whole_queue(self):
        for _ in range(3):
            self.env["whatsapp.message"]._queue(
                self.template, record=self._rfi(), partner=self.consultant)
        with patch(SEND_PATH, self._ok):
            self.env["whatsapp.message"]._cron_dispatch()
        pending = self.env["whatsapp.message"].search([("state", "=", "queued")])
        self.assertFalse(pending)

    def test_without_an_account_messages_wait_instead_of_vanishing(self):
        """Alerts queued before anyone connected a number must survive."""
        self.account.active = False
        message = self.env["whatsapp.message"]._queue(
            self.template, record=self._rfi(), partner=self.consultant)
        self.assertFalse(message.account_id)
        self.assertFalse(message._dispatch())
        self.assertEqual(message.state, "queued")

    def test_sending_leaves_a_trace_on_the_document(self):
        rfi = self._rfi()
        before = len(rfi.message_ids)
        message = self.env["whatsapp.message"]._queue(
            self.template, record=rfi, partner=self.consultant)
        with patch(SEND_PATH, self._ok):
            message._dispatch()
        self.assertGreater(len(rfi.message_ids), before)

    # ------------------------------------------------------------------
    # Delivery receipts
    # ------------------------------------------------------------------
    def test_receipts_never_move_a_message_backwards(self):
        """Meta does not order its callbacks."""
        message = self.env["whatsapp.message"]._queue(
            self.template, record=self._rfi(), partner=self.consultant)
        with patch(SEND_PATH, self._ok):
            message._dispatch()

        Message = self.env["whatsapp.message"]
        Message._apply_status("wamid.TEST123", "read")
        self.assertEqual(message.state, "read")
        Message._apply_status("wamid.TEST123", "delivered")
        self.assertEqual(message.state, "read", "a late receipt must not undo 'read'")

    def test_a_failure_receipt_always_wins(self):
        message = self.env["whatsapp.message"]._queue(
            self.template, record=self._rfi(), partner=self.consultant)
        with patch(SEND_PATH, self._ok):
            message._dispatch()
        self.env["whatsapp.message"]._apply_status("wamid.TEST123", "failed")
        self.assertEqual(message.state, "failed")

    def test_an_unknown_receipt_is_ignored(self):
        found = self.env["whatsapp.message"]._apply_status("wamid.NOPE", "read")
        self.assertFalse(found)

    # ------------------------------------------------------------------
    # Inbound
    # ------------------------------------------------------------------
    def test_a_reply_lands_on_the_record_it_was_about(self):
        rfi = self._rfi()
        sent = self.env["whatsapp.message"]._queue(
            self.template, record=rfi, partner=self.consultant)
        with patch(SEND_PATH, self._ok):
            sent._dispatch()
        before = len(rfi.message_ids)

        payload = {"entry": [{"changes": [{"value": {
            "metadata": {"phone_number_id": "1234567890"},
            "messages": [{
                "from": "971501234567",
                "id": "wamid.INBOUND1",
                "text": {"body": "Lap length is 40d, drawing follows."},
            }],
        }}]}]}
        self.env["whatsapp.message"]._handle_webhook(payload)

        inbound = self.env["whatsapp.message"].search(
            [("wa_message_id", "=", "wamid.INBOUND1")])
        self.assertEqual(len(inbound), 1)
        self.assertEqual(inbound.direction, "in")
        self.assertEqual(inbound.state, "received")
        self.assertEqual(inbound.res_id, rfi.id)
        self.assertEqual(inbound.partner_id, self.consultant)
        self.assertGreater(len(rfi.message_ids), before)

    def test_a_webhook_carrying_both_receipts_and_replies(self):
        sent = self.env["whatsapp.message"]._queue(
            self.template, record=self._rfi(), partner=self.consultant)
        with patch(SEND_PATH, self._ok):
            sent._dispatch()
        payload = {"entry": [{"changes": [{"value": {
            "metadata": {"phone_number_id": "1234567890"},
            "statuses": [{"id": "wamid.TEST123", "status": "delivered"}],
            "messages": [{"from": "971501234567", "id": "wamid.IN2",
                          "text": {"body": "ok"}}],
        }}]}]}
        self.env["whatsapp.message"]._handle_webhook(payload)
        self.assertEqual(sent.state, "delivered")
        self.assertTrue(self.env["whatsapp.message"].search(
            [("wa_message_id", "=", "wamid.IN2")]))

    def test_malformed_webhooks_do_not_explode(self):
        self.env["whatsapp.message"]._handle_webhook({})
        self.env["whatsapp.message"]._handle_webhook({"entry": [{}]})
        self.env["whatsapp.message"]._handle_webhook(
            {"entry": [{"changes": [{"value": {}}]}]})

    # ------------------------------------------------------------------
    # The events that actually send
    # ------------------------------------------------------------------
    def test_ball_in_court_queues_one_message(self):
        rfi = self._rfi()
        rfi.ball_in_court_id = self.consultant
        before = self.env["whatsapp.message"].search_count([])
        rfi._notify_ball_in_court()
        after = self.env["whatsapp.message"].search_count([])
        self.assertEqual(after - before, 1)
        queued = self.env["whatsapp.message"].search([], order="id desc", limit=1)
        self.assertEqual(queued.partner_id, self.consultant)
        self.assertEqual(queued.res_id, rfi.id)

    def test_assigning_a_defect_notifies_the_subcontractor(self):
        defect = self.env["construction.defect"].create({
            "name": "Chipped tile at lobby",
            "project_id": self.project.id,
        })
        before = self.env["whatsapp.message"].search_count([])
        defect.responsible_subcontractor_id = self.subcontractor
        self.assertEqual(self.env["whatsapp.message"].search_count([]) - before, 1)

        # Writing the same value again is not a reassignment.
        before = self.env["whatsapp.message"].search_count([])
        defect.write({"responsible_subcontractor_id": self.subcontractor.id})
        self.assertEqual(self.env["whatsapp.message"].search_count([]), before)

    def test_a_permit_is_warned_once_before_it_expires(self):
        permit = self.env["construction.permit"].create({
            "name": "Hot work at level 3",
            "project_id": self.project.id,
            "permit_type": "hot_work",
            "contractor_id": self.subcontractor.id,
            "valid_from": fields.Datetime.now() - timedelta(hours=2),
            "valid_to": fields.Datetime.now() + timedelta(hours=1),
        })
        permit.state = "approved"

        before = self.env["whatsapp.message"].search_count([])
        self.env["construction.permit"]._cron_expire_permits()
        self.assertEqual(
            self.env["whatsapp.message"].search_count([]) - before, 1)
        self.assertTrue(permit.whatsapp_expiry_warned)

        # A second sweep must not nag.
        before = self.env["whatsapp.message"].search_count([])
        self.env["construction.permit"]._cron_expire_permits()
        self.assertEqual(self.env["whatsapp.message"].search_count([]), before)

    def test_a_stuck_meeting_action_is_chased_once(self):
        owner = self.env["res.users"].create({
            "name": "Action Owner", "login": "wa.owner@example.com"})
        owner.partner_id.mobile = "+971509998888"
        meeting = self.env["construction.meeting"].create({
            "name": "Weekly progress", "project_id": self.project.id,
            "series": "Weekly",
        })
        action = self.env["construction.meeting.action"].create({
            "meeting_id": meeting.id,
            "name": "Provide the revised programme",
            "owner_id": owner.id,
            "deadline": fields.Date.context_today(meeting) - timedelta(days=5),
        })
        action.carried_count = 3

        # Scoped to this action: demo data ships its own stuck items, and a
        # test that counts every row in the database is really testing the demo.
        def chases_for(record):
            return self.env["whatsapp.message"].search_count([
                ("res_model", "=", record._name), ("res_id", "=", record.id)])

        self.env["construction.meeting.action"]._cron_chase_stuck_actions()
        self.assertTrue(action.whatsapp_chased)
        self.assertEqual(chases_for(action), 1)

        self.env["construction.meeting.action"]._cron_chase_stuck_actions()
        self.assertEqual(chases_for(action), 1, "a second sweep must not nag")

    def test_an_action_that_is_merely_late_is_not_chased(self):
        """One missed date is a slip. Three meetings is a pattern."""
        meeting = self.env["construction.meeting"].create({
            "name": "Weekly progress", "project_id": self.project.id})
        action = self.env["construction.meeting.action"].create({
            "meeting_id": meeting.id,
            "name": "Fresh but late",
            "deadline": fields.Date.context_today(meeting) - timedelta(days=1),
        })
        self.env["construction.meeting.action"]._cron_chase_stuck_actions()
        self.assertFalse(action.whatsapp_chased)
        self.assertFalse(self.env["whatsapp.message"].search_count([
            ("res_model", "=", action._name), ("res_id", "=", action.id)]))

    # ------------------------------------------------------------------
    # Webhook endpoint
    # ------------------------------------------------------------------
    def test_the_verify_token_is_required(self):
        """The route is public because Meta calls it."""
        accounts = self.env["whatsapp.account"].search(
            [("webhook_verify_token", "!=", False)])
        self.assertIn("verify-me", accounts.mapped("webhook_verify_token"))
        self.assertNotIn("wrong-token", accounts.mapped("webhook_verify_token"))

    def test_a_callback_must_carry_metas_signature(self):
        """The POST route is public and it writes to the database.

        Without a signature check anyone on the internet could mark messages as
        read, or post text into the chatter of a project they have never seen.
        """
        Account = self.env["whatsapp.account"]
        body = b'{"entry":[]}'
        good = "sha256=" + hmac.new(
            b"app-secret-value", body, hashlib.sha256).hexdigest()

        self.assertTrue(Account._verify_signature(good, body))
        self.assertFalse(Account._verify_signature(None, body))
        self.assertFalse(Account._verify_signature("", body))
        self.assertFalse(Account._verify_signature("sha256=deadbeef", body))
        self.assertFalse(
            Account._verify_signature(good.replace("sha256=", ""), body),
            "an unprefixed digest is not a signature")

    def test_a_signature_is_over_the_exact_body(self):
        """Signing the body means the body cannot be swapped after signing."""
        Account = self.env["whatsapp.account"]
        signed = b'{"entry":[{"a":1}]}'
        tampered = b'{"entry":[{"a":2}]}'
        signature = "sha256=" + hmac.new(
            b"app-secret-value", signed, hashlib.sha256).hexdigest()
        self.assertTrue(Account._verify_signature(signature, signed))
        self.assertFalse(Account._verify_signature(signature, tampered))

    def test_verification_fails_closed_with_no_secret_configured(self):
        """Refusing receipts is a smaller problem than accepting forged ones."""
        self.env["whatsapp.account"].search([]).write({"app_secret": False})
        body = b"{}"
        signature = "sha256=" + hmac.new(
            b"anything", body, hashlib.sha256).hexdigest()
        self.assertFalse(
            self.env["whatsapp.account"]._verify_signature(signature, body))

    def test_an_ordinary_user_cannot_hand_write_a_message(self):
        """The log is a record of what the system sent, not an outbox.

        Create rights would let any employee send a template to any number at
        the company's expense.
        """
        staff = self.env["res.users"].create({
            "name": "Site staff", "login": "wa.staff@example.com",
            "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
        })
        with self.assertRaises(AccessError):
            self.env["whatsapp.message"].with_user(staff).create({
                "phone": "971500000000",
                "template_id": self.template.id,
            })

    def test_the_events_can_still_queue_as_an_ordinary_user(self):
        """Locking the log down must not break the thing that fills it."""
        staff = self.env["res.users"].create({
            "name": "Engineer", "login": "wa.eng@example.com",
            "groups_id": [(6, 0, [
                self.env.ref("base.group_user").id,
                self.env.ref("construction_base.group_construction_pm").id,
            ])],
        })
        rfi = self._rfi()
        queued = self.env["whatsapp.message"].with_user(staff)._queue(
            self.template, record=rfi, partner=self.consultant)
        self.assertTrue(queued)

    def test_json_payloads_round_trip(self):
        """Guard against the webhook body shape drifting silently."""
        payload = {"entry": [{"changes": [{"value": {
            "statuses": [{"id": "x", "status": "sent"}]}}]}]}
        self.assertEqual(json.loads(json.dumps(payload)), payload)
