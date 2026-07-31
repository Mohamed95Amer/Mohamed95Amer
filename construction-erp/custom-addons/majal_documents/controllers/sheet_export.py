import csv
import io
import re

from odoo import http
from odoo.http import content_disposition, request


def _safe_csv(value):
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


class MajalSheetExport(http.Controller):
    @http.route(
        "/majal/sheets/<int:sheet_id>/export.csv",
        type="http",
        auth="user",
        methods=["GET"],
    )
    def export_sheet(self, sheet_id):
        sheet = request.env["majal.sheet"].search([("id", "=", sheet_id)], limit=1)
        if not sheet:
            return request.not_found()
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(
            ["Code", "Description", "Unit", "Quantity", "Unit Rate", "Amount", "Note"]
        )
        for line in sheet.line_ids.sorted(lambda item: (item.sequence, item.id)):
            writer.writerow(
                [
                    _safe_csv(line.code),
                    _safe_csv(line.description),
                    _safe_csv(line.unit),
                    line.quantity,
                    line.unit_rate,
                    line.amount,
                    _safe_csv(line.note),
                ]
            )
        writer.writerow(["", "TOTAL", "", "", "", sheet.amount_total, ""])
        filename = re.sub(r"[^A-Za-z0-9_.-]+", "-", sheet.reference or "sheet")
        payload = "\ufeff" + stream.getvalue()
        return request.make_response(
            payload.encode("utf-8"),
            headers=[
                ("Content-Type", "text/csv; charset=utf-8"),
                ("Content-Disposition", content_disposition("%s.csv" % filename)),
                ("X-Content-Type-Options", "nosniff"),
                ("Cache-Control", "no-store"),
            ],
        )
