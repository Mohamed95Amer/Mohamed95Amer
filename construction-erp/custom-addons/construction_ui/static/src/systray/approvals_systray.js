import { Component, onWillStart, useState, whenReady } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const systray = registry.category("systray");

/**
 * How many approvals are waiting on you, in the top bar.
 *
 * The approval inbox is the queue this product is built around — a variation,
 * a claim or a permit sits in it holding up work and money — and until now the
 * only way to learn there was anything in it was to go and look. Messages and
 * activities both had a counter; the one queue with a contract value attached
 * to it did not.
 */
export class ApprovalsSystray extends Component {
    static template = "construction_ui.ApprovalsSystray";
    static props = {};

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.state = useState({ count: 0 });
        onWillStart(async () => this.refresh());
    }

    async refresh() {
        try {
            this.state.count = await this.orm.call(
                "construction.approval.step", "systray_inbox_count", []);
        } catch {
            // A user without access to the approval engine still gets a
            // working top bar; they simply never see a count.
            this.state.count = 0;
        }
    }

    async onClick() {
        const action = await this.orm.call(
            "construction.approval.step", "systray_inbox_action", []);
        await this.action.doAction(action);
        // The queue is shorter the moment you sign something in it.
        this.refresh();
    }
}

// Ahead of messages and activities: it is the most consequential of the
// three, and the one people are told to watch.
systray.add(
    "construction_ui.ApprovalsSystray",
    { Component: ApprovalsSystray },
    { sequence: 96 }
);

/*
 * The droplet in the top bar was web_responsive's "App Menu Preferences",
 * which tunes the app drawer — a drawer the sidebar has replaced as the way
 * around the product. What is left is an unlabelled icon that opens a user
 * form, which is a puzzle rather than a control.
 *
 * Removed once every module body has run rather than at import time: this
 * module does not depend on web_responsive, so nothing decides which of the
 * two is evaluated first, and removing an entry before it is added does
 * nothing at all.
 */
whenReady(() => {
    if (systray.contains("AppMenuTheme")) {
        systray.remove("AppMenuTheme");
    }
});
