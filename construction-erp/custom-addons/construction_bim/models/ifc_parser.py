"""A dependency-free reader for the parts of IFC we index.

IFC's usual file form (STEP / ISO-10303-21) is line-based text:

    #142= IFCWALLSTANDARDCASE('2O2Fr$t4X7Zf8NOew3FLIE',#41,'Basic Wall',$,...);

The identity of each element is read here — its GlobalId, its type, its name,
which storey contains it — together with its property sets and quantities.
Geometry, which is the hard part of IFC, is left to the viewer in the browser.
That keeps the server free of a heavyweight IFC toolchain, and means a model
can be indexed, quantified and linked to records on a machine with no graphics
stack at all.

Quantities are worth the extra parsing because they are what turns a model from
a picture into a commercial document: an IfcElementQuantity carries the volume
of concrete in that wall, and a wall with a volume can be checked against the
bill item somebody is being paid for.
"""

import re

ENTITY = re.compile(
    r"^#(?P<id>\d+)\s*=\s*(?P<type>IFC[A-Z0-9_]+)\s*\((?P<args>.*)\)\s*;\s*$",
    re.IGNORECASE,
)

# Spatial containers and relationships we follow to place an element.
STOREY_TYPE = "IFCBUILDINGSTOREY"
CONTAINMENT = "IFCRELCONTAINEDINSPATIALSTRUCTURE"
AGGREGATES = "IFCRELAGGREGATES"

# Property and quantity machinery. IFC keeps these outside the element and
# joins them with a relationship, so three entity families have to be read
# before a wall can say how much concrete is in it.
DEFINES_BY_PROPERTIES = "IFCRELDEFINESBYPROPERTIES"
PROPERTY_SET = "IFCPROPERTYSET"
ELEMENT_QUANTITY = "IFCELEMENTQUANTITY"
SINGLE_VALUE = "IFCPROPERTYSINGLEVALUE"

# IfcQuantityLength/Area/Volume/Count/Weight are all IfcPhysicalSimpleQuantity:
# (Name, Description, Unit, Value, Formula). The measure is the fourth
# argument — the third is the unit, and reading it as the value gives every
# element a quantity of zero.
QUANTITY_TYPES = {
    "IFCQUANTITYLENGTH": "length",
    "IFCQUANTITYAREA": "area",
    "IFCQUANTITYVOLUME": "volume",
    "IFCQUANTITYCOUNT": "count",
    "IFCQUANTITYWEIGHT": "weight",
}

# A wrapped measure: IFCTEXT('Concrete'), IFCREAL(2.5), IFCBOOLEAN(.T.).
WRAPPED = re.compile(r"^IFC[A-Z]+\((?P<value>.*)\)$", re.IGNORECASE)

# Entities that are not physical products; indexing them would bury the real
# elements under thousands of ownership, unit and geometry records.
SKIP_PREFIXES = (
    "IFCCARTESIAN", "IFCDIRECTION", "IFCAXIS", "IFCOWNER", "IFCPERSON",
    "IFCORGANIZATION", "IFCAPPLICATION", "IFCUNIT", "IFCSI", "IFCMEASURE",
    "IFCPOLYLINE", "IFCPRODUCTDEFINITION", "IFCSHAPE", "IFCGEOMETRIC",
    "IFCLOCALPLACEMENT", "IFCPROPERTY", "IFCREL", "IFCEXTRUDED",
    "IFCCLOSEDSHELL", "IFCFACE", "IFCPLANE", "IFCCIRCLE", "IFCARBITRARY",
    "IFCCOLOUR", "IFCSURFACE", "IFCPRESENTATION", "IFCSTYLED", "IFCMATERIAL",
    "IFCRECTANGLE", "IFCPROFILE", "IFCSWEPT", "IFCBOUNDING", "IFCTRIMMED",
)

# An IFC GlobalId is a 22-character base64 GUID over this alphabet. Checking
# the shape of the value matters more than the blacklist above: plenty of
# entities put an enumeration or a number first, and indexing those produced
# dozens of "elements" all sharing a GlobalId of '.AREA.'.
GLOBAL_ID = re.compile(r"^[0-9A-Za-z_$]{22}$")


def split_args(text):
    """Split a STEP argument list on top-level commas.

    Commas inside quotes and nested parentheses are part of a value, not
    separators — a naive split mangles every name containing a comma.
    """
    args, depth, current, in_quote = [], 0, [], False
    index = 0
    while index < len(text):
        char = text[index]
        if in_quote:
            if char == "'":
                # A doubled quote is an escaped quote inside a STEP string.
                if index + 1 < len(text) and text[index + 1] == "'":
                    current.append("'")
                    index += 2
                    continue
                in_quote = False
            else:
                current.append(char)
            index += 1
            continue
        if char == "'":
            in_quote = True
        elif char in "([":
            depth += 1
            current.append(char)
        elif char in ")]":
            depth -= 1
            current.append(char)
        elif char == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(char)
        index += 1
    args.append("".join(current).strip())
    return args


def refs(value):
    """Every #id referenced inside a STEP argument."""
    return [int(n) for n in re.findall(r"#(\d+)", value or "")]


