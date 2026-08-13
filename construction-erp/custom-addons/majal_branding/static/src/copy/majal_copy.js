/** @odoo-module **/

/*
 * The underlying platform still supplies a few generic labels and the private
 * To-do sample note. Keep those records untouched (they are part of the
 * upstream module and may be recreated on an upgrade), but present them in
 * the Majal vocabulary at the client boundary.
 */

const COPY = new Map([
    ["Handle by Emails", "Email notifications"],
    ["Handle in Odoo", "Handle in Majal"],
    ["Welcome to the To-do app!", "Welcome to the Majal work planner"],
    [
        "Use it to manage your work, take notes on the go, and create tasks based on them.",
        "Plan site, property and facilities work, capture notes and turn them into accountable actions.",
    ],
    ["Using the editor", "Plan your work"],
    [
        "This private to-do is for you to play around with.",
        "Use this private workboard to prepare your next site, property or facilities action.",
    ],
    ["Who has access to what?", "Who can see this work?"],
    [
        "By default, to-dos are only visible to you. You can share them with other users by adding them as assignees.",
        "Work notes are private by default. Add colleagues as assignees when an action needs shared ownership.",
    ],
    ["Organize your to-dos however you want", "Organise work the Majal way"],
    [
        "Customize the stages from the Kanban view to reflect your preferred workflow.",
        "Use stages to make the hand-off from planning to site execution and close-out visible.",
    ],
    ["Manage your to-dos and assigned tasks from a single place", "One workboard for every action"],
    ["Convert to-dos into tasks", "Turn a reminder into accountable work"],
    ["Create to-dos from anywhere", "Capture work wherever you are"],
]);

const isTodoRoute = () => window.location.pathname.includes("/to-do/");

function replaceText(root) {
    if (!root || !isTodoRoute()) {
        return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
        nodes.push(node);
    }
    for (const textNode of nodes) {
        const original = textNode.nodeValue;
        const trimmed = original.trim();
        const replacement = COPY.get(trimmed)
            || (/^Welcome .*!$/.test(trimmed) ? "My Majal workboard" : null)
            || (/^Hey .+ 👋$/.test(trimmed) ? "Welcome back to your Majal workboard 👋" : null);
        if (replacement) {
            textNode.nodeValue = original.replace(trimmed, replacement);
        }
    }
}

function applyCopy() {
    if (!document.body) {
        window.addEventListener("DOMContentLoaded", applyCopy, { once: true });
        return;
    }
    document.body.classList.toggle("o_majal_todo_route", isTodoRoute());
    replaceText(document.body);
    // The form renderer replaces the editor after the record loads, and Odoo's
    // router changes the URL without a full page reload. Observe the document
    // once so both cases stay branded without touching the stored HTML.
    if (window.__majalCopyObserver || !document.body) {
        return;
    }
    const observer = new MutationObserver((mutations) => {
        document.body.classList.toggle("o_majal_todo_route", isTodoRoute());
        if (!isTodoRoute()) {
            return;
        }
        for (const mutation of mutations) {
            for (const added of mutation.addedNodes) {
                if (added.nodeType === Node.ELEMENT_NODE) {
                    replaceText(added);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__majalCopyObserver = observer;
}

applyCopy();
window.addEventListener("popstate", applyCopy);
