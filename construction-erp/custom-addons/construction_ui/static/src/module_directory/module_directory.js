/** @odoo-module **/

import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MajalModuleDirectory extends Component {
    static template = "construction_ui.MajalModuleDirectory";
    static props = {
        action: { type: Object, optional: true },
        actionId: { type: [Number, Boolean], optional: true },
        className: { type: String, optional: true },
        updateActionState: { type: Function, optional: true },
    };

    setup() {
        this.menuService = useService("menu");
    }

    get apps() {
        return this.menuService.getApps().filter(
            (app) => !["base.menu_management", "website.menu_website_configuration"].includes(app.xmlid)
        );
    }

    openApp(app) {
        this.menuService.selectMenu(app);
    }
}

registry.category("actions").add(
    "construction_ui.module_directory",
    MajalModuleDirectory
);
