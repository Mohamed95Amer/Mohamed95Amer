import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { ReferralShare } from "@/components/ReferralShare";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = await requireUser(); const admin = getServiceSupabase(); let { data: referral } = await admin.from("referral_codes").select("code").eq("user_id", user.id).maybeSingle();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  if (!referral) { for (let attempt = 0; attempt < 3 && !referral; attempt += 1) { const code = randomBytes(6).toString("hex").toUpperCase(); const result = await admin.from("referral_codes").insert({ user_id: user.id, code }).select("code").single(); if (result.data) referral = result.data; } }
  const { data: attributions } = await admin.from("referral_attributions").select("referred_user_id, first_purchase_at, created_at").eq("referrer_user_id", user.id); const joined = attributions?.length ?? 0; const purchased = (attributions ?? []).filter((row) => row.first_purchase_at).length; const url = referral ? `${env.siteUrl()}/register?ref=${referral.code}` : env.siteUrl();
  return <main className="container-pro max-w-4xl py-10 sm:py-14" dir={ar ? "rtl" : "ltr"}><p className="eyebrow text-jade-600">{ar ? "دعوات موثوقة" : "Grow trusted demand"}</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">{ar ? "ادعُ أصدقاءك إلى Get Gold" : "Invite friends to Get Gold"}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{ar ? "شارك الأسعار الواضحة والمتاجر الإماراتية الموثّقة. لا توجد مكافأة نقدية حالياً؛ نسجل الدعوات الفعلية لاختبار برنامج عادل قبل الإعلان عن أي حوافز." : "Share transparent pricing and verified UAE stores. There is no cash reward yet; this records genuine invitations so a fair programme can be tested before incentives are promised."}</p><ReferralShare url={url} arabic={ar} /><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="card p-6"><p className="label">{ar ? "أصدقاء انضموا" : "Friends joined"}</p><p className="mt-2 font-serif text-4xl text-jade-950">{joined}</p></div><div className="card p-6"><p className="label">{ar ? "أكملوا أول عملية شراء" : "Reached first purchase"}</p><p className="mt-2 font-serif text-4xl text-jade-950">{purchased}</p></div></div></main>;
}
