import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export async function adminContext() {
  const {
    data: { user },
  } = await (await getServerSupabase()).auth.getUser();
  if (!user) return null;
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error || !["admin", "super_admin"].includes(data?.role)) return null;
  return { db, user };
}
