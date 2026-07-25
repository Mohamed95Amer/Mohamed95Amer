"""Generate a small but valid IFC4 model with real geometry.

Three walls and a slab on one storey, each an extruded rectangle. Enough for a
viewer to draw and for the element index to have something to link to.
"""
ENT = []

def add(text):
    ENT.append(text)
    return len(ENT)  # step ids are 1-based and sequential

def box(name, guid, placement_ref, x, y, length, width, height, ifc_type):
    """One extruded rectangular solid placed in the storey."""
    p2d = add(f"IFCCARTESIANPOINT((0.,0.))")
    dirx = add("IFCDIRECTION((1.,0.))")
    ax2d = add(f"IFCAXIS2PLACEMENT2D(#{p2d},#{dirx})")
    prof = add(f"IFCRECTANGLEPROFILEDEF(.AREA.,$,#{ax2d},{length},{width})")
    origin = add(f"IFCCARTESIANPOINT(({x},{y},0.))")
    zdir = add("IFCDIRECTION((0.,0.,1.))")
    xdir = add("IFCDIRECTION((1.,0.,0.))")
    ax3d = add(f"IFCAXIS2PLACEMENT3D(#{origin},#{zdir},#{xdir})")
    extdir = add("IFCDIRECTION((0.,0.,1.))")
    solid = add(f"IFCEXTRUDEDAREASOLID(#{prof},#{ax3d},#{extdir},{height})")
    shape = add(f"IFCSHAPEREPRESENTATION(#{CTX},'Body','SweptSolid',(#{solid}))")
    pds = add(f"IFCPRODUCTDEFINITIONSHAPE($,$,(#{shape}))")
    lp = add(f"IFCLOCALPLACEMENT(#{placement_ref},#{IDENTITY})")
    return add(
        f"{ifc_type}('{guid}',#{OWNER},'{name}',$,$,#{lp},#{pds},$)")

# --- header context -------------------------------------------------------
PERSON = add("IFCPERSON($,$,'Majal',$,$,$,$,$)")
ORG = add("IFCORGANIZATION($,'Majal',$,$,$)")
PANDO = add(f"IFCPERSONANDORGANIZATION(#{PERSON},#{ORG},$)")
APP = add(f"IFCAPPLICATION(#{ORG},'1.0','Majal ERP','MAJAL')")
OWNER = add(f"IFCOWNERHISTORY(#{PANDO},#{APP},$,.ADDED.,$,$,$,0)")

O = add("IFCCARTESIANPOINT((0.,0.,0.))")
Z = add("IFCDIRECTION((0.,0.,1.))")
X = add("IFCDIRECTION((1.,0.,0.))")
IDENTITY = add(f"IFCAXIS2PLACEMENT3D(#{O},#{Z},#{X})")
CTX = add(
    f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#{IDENTITY},$)")

LEN_U = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
AREA_U = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")
VOL_U = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")
UNITS = add(f"IFCUNITASSIGNMENT((#{LEN_U},#{AREA_U},#{VOL_U}))")

SITE_PL = add(f"IFCLOCALPLACEMENT($,#{IDENTITY})")
PROJECT = add(
    f"IFCPROJECT('0YvctVUKr0kugbFTf53O9L',#{OWNER},'Al Noor Tower',$,$,$,$,"
    f"(#{CTX}),#{UNITS})")
SITE = add(
    f"IFCSITE('1SiteGuid0000000000000',#{OWNER},'Site',$,$,#{SITE_PL},$,$,"
    ".ELEMENT.,$,$,$,$,$)")
BLD_PL = add(f"IFCLOCALPLACEMENT(#{SITE_PL},#{IDENTITY})")
BUILDING = add(
    f"IFCBUILDING('1BldgGuid0000000000000',#{OWNER},'Tower',$,$,#{BLD_PL},$,$,"
    ".ELEMENT.,$,$,$)")
STOREY_PL = add(f"IFCLOCALPLACEMENT(#{BLD_PL},#{IDENTITY})")
STOREY = add(
    f"IFCBUILDINGSTOREY('1PbCwGKuT9KPSKPuXfeXpk',#{OWNER},'Level 03',$,$,"
    f"#{STOREY_PL},$,$,.ELEMENT.,9.)")

# --- the elements ---------------------------------------------------------
walls = [
    ("Basic Wall:CMU 200 — grid A", "2O2Fr$t4X7Zf8NOew3FLIE", 0.0, 0.0, 8.0, 0.2, 3.0, "IFCWALL"),
    ("Basic Wall:Curtain, grid F", "3Xs9pQ1nD2yQ8mWJk4LzAB", 0.0, 6.0, 8.0, 0.2, 3.0, "IFCWALL"),
    ("Basic Wall:Core wall", "4Kl0mNoPq1RsT2uVwXyZaB", -4.0, 3.0, 0.2, 6.0, 3.0, "IFCWALL"),
]
element_ids = []
for name, guid, x, y, length, width, height, ifc_type in walls:
    element_ids.append(box(name, guid, STOREY_PL, x, y, length, width, height, ifc_type))
element_ids.append(
    box("Floor slab L03", "5SlAbGuId0000000000000", STOREY_PL,
        0.0, 3.0, 8.4, 6.4, 0.25, "IFCSLAB"))

# --- spatial structure ----------------------------------------------------
add(f"IFCRELAGGREGATES('1AggProj0000000000000A',#{OWNER},$,$,#{PROJECT},(#{SITE}))")
add(f"IFCRELAGGREGATES('1AggSite0000000000000B',#{OWNER},$,$,#{SITE},(#{BUILDING}))")
add(f"IFCRELAGGREGATES('1AggBldg0000000000000C',#{OWNER},$,$,#{BUILDING},(#{STOREY}))")
contained = ",".join(f"#{i}" for i in element_ids)
add(f"IFCRELCONTAINEDINSPATIALSTRUCTURE('1RelCont000000000000D0',#{OWNER},$,$,"
    f"({contained}),#{STOREY})")

body = "\n".join(f"#{i + 1}= {text};" for i, text in enumerate(ENT))
print(f"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('al-noor-l03.ifc','2026-07-25T10:00:00',('Majal'),('Majal'),'Majal ERP','Majal ERP','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
{body}
ENDSEC;
END-ISO-10303-21;""")
