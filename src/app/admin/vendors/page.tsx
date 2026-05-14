import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminVendorsPage({ searchParams }: { searchParams: { filter?: string } }) {
  const admin = getServiceSupabase();
  let q = admin.from("vendors").select("id, business_name, emirate, verification_status, created_at").order("created_at", { ascending: false });
  if (searchParams.filter) q = q.eq("verification_status", searchParams.filter);
  const { data } = await q;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">Business</th>
            <th className="px-4 py-2 text-left">Emirate</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Created</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((v) => (
            <tr key={v.id} className="border-t border-bone-deep">
              <td className="px-4 py-2 font-medium">{v.business_name}</td>
              <td className="px-4 py-2">{v.emirate}</td>
              <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{v.verification_status}</span></td>
              <td className="px-4 py-2 text-ink-muted">{new Date(v.created_at).toLocaleString()}</td>
              <td className="px-4 py-2 text-right"><Link href={`/admin/vendors/${v.id}`} className="underline">Review</Link></td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">No vendors.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
