/** @odoo-module **/

import { registry } from "@web/core/registry";
import "@web/webclient/switch_company_menu/switch_company_menu";

// Majal is presented to client users as one operational workspace. Company
// boundaries remain enforced by the server, but the platform-level company
// selector is intentionally not exposed in the client interface.
const systray = registry.category("systray");
if (systray.contains("SwitchCompanyMenu")) {
    systray.remove("SwitchCompanyMenu");
}
