"""Turning a PDF form into a Majal form, and back again.

The round trip is the feature: a client issues a permit as a PDF, a foreman
fills it on a phone, and what comes back is that PDF with the boxes filled —
not a Majal report that happens to contain the same answers. An auditor asks
for the form.

So these tests build a real AcroForm PDF, read it, complete the inspection,
and read the produced file back to check the answers landed in the right
boxes. Asserting only that a file was produced would pass on a blank one.
"""

import base64
import io

from odoo.exceptions import UserError
from odoo.tests import Form, TransactionCase, tagged


def build_pdf_form(fields):
    """A real one-page PDF with real AcroForm text fields."""
    from pypdf import PdfWriter
    from pypdf.generic import (
        ArrayObject, DictionaryObject, NameObject, NumberObject,
        TextStringObject,
    )

    writer = PdfWriter()
    page = writer.add_blank_page(width=595, height=842)

    annotations = ArrayObject()
    for index, (name, label) in enumerate(fields):
        widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject(name),
            NameObject("/TU"): TextStringObject(label),
            NameObject("/V"): TextStringObject(""),
            NameObject("/Ff"): NumberObject(0),
            NameObject("/Rect"): ArrayObject([
                NumberObject(50), NumberObject(700 - index * 40),
                NumberObject(400), NumberObject(725 - index * 40),
            ]),
        })
        annotations.append(writer._add_object(widget))

    page[NameObject("/Annots")] = annotations
    writer._root_object[NameObject("/AcroForm")] = DictionaryObject({
        NameObject("/Fields"): annotations,
    })

    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


PERMIT_FIELDS = [
    ("permit_no", "Permit number"),
    ("date_of_works", "Date of works"),
    ("supervisor", "Supervisor"),
]


