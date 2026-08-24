# Majal Demo Environment

This optional module creates a deterministic, synthetic acceptance environment.
It is never installed automatically and contains no production or client data.

It demonstrates Construction, Facilities and Property with real linked records:
projects, programme tasks, BOQs, tenders, approvals, site forms, HSE, work orders,
assets, plans and pins, BIM elements and pins, property developments and units,
sales and leasing, controlled documents, PDF field mapping, eSign requests,
collaborative spreadsheets, role personas and Majal Intelligence.

All demo users use password `MajalDemo!2026`:

| Login | Persona | Scope |
|---|---|---|
| demo.owner@majal.local | Platform owner | All suites |
| demo.pm@majal.local | Project manager | Construction |
| demo.engineer@majal.local | Site engineer | Construction |
| demo.field@majal.local | Field user | Construction |
| demo.fm.manager@majal.local | Facility manager | Facilities |
| demo.tech@majal.local | Technician | Facilities |
| demo.property.director@majal.local | Property director | Property |
| demo.property.sales@majal.local | Property sales manager | Property |
| demo.property.ops@majal.local | Property operations | Property + Facilities |
| demo.property.agent@majal.local | Property field agent | Property |

Install **Majal Demo Environment** in a disposable demo database. Remove the
database after the demonstration; do not install this module in a customer
database. The offline **Majal Demo Guide** provider requires no API key and is
enabled only while `majal.demo.installed` is true.
