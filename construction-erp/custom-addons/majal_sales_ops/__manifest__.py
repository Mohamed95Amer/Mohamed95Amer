{
    "name": "Majal Sales Ops",
    "summary": "The pipeline Majal is sold from — provenance-checked leads, "
               "ICP scoring, bilingual outreach sequences and a social queue, "
               "all of it held behind one human approval",
    "version": "18.0.1.0.0",
    "category": "Sales",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_base",
        "construction_ui",
        "crm",
        "mail",
    ],
    "data": [
        "security/majal_sales_groups.xml",
        "security/ir.model.access.csv",
        "data/majal_lead_source_data.xml",
        "data/majal_approval_rule_data.xml",
        # Templates before sequences: the steps reference them by xml id, and
        # a forward reference is an unresolved-id error at install time.
        "data/mail_template_data.xml",
        "data/majal_sales_sequence_data.xml",
        "data/ir_cron_data.xml",
        "views/crm_lead_views.xml",
        "views/outreach_views.xml",
        "views/content_post_views.xml",
        "views/sequence_views.xml",
        "views/lead_source_views.xml",
        "views/menus.xml",
    ],
    "installable": True,
}
