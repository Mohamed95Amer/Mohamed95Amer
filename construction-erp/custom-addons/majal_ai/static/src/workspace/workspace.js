/** @odoo-module **/

import {
    Component,
    onPatched,
    onWillStart,
    useRef,
    useState,
} from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MajalAiWorkspace extends Component {
    static template = "majal_ai.Workspace";
    static props = {
        action: { type: Object, optional: true },
        actionId: { type: [Number, Boolean], optional: true },
        className: { type: String, optional: true },
        updateActionState: { type: Function, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.messageArea = useRef("messageArea");
        this.state = useState({
            loading: true,
            sending: false,
            providers: [],
            projects: [],
            equipment: [],
            conversations: [],
            suggestions: [],
            messages: [],
            conversationId: false,
            providerId: false,
            scope: "portfolio",
            projectId: false,
            equipmentId: false,
            question: "",
            sidebarOpen: false,
        });
        onWillStart(() => this.load());
        onPatched(() => this.scrollToBottom());
    }

    async load() {
        this.state.loading = true;
        try {
            const data = await this.orm.call(
                "majal.ai.conversation",
                "bootstrap",
                []
            );
            this.state.providers = data.providers;
            this.state.projects = data.projects;
            this.state.equipment = data.equipment;
            this.state.conversations = data.conversations;
            this.state.suggestions = data.suggestions;
            const preferred =
                data.providers.find((provider) => provider.ready) ||
                data.providers[0];
            this.state.providerId = preferred?.id || false;
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.state.loading = false;
        }
    }

    get selectedProvider() {
        return this.state.providers.find(
            (provider) => provider.id === this.state.providerId
        );
    }

    get selectedProjectName() {
        return this.state.projects.find(
            (project) => project.id === this.state.projectId
        )?.name;
    }

    get selectedEquipmentName() {
        return this.state.equipment.find(
            (asset) => asset.id === this.state.equipmentId
        )?.name;
    }

    selectProvider(provider) {
        if (!provider.ready) {
            this.notification.add(
                provider.note || _t("Ask an administrator to configure this provider."),
                { type: "warning", title: _t("%s is not ready", provider.name) }
            );
            return;
        }
        this.state.providerId = provider.id;
    }

    setScope(scope) {
        this.state.scope = scope;
        if (scope !== "construction") this.state.projectId = false;
        if (scope !== "facilities") this.state.equipmentId = false;
    }

    onProjectChange(event) {
        this.state.projectId = Number(event.target.value) || false;
    }

    onEquipmentChange(event) {
        this.state.equipmentId = Number(event.target.value) || false;
    }

    onQuestionInput(event) {
        this.state.question = event.target.value;
    }

    onKeydown(event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            this.send();
        }
    }

    useSuggestion(suggestion) {
        this.setScope(suggestion.scope);
        this.state.question = suggestion.label;
        this.send();
    }

    async send() {
        const question = this.state.question.trim();
        const provider = this.selectedProvider;
        if (!question || this.state.sending) return;
        if (!provider?.ready) {
            this.notification.add(
                _t("Choose a configured AI provider before sending a question."),
                { type: "warning" }
            );
            return;
        }

        this.state.sending = true;
        this.state.question = "";
        const optimistic = {
            id: `pending-${Date.now()}`,
            role: "user",
            content: question,
            citations: [],
        };
        this.state.messages.push(optimistic);
        try {
            const result = await this.orm.call(
                "majal.ai.conversation",
                "ask",
                [
                    question,
                    provider.id,
                    this.state.scope,
                    this.state.conversationId || false,
                    this.state.projectId || false,
                    this.state.equipmentId || false,
                ]
            );
            this.state.conversationId = result.conversation_id;
            this.state.messages.splice(
                this.state.messages.indexOf(optimistic),
                1,
                result.user_message,
                result.assistant_message
            );
            const existing = this.state.conversations.find(
                (item) => item.id === result.conversation_id
            );
            if (!existing) {
                this.state.conversations.unshift({
                    id: result.conversation_id,
                    name: result.conversation_name,
                    scope: this.state.scope,
                    provider_id: provider.id,
                });
            }
        } catch (error) {
            const index = this.state.messages.indexOf(optimistic);
            if (index >= 0) this.state.messages.splice(index, 1);
            this.state.question = question;
            this.notifyError(error);
        } finally {
            this.state.sending = false;
        }
    }

    async openConversation(item) {
        this.state.loading = true;
        try {
            const data = await this.orm.call(
                "majal.ai.conversation",
                "load_conversation",
                [item.id]
            );
            this.state.conversationId = data.id;
            this.state.messages = data.messages;
            this.state.scope = data.scope;
            this.state.providerId = data.provider_id;
            this.state.projectId = data.project_id || false;
            this.state.equipmentId = data.equipment_id || false;
            this.state.sidebarOpen = false;
        } catch (error) {
            this.notifyError(error);
        } finally {
            this.state.loading = false;
        }
    }

    async archiveConversation(item, event) {
        event.stopPropagation();
        await this.orm.call(
            "majal.ai.conversation",
            "archive_conversation",
            [item.id]
        );
        this.state.conversations = this.state.conversations.filter(
            (conversation) => conversation.id !== item.id
        );
        if (this.state.conversationId === item.id) this.newConversation();
    }

    newConversation() {
        this.state.conversationId = false;
        this.state.messages = [];
        this.state.question = "";
        this.state.sidebarOpen = false;
    }

    toggleSidebar() {
        this.state.sidebarOpen = !this.state.sidebarOpen;
    }

    openCitation(citation) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: citation.model,
            res_id: citation.res_id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    scrollToBottom() {
        const area = this.messageArea.el;
        if (area) area.scrollTop = area.scrollHeight;
    }

    notifyError(error) {
        const message =
            error?.data?.message ||
            error?.message ||
            _t("Majal Intelligence could not complete the request.");
        this.notification.add(message, {
            type: "danger",
            title: _t("Majal Intelligence"),
        });
    }
}

registry.category("actions").add("majal_ai.workspace", MajalAiWorkspace);
