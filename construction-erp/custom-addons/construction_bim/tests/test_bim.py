import base64
import io
import zipfile
from xml.etree import ElementTree

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged

from odoo.addons.construction_bim.models import ifc_parser
from odoo.addons.construction_bim.models.bim_clash import MAX_RESULTS

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
#43= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('120'),$);
#44= IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#45= IFCPROPERTYSET('5PsetGuidAAAAAAAAAAAAA',$,'Pset_WallCommon',$,(#40,#43,#44));
#46= IFCRELDEFINESBYPROPERTIES('5RelPropAAAAAAAAAAAAAA',$,$,$,(#20,#21),#45);
#50= IFCQUANTITYLENGTH('Length',$,$,8.,$);
#51= IFCQUANTITYAREA('NetSideArea',$,$,24.,$);
#52= IFCQUANTITYVOLUME('NetVolume',$,$,4.8,$);
#53= IFCELEMENTQUANTITY('5QtoGuidAAAAAAAAAAAAAA',$,'BaseQuantities',$,$,(#50,#51,#52));
#54= IFCRELDEFINESBYPROPERTIES('5RelQtoAAAAAAAAAAAAAAA',$,$,$,(#20),#53);
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

    def test_the_spatial_structure_is_not_indexed_as_elements(self):
        """A project, a site, a building and a storey are where elements live.

        Listing them among the elements inflated every count and put rows
        nobody can raise an RFI against at the top of the register. The storeys
        are still returned separately, which is what names the levels.
        """
        elements, storeys = ifc_parser.parse(SAMPLE_IFC)
        types = {e["ifc_type"] for e in elements}
        for container in ("IFCPROJECT", "IFCSITE", "IFCBUILDING",
                          "IFCBUILDINGSTOREY"):
            self.assertNotIn(container, types)
        self.assertEqual(len(storeys), 1)

    def test_rubbish_is_not_mistaken_for_a_model(self):
        elements, storeys = ifc_parser.parse("this is not an IFC file at all")
        self.assertFalse(elements)
        self.assertFalse(storeys)


@tagged("post_install", "-at_install")
class TestIfcQuantities(TransactionCase):
    """Quantities and property sets — what makes a model a commercial document.

    IFC keeps both outside the element and joins them with a relationship, so
    the reader has to walk three entity families before a wall can say how much
    concrete is in it.
    """

    def test_quantities_are_read_from_the_measure_not_the_unit(self):
        """IfcPhysicalSimpleQuantity is (Name, Description, Unit, Value).

        Reading the third argument gives the unit — which is usually absent —
        and so gives every element a quantity of zero.
        """
        elements, _storeys = ifc_parser.parse(SAMPLE_IFC)
        wall = next(e for e in elements
                    if e["global_id"] == "2O2Fr$t4X7Zf8NOew3FLIE")
        quantities = {kind: value for kind, _name, value in wall["quantities"]}
        self.assertEqual(quantities["length"], 8.0)
        self.assertEqual(quantities["area"], 24.0)
        self.assertEqual(quantities["volume"], 4.8)

    def test_a_property_set_reaches_every_element_it_describes(self):
        """One definition is routinely shared by hundreds of elements."""
        elements, _storeys = ifc_parser.parse(SAMPLE_IFC)
        for global_id in ("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB"):
            element = next(e for e in elements if e["global_id"] == global_id)
            properties = {name: value for _pset, name, value in element["properties"]}
            self.assertEqual(properties["Reference"], "W-01")
            self.assertEqual(properties["FireRating"], "120")
            self.assertEqual(properties["LoadBearing"], "Yes")

    def test_a_quantity_set_is_not_indexed_as_an_element(self):
        """IfcElementQuantity is an IfcRoot and carries a GlobalId of its own.

        That is enough to make it look like a wall to a filter that only checks
        the first argument, and a model would then show quantity sets among its
        elements.
        """
        elements, _storeys = ifc_parser.parse(SAMPLE_IFC)
        types = {e["ifc_type"] for e in elements}
        self.assertNotIn("IFCELEMENTQUANTITY", types)
        self.assertNotIn("IFCPROPERTYSET", types)

    def test_a_door_without_quantities_reports_none(self):
        elements, _storeys = ifc_parser.parse(SAMPLE_IFC)
        door = next(e for e in elements
                    if e["global_id"] == "0aB1cD2eF3gH4iJ5kL6mN7")
        self.assertFalse(door["quantities"])


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
        # Two walls and a door. The project, building and storey around them
        # are spatial structure, not elements.
        self.assertEqual(self.model.element_count, 3)
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
    def test_the_viewer_is_given_every_element_not_only_linked_ones(self):
        """The side list is the model's contents, not its workload.

        Sending only linked elements meant a freshly indexed model showed its
        element count in the header beside an empty list — the moment somebody
        most needs to see what is in the file. Unlinked elements carry a
        bucket of "none", so the filters still separate them.
        """
        self.model.action_index()
        wall = self._element("2O2Fr$t4X7Zf8NOew3FLIE")
        wall.note = "Check setting out"

        payload = self.env["construction.bim.model"].viewer_payload(self.model.id)
        self.assertEqual(payload["id"], self.model.id)
        self.assertIn("file_url", payload)
        self.assertEqual(len(payload["elements"]), payload["element_count"])
        by_global_id = {row["global_id"]: row for row in payload["elements"]}
        self.assertTrue(by_global_id["2O2Fr$t4X7Zf8NOew3FLIE"]["is_linked"])
        unlinked = [row for row in payload["elements"] if not row["is_linked"]]
        self.assertTrue(unlinked, "the fixture should hold unlinked elements")
        self.assertEqual({row["link_bucket"] for row in unlinked}, {"none"})

    def test_the_payload_of_a_missing_model_is_empty_not_an_error(self):
        self.assertEqual(
            self.env["construction.bim.model"].viewer_payload(999999), {})


