{
    "name": "Construction Planning (CPM / Primavera-style)",
    "summary": "WBS, typed task dependencies (FS/SS/FF/SF) with lag, "
               "critical-path scheduling and a Gantt timeline",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "web_timeline"],
    "data": [
        "security/ir.model.access.csv",
        "views/task_link_views.xml",
        "views/project_task_views.xml",
        "views/planning_menus.xml",
        "views/gantt_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "construction_planning/static/src/gantt/gantt.js",
            "construction_planning/static/src/gantt/gantt.xml",
            "construction_planning/static/src/gantt/gantt.scss",
        ],
    },
    "demo": [
        "demo/planning_demo.xml",
    ],
    "installable": True,
}
