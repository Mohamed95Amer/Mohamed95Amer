{
    "name": "Majal WhatsApp Notifications",
    "summary": "Send operational alerts over WhatsApp through Meta's Cloud API "
               "— permits, SLAs, RFIs, defects and stuck meeting actions",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_base",
        "construction_rfi",
        "construction_defect",
        "construction_hse",
        "construction_meeting",
        "facility_sla",
    ],
    "data": [
        "security/ir.model.access.csv",
        "views/whatsapp_views.xml",
        "views/whatsapp_menus.xml",
        "data/whatsapp_templates.xml",
        "data/whatsapp_cron.xml",
    ],
    "installable": True,
}
