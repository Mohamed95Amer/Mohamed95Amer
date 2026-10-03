"""The forms a contractor already has in a folder somewhere.

A form builder that ships empty puts the whole job of writing a QA system onto
whoever opens it first, and the usual result is two forms nobody maintains.
These are the standard checks — the ones that appear on almost every job,
worded the way an engineer signing them would expect.

They are ordinary records, not fixed configuration: install them, then edit,
delete, or copy them per project. Nothing here is re-imposed on upgrade, so a
question somebody rewrote stays rewritten.
"""

from odoo import _, api, models

YES_NO = "yes_no"
TEXT = "text"
NUMBER = "number"
DATE = "date"
PHOTO = "photo"
SIGNATURE = "signature"

# (code, name, description, [(section, question, type, required)])
LIBRARY = [
    (
        "SNAG-GEN",
        "Snagging / Punch List",
        "Room-by-room snagging before handover. Failed checks become defects "
        "on the punch list in one click.",
        [
            ("Location", "Room / area reference", TEXT, True),
            ("Location", "Level / zone", TEXT, False),
            ("Floors", "Floor finish free of chips, scratches and staining", YES_NO, True),
            ("Floors", "Skirting continuous, level and sealed", YES_NO, True),
            ("Walls & ceilings", "Wall finish even, no roller marks or patching visible", YES_NO, True),
            ("Walls & ceilings", "Ceiling tiles/boards aligned, no damaged edges", YES_NO, True),
            ("Walls & ceilings", "Corners and junctions square and sealed", YES_NO, False),
            ("Doors & ironmongery", "Door closes and latches without binding", YES_NO, True),
            ("Doors & ironmongery", "Ironmongery fitted, aligned and operating", YES_NO, True),
            ("Doors & ironmongery", "Door leaf free of damage, finish intact", YES_NO, False),
            ("Joinery", "Joinery fixed square, gaps within tolerance", YES_NO, False),
            ("MEP", "Switches and sockets level, plates undamaged", YES_NO, True),
            ("MEP", "Light fittings operate, diffusers clean and aligned", YES_NO, True),
            ("MEP", "Grilles and diffusers fixed square, no damage", YES_NO, False),
            ("MEP", "Sanitaryware fixed, sealed and free of damage", YES_NO, False),
            ("Glazing", "Glazing free of scratches, seals intact", YES_NO, False),
            ("Cleaning", "Area builder-cleaned and free of debris", YES_NO, True),
            ("Evidence", "Photograph of the area", PHOTO, False),
            ("Evidence", "Photograph of any defect found", PHOTO, False),
            ("Sign-off", "Snagged by", SIGNATURE, True),
        ],
    ),
    (
        "SNAG-CLOSE",
        "Snag Close-Out Re-Inspection",
        "Re-inspection after rectification. Anything still failing goes back "
        "on the list rather than quietly closing.",
        [
            ("Reference", "Original snag reference", TEXT, True),
            ("Reference", "Room / area reference", TEXT, True),
            ("Rectification", "Defect rectified as described", YES_NO, True),
            ("Rectification", "Rectification finish matches surrounding work", YES_NO, True),
            ("Rectification", "No new damage caused by the rectification", YES_NO, True),
            ("Rectification", "Area re-cleaned after works", YES_NO, False),
            ("Evidence", "Photograph after rectification", PHOTO, True),
            ("Sign-off", "Date closed", DATE, True),
            ("Sign-off", "Accepted by", SIGNATURE, True),
        ],
    ),
    (
        "QA-PREPOUR",
        "Pre-Pour Concrete Inspection",
        "The check that has to happen before the concrete arrives — after "
        "which nothing is correctable.",
        [
            ("Reference", "Pour reference / grid location", TEXT, True),
            ("Reference", "Element type (raft, column, slab, beam)", TEXT, True),
            ("Reference", "Concrete grade specified", TEXT, True),
            ("Setting out", "Setting out checked against approved drawings", YES_NO, True),
            ("Setting out", "Levels checked and recorded", YES_NO, True),
            ("Formwork", "Formwork aligned, plumb and adequately braced", YES_NO, True),
            ("Formwork", "Formwork clean, oiled and free of debris", YES_NO, True),
            ("Formwork", "Joints sealed against grout loss", YES_NO, True),
            ("Reinforcement", "Bar size, spacing and laps match drawings", YES_NO, True),
            ("Reinforcement", "Cover to reinforcement (mm)", NUMBER, True),
            ("Reinforcement", "Spacers and chairs fixed at correct centres", YES_NO, True),
            ("Reinforcement", "Reinforcement clean, free of loose rust and oil", YES_NO, True),
            ("Reinforcement", "Starter bars and dowels in position", YES_NO, False),
            ("Embedded items", "Cast-in items, sleeves and conduits positioned", YES_NO, True),
            ("Embedded items", "Waterstops and construction joints prepared", YES_NO, False),
            ("Access & safety", "Safe access and edge protection in place", YES_NO, True),
            ("Evidence", "Photograph of prepared works", PHOTO, True),
            ("Approval", "Consultant approval to pour", YES_NO, True),
            ("Approval", "Approved by", SIGNATURE, True),
        ],
    ),
    (
        "QA-POSTPOUR",
        "Post-Pour Concrete Record",
        "What was actually poured, and how it was cured — the record a "
        "structural query comes back to years later.",
        [
            ("Reference", "Pour reference / grid location", TEXT, True),
            ("Pour", "Date of pour", DATE, True),
            ("Pour", "Volume placed (m³)", NUMBER, True),
            ("Pour", "Delivery note numbers", TEXT, True),
            ("Testing", "Slump measured (mm)", NUMBER, True),
            ("Testing", "Slump within specification", YES_NO, True),
            ("Testing", "Concrete temperature (°C)", NUMBER, False),
            ("Testing", "Cubes taken and identified", YES_NO, True),
            ("Testing", "Number of cubes taken", NUMBER, False),
            ("Placement", "Compaction carried out throughout", YES_NO, True),
            ("Placement", "Cold joints avoided / treated", YES_NO, True),
            ("Curing", "Curing method applied", TEXT, True),
            ("Curing", "Curing started within specified time", YES_NO, True),
            ("Evidence", "Photograph of completed pour", PHOTO, False),
            ("Sign-off", "Recorded by", SIGNATURE, True),
        ],
    ),
    (
        "QA-BLOCK",
        "Blockwork / Masonry Inspection",
        "Coursing, ties and joints, checked before anything is plastered over.",
        [
            ("Reference", "Wall reference / grid", TEXT, True),
            ("Materials", "Block type and grade as specified", YES_NO, True),
            ("Materials", "Mortar mix as specified", YES_NO, True),
            ("Workmanship", "Coursing level, perpends aligned", YES_NO, True),
            ("Workmanship", "Wall plumb within tolerance", YES_NO, True),
            ("Workmanship", "Joints fully filled and struck", YES_NO, True),
            ("Workmanship", "Wall ties / restraint straps at correct centres", YES_NO, True),
            ("Workmanship", "Movement joints formed as detailed", YES_NO, False),
            ("Openings", "Lintels bearing correct both sides", YES_NO, True),
            ("Openings", "Openings dimensionally correct", YES_NO, True),
            ("MEP coordination", "Chases and openings coordinated with MEP", YES_NO, True),
            ("Evidence", "Photograph of completed wall", PHOTO, False),
            ("Sign-off", "Inspected by", SIGNATURE, True),
        ],
    ),
    (
        "QA-MEP1",
        "MEP First Fix Inspection",
        "Containment, routing and support before ceilings and walls close up.",
        [
            ("Reference", "Area / level", TEXT, True),
            ("Reference", "Service (electrical, mechanical, plumbing)", TEXT, True),
            ("Routing", "Route matches coordinated drawings", YES_NO, True),
            ("Routing", "Clearances to other services maintained", YES_NO, True),
            ("Support", "Supports and hangers at specified centres", YES_NO, True),
            ("Support", "Fixings suitable for the substrate", YES_NO, True),
            ("Containment", "Containment continuous and earthed where required", YES_NO, True),
            ("Containment", "Cables installed without damage to insulation", YES_NO, False),
            ("Pipework", "Pipework falls correct where required", YES_NO, False),
            ("Pipework", "Pressure test carried out and passed", YES_NO, False),
            ("Pipework", "Test pressure held (bar)", NUMBER, False),
            ("Penetrations", "Penetrations formed in approved positions", YES_NO, True),
            ("Penetrations", "Firestopping scheduled for all penetrations", YES_NO, True),
            ("Evidence", "Photograph before closing up", PHOTO, True),
            ("Sign-off", "Inspected by", SIGNATURE, True),
        ],
    ),
    (
        "QA-DUCT",
        "HVAC Ductwork Installation",
        "Ductwork installed, supported and tested before insulation.",
        [
            ("Reference", "System reference / area", TEXT, True),
            ("Installation", "Duct sizes and route as per drawings", YES_NO, True),
            ("Installation", "Joints sealed to specification", YES_NO, True),
            ("Installation", "Supports at specified centres", YES_NO, True),
            ("Installation", "Fire dampers installed in correct positions", YES_NO, True),
            ("Installation", "Access panels fitted and reachable", YES_NO, True),
            ("Testing", "Leakage test carried out", YES_NO, True),
            ("Testing", "Measured leakage within class limit", YES_NO, True),
            ("Cleanliness", "Ductwork internally clean and capped", YES_NO, True),
            ("Insulation", "Insulation applied and vapour sealed", YES_NO, False),
            ("Evidence", "Photograph of installation", PHOTO, False),
            ("Sign-off", "Inspected by", SIGNATURE, True),
        ],
    ),
    (
        "QA-FIRESTOP",
        "Firestopping Inspection",
        "Every penetration, photographed. The one record a fire officer will "
        "ask for and nobody can reconstruct afterwards.",
        [
            ("Reference", "Penetration reference / location", TEXT, True),
            ("Reference", "Fire rating required", TEXT, True),
            ("Substrate", "Substrate type (wall / floor, construction)", TEXT, True),
            ("Substrate", "Opening dimensions within approved limits", YES_NO, True),
            ("System", "Approved system used for this configuration", YES_NO, True),
            ("System", "Product batch / reference recorded", TEXT, False),
            ("Installation", "Installed in accordance with the approval", YES_NO, True),
            ("Installation", "Annular gap correctly filled", YES_NO, True),
            ("Installation", "Depth of seal correct", YES_NO, True),
            ("Identification", "Penetration labelled", YES_NO, True),
            ("Evidence", "Photograph before sealing", PHOTO, True),
            ("Evidence", "Photograph after sealing", PHOTO, True),
            ("Sign-off", "Installed by", TEXT, True),
            ("Sign-off", "Inspected by", SIGNATURE, True),
        ],
    ),
    (
        "QA-WPROOF",
        "Waterproofing Inspection",
        "Substrate, application and flood test — before anything is laid over it.",
        [
            ("Reference", "Area reference", TEXT, True),
            ("Substrate", "Substrate sound, clean and dry", YES_NO, True),
            ("Substrate", "Falls to outlets correct", YES_NO, True),
            ("Substrate", "Corners and upstands prepared", YES_NO, True),
            ("Application", "Primer applied where required", YES_NO, False),
            ("Application", "Number of coats applied", NUMBER, True),
            ("Application", "Membrane continuous, no pinholes or blisters", YES_NO, True),
            ("Application", "Upstand height (mm)", NUMBER, True),
            ("Details", "Outlets and penetrations detailed", YES_NO, True),
            ("Testing", "Flood test carried out", YES_NO, True),
            ("Testing", "Flood test duration (hours)", NUMBER, False),
            ("Testing", "No leakage observed", YES_NO, True),
            ("Evidence", "Photograph of completed membrane", PHOTO, True),
            ("Sign-off", "Inspected by", SIGNATURE, True),
        ],
    ),
    (
        "QA-FINISH",
        "Finishes Inspection",
        "Plaster, paint and tiling checked against the approved sample.",
        [
            ("Reference", "Room / area reference", TEXT, True),
            ("Reference", "Finish type", TEXT, True),
            ("Preparation", "Substrate prepared and free of defects", YES_NO, True),
            ("Preparation", "Approved sample / mock-up referenced", YES_NO, True),
            ("Application", "Finish even, free of cracks and undulation", YES_NO, True),
            ("Application", "Colour and texture match approved sample", YES_NO, True),
            ("Application", "Edges, corners and junctions neat", YES_NO, True),
            ("Tiling", "Tile setting out symmetrical, cuts acceptable", YES_NO, False),
            ("Tiling", "Joints uniform and fully grouted", YES_NO, False),
            ("Tiling", "No hollow tiles on tapping", YES_NO, False),
            ("Protection", "Completed work protected", YES_NO, True),
            ("Evidence", "Photograph of finished area", PHOTO, False),
            ("Sign-off", "Inspected by", SIGNATURE, True),
        ],
    ),
    (
        "QA-MATERIAL",
        "Material Delivery Inspection",
        "What arrived, whether it was approved, and what condition it was in.",
        [
            ("Delivery", "Delivery note number", TEXT, True),
            ("Delivery", "Date received", DATE, True),
            ("Delivery", "Supplier", TEXT, True),
            ("Delivery", "Material description", TEXT, True),
            ("Delivery", "Quantity received", NUMBER, True),
            ("Compliance", "Material matches approved submittal", YES_NO, True),
            ("Compliance", "Certificates / test reports provided", YES_NO, True),
            ("Compliance", "Shelf life / expiry acceptable", YES_NO, False),
            ("Condition", "Free of damage in transit", YES_NO, True),
            ("Condition", "Stored correctly on site", YES_NO, True),
            ("Evidence", "Photograph of delivery", PHOTO, False),
            ("Decision", "Accepted / rejected", TEXT, True),
            ("Sign-off", "Received by", SIGNATURE, True),
        ],
    ),
    (
        "HSE-WALK",
        "Site Safety Walk",
        "The weekly walk. Kept short enough that it actually gets done.",
        [
            ("Access", "Access routes clear and defined", YES_NO, True),
            ("Access", "Edge protection complete and secure", YES_NO, True),
            ("Access", "Scaffolds tagged and within inspection date", YES_NO, True),
            ("Access", "Ladders and access equipment in good condition", YES_NO, True),
            ("Housekeeping", "Work areas free of debris and trip hazards", YES_NO, True),
            ("Housekeeping", "Waste segregated and skips not overflowing", YES_NO, False),
            ("PPE", "Correct PPE worn by all operatives", YES_NO, True),
            ("Permits", "High-risk work covered by a valid permit", YES_NO, True),
            ("Electrical", "Temporary electrics safe, no damaged leads", YES_NO, True),
            ("Plant", "Plant operators certified, exclusion zones observed", YES_NO, True),
            ("Emergency", "Fire points and escape routes unobstructed", YES_NO, True),
            ("Emergency", "First aid and emergency contacts displayed", YES_NO, False),
            ("Findings", "Unsafe conditions observed", TEXT, False),
            ("Evidence", "Photograph of any finding", PHOTO, False),
            ("Sign-off", "Walked by", SIGNATURE, True),
        ],
    ),
    (
        "QA-HANDOVER",
        "Handover / Taking-Over Inspection",
        "The formal walk with the client. Everything outstanding gets listed "
        "here rather than argued about later.",
        [
            ("Reference", "Area / unit reference", TEXT, True),
            ("Reference", "Date of inspection", DATE, True),
            ("Completeness", "All works complete in accordance with contract", YES_NO, True),
            ("Completeness", "Outstanding snags listed and agreed", YES_NO, True),
            ("Completeness", "Number of outstanding items", NUMBER, False),
            ("Systems", "MEP systems tested and commissioned", YES_NO, True),
            ("Systems", "Commissioning records provided", YES_NO, True),
            ("Systems", "Life safety systems demonstrated", YES_NO, True),
            ("Documentation", "As-built drawings provided", YES_NO, True),
            ("Documentation", "O&M manuals provided", YES_NO, True),
            ("Documentation", "Warranties and guarantees provided", YES_NO, True),
            ("Documentation", "Training delivered to operating staff", YES_NO, False),
            ("Condition", "Area clean and ready for occupation", YES_NO, True),
            ("Evidence", "Photograph of the area at handover", PHOTO, False),
            ("Sign-off", "Contractor", SIGNATURE, True),
            ("Sign-off", "Client / consultant", SIGNATURE, True),
        ],
    ),
]


