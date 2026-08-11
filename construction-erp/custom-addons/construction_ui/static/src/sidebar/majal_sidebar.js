import { Component, onWillUnmount, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { WebClient } from "@web/webclient/webclient";

const STORE_COLLAPSED = "majal_sidebar_collapsed";
const STORE_OPEN = "majal_sidebar_open_sections";
const STORE_ACTIVE = "majal_sidebar_active_menu";

/** Read a stored value without letting a corrupt entry break the web client. */
function readStore(key, fallback) {
    try {
        const raw = browser.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeStore(key, value) {
    try {
        browser.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private browsing, a full quota, a locked-down profile. Losing the
        // preference is not a reason to stop rendering the navigation.
    }
}

export class MajalSidebar extends Component {
    static template = "construction_ui.MajalSidebar";
    static props = {};

    setup() {
        this.menuService = useService("menu");
        this.ui = useState(useService("ui"));
        this.state = useState({
            collapsed: !!readStore(STORE_COLLAPSED, false),
            // Which sections are expanded, by xmlid rather than by database id:
            // ids are not stable across databases, and this preference is
            // stored in the browser, which may well meet more than one.
            open: readStore(STORE_OPEN, {}),
            activeId: Number(browser.sessionStorage.getItem(STORE_ACTIVE)) || null,
        });

        const rerender = () => this.render(true);
        this.env.bus.addEventListener("MENUS:APP-CHANGED", rerender);
        onWillUnmount(() =>
            this.env.bus.removeEventListener("MENUS:APP-CHANGED", rerender)
        );
    }

    get apps() {
        return this.menuService.getApps();
    }

    get currentApp() {
        return this.menuService.getCurrentApp();
    }

    /** The current app's menu, as a tree of sections and their children. */
    get sections() {
        const app = this.currentApp;
        if (!app) {
            return [];
        }
        return this.menuService.getMenuAsTree(app.id).childrenTree || [];
    }

    /** Sections with no children, which lead somewhere on their own. */
    isLeaf(section) {
        return !section.childrenTree || !section.childrenTree.length;
    }

    isOpen(section) {
        return !!this.state.open[section.xmlid || section.id];
    }

    toggleSection(section) {
        const key = section.xmlid || section.id;
        const open = { ...this.state.open };
        if (open[key]) {
            delete open[key];
        } else {
            open[key] = true;
        }
        this.state.open = open;
        writeStore(STORE_OPEN, open);
    }

    toggleCollapsed() {
        this.state.collapsed = !this.state.collapsed;
        writeStore(STORE_COLLAPSED, this.state.collapsed);
    }

    isCurrentApp(app) {
        return this.currentApp && this.currentApp.id === app.id;
    }

    isActive(menu) {
        return this.state.activeId === menu.id;
    }

    onMenuSelected(menu) {
        // Tracked here rather than read back from the router: selectMenu puts
        // the action in the URL and the app in session storage, but nothing
        // records which of the app's forty-odd screens you asked for — and
        // that is precisely what the column has to show.
        this.state.activeId = menu.id;
        try {
            browser.sessionStorage.setItem(STORE_ACTIVE, String(menu.id));
        } catch {
            // See writeStore.
        }
        this.menuService.selectMenu(menu);
    }

    href(menu) {
        return menu.actionID ? `/app/action-${menu.actionID}` : "#";
    }
}

/* The sidebar is part of the web client's frame, so it mounts alongside the
   navbar rather than inside it: the navbar keeps the breadcrumbs, the search
   and the systray, and gives up only the section menu it could never fit. */
patch(WebClient, {
    components: { ...WebClient.components, MajalSidebar },
});
