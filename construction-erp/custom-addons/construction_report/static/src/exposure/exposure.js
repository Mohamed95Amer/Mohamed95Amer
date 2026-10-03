/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { formatMonetary } from "@web/views/fields/formatters";
import { _t } from "@web/core/l10n/translation";

/**
 * What the company is exposed to, rather than how busy it is.
 *
 * Every figure here already existed on some record; none of them were ever on
 * the same screen, so answering "how much have we given away in variations
 * this year" took a morning and a spreadsheet.
 */
export class CommercialExposure extends Component {
    static template = "construction_report.Exposure";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ loading: true, data: null });

        onWillStart(async () => {
            this.state.data = await this.orm.call(
                "construction.exposure", "exposure", []);
            this.state.loading = false;
        });
    }

    money(value) {
        return formatMonetary(value || 0, { digits: [69, 0] });
    }

    percent(value) {
        return `${(value || 0).toFixed(1)}%`;
    }

    /**
     * Variations above a tenth of the contract are worth a second look, and
     * above a fifth are usually a conversation with the client. The colour is
     * a prompt to ask, not a verdict.
     */
    variationClass(row) {
        if (row.variation_percent >= 20) {
            return "o_exposure_high";
        }
        return row.variation_percent >= 10 ? "o_exposure_watch" : "";
    }

    openProject(row) {
        this.action.doAction({
            type: "ir.actions.act_window",
            name: row.name,
            res_model: "project.project",
            res_id: row.id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    openApprovals() {
        this.action.doAction({
            type: "ir.actions.act_window",
            name: _t("Waiting for signature"),
            res_model: "construction.approval.step",
            views: [[false, "list"], [false, "form"]],
            domain: [["state", "=", "pending"]],
            target: "current",
        });
    }
}

registry.category("actions").add("construction_report.exposure", CommercialExposure);
