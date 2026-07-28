/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";


const userMenuItems = registry.category("user_menuitems");

for (const key of ["documentation", "support", "odoo_account"]) {
    if (userMenuItems.contains(key)) {
        userMenuItems.remove(key);
    }
}

userMenuItems.add("majal_help", () => ({
    type: "item",
    id: "majal_help",
    description: _t("Help & Support"),
    href: "/majal/help",
    callback: () => browser.open("/majal/help", "_blank"),
    sequence: 10,
}));

userMenuItems.add("majal_open_source", () => ({
    type: "item",
    id: "majal_open_source",
    description: _t("Open-source notices"),
    href: "/majal/legal/open-source",
    callback: () => browser.open("/majal/legal/open-source", "_blank"),
    sequence: 20,
}));
