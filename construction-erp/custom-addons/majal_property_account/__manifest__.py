{
    "name": "Majal Property Accounting",
    "summary": "Draft invoice bridge for Property instalments and rent",
    "version": "18.0.1.0.0",
    "category": "Accounting",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "depends": [
        "account",
        "majal_real_estate",
        "majal_property_operations",
        "majal_property_ownership",
    ],
    "data": [
        "security/majal_property_account_security.xml",
        "security/ir.model.access.csv",
        "views/accounting_views.xml",
        "views/invoice_links.xml",
        "views/menus.xml",
    ],
    "application": False,
    "installable": True,
    "auto_install": False,
}
