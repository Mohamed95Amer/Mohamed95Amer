import { redirect } from "next/navigation";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return data.user;
}

export async function getCurrentProfile() {
  const supabase = getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const admin = getServiceSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, phone, role")
    .eq("id", auth.user.id)
    .single();
  return profile ? { ...profile, email: auth.user.email } : null;
}

export type AccountRole = "customer" | "vendor" | "delivery_company" | "admin" | "super_admin";

export async function requireRole(roles: AccountRole[]) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role as (typeof roles)[number])) {
    redirect("/");
  }
  return profile;
}

export async function requireAdmin() {
  return requireRole(["admin", "super_admin"]);
}

export async function requireVendor() {
  return requireRole(["vendor", "admin", "super_admin"]);
}

export async function requireDeliveryCompany() {
  return requireRole(["delivery_company", "admin", "super_admin"]);
}