# Read for their contents, never indexed as elements of their own. An
# IfcElementQuantity is an IfcRoot and so carries a GlobalId, which is enough
# to make it look like a wall to a filter that only checks the first argument.
NOT_AN_ELEMENT = (PROPERTY_SET, ELEMENT_QUANTITY)

# Read so elements can be placed, but not themselves elements. IfcSpace is
# deliberately absent: a room is something an FM team raises tickets against.
SPATIAL_CONTAINERS = ("IFCPROJECT", "IFCSITE", "IFCBUILDING", STOREY_TYPE)


def is_product(ifc_type):
    upper = ifc_type.upper()
    if upper == STOREY_TYPE:
        return True
    if upper in NOT_AN_ELEMENT:
        return False
    return not any(upper.startswith(prefix) for prefix in SKIP_PREFIXES)


def unwrap(value):
    """Strip an IFC measure wrapper and quotes from a property value."""
    text = (value or "").strip()
    match = WRAPPED.match(text)
    if match:
        text = match.group("value").strip()
    if text in ("$", "*", ""):
        return ""
    # STEP booleans.
    if text in (".T.", ".F."):
        return "Yes" if text == ".T." else "No"
    return text.strip("'")


def as_number(value):
    try:
        return float(unwrap(value))
    except (TypeError, ValueError):
        return 0.0


def parse(content):
    """Index an IFC file.

    Returns (elements, storeys). Each element carries step_id, ifc_type,
    global_id, name, storey_step_id, a ``properties`` list of
    (pset, name, value) and a ``quantities`` list of (kind, name, value).
    """
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="replace")

    entities = {}
    containment = []
    # Property machinery, resolved after the whole file is read: IFC is free to
    # reference an entity defined further down the file, so nothing can be
    # joined up on the first pass.
    single_values = {}
    quantity_values = {}
    property_sets = {}
    element_quantities = {}
    defines = []
    # STEP allows an entity to span several physical lines, so the file is
    # rejoined on the semicolon that actually terminates a record.
    for raw in re.split(r";\s*\n", content):
        line = raw.strip()
        if not line:
            continue
        if not line.endswith(";"):
            line += ";"
        match = ENTITY.match(line.replace("\n", " "))
        if not match:
            continue
        ifc_type = match.group("type").upper()
        args = split_args(match.group("args"))
        step_id = int(match.group("id"))
        if ifc_type == CONTAINMENT and len(args) >= 6:
            containment.append((refs(args[4]), refs(args[5])))
            continue
        if ifc_type == DEFINES_BY_PROPERTIES and len(args) >= 6:
            defines.append((refs(args[4]), refs(args[5])))
            continue
        if ifc_type == SINGLE_VALUE and len(args) >= 3:
            single_values[step_id] = (unwrap(args[0]), unwrap(args[2]))
            continue
        if ifc_type in QUANTITY_TYPES and len(args) >= 4:
            quantity_values[step_id] = (
                QUANTITY_TYPES[ifc_type], unwrap(args[0]), as_number(args[3]))
            continue
        if ifc_type == PROPERTY_SET and len(args) >= 5:
            property_sets[step_id] = (unwrap(args[2]), refs(args[4]))
            continue
        if ifc_type == ELEMENT_QUANTITY and len(args) >= 6:
            element_quantities[step_id] = (unwrap(args[2]), refs(args[5]))
            continue
        if not is_product(ifc_type):
            continue
        candidate = args[0] if args else ""
        entities[step_id] = {
            "step_id": step_id,
            "ifc_type": ifc_type,
            "global_id": candidate if GLOBAL_ID.match(candidate or "") else "",
            "name": args[2] if len(args) > 2 and args[2] not in ("$", "*") else "",
            "storey_step_id": 0,
            "properties": [],
            "quantities": [],
        }

    for contained, containers in containment:
        storey = containers[0] if containers else 0
        for step_id in contained:
            if step_id in entities:
                entities[step_id]["storey_step_id"] = storey

    # Join the property machinery onto the elements it describes. One
    # definition is routinely shared by hundreds of elements — every door of a
    # type points at the same Pset — so this walks the relationship rather than
    # copying anything during the first pass.
    for related, definition in defines:
        for definition_id in definition:
            pset = property_sets.get(definition_id)
            quantity_set = element_quantities.get(definition_id)
            if not pset and not quantity_set:
                continue
            for step_id in related:
                element = entities.get(step_id)
                if not element:
                    continue
                if pset:
                    set_name, property_ids = pset
                    element["properties"].extend(
                        (set_name, name, value)
                        for name, value in (
                            single_values[p] for p in property_ids
                            if p in single_values)
                        if value != ""
                    )
                if quantity_set:
                    _set_name, quantity_ids = quantity_set
                    element["quantities"].extend(
                        quantity_values[q] for q in quantity_ids
                        if q in quantity_values
                    )

    storeys = {
        step_id: entity for step_id, entity in entities.items()
        if entity["ifc_type"] == STOREY_TYPE
    }
    # The spatial structure is where elements live, not something anybody
    # raises an RFI against. Leaving the project, site, building and storey in
    # the element list inflated every count and put three rows nobody can act
    # on at the top of every register. Storeys are still returned above, which
    # is what names the levels.
    elements = [
        e for e in entities.values()
        if e["global_id"] and e["ifc_type"] not in SPATIAL_CONTAINERS
    ]
    return elements, storeys
