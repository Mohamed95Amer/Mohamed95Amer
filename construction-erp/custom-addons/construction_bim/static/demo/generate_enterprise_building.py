"""Generate Majal's detailed IFC4 marketing model.

The model intentionally uses only simple swept solids so it remains fast in a
browser while still behaving like a real federated coordination model: six
levels, structure, envelope, architectural zones and building-services
proxies, all with quantities and asset properties.
"""

from pathlib import Path


ENT = []


def add(text):
    ENT.append(text)
    return len(ENT)


def guid(prefix, floor=0, index=0):
    value = f"MJL{prefix.upper():<4}{floor:02d}{index:04d}".replace(" ", "0")
    return (value + "0000000000000000000000")[:22]


def axis_at(x, y, z):
    point = add(f"IFCCARTESIANPOINT(({x:.3f},{y:.3f},{z:.3f}))")
    zdir = add("IFCDIRECTION((0.,0.,1.))")
    xdir = add("IFCDIRECTION((1.,0.,0.))")
    return add(f"IFCAXIS2PLACEMENT3D(#{point},#{zdir},#{xdir})")


def box(name, element_guid, placement_ref, x, y, length, width, height, ifc_type):
    p2d = add("IFCCARTESIANPOINT((0.,0.))")
    dirx = add("IFCDIRECTION((1.,0.))")
    ax2d = add(f"IFCAXIS2PLACEMENT2D(#{p2d},#{dirx})")
    profile = add(
        f"IFCRECTANGLEPROFILEDEF(.AREA.,$,#{ax2d},{length:.3f},{width:.3f})"
    )
    solid_axis = axis_at(x, y, 0.0)
    extdir = add("IFCDIRECTION((0.,0.,1.))")
    solid = add(
        f"IFCEXTRUDEDAREASOLID(#{profile},#{solid_axis},#{extdir},{height:.3f})"
    )
    shape = add(f"IFCSHAPEREPRESENTATION(#{CTX},'Body','SweptSolid',(#{solid}))")
    pds = add(f"IFCPRODUCTDEFINITIONSHAPE($,$,(#{shape}))")
    local = add(f"IFCLOCALPLACEMENT(#{placement_ref},#{IDENTITY})")
    step = add(
        f"{ifc_type}('{element_guid}',#{OWNER},'{name}',$,$,#{local},#{pds},$)"
    )
    return step, length * width * height, max(length * height, length * width)


def attach_properties(step, floor, system, reference, volume, area, index):
    properties = [
        ("AssetReference", reference),
        ("Level", f"Level {floor:02d}"),
        ("System", system),
        ("Status", "Issued for Coordination"),
        ("FireRating", "120 min" if system in ("Structure", "Core") else "60 min"),
    ]
    prop_ids = [
        add(f"IFCPROPERTYSINGLEVALUE('{name}',$,IFCLABEL('{value}'),$)")
        for name, value in properties
    ]
    pset = add(
        f"IFCPROPERTYSET('{guid('PSET', floor, index)}',#{OWNER},"
        f"'Pset_MajalAsset',$,({','.join(f'#{item}' for item in prop_ids)}))"
    )
    add(
        f"IFCRELDEFINESBYPROPERTIES('{guid('RPS', floor, index)}',#{OWNER},$,$,"
        f"(#{step}),#{pset})"
    )
    quantities = [
        add(f"IFCQUANTITYAREA('GrossArea',$,$,{area:.3f},$)"),
        add(f"IFCQUANTITYVOLUME('GrossVolume',$,$,{volume:.3f},$)"),
        add("IFCQUANTITYCOUNT('Count',$,$,1.,$)"),
    ]
    qset = add(
        f"IFCELEMENTQUANTITY('{guid('QTO', floor, index)}',#{OWNER},"
        f"'BaseQuantities',$,$,({','.join(f'#{item}' for item in quantities)}))"
    )
    add(
        f"IFCRELDEFINESBYPROPERTIES('{guid('RQT', floor, index)}',#{OWNER},$,$,"
        f"(#{step}),#{qset})"
    )


