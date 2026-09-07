# QR, NFC and connected-asset roadmap

## What Majal implements now

Every facility asset has:

- a human-readable, unique code such as `AST-2026-00001`;
- independent QR and NFC destinations protected by an unguessable token;
- an active, missing or retired tag state;
- optional storage of the physical NFC tag UID;
- a printable 70 × 50 mm QR/NFC label;
- an authenticated mobile landing page;
- append-only scan events recording asset, user, time, method and assigned
  facility location;
- last-scan summary fields and token rotation for lost or copied labels.

The NFC payload is the asset's **NFC Tag URL** encoded as an NFC Forum NDEF URI
record. QR and NFC open separate Majal paths so scan history records the method.
Both tag URLs enter through Majal sign-in with a same-site return path. This is
intentional: a new phone selects the locked `erp` database, signs in, and then
continues to the asset without exposing the database manager or bypassing
record permissions.

## Choosing the carrier

| Need | Recommended carrier | Why |
| --- | --- | --- |
| Fixed plant, rooms, panels, fire equipment | QR + NFC on one label | Any phone can scan QR; technicians get faster tap-to-open with NFC |
| Tools and returnable equipment scanned one at a time | Durable QR/NFC | Low cost and deliberate custody confirmation |
| Hundreds of items moving through gates | UHF RFID | Bulk reads without line of sight; NFC is intentionally short range |
| Vehicles and high-value mobile plant | BLE/GPS/cellular | Continuous or proximity location rather than manual scan events |
| Materials, batches and logistics shared with suppliers | GS1 QR/DataMatrix or RFID | Interoperable identifiers and EPCIS event exchange |

Use on-metal NFC/RFID tags for metal equipment and industrial labels rated for
UV, heat, chemicals and wash-down where required.

## Construction and facilities workflows

1. **Maintenance:** tap the AHU, see warranty/manuals/open work, confirm the
   physical scan, then start a work order or meter reading.
2. **Inspections:** scan fire doors, extinguishers, lifts and safety equipment
   to prove the inspector was at the identified asset.
3. **Rooms and locations:** tag plant rooms and zones so a technician can open
   local assets, requests and evacuation/safety information.
4. **Materials:** commission a tag at receiving, record storage, installation,
   inspection and handover events.
5. **Tools:** check out/in custody, last known project/location and calibration
   due dates.
6. **BIM handover:** connect the facility asset to its IFC GlobalId. A physical
   scan then opens the asset, its model element, drawings, submittals and
   maintenance history.
7. **Documents and permits:** QR on approved drawings, permits and equipment
   packs opens the current controlled revision—not a copied file.

## Standards and security decisions

- ISO 55001:2024 emphasizes asset lifecycle control and trustworthy data used
  to balance cost, risk and performance.
- GS1 recommends GIAI/GRAI identifiers for assets and EPCIS events for the
  **what, when, where and why** of traceability. Majal's scan-event model is
  intentionally compatible with that shape.
- GS1 Digital Link provides stable web identifiers that can later connect Majal
  assets to supplier and owner information without replacing the printed code.
- NFC Forum NDEF URI records are the interoperable format for phone-readable
  NFC tags.
- NFC UID is not treated as authentication: common tags can be copied and some
  devices do not expose a stable UID. Majal still requires login, server-side
  record rules and CSRF protection.

References:

- [ISO 55001:2024](https://www.iso.org/standard/83054.html)
- [GS1 Digital Link](https://www.gs1.org/standards/gs1-digital-link)
- [GS1 traceability and asset identifiers](https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard)
- [GS1 EPCIS](https://www.gs1.org/standards/epcis)
- [NFC Forum NDEF](https://nfc-forum.org/build/specifications/data-exchange-format-ndef-technical-specification/)
