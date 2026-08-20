/** @odoo-module **/

import { BoardController } from "@board/board_controller";
import { rpc } from "@web/core/network/rpc";
import { renderToString } from "@web/core/utils/render";
import { patch } from "@web/core/utils/patch";
import { blockDom } from "@odoo/owl";

const serializer = new XMLSerializer();

patch(BoardController.prototype, {
    async saveBoard() {
        const templateFn = renderToString.app.getTemplate("board.arch");
        const bdom = templateFn(this.board, {});
        const root = document.createElement("rendertostring");
        blockDom.mount(bdom, root);
        const result = serializer.serializeToString(root);
        const arch = result.slice(result.indexOf("<", 1), result.indexOf("</rendertostring>"));
        const response = await rpc("/majal/board/save", {
            // viewId is deliberately not part of standardViewProps in Odoo 18.
            // The View component publishes the resolved view in env.config.
            view_id: this.env.config.viewId,
            custom_id: this.board.customViewId || false,
            arch,
        });
        this.board.customViewId = response.custom_id;
        this.env.bus.trigger("CLEAR-CACHES");
    },
});
