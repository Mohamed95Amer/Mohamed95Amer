from odoo.exceptions import AccessError
from odoo.http import Controller, request, route


class MajalBoardController(Controller):
    @route("/majal/board/save", type="json", auth="user")
    def save_board(self, view_id, arch, custom_id=None):
        base_view = request.env["ir.ui.view"].browse(int(view_id)).exists()
        if not base_view or base_view.model != "board.board":
            raise AccessError("This dashboard view is not available.")
        Custom = request.env["ir.ui.view.custom"].sudo()
        custom = Custom.browse(int(custom_id)).exists() if custom_id else Custom
        if custom and custom.user_id != request.env.user:
            raise AccessError("This dashboard layout belongs to another user.")
        if custom:
            custom.write({"arch": arch})
        else:
            custom = Custom.create({
                "ref_id": base_view.id,
                "user_id": request.env.user.id,
                "arch": arch,
            })
        return {"result": True, "custom_id": custom.id}
