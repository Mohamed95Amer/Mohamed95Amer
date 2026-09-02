"""Intake has to be safe on files nobody meant to be safe.

The cases below are the ones the design turns on, not a tour of the happy
path: an untrusted upload, a mapping a user could edit over RPC, a duplicate,
a file in Arabic, and a failure part-way through that must leave nothing
behind.
"""

import base64
import io
import json
import zipfile

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, new_test_user, tagged

from odoo.addons.majal_document_intake.models import parsers


def as_upload(payload):
    return base64.b64encode(payload if isinstance(payload, bytes)
                            else payload.encode("utf-8"))


def build_xlsx(rows):
    import openpyxl

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return base64.b64encode(buffer.getvalue())


@tagged("post_install", "-at_install")
class TestIntake(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(
            cls.env, login="intake-user", groups="base.group_user",
            # Explicit password: new_test_user defaults it to the login,
            # and this database enforces a 12-character minimum. The
            # module suite alone does not install that policy, so a short
            # login passes there and fails in the full run.
            password="intake-user-password",
        )
        cls.project = cls.env["project.project"].create(
            {"name": "Intake Project", "is_construction": True}
        )

    def _upload(self, data, filename, **extra):
        values = {
            "file": data,
            "filename": filename,
            "company_id": self.env.company.id,
        }
        values.update(extra)
        return self.env["majal.intake.upload"].create(values)

    # -- Isolation of the review lines ---------------------------------

    def test_another_user_cannot_read_or_edit_my_review_lines(self):
        """majal.intake.field needs its own rules; a parent's do not cascade.

        The upload is protected by rule_intake_upload_own, but Odoo does not
        extend a record rule to a one2many child. Every internal user holds
        read/write/unlink on majal.intake.field through the ACL, and those
        rows carry sample_value — the actual cell contents of the file. So
        without rules of its own, a colleague's payroll CSV is one search_read
        away and its proposed mapping is editable over RPC.
        """
        mine = self._upload(
            as_upload("Subject,Salary\nAugust payroll,48000\n"), "payroll.csv"
        )
        mine.action_parse()
        self.assertTrue(mine.field_ids, "the upload should have review lines")

        other = new_test_user(
            self.env, login="intake-other", groups="base.group_user",
            password="intake-other-password",
        )
        as_other = self.env["majal.intake.field"].with_user(other)

        visible = as_other.search([("upload_id", "=", mine.id)])
        self.assertFalse(
            visible,
            "another user can see the review lines of my upload, and with "
            "them the values read out of my file",
        )

        # And cannot reach them by id either, which is the RPC shape.
        with self.assertRaises(AccessError):
            as_other.browse(mine.field_ids[0].id).read(["sample_value"])

    def test_a_mapping_rule_from_another_company_is_out_of_reach(self):
        """The company rule on a profile stops at the profile.

        majal.intake.mapping.line carries a stored company_id and had no rule
        of its own, so the lines — which are where a profile actually says
        anything — were readable across companies, and writable by any
        construction manager, while the profile they belong to was not. Same
        omission as on the review lines, one model over.
        """
        other_company = self.env["res.company"].create({"name": "Other Co"})
        profile = self.env["majal.intake.mapping.profile"].create({
            "name": "Their letters",
            "company_id": other_company.id,
            "target_model": "majal.document",
            "line_ids": [(0, 0, {"source_key": "Subject", "target_field": "name"})],
        })

        mine = new_test_user(
            self.env, login="intake-mapping-reader", groups="base.group_user",
            password="intake-mapping-reader-password",
        )
        as_mine = self.env["majal.intake.mapping.line"].with_user(mine)

        self.assertFalse(
            as_mine.search([("profile_id", "=", profile.id)]),
            "a mapping rule belonging to another company is visible",
        )
        with self.assertRaises(AccessError):
            as_mine.browse(profile.line_ids[0].id).read(["target_field"])

    # -- Parsing -------------------------------------------------------

    def test_a_csv_is_read_and_its_columns_proposed(self):
        upload = self._upload(
            as_upload("Subject,Date\nMonthly letter,2026-08-16\n"),
            "letter.csv",
        )
        upload.action_parse()
        self.assertEqual(upload.state, "parsed")
        self.assertEqual(upload.file_format, "csv")
        self.assertEqual(upload.row_count, 1)

        by_source = {f.source_key: f for f in upload.field_ids}
        self.assertEqual(by_source["Subject"].target_field, "name")
        self.assertEqual(by_source["Date"].target_field, "document_date")
        self.assertEqual(by_source["Subject"].sample_value, "Monthly letter")

    def test_arabic_headers_map_through_folded_spelling(self):
        """اجمالي and إجمالي are the same word written two ways, and a file
        picks one. Folding the alef forms is what makes the alias table work
        on real documents rather than on tidied ones."""
        upload = self._upload(
            as_upload("الموضوع,التاريخ\nخطاب شهري,2026-08-16\n"),
            "letter-ar.csv",
        )
        upload.action_parse()
        by_source = {f.source_key: f for f in upload.field_ids}
        self.assertEqual(by_source["الموضوع"].target_field, "name")
        self.assertEqual(by_source["التاريخ"].target_field, "document_date")
        self.assertEqual(by_source["الموضوع"].sample_value, "خطاب شهري")

    def test_a_formula_cell_cannot_survive_into_a_spreadsheet(self):
        """Inert in Odoo, executable when somebody exports the record and
        opens it in Excel. Neutralised on the way in, where it is cheap."""
        upload = self._upload(
            as_upload('Subject,Note\n=cmd|\'/c calc\'!A1,x\n'), "evil.csv"
        )
        upload.action_parse()
        subject = upload.field_ids.filtered(
            lambda f: f.source_key == "Subject")
        self.assertTrue(subject.sample_value.startswith("'="))

    def test_a_scanned_pdf_says_so_instead_of_looking_empty(self):
        """A real PDF with no text layer, which is what a scan is. A malformed
        one would take the "cannot be read" path and prove nothing about the
        case that actually matters."""
        from pypdf import PdfWriter

        writer = PdfWriter()
        writer.add_blank_page(width=595, height=842)
        buffer = io.BytesIO()
        writer.write(buffer)

        upload = self._upload(base64.b64encode(buffer.getvalue()), "scan.pdf")
        upload.action_parse()
        self.assertNotEqual(upload.state, "parsed")
        self.assertIn("OCR", upload.error)

    def test_a_malformed_file_is_refused_and_recorded(self):
        """Recorded rather than raised. A UserError rolls the transaction back
        at the RPC boundary, so the note explaining the failure would not
        survive the failure — the upload would look untouched afterwards."""
        upload = self._upload(as_upload("{not json at all"), "broken.json")
        upload.action_parse()
        self.assertTrue(upload.error)
        self.assertNotEqual(upload.state, "parsed")

    def test_an_oversized_upload_is_refused(self):
        self.env["ir.config_parameter"].sudo().set_param(
            "majal_document_intake.max_upload_mb", "0.0005")
        upload = self._upload(
            as_upload("Subject,Date\n" + ("x,y\n" * 500)), "big.csv"
        )
        with self.assertRaises(UserError):
            upload.action_parse()

    def test_a_zip_bomb_is_refused_before_it_is_expanded(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/workbook.xml", b"0" * (80 * 1024 * 1024))
        with self.assertRaises(parsers.ParseError):
            parsers.parse_xlsx(buffer.getvalue())

    def test_the_format_comes_from_the_bytes_not_the_extension(self):
        """A caller's extension is a claim; the leading bytes are evidence."""
        self.assertEqual(
            parsers.sniff_format(b"%PDF-1.7\n...", "actually.csv"), "pdf")
        self.assertEqual(
            parsers.sniff_format(build_xlsx([["a"]]) and
                                 base64.b64decode(build_xlsx([["a"]])),
                                 "claims.txt"),
            "xlsx")

    # -- The allowlist -------------------------------------------------

    def test_a_workflow_field_cannot_be_mapped(self):
        """state is what the approval workflow owns. If an import could set
        it, the workflow would be advisory."""
        profile = self.env["majal.intake.mapping.profile"].create({
            "name": "Bad profile",
            "target_model": "majal.document",
        })
        with self.assertRaises(ValidationError):
            self.env["majal.intake.mapping.line"].create({
                "profile_id": profile.id,
                "source_key": "Status",
                "target_field": "state",
            })

    def test_the_allowlist_is_the_models_own_rules_not_a_copy(self):
        allowed = self.env["majal.document"]._intake_writable_fields()
        self.assertEqual(
            allowed, set(self.env["majal.document"].CONTROLLED_CONTENT))
        self.assertFalse(
            allowed & set(self.env["majal.document"].TRANSITION_FIELDS),
            "a workflow field is reachable through the import allowlist")

    def test_sheet_lines_are_not_an_import_target(self):
        """line_ids takes Odoo command tuples, which is a route to nested
        writes through a field that looks like an ordinary target."""
        self.assertNotIn(
            "line_ids", self.env["majal.sheet"]._intake_writable_fields())

    def test_a_forbidden_field_is_refused_at_apply_even_over_rpc(self):
        """The review screen filters what it offers, but a decision arriving
        over RPC has not been through the review screen."""
        upload = self._upload(
            as_upload("Subject\nHello\n"), "letter.csv")
        upload.action_parse()
        # Bypass the onchange exactly as a crafted RPC call would.
        upload.field_ids[0].with_context(
            skip_onchange=True).write({"target_field": "approval_checksum",
                                       "decision": "accept"})
        with self.assertRaises(UserError):
            upload.action_apply()
        self.assertEqual(upload.state, "parsed")

    # -- Applying ------------------------------------------------------

    def test_applying_creates_the_record_and_keeps_the_original(self):
        upload = self._upload(
            as_upload("Subject,Language\nMonthly letter,en_US\n"),
            "letter.csv",
            project_id=self.project.id,
        )
        upload.action_parse()
        upload.field_ids.filtered(
            lambda f: f.target_field).write({"decision": "accept"})
        upload.action_apply()

        self.assertEqual(upload.state, "applied")
        model, _sep, record_id = upload.created_record_ref.partition(",")
        document = self.env[model].browse(int(record_id))
        self.assertEqual(document.name, "Monthly letter")
        self.assertEqual(document.project_id, self.project)

        attachment = self.env["ir.attachment"].search([
            ("res_model", "=", "majal.document"),
            ("res_id", "=", document.id),
        ])
        self.assertTrue(attachment, "the source file was not kept")
        self.assertEqual(attachment.name, "letter.csv")

    def test_an_html_upload_is_not_stored_as_renderable_html(self):
        """The stored original is served back to users. An uploaded page kept
        as text/html is a script running on Majal's own origin.

        ir.attachment._check_contents already forces html-like content to
        text/plain for anyone without view-write rights; this pins that the
        intake path goes through it rather than around it.
        """
        author = new_test_user(
            self.env, login="intake-author", groups="base.group_user",
            password="intake-author-password")
        # Created *as* the author, not created as admin and then read as the
        # author: the own-records rule correctly refuses the second, which is
        # the rule doing its job rather than a problem with this test.
        upload = self.env["majal.intake.upload"].with_user(author).create({
            "file": as_upload("Subject\n<script>alert(1)</script>\n"),
            "filename": "payload.html",
            "company_id": self.env.company.id,
            # No project. The target model's own record rules apply to what
            # intake creates — as they must — and this author is not a member
            # of that project, so naming it here would be testing the project
            # rule rather than the attachment.
        })
        upload.action_parse()
        upload.field_ids.filtered(
            lambda f: f.target_field).write({"decision": "accept"})
        upload.action_apply()

        model, _sep, record_id = upload.created_record_ref.partition(",")
        attachment = self.env["ir.attachment"].search([
            ("res_model", "=", model), ("res_id", "=", int(record_id)),
        ])
        self.assertTrue(attachment)
        self.assertNotIn("html", attachment.mimetype)

    def test_nothing_is_created_when_the_import_fails(self):
        """Partial records are the failure mode this design exists to avoid."""
        before = self.env["majal.document"].search_count([])
        upload = self._upload(as_upload("Language\nnot-a-language\n"),
                              "bad.csv")
        upload.action_parse()
        upload.field_ids.write({"decision": "accept"})
        with self.assertRaises(Exception):
            upload.action_apply()
        self.assertEqual(
            self.env["majal.document"].search_count([]), before,
            "a failed import left a record behind")

    def test_rejecting_creates_nothing(self):
        before = self.env["majal.document"].search_count([])
        upload = self._upload(as_upload("Subject\nHello\n"), "letter.csv")
        upload.action_parse()
        upload.action_reject()
        self.assertEqual(upload.state, "rejected")
        self.assertEqual(self.env["majal.document"].search_count([]), before)

    def test_an_applied_import_cannot_be_quietly_undone(self):
        """Reversing an import means deleting a record that may already be
        submitted, approved or signed. That is done from the record."""
        upload = self._upload(as_upload("Subject\nHello\n"), "letter.csv")
        upload.action_parse()
        upload.field_ids.filtered(
            lambda f: f.target_field).write({"decision": "accept"})
        upload.action_apply()
        with self.assertRaises(UserError):
            upload.action_reject()
        with self.assertRaises(UserError):
            upload.action_reset()

    # -- Duplicates ----------------------------------------------------

    def test_the_same_file_twice_is_flagged_and_refused(self):
        payload = as_upload("Subject\nMonthly letter\n")
        first = self._upload(payload, "letter.csv")
        first.action_parse()
        first.field_ids.filtered(
            lambda f: f.target_field).write({"decision": "accept"})
        first.action_apply()

        second = self._upload(payload, "letter-resent.csv")
        second.action_parse()
        self.assertEqual(second.duplicate_of_id, first,
                         "a re-sent file was not recognised")
        with self.assertRaises(UserError):
            second.action_apply()

    def test_a_different_file_with_the_same_name_is_not_a_duplicate(self):
        """A filename gets reused for a corrected file. Only the checksum is
        evidence."""
        first = self._upload(as_upload("Subject\nOriginal\n"), "letter.csv")
        first.action_parse()
        first.field_ids.filtered(
            lambda f: f.target_field).write({"decision": "accept"})
        first.action_apply()

        corrected = self._upload(as_upload("Subject\nCorrected\n"), "letter.csv")
        corrected.action_parse()
        self.assertFalse(corrected.duplicate_of_id)

    # -- Formats -------------------------------------------------------

    def test_json_records_become_columns(self):
        payload = json.dumps([
            {"Subject": "First", "Date": "2026-08-16"},
            {"Subject": "Second", "Date": "2026-08-17"},
        ])
        upload = self._upload(as_upload(payload), "letters.json")
        upload.action_parse()
        self.assertEqual(upload.row_count, 2)
        self.assertIn("name", upload.field_ids.mapped("target_field"))

    def test_nested_json_is_refused_rather_than_flattened_by_guesswork(self):
        payload = json.dumps([{"Subject": {"ar": "خطاب", "en": "Letter"}}])
        upload = self._upload(as_upload(payload), "nested.json")
        upload.action_parse()
        self.assertNotEqual(upload.state, "parsed")
        self.assertIn("nested", upload.error)

    def test_xlsx_is_read_without_evaluating_a_formula(self):
        upload = self._upload(
            build_xlsx([["Subject", "Date"], ["From a workbook", "2026-08-16"]]),
            "letter.xlsx",
        )
        upload.action_parse()
        self.assertEqual(upload.file_format, "xlsx")
        subject = upload.field_ids.filtered(lambda f: f.source_key == "Subject")
        self.assertEqual(subject.sample_value, "From a workbook")

    # -- Isolation -----------------------------------------------------

    def test_a_user_does_not_see_another_users_uploads(self):
        other = new_test_user(
            self.env, login="intake-other", groups="base.group_user",
            password="intake-other-password")
        mine = self._upload(as_upload("Subject\nMine\n"), "mine.csv")
        visible = self.env["majal.intake.upload"].with_user(other).search([
            ("id", "=", mine.id)
        ])
        self.assertFalse(
            visible, "an upload was visible to a user who did not make it")
