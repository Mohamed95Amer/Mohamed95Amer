import base64

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from odoo.addons.construction_bim.models import ifc_parser

# A minimal but real STEP file: two walls and a door on one storey, plus the
# containment relationship and enough noise entities to prove the filtering.
SAMPLE_IFC = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('sample.ifc','2026-07-25T10:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1= IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Al Noor Tower',$,$,$,$,$,$);
#2= IFCCARTESIANPOINT((0.,0.,0.));
#3= IFCDIRECTION((0.,0.,1.));
#4= IFCLOCALPLACEMENT($,#2);
#10= IFCBUILDINGSTOREY('1PbCwGKuT9KPSKPuXfeXpk',$,'Level 03',$,$,#4,$,$,.ELEMENT.,9000.);
#20= IFCWALLSTANDARDCASE('2O2Fr$t4X7Zf8NOew3FLIE',$,'Basic Wall:CMU 200',$,$,#4,$,$);
#21= IFCWALLSTANDARDCASE('3Xs9pQ1nD2yQ8mWJk4LzAB',$,'Basic Wall:Curtain, Grid F',$,$,#4,$,$);
#22= IFCDOOR('0aB1cD2eF3gH4iJ5kL6mN7',$,'Single-Flush 900x2100',$,$,#4,$,$,2100.,900.);
#30= IFCRELCONTAINEDINSPATIALSTRUCTURE('1RelGuidAAAAAAAAAAAAAA',$,$,$,(#20,#21,#22),#10);
#40= IFCPROPERTYSINGLEVALUE('Reference',$,IFCTEXT('W-01'),$);
#41= IFCRECTANGLEPROFILEDEF(.AREA.,$,#4,8.,0.2);
#42= IFCRECTANGLEPROFILEDEF(.AREA.,$,#4,6.,0.2);
ENDSEC;
END-ISO-10303-21;
"""


@tagged("post_install", "-at_install")
class TestIfcParser(TransactionCase):
    """The parser is pure text handling, so it is tested on its own."""

    def test_products_are_indexed_and_noise_is_not(self):
        elements, storeys = ifc_parser.parse(SAMPLE_IFC)
        types = {e["ifc_type"] for e in elements}
        self.assertIn("IFCWALLSTANDARDCASE", types)
        self.assertIn("IFCDOOR", types)
        self.assertIn("IFCBUILDINGSTOREY", types)
        self.assertNotIn("IFCCARTESIANPOINT", types)
        self.assertNotIn("IFCLOCALPLACEMENT", types)
        self.assertNotIn("IFCPROPERTYSINGLEVALUE", types)
        self.assertEqual(len(storeys), 1)

    def test_global_ids_and_names_are_read(self):
        elements, _ = ifc_parser.parse(SAMPLE_IFC)
        by_id = {e["global_id"]: e for e in elements}
        wall = by_id["2O2Fr$t4X7Zf8NOew3FLIE"]
        self.assertEqual(wall["name"], "Basic Wall:CMU 200")
        self.assertEqual(wall["ifc_type"], "IFCWALLSTANDARDCASE")
        self.assertEqual(by_id["0aB1cD2eF3gH4iJ5kL6mN7"]["name"],
                         "Single-Flush 900x2100")

    def test_elements_are_placed_on_their_storey(self):
        elements, storeys = ifc_parser.parse(SAMPLE_IFC)
        storey_step = next(iter(storeys))
        walls = [e for e in elements if e["ifc_type"] == "IFCWALLSTANDARDCASE"]
        self.assertTrue(walls)
        for wall in walls:
            self.assertEqual(wall["storey_step_id"], storey_step)

    def test_commas_inside_names_do_not_split_the_arguments(self):
        """A naive split on commas mangles every name that contains one."""
        elements, _ = ifc_parser.parse(SAMPLE_IFC)
        names = {e["name"] for e in elements}
        self.assertIn("Basic Wall:Curtain, Grid F", names)

    def test_escaped_quotes_survive(self):
        content = SAMPLE_IFC.replace(
            "'Basic Wall:CMU 200'", "'Wall ''A'' type'")
        elements, _ = ifc_parser.parse(content)
        self.assertIn("Wall 'A' type", {e["name"] for e in elements})

    def test_an_entity_split_across_lines_is_still_read(self):
        content = SAMPLE_IFC.replace(
            "#22= IFCDOOR('0aB1cD2eF3gH4iJ5kL6mN7',$,'Single-Flush 900x2100',$,$,#4,$,$,2100.,900.);",
            "#22= IFCDOOR('0aB1cD2eF3gH4iJ5kL6mN7',$,\n"
            "  'Single-Flush 900x2100',$,$,#4,$,$,2100.,900.);",
        )
        elements, _ = ifc_parser.parse(content)
        self.assertIn("0aB1cD2eF3gH4iJ5kL6mN7", {e["global_id"] for e in elements})

    def test_an_enum_in_the_first_slot_is_not_a_globalid(self):
        """Plenty of entities put an enumeration first.

        Indexing those produced a pile of elements all claiming a GlobalId of
        '.AREA.', which then collided on the uniqueness constraint. A GlobalId
        is a 22-character base64 GUID, and checking that is more reliable than
        listing every entity type to skip.
        """
        elements, _ = ifc_parser.parse(SAMPLE_IFC)
        self.assertNotIn(".AREA.", {e["global_id"] for e in elements})
        self.assertNotIn("IFCRECTANGLEPROFILEDEF",
                         {e["ifc_type"] for e in elements})
        self.assertTrue(all(len(e["global_id"]) == 22 for e in elements))

    def test_rubbish_is_not_mistaken_for_a_model(self):
        elements, storeys = ifc_parser.parse("this is not an IFC file at all")
        self.assertFalse(elements)
        self.assertFalse(storeys)


@tagged("post_install", "-at_install")
class TestBimModel(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "BIM Project", "is_construction": True,
             "project_code": "BIM1"})
        cls.model = cls.env["construction.bim.model"].create({
            "name": "Tower — architectural",
            "project_id": cls.project.id,
            "discipline": "architectural",
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
            "ifc_filename": "sample.ifc",
        })

    def _element(self, global_id):
        return self.env["construction.bim.element"].search([
            ("model_id", "=", self.model.id), ("global_id", "=", global_id)])

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------
    def test_indexing_creates_the_elements(self):
        self.model.action_index()
        self.assertEqual(self.model.state, "indexed")
        self.assertTrue(self.model.element_count >= 4)
        wall = self._element("2O2Fr$t4X7Zf8NOew3FLIE")
        self.assertEqual(wall.name, "Basic Wall:CMU 200")
        self.assertEqual(wall.storey, "Level 03")

    def test_a_model_with_no_file_cannot_be_indexed(self):
        empty = self.env["construction.bim.model"].create({
            "name": "Nothing yet", "project_id": self.project.id,
            "ifc_file": base64.b64encode(b" "),
        })
        empty.ifc_file = False
        with self.assertRaises(UserError):
            empty.action_index()

    def test_re_indexing_keeps_links_because_globalids_are_stable(self):
        """The whole reason to key on GlobalId.

        A model is re-exported constantly. If links were keyed on anything the
        authoring tool renumbers, every RFI would come loose on each revision.
        """
        self.model.action_index()
        wall = self._element("2O2Fr$t4X7Zf8NOew3FLIE")
        rfi = self.env["construction.rfi"].create({
            "name": "Confirm CMU coursing",
            "project_id": self.project.id,
            "question": "Which coursing applies here?",
        })
        wall.rfi_id = rfi
        self.assertTrue(wall.is_linked)

        # Re-export: the step numbers move, the GlobalIds do not.
        renumbered = SAMPLE_IFC.replace("#20=", "#920=").replace("#21=", "#921=")
        self.model.ifc_file = base64.b64encode(renumbered.encode())
        self.model.action_index()

        wall = self._element("2O2Fr$t4X7Zf8NOew3FLIE")
        self.assertEqual(wall.rfi_id, rfi, "the link must survive a re-export")
        self.assertEqual(wall.step_id, 920)

    def test_an_element_that_disappears_but_carries_records_is_kept(self):
        """Losing the RFI history because a wall was redrawn is not a fix."""
        self.model.action_index()
        door = self._element("0aB1cD2eF3gH4iJ5kL6mN7")
        door.note = "Ironmongery to be confirmed"

        without_door = "\n".join(
            line for line in SAMPLE_IFC.splitlines()
            if "IFCDOOR" not in line
        )
        self.model.ifc_file = base64.b64encode(without_door.encode())
        self.model.action_index()

        door = self._element("0aB1cD2eF3gH4iJ5kL6mN7")
        self.assertTrue(door, "an element carrying records must not be deleted")
        self.assertTrue(door.is_orphan)

    def test_an_unlinked_element_that_disappears_is_removed(self):
        self.model.action_index()
        self.assertTrue(self._element("0aB1cD2eF3gH4iJ5kL6mN7"))

        without_door = "\n".join(
            line for line in SAMPLE_IFC.splitlines()
            if "IFCDOOR" not in line
        )
        self.model.ifc_file = base64.b64encode(without_door.encode())
        self.model.action_index()
        self.assertFalse(self._element("0aB1cD2eF3gH4iJ5kL6mN7"))

    def test_setting_a_model_current_supersedes_its_predecessor(self):
        self.model.action_index()
        self.model.action_make_current()
        self.assertEqual(self.model.state, "current")

        newer = self.env["construction.bim.model"].create({
            "name": "Tower — architectural rev B",
            "project_id": self.project.id,
            "discipline": "architectural",
            "revision": "B",
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        newer.action_index()
        newer.action_make_current()

        self.assertEqual(newer.state, "current")
        self.assertEqual(self.model.state, "superseded")

    def test_a_different_discipline_is_not_superseded(self):
        """Architectural and structural models are current at the same time."""
        self.model.action_index()
        self.model.action_make_current()
        structural = self.env["construction.bim.model"].create({
            "name": "Tower — structural",
            "project_id": self.project.id,
            "discipline": "structural",
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        structural.action_index()
        structural.action_make_current()
        self.assertEqual(self.model.state, "current")

    # ------------------------------------------------------------------
    # Links
    # ------------------------------------------------------------------
    def test_the_worst_linked_state_decides_the_colour(self):
        """A closed defect does not make an element with an open RFI green."""
        self.model.action_index()
        wall = self._element("2O2Fr$t4X7Zf8NOew3FLIE")
        defect = self.env["construction.defect"].create({
            "name": "Chipped block", "project_id": self.project.id})
        rfi = self.env["construction.rfi"].create({
            "name": "Coursing?", "project_id": self.project.id,
            "question": "?"})
        wall.write({"defect_id": defect.id, "rfi_id": rfi.id})
        self.assertEqual(wall.link_bucket, "blocked")

        rfi.write({"state": "closed"})
        wall.invalidate_recordset()
        self.assertEqual(wall.link_bucket, "open",
                         "the open defect still holds the element open")

    def test_an_element_with_nothing_attached_is_not_linked(self):
        self.model.action_index()
        wall = self._element("3Xs9pQ1nD2yQ8mWJk4LzAB")
        self.assertFalse(wall.is_linked)
        self.assertEqual(wall.link_bucket, "none")

    def test_a_note_alone_counts_as_a_link(self):
        self.model.action_index()
        wall = self._element("3Xs9pQ1nD2yQ8mWJk4LzAB")
        wall.note = "Setting out to be checked against survey"
        self.assertTrue(wall.is_linked)

    def test_linking_from_the_viewer_creates_a_missing_element(self):
        """The viewer can select a nested component the index never saw."""
        self.model.action_index()
        rfi = self.env["construction.rfi"].create({
            "name": "Nested part", "project_id": self.project.id,
            "question": "?"})
        element_id = self.env["construction.bim.element"].link_element(
            self.model.id, "9nEwGlObAlId000000000",
            {"name": "Sub-assembly", "ifc_type": "IFCMEMBER", "rfi_id": rfi.id},
        )
        element = self.env["construction.bim.element"].browse(element_id)
        self.assertEqual(element.rfi_id, rfi)
        self.assertEqual(element.model_id, self.model)

    def test_linking_twice_updates_rather_than_duplicates(self):
        self.model.action_index()
        first = self.env["construction.bim.element"].link_element(
            self.model.id, "2O2Fr$t4X7Zf8NOew3FLIE", {"note": "one"})
        second = self.env["construction.bim.element"].link_element(
            self.model.id, "2O2Fr$t4X7Zf8NOew3FLIE", {"note": "two"})
        self.assertEqual(first, second)
        self.assertEqual(
            self.env["construction.bim.element"].browse(first).note, "two")

    # ------------------------------------------------------------------
    # Viewer payload
    # ------------------------------------------------------------------
    def test_the_viewer_is_given_only_what_it_draws(self):
        """The viewer colours linked elements; sending thousands of unlinked
        ones would be a large payload conveying nothing."""
        self.model.action_index()
        wall = self._element("2O2Fr$t4X7Zf8NOew3FLIE")
        wall.note = "Check setting out"

        payload = self.env["construction.bim.model"].viewer_payload(self.model.id)
        self.assertEqual(payload["id"], self.model.id)
        self.assertIn("file_url", payload)
        self.assertEqual(len(payload["linked"]), 1)
        self.assertEqual(payload["linked"][0]["global_id"],
                         "2O2Fr$t4X7Zf8NOew3FLIE")

    def test_the_payload_of_a_missing_model_is_empty_not_an_error(self):
        self.assertEqual(
            self.env["construction.bim.model"].viewer_payload(999999), {})
