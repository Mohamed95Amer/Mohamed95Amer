# Majal third-party notice

Majal is a commercial managed service built from original Majal modules and
open-source components.

The current Route A build includes:

- Odoo 18 Community Edition, licensed under GNU LGPL version 3;
- Odoo Community Association modules, licensed individually under LGPL-3 or
  AGPL-3;
- Odoo Mates community accounting modules, licensed under LGPL-3;
- Majal modules declared under LGPL-3, except `facility_contract` and
  `facility_inventory`, which are declared under AGPL-3;
- web-ifc and three.js browser libraries used by the BIM viewer under their
  respective upstream licences.

Each module's `__manifest__.py`, source headers and bundled documentation state
its applicable licence and upstream authorship. Pinned upstream revisions are
recorded in:

- `ODOO_PINNED_SHA`
- `oca-repos.yml`
- `third-party-repos.yml`
- `custom-addons/construction_bim/static/lib/SOURCES.md`

The corresponding source and build instructions for the deployed Route A
release are offered at:

https://github.com/Mohamed95Amer/Mohamed95Amer

The public product route `/majal/legal/open-source` links to the same offer.
Deployers must update the offer if they deploy from a different repository or
release and must keep it available to all remote users of AGPL-covered
components.

This notice does not replace the licence text or alter any copyright or licence
term. Commercial deployments should preserve all source headers and complete
notices and should obtain legal review for their exact combination and
distribution model.
