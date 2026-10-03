# BIM

What `construction_bim` does, how it does it, and what it deliberately does not
do. The last section is the important one: a BIM system that is vague about its
limits gets trusted for things it cannot do, and the first person to find out is
whoever was relying on it.

## The idea

A model that can be spun around is a picture. The module exists to make it a
record: every element in an IFC file carries a **GlobalId**, a 22-character
base64 GUID that authoring tools promise to keep stable across exports, so an
RFI raised against a wall stays attached to that wall through revision after
revision. Everything else here follows from that one identity.

## What is indexed

`models/ifc_parser.py` reads IFC's STEP form (ISO-10303-21) with no third-party
library. It pulls out:

- **Elements** — GlobalId, IFC type, name, and the storey containing them, via
  `IfcRelContainedInSpatialStructure`.
- **Property sets** — `IfcPropertySet` → `IfcPropertySingleValue`, joined to
  elements through `IfcRelDefinesByProperties`. Stored as rows, not a blob, so
  "every door with a 60-minute fire rating" is a query.
- **Quantities** — `IfcElementQuantity` → `IfcQuantityLength/Area/Volume/Count/
  Weight`. Stored as columns on the element so they can be totalled by
  `read_group` rather than by parsing a thousand JSON documents.

Values are kept as text. IFC types them, but the types are inconsistent between
authoring tools — a fire rating arrives as `IFCLABEL('60')` from one and
`IFCREAL(60.)` from another — and coercing them here would silently lose
whichever the model actually said.

Geometry is **not** parsed server-side. It is drawn in the browser by web-ifc,
which keeps the server free of a graphics toolchain and means a model can be
indexed on a machine with no GPU.

## Quantities and the bill

Every `construction.boq.line` linked to model elements gains a **model
quantity** and a **variance** against the billed quantity. Which measure answers
a line is taken from its unit of measure — cubic metres → volume, square metres
→ area — mapped by UoM-category xmlid rather than by category name, which is
translated and would stop matching in Arabic. A unit the model cannot measure
(hours, lump sum) leaves the measure blank rather than guessing, because a wrong
default reads as a real variance.

**Nothing overwrites the bill.** The quantity somebody is being paid against is
a commercial position, not a number a re-export gets to change.

### Units

Quantities are reported in whatever unit the file was written in. The parser
does not currently read `IfcUnitAssignment`, so a model authored in millimetres
will report millimetres and the takeoff will not say so. Check the export
settings of the authoring tool before treating a total as cubic metres. This is
a known gap, not a subtlety — it is listed under limitations below.

## 4D

The date slider in the viewer drives element visibility from the **dates of the
programme tasks elements are linked to**. There is no separate schedule stored
in the model: a date moved in the Gantt is a date moved here, with nothing to
re-link and nothing to keep in step. An element with no task is treated as
existing throughout, because a model is not a complete programme and hiding
everything nobody has scheduled would leave an empty screen on day one.

## BCF 2.1

Issues leave the system as `.bcfzip` archives — one folder per topic, each with
a `markup.bcf` and a `viewpoint.bcfv` — and come back the same way. This is how
they reach the people who answer them, who work in Solibri, Navisworks, Revit,
Tekla, BIMcollab or Revizto and will not log in here to read a pin.

- Topics are matched on **GUID**, so a file that has been round-tripped through
  a reviewer's tool updates the issues rather than duplicating every one.
- A pin's **camera** is exported as the viewpoint, so the topic opens on what
  the person raising it was looking at. A pin with no saved view still exports a
  camera standing back from the point, because a topic that opens inside a wall
  is a topic nobody can read.
- The **selected component** is written by IfcGuid, which is what lands the
  topic on the right wall in the other tool.
- A topic raised here as a defect **stays** a defect on import, even if the
  reviewer's tool called it something from its own vocabulary.

Implemented: topics, comments, viewpoints, component selection. Not implemented:
BCF's project and extension schemas, which describe a server-side issue-tracking
API rather than a file, and the BCF REST API.

## Revision comparison

Two revisions of the same discipline are differenced on GlobalId: added,
removed, renamed, moved storey, changed quantity. Removals that carried an RFI,
defect, task or bill item are flagged, because that is the one a design manager
has to deal with today.

This is an **index** comparison, not a geometric one. Two walls can have
identical quantities and sit a metre apart, and this will not notice. What is
claimed is exactly what is checked: identity, storey, name and measured
quantity.

## Why not DWG

DWG is a closed, undocumented Autodesk format. The only complete readers are
Autodesk's own libraries and the Open Design Alliance's, both of which require
paid membership and neither of which can be redistributed under LGPL-3 — which
is the licence this whole suite ships under. Shipping a half-working DWG reader
would be worse than shipping none: a drawing that opens but silently drops
layers is a drawing somebody builds from.

The supported paths are **IFC** for models and **PDF** for drawings
(`construction_drawing`, with pin-on-sheet in `construction_pin`). Every
authoring tool that produces DWG can export both.

## Federation and clash detection

Several models load into one scene, each tinted by discipline and toggled
independently. Overlays are for coordination, not record-keeping: pins and
links stay with the host model, because "which model is this pin on" has to
have one answer.

A **clash test** names two models and a tolerance. It runs in the browser,
where the geometry is, and the results are recorded here. What it detects is
**axis-aligned bounding-box overlap** beyond the tolerance — a broad phase, and
the same first step every clash engine takes, but *not* triangle-precise: a
duct passing cleanly through a door opening has overlapping boxes and will be
reported. Elements are bucketed into a uniform grid sized from the median
element, because every-element-against-every-element on two ten-thousand-element
models is a hundred million comparisons and the browser would simply stop.

The status workflow is the part that matters over weeks:

- A clash somebody **approved** as "seen, not a problem" stays approved through
  every future run. Without that, a box-overlap test is unusable by the second
  week.
- A clash the latest run no longer finds **resolves itself**, flagged as closed
  by the run rather than by a person.
- A resolved clash that comes back is **reopened**, because that is news.
- Pairs are matched irrespective of which model was A — that is an accident of
  how the test was set up.

Any clash becomes an RFI with a pin at the intersection point, in one click.

## Limitations

Stated plainly, because the alternative is somebody discovering them on a job:

- **Clash testing is bounding-box, not triangle-precise.** See above. It will
  report things that are not problems; approving them is how you tell it so.
- **Clash results are capped** at 2000 per run. A run finding fifty thousand
  overlaps has found nothing anybody can act on, and the count skipped is kept.
- **Units are not read** from `IfcUnitAssignment` — see above. This applies to
  the clash tolerance too, which is in the model's own units.
- **Comparison is not geometric** — see above.
- **No IFC writing.** The module reads models and writes BCF; it never edits or
  re-exports an IFC file.
- **Large models.** Indexing is line-based and cheap, but capped at 300 MB per
  file. The browser viewer is the real limit: web-ifc will struggle with a
  federated model of a whole tower on a laptop. Split by discipline.
