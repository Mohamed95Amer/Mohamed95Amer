"""A dependency-free reader for the parts of IFC we index.

IFC's usual file form (STEP / ISO-10303-21) is line-based text:

    #142= IFCWALLSTANDARDCASE('2O2Fr$t4X7Zf8NOew3FLIE',#41,'Basic Wall',$,...);

Only the identity of each element is needed here — its GlobalId, its type, its
name and which storey contains it — so the geometry, which is the hard part of
IFC, is left to the viewer in the browser. That keeps the server free of a
heavyweight IFC toolchain, and means a model can be indexed and linked to
records on a machine with no graphics stack at all.
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


def is_product(ifc_type):
    upper = ifc_type.upper()
    if upper == STOREY_TYPE:
        return True
    return not any(upper.startswith(prefix) for prefix in SKIP_PREFIXES)


def parse(content):
    """Index an IFC file.

    Returns (elements, storeys) where elements is a list of dicts with
    step_id, ifc_type, global_id, name and storey_step_id.
    """
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="replace")

    entities = {}
    containment = []
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
        if not is_product(ifc_type):
            continue
        candidate = args[0] if args else ""
        entities[step_id] = {
            "step_id": step_id,
            "ifc_type": ifc_type,
            "global_id": candidate if GLOBAL_ID.match(candidate or "") else "",
            "name": args[2] if len(args) > 2 and args[2] not in ("$", "*") else "",
            "storey_step_id": 0,
        }

    for contained, containers in containment:
        storey = containers[0] if containers else 0
        for step_id in contained:
            if step_id in entities:
                entities[step_id]["storey_step_id"] = storey

    storeys = {
        step_id: entity for step_id, entity in entities.items()
        if entity["ifc_type"] == STOREY_TYPE
    }
    elements = [e for e in entities.values() if e["global_id"]]
    return elements, storeys
