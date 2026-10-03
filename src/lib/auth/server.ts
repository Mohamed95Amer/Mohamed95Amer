import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const getVerifiedUser = cache(async () => {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export async function requireUser() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login");
  return user;
}

export const getCurrentProfile = cache(async () => {
  const user = await getVerifiedUser();
  if (!user) return null;
  const admin = getServiceSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, phone, role")
    .eq("id", user.id)
    .single();
  return profile ? { ...profile, email: user.email } : null;
});

export type AccountRole =
  "customer" | "vendor" | "delivery_company" | "admin" | "super_admin";

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
