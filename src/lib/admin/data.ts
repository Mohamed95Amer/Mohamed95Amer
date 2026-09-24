import { cache } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import type {
  CommissionOrder,
  CommissionVendor,
  LedgerEntry,
} from "./commissions";

// Page every dataset: PostgREST's default 1,000-row limit must not hide liabilities.
export async function allRows<T>(
  table: string,
  columns: string,
  sort = "id",
): Promise<T[]> {
  const db = getServiceSupabase(),
    rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(sort)
      .range(from, from + 999);
    if (error) throw new Error("Could not load " + table);
    rows.push(...(data as unknown as T[]));
    if (data.length < 1000) return rows;
  }
}
export const getCommissionData = cache(async () => {
  await requireAdmin();
  const [orders, vendors, ledger] = await Promise.all([
    allRows<CommissionOrder>("admin_commission_orders", "*"),
    allRows<CommissionVendor>("vendors", "id,business_name,is_demo"),
    allRows<LedgerEntry>(
      "commission_ledger",
      "id,vendor_id,kind,amount_aed,note,reference,created_at,voided_at,void_reason",
    ),
  ]);
  return { orders, vendors, ledger };
});
