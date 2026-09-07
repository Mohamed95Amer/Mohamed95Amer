/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { router, routerBus } from "@web/core/browser/router";

const UPSTREAM = "/odoo";
const MAJAL = "/app";

function toMajal(value) {
    if (typeof value !== "string") return value;
    return value.replace(/^\/odoo(?=\/|\?|$)/, MAJAL);
}

function toUpstream(url) {
    const normalized = new URL(url, browser.location.origin);
    if (normalized.pathname === MAJAL || normalized.pathname.startsWith(`${MAJAL}/`)) {
        normalized.pathname = normalized.pathname.replace(/^\/app/, UPSTREAM);
    }
    return normalized;
}

const upstreamStateToUrl = router.stateToUrl.bind(router);
const upstreamUrlToState = router.urlToState.bind(router);

router.stateToUrl = (state) => toMajal(upstreamStateToUrl(state));
router.urlToState = (url) => upstreamUrlToState(toUpstream(url));

function displayCurrentRoute() {
    const displayPath = toMajal(browser.location.pathname);
    if (displayPath !== browser.location.pathname) {
        browser.history.replaceState(
            browser.history.state,
            "",
            displayPath + browser.location.search + browser.location.hash
        );
    }
}

// Anchor navigation is normally handled by the upstream router only while the
// current path starts with /odoo. Once Majal displays /app, handle those links
// through the same public router API so back/forward state remains intact.
browser.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.target.closest("[contenteditable]")) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor || anchor.target === "_blank") return;
    let target;
    try {
        target = new URL(anchor.href, browser.location.origin);
    } catch {
        return;
    }
    const isBackend = target.origin === browser.location.origin && (
        target.pathname === MAJAL || target.pathname.startsWith(`${MAJAL}/`) ||
        target.pathname === UPSTREAM || target.pathname.startsWith(`${UPSTREAM}/`)
    );
    if (!isBackend || !browser.location.pathname.startsWith(MAJAL)) return;
    event.preventDefault();
    const nextState = router.urlToState(target);
    router.pushState(nextState, { replace: true, sync: true });
    routerBus.trigger("ROUTE_CHANGE");
});

displayCurrentRoute();
