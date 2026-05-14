"use client";

import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  async function onClick() {
    await getBrowserSupabase().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button onClick={onClick} className="btn-ghost text-xs">Sign out</button>
  );
}