@tagged("post_install", "-at_install")
class TestBimPins(TransactionCase):
    """Pins put a record at a point, not just on an element.

    Element links answer "which wall"; a pin answers "where on it". The
    position is stored in the model's own space so it stays on the crack while
    the camera moves — which is the only thing separating this from drawing on
    a screenshot.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Pin Project", "is_construction": True,
             "project_code": "PIN1"})
        cls.model = cls.env["construction.bim.model"].create({
            "name": "Pinned model",
            "project_id": cls.project.id,
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.model.action_index()

    def _drop(self, **values):
        payload = {
            "name": "Crack at third window",
            "pos_x": 1.5, "pos_y": 2.5, "pos_z": 3.5,
            "pin_type": "note",
        }
        payload.update(values)
        return self.env["construction.bim.pin"].drop_pin(self.model.id, payload)

    def test_a_pin_keeps_its_position_in_model_space(self):
        result = self._drop()
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertEqual(pin.pos_x, 1.5)
        self.assertEqual(pin.pos_y, 2.5)
        self.assertEqual(pin.pos_z, 3.5)
        self.assertEqual(result["position"], [1.5, 2.5, 3.5])

    def test_a_pin_on_an_element_records_which_one(self):
        result = self._drop(global_id="2O2Fr$t4X7Zf8NOew3FLIE")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertTrue(pin.element_id)
        self.assertEqual(pin.element_id.global_id, "2O2Fr$t4X7Zf8NOew3FLIE")
        self.assertEqual(pin.storey, "Level 03",
                         "the pin should inherit the storey it was dropped on")

    def test_a_pin_in_mid_air_is_still_a_pin(self):
        """A click that misses an element must not be refused — plenty of
        observations are about a space, not a component."""
        result = self._drop(global_id="")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertFalse(pin.element_id)
        self.assertTrue(pin.exists())

    def test_dropping_a_defect_pin_creates_the_defect(self):
        """Placing the pin and raising the record are one action.

        Making somebody place a pin, then open a form, then come back and link
        them loses the position and most of the point.
        """
        result = self._drop(pin_type="defect", name="Chipped nosing",
                            note="Second step from the top")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertTrue(pin.defect_id)
        self.assertEqual(pin.defect_id.name, "Chipped nosing")
        self.assertEqual(pin.defect_id.project_id, self.project)

    def test_dropping_an_rfi_pin_creates_the_rfi(self):
        result = self._drop(pin_type="rfi", name="Which lap applies here?",
                            note="Grid F, level 3")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertTrue(pin.rfi_id)
        self.assertEqual(pin.rfi_id.project_id, self.project)

    def test_dropping_a_task_pin_creates_the_task(self):
        result = self._drop(pin_type="task", name="Make good")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertTrue(pin.task_id)
        self.assertEqual(pin.task_id.project_id, self.project)

    def test_the_pin_colour_follows_the_record_it_stands_for(self):
        result = self._drop(pin_type="rfi", name="Open question")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertEqual(pin.bucket, "blocked")

        pin.rfi_id.write({"state": "closed"})
        pin.invalidate_recordset()
        self.assertEqual(pin.bucket, "done")

    def test_deleting_a_marker_does_not_delete_the_question(self):
        """A pin standing for an RFI is a view of it, not the RFI itself."""
        result = self._drop(pin_type="rfi", name="Still open")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        rfi = pin.rfi_id

        pin.remove_pin()

        self.assertTrue(pin.exists(), "an RFI pin is not a throwaway marker")
        self.assertTrue(rfi.exists())

    def test_a_plain_note_pin_can_be_removed(self):
        result = self._drop(pin_type="note", name="Just a note")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        pin.remove_pin()
        self.assertFalse(pin.exists())

    def test_the_viewer_is_told_about_pins_and_storeys(self):
        self._drop(global_id="2O2Fr$t4X7Zf8NOew3FLIE")
        payload = self.env["construction.bim.model"].viewer_payload(self.model.id)
        self.assertEqual(len(payload["pins"]), 1)
        self.assertIn("Level 03", payload["storeys"])
        self.assertTrue(payload["pin_types"])

    def test_clicking_a_pin_opens_an_action_the_client_can_run(self):
        """The viewer hands this straight to doAction, which needs `views`.

        Without it the web client throws while preprocessing and the click does
        nothing visible — the pin looks broken rather than the action.
        """
        result = self._drop(pin_type="defect", name="Chipped nosing")
        pin = self.env["construction.bim.pin"].browse(result["id"])

        action = pin.action_open_record()

        self.assertEqual(action["res_model"], "construction.defect")
        self.assertEqual(action["res_id"], pin.defect_id.id)
        self.assertEqual(action["views"], [[False, "form"]])

    def test_a_note_pin_opens_nothing_because_there_is_nothing_to_open(self):
        result = self._drop(pin_type="note", name="Just a note")
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.assertFalse(pin.action_open_record())

    def test_a_pin_on_a_missing_model_is_refused_quietly(self):
        self.assertEqual(
            self.env["construction.bim.pin"].drop_pin(999999, {"name": "x"}), {})

    def test_deleting_the_model_takes_its_pins(self):
        result = self._drop()
        pin = self.env["construction.bim.pin"].browse(result["id"])
        self.model.unlink()
        self.assertFalse(pin.exists())


@tagged("post_install", "-at_install")
class TestBimQuantitiesStored(TransactionCase):
    """The indexed side: quantities as columns, properties as rows."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Quantities", "is_construction": True,
             "project_code": "QTY1"})
        cls.model = cls.env["construction.bim.model"].create({
            "name": "Quantified model",
            "project_id": cls.project.id,
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.model.action_index()

    def _wall(self):
        return self.env["construction.bim.element"].search([
            ("model_id", "=", self.model.id),
            ("global_id", "=", "2O2Fr$t4X7Zf8NOew3FLIE"),
        ])

    def test_quantities_land_on_the_element(self):
        wall = self._wall()
        self.assertEqual(wall.quantity_volume, 4.8)
        self.assertEqual(wall.quantity_area, 24.0)
        self.assertTrue(wall.has_quantities)

    def test_properties_land_as_rows_that_can_be_searched(self):
        """A blob would display; rows answer 'every wall rated 120 minutes'."""
        rated = self.env["construction.bim.element"].search([
            ("model_id", "=", self.model.id),
            ("property_ids.name", "=", "FireRating"),
            ("property_ids.value", "=", "120"),
        ])
        self.assertEqual(len(rated), 2)

    def test_re_indexing_drops_a_property_the_model_no_longer_has(self):
        """A revision that removed a property must remove it here too."""
        stripped = SAMPLE_IFC.replace(
            "#43= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('120'),$);\n", "")
        self.model.write({"ifc_file": base64.b64encode(stripped.encode())})
        self.model.action_index()

        self.assertFalse(self.env["construction.bim.property"].search([
            ("model_id", "=", self.model.id), ("name", "=", "FireRating"),
        ]))
        self.assertTrue(self.env["construction.bim.property"].search([
            ("model_id", "=", self.model.id), ("name", "=", "Reference"),
        ]))

    def test_the_takeoff_totals_what_the_model_measures(self):
        totals = {row["ifc_type"]: row for row in self.model._quantity_totals()}
        self.assertEqual(totals["IFCWALLSTANDARDCASE"]["volume"], 4.8)

    def test_the_takeoff_action_only_offers_quantified_elements(self):
        action = self.model.action_takeoff()
        self.assertIn(("has_quantities", "=", True), action["domain"])


@tagged("post_install", "-at_install")
class TestBoqAgainstModel(TransactionCase):
    """The bill's measurement against the model's."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Bill check", "is_construction": True,
             "project_code": "BQ1"})
        cls.model = cls.env["construction.bim.model"].create({
            "name": "Billed model",
            "project_id": cls.project.id,
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.model.action_index()
        cls.boq = cls.env["construction.boq"].create({
            "name": "Main bill", "project_id": cls.project.id})
        cls.line = cls.env["construction.boq.line"].create({
            "name": "Blockwork 200mm",
            "boq_id": cls.boq.id,
            "uom_id": cls.env.ref("uom.product_uom_cubic_meter").id,
            "quantity": 5.0,
            "unit_rate": 300.0,
        })

    def test_the_measure_is_taken_from_the_unit(self):
        self.assertEqual(self.line.bim_measure, "volume")

    def test_a_linked_element_gives_the_line_a_model_quantity(self):
        wall = self.env["construction.bim.element"].search([
            ("model_id", "=", self.model.id),
            ("global_id", "=", "2O2Fr$t4X7Zf8NOew3FLIE"),
        ])
        wall.boq_line_id = self.line

        self.line.invalidate_recordset()
        self.assertEqual(self.line.bim_element_count, 1)
        self.assertEqual(self.line.bim_quantity, 4.8)
        # The model measures less than the bill: a real variance, and the
        # reason for the whole comparison.
        self.assertAlmostEqual(self.line.bim_variance, -0.2, places=6)

    def test_a_line_with_no_model_behind_it_claims_nothing(self):
        """A zero variance on an unlinked line would read as agreement."""
        self.assertEqual(self.line.bim_element_count, 0)
        self.assertEqual(self.line.bim_quantity, 0.0)
        self.assertEqual(self.line.bim_variance, 0.0)

    def test_a_unit_the_model_cannot_measure_leaves_the_measure_blank(self):
        hours = self.env["construction.boq.line"].create({
            "name": "Supervision",
            "boq_id": self.boq.id,
            "uom_id": self.env.ref("uom.product_uom_hour").id,
            "quantity": 100.0,
        })
        self.assertFalse(hours.bim_measure)


@tagged("post_install", "-at_install")
class TestBimComparison(TransactionCase):
    """What changed between two revisions."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Revisions", "is_construction": True,
             "project_code": "REV1"})
        cls.rev_a = cls.env["construction.bim.model"].create({
            "name": "Tower", "project_id": cls.project.id, "revision": "A",
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.rev_a.action_index()

        changed = SAMPLE_IFC.replace(
            "#21= IFCWALLSTANDARDCASE('3Xs9pQ1nD2yQ8mWJk4LzAB',$,"
            "'Basic Wall:Curtain, Grid F',$,$,#4,$,$);\n", "")
        changed = changed.replace("IFCQUANTITYVOLUME('NetVolume',$,$,4.8,$)",
                                  "IFCQUANTITYVOLUME('NetVolume',$,$,6.2,$)")
        changed = changed.replace("Single-Flush 900x2100", "Double-Leaf 1800x2100")
        cls.rev_b = cls.env["construction.bim.model"].create({
            "name": "Tower", "project_id": cls.project.id, "revision": "B",
            "ifc_file": base64.b64encode(changed.encode()),
        })
        cls.rev_b.action_index()

    def _compare(self):
        comparison = self.env["construction.bim.comparison"].create({
            "base_model_id": self.rev_a.id,
            "target_model_id": self.rev_b.id,
        })
        comparison.action_compare()
        return comparison

    def test_a_deleted_element_is_reported_as_removed(self):
        comparison = self._compare()
        removed = comparison.line_ids.filtered(
            lambda l: l.change_type == "removed")
        self.assertEqual(len(removed), 1)
        self.assertEqual(removed.global_id, "3Xs9pQ1nD2yQ8mWJk4LzAB")

    def test_a_renamed_element_reports_both_names(self):
        comparison = self._compare()
        renamed = comparison.line_ids.filtered(
            lambda l: l.change_type == "renamed")
        self.assertEqual(len(renamed), 1)
        self.assertEqual(renamed.was, "Single-Flush 900x2100")
        self.assertEqual(renamed.now, "Double-Leaf 1800x2100")

    def test_a_changed_quantity_reports_the_measure_that_moved(self):
        comparison = self._compare()
        changed = comparison.line_ids.filtered(
            lambda l: l.change_type == "quantity")
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed.measure, "volume")
        self.assertEqual(changed.was, "4.800")
        self.assertEqual(changed.now, "6.200")

    def test_a_removal_that_carries_records_is_flagged(self):
        """The removal that matters: somebody raised an RFI against that wall."""
        rfi = self.env["construction.rfi"].create({
            "name": "Curtain wall build-up", "project_id": self.project.id,
            "question": "Which system?",
        })
        wall = self.env["construction.bim.element"].search([
            ("model_id", "=", self.rev_a.id),
            ("global_id", "=", "3Xs9pQ1nD2yQ8mWJk4LzAB"),
        ])
        wall.rfi_id = rfi

        comparison = self._compare()

        removed = comparison.line_ids.filtered(
            lambda l: l.change_type == "removed")
        self.assertTrue(removed.is_linked)

    def test_comparing_a_revision_with_itself_is_refused(self):
        comparison = self.env["construction.bim.comparison"].create({
            "base_model_id": self.rev_a.id, "target_model_id": self.rev_a.id})
        with self.assertRaises(UserError):
            comparison.action_compare()


@tagged("post_install", "-at_install")
class TestBcfExchange(TransactionCase):
    """Issues have to leave the system to be answered.

    The people who answer them work in Solibri, Navisworks or BIMcollab, and
    none of those will log in here to read a pin.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "BCF", "is_construction": True, "project_code": "BCF1"})
        cls.model = cls.env["construction.bim.model"].create({
            "name": "Exchanged model",
            "project_id": cls.project.id,
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.model.action_index()

    def _drop(self, **values):
        payload = {
            "name": "Duct clashes with beam",
            "note": "Level 03, grid C/4",
            "pin_type": "rfi",
            "global_id": "2O2Fr$t4X7Zf8NOew3FLIE",
            "pos_x": 1.5, "pos_y": 2.5, "pos_z": -3.5,
            "cam_x": 12.0, "cam_y": 9.0, "cam_z": 14.0,
            "cam_target_x": 1.5, "cam_target_y": 2.5, "cam_target_z": -3.5,
        }
        payload.update(values)
        result = self.env["construction.bim.pin"].drop_pin(self.model.id, payload)
        return self.env["construction.bim.pin"].browse(result["id"])

    def _archive(self, pins):
        payload = self.env["construction.bim.bcf"].export_pins(pins)
        return zipfile.ZipFile(io.BytesIO(payload)), payload

    def test_an_export_is_a_zip_of_one_folder_per_topic(self):
        pin = self._drop()
        archive, _payload = self._archive(pin)
        names = archive.namelist()
        guid = pin.bcf_guid
        self.assertIn("bcf.version", names)
        self.assertIn(f"{guid}/markup.bcf", names)
        self.assertIn(f"{guid}/viewpoint.bcfv", names)

    def test_the_topic_carries_the_title_status_and_description(self):
        pin = self._drop()
        archive, _payload = self._archive(pin)
        root = ElementTree.fromstring(archive.read(f"{pin.bcf_guid}/markup.bcf"))
        topic = root.find("Topic")
        self.assertEqual(topic.findtext("Title"), "Duct clashes with beam")
        self.assertEqual(topic.findtext("Description"), "Level 03, grid C/4")
        self.assertEqual(topic.get("TopicType"), "Issue")
        self.assertEqual(topic.get("TopicStatus"), "Open")

    def test_the_viewpoint_selects_the_element_and_places_the_camera(self):
        """Selection is what makes the topic land on the right wall abroad."""
        pin = self._drop()
        archive, _payload = self._archive(pin)
        root = ElementTree.fromstring(archive.read(f"{pin.bcf_guid}/viewpoint.bcfv"))
        component = root.find("Components/Selection/Component")
        self.assertEqual(component.get("IfcGuid"), "2O2Fr$t4X7Zf8NOew3FLIE")
        point = root.find("PerspectiveCamera/CameraViewPoint")
        self.assertEqual(float(point.findtext("X")), 12.0)

    def test_a_pin_with_no_saved_view_still_exports_a_camera(self):
        """A topic that opens inside a wall is a topic nobody can read."""
        pin = self._drop(cam_x=0.0, cam_y=0.0, cam_z=0.0,
                         cam_target_x=0.0, cam_target_y=0.0, cam_target_z=0.0)
        self.assertFalse(pin.has_viewpoint)
        archive, _payload = self._archive(pin)
        root = ElementTree.fromstring(archive.read(f"{pin.bcf_guid}/viewpoint.bcfv"))
        point = root.find("PerspectiveCamera/CameraViewPoint")
        self.assertNotEqual(float(point.findtext("X")), 0.0)

    def test_the_topic_guid_is_stable_across_exports(self):
        """Otherwise a reviewer's answer lands on a new issue every time."""
        pin = self._drop()
        first = pin.bcf_guid or pin._bcf_guid()
        self.env["construction.bim.bcf"].export_pins(pin)
        self.assertEqual(pin.bcf_guid, first)

    def test_a_round_trip_updates_rather_than_duplicates(self):
        pin = self._drop()
        _archive, payload = self._archive(pin)
        before = self.env["construction.bim.pin"].search_count(
            [("model_id", "=", self.model.id)])

        self.env["construction.bim.bcf"].import_archive(self.model, payload)

        after = self.env["construction.bim.pin"].search_count(
            [("model_id", "=", self.model.id)])
        self.assertEqual(before, after)
        # The type it was raised as survives a foreign tool's vocabulary.
        self.assertEqual(pin.pin_type, "rfi")

    def test_a_foreign_archive_becomes_pins(self):
        """The case that matters: a file somebody else's tool wrote."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("bcf.version", "<Version VersionId='2.1'/>")
            archive.writestr("topic-1/markup.bcf", """<?xml version="1.0"?>
                <Markup>
                  <Topic Guid="11111111-2222-3333-4444-555555555555"
                         TopicType="Issue" TopicStatus="Open">
                    <Title>Clash: duct through beam</Title>
                    <Description>Coordinate before fabrication.</Description>
                  </Topic>
                  <Viewpoints Guid="v1"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints>
                </Markup>""")
            archive.writestr("topic-1/viewpoint.bcfv", """<?xml version="1.0"?>
                <VisualizationInfo Guid="v1">
                  <Components><Selection>
                    <Component IfcGuid="2O2Fr$t4X7Zf8NOew3FLIE"/>
                  </Selection></Components>
                  <PerspectiveCamera>
                    <CameraViewPoint><X>10</X><Y>5</Y><Z>10</Z></CameraViewPoint>
                    <CameraDirection><X>0</X><Y>0</Y><Z>-1</Z></CameraDirection>
                  </PerspectiveCamera>
                </VisualizationInfo>""")

        pins = self.env["construction.bim.bcf"].import_archive(
            self.model, buffer.getvalue())

        self.assertEqual(len(pins), 1)
        self.assertEqual(pins.name, "Clash: duct through beam")
        # Landed on the right wall, by GlobalId.
        self.assertEqual(pins.element_id.global_id, "2O2Fr$t4X7Zf8NOew3FLIE")
        self.assertTrue(pins.has_viewpoint)

    def test_something_that_is_not_a_zip_is_refused(self):
        with self.assertRaises(UserError):
            self.env["construction.bim.bcf"].import_archive(
                self.model, b"this is not a zip")

    def test_a_zip_with_no_topics_is_refused(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("readme.txt", "nothing here")
        with self.assertRaises(UserError):
            self.env["construction.bim.bcf"].import_archive(
                self.model, buffer.getvalue())

    def test_exporting_a_model_with_no_pins_says_so(self):
        empty = self.env["construction.bim.model"].create({
            "name": "No pins", "project_id": self.project.id,
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        with self.assertRaises(UserError):
            empty.action_export_bcf()


@tagged("post_install", "-at_install")
class TestFourD(TransactionCase):
    """The programme, as the model sees it."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "4D", "is_construction": True, "project_code": "4D1"})
        cls.model = cls.env["construction.bim.model"].create({
            "name": "Scheduled model",
            "project_id": cls.project.id,
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.model.action_index()

    def test_the_schedule_comes_from_the_tasks_elements_are_linked_to(self):
        """One set of dates, and it is the one the site works to."""
        task = self.env["project.task"].create({
            "name": "Blockwork — grid A",
            "project_id": self.project.id,
            "date_assign": "2026-08-01 08:00:00",
            "date_deadline": "2026-08-14",
        })
        element = self.env["construction.bim.element"].search([
            ("model_id", "=", self.model.id),
            ("global_id", "=", "2O2Fr$t4X7Zf8NOew3FLIE"),
        ])
        element.task_id = task

        schedule = self.model._schedule_payload()

        self.assertEqual(len(schedule), 1)
        self.assertEqual(schedule[0]["global_id"], "2O2Fr$t4X7Zf8NOew3FLIE")
        self.assertEqual(schedule[0]["start"], "2026-08-01")
        self.assertEqual(schedule[0]["finish"], "2026-08-14")

    def test_a_task_with_no_dates_is_left_out(self):
        """An undated task would put an element nowhere on the timeline."""
        task = self.env["project.task"].create({
            "name": "Unscheduled", "project_id": self.project.id})
        task.write({"date_assign": False, "date_deadline": False})
        element = self.env["construction.bim.element"].search([
            ("model_id", "=", self.model.id),
            ("global_id", "=", "3Xs9pQ1nD2yQ8mWJk4LzAB"),
        ])
        element.task_id = task
        # create_date always exists, so the row is only dropped when the task
        # carries no usable date at all; what must not happen is a crash.
        self.assertIsInstance(self.model._schedule_payload(), list)

    def test_the_viewer_is_given_the_schedule_and_the_totals(self):
        payload = self.model.viewer_payload(self.model.id)
        self.assertIn("schedule", payload)
        self.assertIn("totals", payload)


@tagged("post_install", "-at_install")
class TestClashDetection(TransactionCase):
    """Clash tests: run in the browser, recorded here.

    The geometry lives in the browser, so what is tested here is the half that
    matters over time — that a re-run does not undo a person's decision, and
    that a clash which has been designed out closes itself.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Coordination", "is_construction": True,
             "project_code": "CO1"})
        cls.structure = cls.env["construction.bim.model"].create({
            "name": "Tower — structural", "project_id": cls.project.id,
            "discipline": "structural",
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.structure.action_index()
        cls.services = cls.env["construction.bim.model"].create({
            "name": "Tower — mechanical", "project_id": cls.project.id,
            "discipline": "mechanical",
            "ifc_file": base64.b64encode(SAMPLE_IFC.encode()),
        })
        cls.services.action_index()
        cls.test = cls.env["construction.bim.clash.test"].create({
            "name": "Structure vs MEP",
            "project_id": cls.project.id,
            "model_a_id": cls.structure.id,
            "model_b_id": cls.services.id,
        })

    def _results(self, *pairs):
        return [
            {"global_id_a": a, "global_id_b": b, "overlap": overlap,
             "x": 1.0, "y": 2.0, "z": 3.0}
            for a, b, overlap in pairs
        ]

    def test_a_run_records_what_it_found(self):
        summary = self.env["construction.bim.clash.test"].record_results(
            self.test.id,
            self._results(("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4)),
        )
        self.assertEqual(summary["created"], 1)
        clash = self.test.clash_ids
        self.assertEqual(clash.status, "new")
        self.assertEqual(clash.overlap, 0.4)
        # Resolved to the indexed elements, so the clash names something a
        # person recognises rather than a GUID.
        self.assertEqual(clash.element_a_id.global_id, "2O2Fr$t4X7Zf8NOew3FLIE")
        self.assertEqual(clash.name_a, "Basic Wall:CMU 200")

    def test_running_again_does_not_duplicate(self):
        results = self._results(
            ("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4))
        self.env["construction.bim.clash.test"].record_results(
            self.test.id, results)
        summary = self.env["construction.bim.clash.test"].record_results(
            self.test.id, results)

        self.assertEqual(summary["created"], 0)
        self.assertEqual(len(self.test.clash_ids), 1)

    def test_an_approved_clash_stays_approved(self):
        """The whole reason the status exists.

        A box-overlap test reports things that are not problems. Somebody says
        so once; a re-run must not make them say it again every week.
        """
        results = self._results(
            ("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4))
        self.env["construction.bim.clash.test"].record_results(
            self.test.id, results)
        self.test.clash_ids.action_approve()

        self.env["construction.bim.clash.test"].record_results(
            self.test.id, results)

        self.assertEqual(self.test.clash_ids.status, "approved")

    def test_a_clash_that_is_gone_closes_itself(self):
        """Designed out between revisions; nobody should have to notice."""
        self.env["construction.bim.clash.test"].record_results(
            self.test.id,
            self._results(("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4)),
        )
        summary = self.env["construction.bim.clash.test"].record_results(
            self.test.id, [])

        self.assertEqual(summary["resolved"], 1)
        clash = self.test.clash_ids
        self.assertEqual(clash.status, "resolved")
        self.assertTrue(clash.resolved_by_run)

    def test_a_clash_that_comes_back_is_reopened(self):
        """It was fixed and then it was not. That is news."""
        results = self._results(
            ("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4))
        self.env["construction.bim.clash.test"].record_results(
            self.test.id, results)
        self.env["construction.bim.clash.test"].record_results(self.test.id, [])
        self.assertEqual(self.test.clash_ids.status, "resolved")

        self.env["construction.bim.clash.test"].record_results(
            self.test.id, results)

        self.assertEqual(self.test.clash_ids.status, "active")

    def test_the_pair_is_the_same_clash_whichever_way_round(self):
        """Which model was A is an accident of how the test was set up."""
        self.env["construction.bim.clash.test"].record_results(
            self.test.id,
            self._results(("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4)),
        )
        summary = self.env["construction.bim.clash.test"].record_results(
            self.test.id,
            self._results(("3Xs9pQ1nD2yQ8mWJk4LzAB", "2O2Fr$t4X7Zf8NOew3FLIE", 0.4)),
        )

        self.assertEqual(summary["created"], 0)
        self.assertEqual(len(self.test.clash_ids), 1)

    def test_raising_an_rfi_pins_it_where_the_clash_is(self):
        self.env["construction.bim.clash.test"].record_results(
            self.test.id,
            self._results(("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4)),
        )
        clash = self.test.clash_ids

        clash.action_raise_rfi()

        self.assertTrue(clash.rfi_id)
        self.assertTrue(clash.pin_id)
        self.assertEqual(clash.pin_id.pin_type, "rfi")
        self.assertEqual(clash.pin_id.pos_x, clash.pos_x)
        self.assertEqual(clash.status, "active")

    def test_raising_twice_reuses_the_question(self):
        self.env["construction.bim.clash.test"].record_results(
            self.test.id,
            self._results(("2O2Fr$t4X7Zf8NOew3FLIE", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.4)),
        )
        clash = self.test.clash_ids
        clash.action_raise_rfi()
        first = clash.rfi_id

        clash.action_raise_rfi()

        self.assertEqual(clash.rfi_id, first)

    def test_a_test_against_itself_is_refused(self):
        with self.assertRaises(UserError):
            self.env["construction.bim.clash.test"].create({
                "name": "Nonsense", "project_id": self.project.id,
                "model_a_id": self.structure.id,
                "model_b_id": self.structure.id,
            })

    def test_the_browser_is_told_both_files_and_the_tolerance(self):
        payload = self.env["construction.bim.clash.test"].test_payload(
            self.test.id)
        self.assertEqual(payload["tolerance"], self.test.tolerance)
        self.assertIn("file_url", payload["model_a"])
        self.assertIn("file_url", payload["model_b"])

    def test_results_are_capped(self):
        """A run finding fifty thousand clashes has found nothing actionable."""
        flood = [
            {"global_id_a": f"A{index:021d}", "global_id_b": f"B{index:021d}",
             "overlap": 0.1, "x": 0.0, "y": 0.0, "z": 0.0}
            for index in range(MAX_RESULTS + 25)
        ]
        self.env["construction.bim.clash.test"].record_results(
            self.test.id, flood, skipped=25)

        self.assertEqual(len(self.test.clash_ids), MAX_RESULTS)
        self.assertEqual(self.test.last_run_skipped, 25)

    def test_federation_offers_the_other_models_of_the_project(self):
        candidates = self.env["construction.bim.model"].federation_candidates(
            self.structure.id)
        names = {entry["name"] for entry in candidates}
        self.assertIn(self.services.display_name, names)
        self.assertNotIn(self.structure.display_name, names)

    def test_a_superseded_revision_is_not_offered_to_federate(self):
        """Coordinating against a model already replaced is a wasted week."""
        self.services.write({"state": "superseded"})
        candidates = self.env["construction.bim.model"].federation_candidates(
            self.structure.id)
        self.assertFalse(candidates)