# IFC ownership, units and context.
PERSON = add("IFCPERSON($,$,'Majal BIM Team',$,$,$,$,$)")
ORG = add("IFCORGANIZATION($,'Majal Mega Projects',$,$,$)")
PANDO = add(f"IFCPERSONANDORGANIZATION(#{PERSON},#{ORG},$)")
APP = add(f"IFCAPPLICATION(#{ORG},'2.0','MajalOps BIM','MAJALOPS')")
OWNER = add(f"IFCOWNERHISTORY(#{PANDO},#{APP},$,.ADDED.,$,$,$,0)")
IDENTITY = axis_at(0, 0, 0)
CTX = add(f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#{IDENTITY},$)")
LEN_U = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
AREA_U = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")
VOL_U = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")
UNITS = add(f"IFCUNITASSIGNMENT((#{LEN_U},#{AREA_U},#{VOL_U}))")

SITE_PL = add(f"IFCLOCALPLACEMENT($,#{IDENTITY})")
PROJECT = add(
    f"IFCPROJECT('{guid('PROJ')}',#{OWNER},'New Cairo Financial District',$,$,$,$,"
    f"(#{CTX}),#{UNITS})"
)
SITE = add(
    f"IFCSITE('{guid('SITE')}',#{OWNER},'Financial District Site',$,$,"
    f"#{SITE_PL},$,$,.ELEMENT.,$,$,$,$,$)"
)
BLD_PL = add(f"IFCLOCALPLACEMENT(#{SITE_PL},#{IDENTITY})")
BUILDING = add(
    f"IFCBUILDING('{guid('BLDG')}',#{OWNER},'Tower A',$,$,#{BLD_PL},$,$,"
    ".ELEMENT.,$,$,$)"
)

storeys = []
all_elements = []
element_index = 1

for floor in range(1, 7):
    elevation = (floor - 1) * 4.2
    storey_axis = axis_at(0, 0, elevation)
    storey_pl = add(f"IFCLOCALPLACEMENT(#{BLD_PL},#{storey_axis})")
    storey = add(
        f"IFCBUILDINGSTOREY('{guid('LVL', floor)}',#{OWNER},'Level {floor:02d}',$,$,"
        f"#{storey_pl},$,$,.ELEMENT.,{elevation:.3f})"
    )
    storeys.append(storey)
    floor_elements = []

    specs = [
        ("Floor slab", "SLAB", 0, 0, 36, 26, .28, "IFCSLAB", "Structure"),
        ("North facade", "WALL", 0, 12.9, 36, .22, 4.0, "IFCWALL", "Envelope"),
        ("South facade", "WALL", 0, -12.9, 36, .22, 4.0, "IFCWALL", "Envelope"),
        ("East facade", "WALL", 17.9, 0, .22, 26, 4.0, "IFCWALL", "Envelope"),
        ("West facade", "WALL", -17.9, 0, .22, 26, 4.0, "IFCWALL", "Envelope"),
        ("Core north", "CORE", 0, 3.9, 10, .3, 4.0, "IFCWALL", "Core"),
        ("Core south", "CORE", 0, -3.9, 10, .3, 4.0, "IFCWALL", "Core"),
        ("Core east", "CORE", 4.9, 0, .3, 8, 4.0, "IFCWALL", "Core"),
        ("Core west", "CORE", -4.9, 0, .3, 8, 4.0, "IFCWALL", "Core"),
    ]
    for gx in (-15, -9, -3, 3, 9, 15):
        for gy in (-10, 0, 10):
            specs.append((f"Column {gx:+03d}/{gy:+03d}", "COL", gx, gy, .55, .55, 4.0, "IFCCOLUMN", "Structure"))
    for beam_no, gy in enumerate((-10, 0, 10), 1):
        specs.append((f"Primary beam Y{beam_no}", "BEAM", 0, gy, 36, .4, .65, "IFCBEAM", "Structure"))
    for beam_no, gx in enumerate((-15, -5, 5, 15), 1):
        specs.append((f"Secondary beam X{beam_no}", "BEAM", gx, 0, .4, 26, .55, "IFCBEAM", "Structure"))
    for panel in range(8):
        specs.append((f"Curtain panel {panel + 1:02d}", "GLAZ", -14 + panel * 4, 12.72, 3.6, .1, 3.35, "IFCBUILDINGELEMENTPROXY", "Facade"))
    specs.extend([
        ("Main lobby door", "DOOR", 0, -12.68, 2.4, .18, 3.1, "IFCBUILDINGELEMENTPROXY", "Architecture"),
        ("Fire stair flight", "STR", -6.5, 0, 3.0, 6.0, 3.8, "IFCBUILDINGELEMENTPROXY", "Architecture"),
        ("Supply air duct", "DUCT", 0, 7.5, 28.0, .65, .55, "IFCBUILDINGELEMENTPROXY", "Mechanical"),
        ("Return air duct", "DUCT", 0, -7.5, 28.0, .55, .45, "IFCBUILDINGELEMENTPROXY", "Mechanical"),
        ("Chilled water flow", "PIPE", -2.0, 0, .18, 22.0, .18, "IFCBUILDINGELEMENTPROXY", "Mechanical"),
        ("Chilled water return", "PIPE", 2.0, 0, .18, 22.0, .18, "IFCBUILDINGELEMENTPROXY", "Mechanical"),
        ("Electrical busbar", "ELEC", 7.0, 0, .35, .5, 3.5, "IFCBUILDINGELEMENTPROXY", "Electrical"),
        ("Fire riser", "FIRE", -7.0, 0, .25, .25, 3.8, "IFCBUILDINGELEMENTPROXY", "Fire Protection"),
    ])

    for local_index, spec in enumerate(specs, 1):
        name, prefix, x, y, length, width, height, ifc_type, system = spec
        step, volume, area = box(
            f"L{floor:02d} - {name}", guid(prefix, floor, local_index),
            storey_pl, x, y, length, width, height, ifc_type,
        )
        attach_properties(
            step, floor, system, f"{prefix}-{floor:02d}-{local_index:03d}",
            volume, area, element_index,
        )
        element_index += 1
        floor_elements.append(step)
        all_elements.append(step)

    add(
        f"IFCRELCONTAINEDINSPATIALSTRUCTURE('{guid('CON', floor)}',#{OWNER},$,$,"
        f"({','.join(f'#{item}' for item in floor_elements)}),#{storey})"
    )

add(f"IFCRELAGGREGATES('{guid('AGP')}',#{OWNER},$,$,#{PROJECT},(#{SITE}))")
add(f"IFCRELAGGREGATES('{guid('AGS')}',#{OWNER},$,$,#{SITE},(#{BUILDING}))")
add(
    f"IFCRELAGGREGATES('{guid('AGB')}',#{OWNER},$,$,#{BUILDING},"
    f"({','.join(f'#{item}' for item in storeys)}))"
)

body = "\n".join(f"#{index}= {text};" for index, text in enumerate(ENT, 1))
payload = f"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('majal-mega-campus.ifc','2026-08-09T00:00:00',('Majal BIM Team'),('Majal Mega Projects'),'MajalOps BIM','MajalOps','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
{body}
ENDSEC;
END-ISO-10303-21;
"""

output = Path(__file__).with_name("majal-mega-campus.ifc")
output.write_text(payload, encoding="utf-8", newline="\n")
print(f"{output} | {len(all_elements)} elements | {len(payload):,} bytes")