class ConstructionFormLibrary(models.AbstractModel):
    """Installs the standard forms, and can be re-run without duplicating."""

    _name = "construction.form.library"
    _description = "Standard Form Library"

    @api.model
    def _install_library(self):
        """Create any standard template the company does not already have.

        Matching is on the template code, so a template somebody renamed,
        rewrote or deleted is left alone — re-running adds what is missing
        rather than restoring what was deliberately changed.
        """
        template_model = self.env["construction.form.template"].sudo()
        question_model = self.env["construction.form.question"].sudo()
        company = self.env.company

        existing = set(template_model.with_context(active_test=False).search([
            ("company_id", "=", company.id),
        ]).mapped("code"))

        created = template_model.browse()
        for code, name, description, questions in LIBRARY:
            if code in existing:
                continue
            template = template_model.create({
                "name": name,
                "code": code,
                "company_id": company.id,
                "description": f"<p>{description}</p>",
            })
            question_model.create([{
                "template_id": template.id,
                "sequence": (index + 1) * 10,
                "section": section,
                "name": question,
                "answer_type": answer_type,
                "required": required,
            } for index, (section, question, answer_type, required)
                in enumerate(questions)])
            created |= template
        return created

    @api.model
    def action_install_library(self):
        """Button target: install and then show what is now available."""
        created = self._install_library()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "type": "success" if created else "info",
                "message": (
                    _("%s standard form(s) added.", len(created)) if created
                    else _("Every standard form is already installed.")
                ),
                "next": {"type": "ir.actions.act_window_close"},
            },
        }
