{
    "name": "Facilities Parts & Stores",
    "summary": "Spare parts held in real stores, consumed against work orders, "
               "with reorder levels and recoverable parts on contracts",
    "version": "18.0.1.0.2",
    "category": "Facilities",
    "license": "AGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "facility_asset",
        "facility_workorder",
        "facility_contract",
        "stock",
    ],
    "data": [
        "security/ir.model.access.csv",
        "data/stock_locations.xml",
        "views/parts_views.xml",
        "views/parts_menus.xml",
    ],
    "demo": ["demo/parts_demo.xml"],
    "installable": True,
}