@tagged("post_install", "-at_install")
class TestFormIntake(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pdf = build_pdf_form(PERMIT_FIELDS)
        cls.project = cls.env["project.project"].create(
            {"name": "Permit Project", "is_construction": True}
        )

    def _upload(self, payload=None, filename="hot-works-permit.pdf"):
        return self.env["majal.intake.upload"].create({
            "file": base64.b64encode(payload or self.pdf),
            "filename": filename,
            "company_id": self.env.company.id,
            "project_id": self.project.id,
            "target_model": "construction.form.template",
        })

    def test_the_pdfs_own_fields_are_detected(self):
        upload = self._upload()
        upload.action_parse()
        self.assertEqual(upload.state, "parsed")
        self.assertEqual(upload.file_format, "pdf-form")
        self.assertEqual(len(upload.field_ids), 3)

        by_key = {f.source_key: f for f in upload.field_ids}
        self.assertEqual(set(by_key), {"permit_no", "date_of_works", "supervisor"})
        # The tooltip is the human question; the field name is the box.
        self.assertEqual(by_key["permit_no"].sample_value, "Permit number")

    def test_a_field_named_date_is_offered_as_a_date(self):
        """A name hint, not a declaration — so it is scored lower than the
        types the PDF states outright, and a reviewer can change it."""
        upload = self._upload()
        upload.action_parse()
        by_key = {f.source_key: f for f in upload.field_ids}
        self.assertEqual(by_key["date_of_works"].target_field, "date")
        self.assertEqual(by_key["supervisor"].target_field, "text")
        self.assertLess(by_key["date_of_works"].confidence,
                        by_key["supervisor"].confidence)

    def test_a_flat_pdf_says_it_needs_ocr_rather_than_offering_nothing(self):
        from pypdf import PdfWriter

        writer = PdfWriter()
        writer.add_blank_page(width=595, height=842)
        buffer = io.BytesIO()
        writer.write(buffer)

        upload = self._upload(buffer.getvalue(), "scanned-permit.pdf")
        upload.action_parse()
        self.assertNotEqual(upload.state, "parsed")
        self.assertIn("OCR", upload.error)

    def test_applying_builds_a_form_template_and_keeps_the_pdf(self):
        upload = self._upload()
        upload.action_parse()
        upload.action_apply()

        self.assertEqual(upload.state, "applied")
        model, _sep, record_id = upload.created_record_ref.partition(",")
        self.assertEqual(model, "construction.form.template")
        template = self.env[model].browse(int(record_id))
        self.assertEqual(len(template.question_ids), 3)
        self.assertTrue(template.has_source_pdf,
                        "the source PDF was not kept, so no filled copy is possible")
        # The PDF field name rides along on the question, which is what makes
        # writing back possible at all.
        self.assertEqual(
            set(template.question_ids.mapped("instructions")),
            {"permit_no", "date_of_works", "supervisor"})

    def test_document_template_maps_its_uploaded_pdf_and_links_the_form(self):
        document_template = self.env["majal.document.template"].create({
            "name": "Client hot-works permit",
            "code": "CLIENT-HW",
            "document_type": "inspection",
            "body_html": "<p>{{ company.name }}</p>",
            "company_id": self.env.company.id,
            "source_file": base64.b64encode(self.pdf),
            "source_filename": "client-hot-works.pdf",
        })

        mapping_action = document_template.action_map_source_document()

        upload = document_template.intake_upload_id
        self.assertEqual(mapping_action["res_id"], upload.id)
        self.assertEqual(upload.document_template_id, document_template)
        self.assertEqual(upload.target_model, "construction.form.template")
        self.assertEqual(upload.state, "parsed")
        self.assertEqual(len(upload.field_ids), 3)

        upload.action_apply()

        self.assertTrue(document_template.mapped_form_template_id)
        self.assertEqual(
            len(document_template.mapped_form_template_id.question_ids), 3)
        open_action = document_template.action_open_mapped_form()
        self.assertEqual(
            open_action["res_id"], document_template.mapped_form_template_id.id)

    def test_the_round_trip_puts_answers_in_the_right_boxes(self):
        upload = self._upload()
        upload.action_parse()
        upload.action_apply()
        template = self.env["construction.form.template"].browse(
            int(upload.created_record_ref.partition(",")[2]))

        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id,
            "project_id": self.project.id,
        })
        # Answers are materialised from the template's questions by
        # action_start, not on create. The real flow starts an inspection
        # before anybody fills it in.
        inspection.action_start()
        by_field = {
            answer.question_id.instructions: answer
            for answer in inspection.answer_ids
        }
        self.assertEqual(set(by_field), {"permit_no", "date_of_works", "supervisor"})
        by_field["permit_no"].answer_text = "HW-2026-0184"
        by_field["supervisor"].answer_text = "Khalid Al Rashed"
        by_field["date_of_works"].answer_date = "2026-08-16"

        inspection.action_export_filled_pdf()

        attachment = self.env["ir.attachment"].search([
            ("res_model", "=", "construction.form.inspection"),
            ("res_id", "=", inspection.id),
        ], limit=1)
        self.assertTrue(attachment, "no filled PDF was produced")

        # Read it back. A test that only checks a file appeared would pass on
        # a blank one, which is exactly the failure worth catching.
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(base64.b64decode(attachment.datas)))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        self.assertIn("HW-2026-0184", text)
        self.assertIn("Khalid Al Rashed", text)
        self.assertIn("2026-08-16", text)

    def test_a_form_with_no_source_pdf_refuses_rather_than_inventing_one(self):
        template = self.env["construction.form.template"].create({
            "name": "Hand-built checklist",
            "code": "HANDBUILT",
            "company_id": self.env.company.id,
            "question_ids": [(0, 0, {"name": "Is it safe?",
                                     "answer_type": "yes_no"})],
        })
        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id,
            "project_id": self.project.id,
        })
        self.assertFalse(template.has_source_pdf)
        with self.assertRaises(UserError):
            inspection.action_export_filled_pdf()

    def test_not_applicable_is_left_blank_rather_than_ticked_as_no(self):
        """A PDF checkbox is on or off. N/A is neither, and writing "Off"
        would read to an auditor as an explicit No."""
        template = self.env["construction.form.template"].create({
            "name": "Checkbox form",
            "code": "CHKBOX",
            "company_id": self.env.company.id,
            "question_ids": [(0, 0, {
                "name": "Extinguisher present?",
                "answer_type": "yes_no",
                "instructions": "extinguisher",
            })],
        })
        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id,
            "project_id": self.project.id,
        })
        inspection.action_start()
        answer = inspection.answer_ids[0]

        answer.answer_yes_no = "na"
        self.assertNotIn("extinguisher", inspection._pdf_values())

        answer.answer_yes_no = "yes"
        self.assertEqual(inspection._pdf_values()["extinguisher"], "Yes")

    def test_correcting_an_answer_type_does_not_crash(self):
        """The review list invites this edit, so it must survive it.

        target_field on a PDF-form upload is the answer type, and it is an
        editable cell. The onchange behind it asks the target model which
        fields an import may write — a question construction.form.template
        could not answer, because only majal.document and majal.sheet
        implement _intake_writable_fields. Correcting a mis-detected type,
        the most ordinary thing a reviewer does on this screen, raised
        AttributeError instead.
        """
        upload = self._upload()
        upload.action_parse()
        line = upload.field_ids.filtered(lambda f: f.source_key == "permit_no")

        form = Form(upload, view="majal_document_intake.view_intake_upload_form")
        with form.field_ids.edit(list(upload.field_ids).index(line)) as edited:
            edited.target_field = "number"
        form.save()

        self.assertEqual(line.target_field, "number")

    def test_an_answer_type_invented_over_rpc_is_refused(self):
        """The review screen offers valid types; a write over RPC does not.

        _apply_as_form copies target_field straight into answer_type, which is
        a Selection. Without a gate the refusal came from the ORM at create
        time, as a ValueError about a selection value — and only after the
        template row had been reached. The import must be refused on its own
        terms instead.
        """
        upload = self._upload()
        upload.action_parse()
        upload.field_ids.write({"decision": "accept"})
        upload.field_ids[0].target_field = "arbitrary_string"

        with self.assertRaises(UserError):
            upload.action_apply()

        self.assertFalse(
            self.env["construction.form.template"].search(
                [("name", "=", "hot-works-permit")]
            ),
            "a refused import must leave no template behind",
        )
