import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = ["created_at", "email", "whatsapp", "karat", "frequency", "target_rate_aed", "locale", "source_path", "consent_at", "active", "unsubscribed_at", "last_sent_at"] as const;

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Neutralise spreadsheet formulas as well as quoting CSV metacharacters.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export async function GET() {
  await requireAdmin();
  const { data, error } = await getServiceSupabase()
    .from("rate_alert_subscriptions")
    .select(columns.join(", "))
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not prepare the export" }, { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="getgold-rate-alert-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
