{
    "name": "Facilities Maintenance Contracts",
    "summary": "Annual maintenance contracts: asset cover, contract SLA, "
               "PM entitlement and contract margin",
    "version": "18.0.1.0.0",
    "category": "Facilities",
    "license": "AGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "facility_asset",
        "facility_workorder",
        "facility_sla",
        "contract",
        "maintenance_equipment_contract",
    ],
    "data": [
        "data/contract_cron.xml",
        "views/facility_contract_views.xml",
        "views/maintenance_request_views.xml",
        "views/contract_menus.xml",
    ],
    "demo": ["demo/contract_demo.xml"],
    "installable": True,
}
