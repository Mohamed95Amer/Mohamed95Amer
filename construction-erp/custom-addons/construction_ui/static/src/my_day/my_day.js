/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

/**
 * One screen with everything one person owes today.
 *
 * The data was always there — defects carry an assignee, inspections an
 * inspector, approvals a step — but a site engineer had to open five registers
 * and filter each one by hand, and the fifth one did not get opened. Rows are
 * ordered by how much trouble ignoring them causes: approvals first, because
 * somebody else is stopped until they are done.
 */
export class MyDay extends Component {
    static template = "construction_ui.MyDay";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ loading: true, data: null });

        onWillStart(async () => {
            this.state.data = await this.orm.call(
                "construction.my.day", "my_day", []);
            this.state.loading = false;
        });
    }

    open(section) {
        this.action.doAction(section.action);
    }

    get greeting() {
        const hour = new Date().getHours();
        if (hour < 12) {
            return _t("Good morning");
        }
        return hour < 17 ? _t("Good afternoon") : _t("Good evening");
    }

    /** What the top line says. Silence when there is nothing is the point. */
    get summary() {
        const data = this.state.data;
        if (!data || !data.total) {
            return _t("Nothing is waiting on you.");
        }
        if (data.urgent) {
            return _t("%(total)s open, %(urgent)s of them late.", {
                total: data.total, urgent: data.urgent,
            });
        }
        return _t("%s open, none late.", data.total);
    }
}

registry.category("actions").add("construction_ui.my_day", MyDay);
