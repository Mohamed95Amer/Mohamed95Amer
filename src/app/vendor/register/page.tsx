import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorOnboardingForm } from "./VendorOnboardingForm";
import { VendorNav } from "@/components/VendorNav";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function VendorRegisterPage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("vendors").select("*").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!profile || !["customer", "vendor"].includes(profile.role)) redirect("/profile");

  if (existing) return <div className="container-pro py-8 sm:py-10"><p className="eyebrow text-jade-600">{arabic ? "إدارة بيانات النشاط" : "Business information"}</p><h1 className="mt-2 font-serif text-3xl">{arabic ? "بيانات المتجر" : "Store details"}</h1><VendorNav arabic={arabic} /><p className="mb-6 rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm leading-relaxed">{arabic ? "إعادة إرسال بيانات النشاط تُعيد متجرك إلى المراجعة وتوقف ظهوره حتى موافقة الإدارة. لتغيير الدفع أو الدوام، استخدم صفحة الدفع والدوام." : "Resubmitting business details returns your store to review and pauses its visibility until admin approval. To change payments or opening times, use Payments & hours."}</p>{existing.admin_notes && <p className="mb-4 text-sm">{existing.admin_notes}</p>}<div className="card max-w-4xl p-5 sm:p-8"><VendorOnboardingForm initial={existing} language={arabic ? "ar" : "en"} /></div></div>;
  return (
    <div className="container-pro py-10 sm:py-14">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <aside className="lg:sticky lg:top-32">
          <p className="eyebrow text-jade-600">{arabic ? "شراكة مع Get Gold" : "Partner with Get Gold"}</p>
          <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">{arabic ? "اجعل متجرك متاحاً للعملاء في كل الإمارات." : "Bring your store to customers across the UAE."}</h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{arabic ? "أخبرنا عن نشاطك وسنساعدك على عرض كتالوج الذهب عبر الإنترنت. يراجع فريق Get Gold طلبك قبل نشر المنتجات." : "Tell us about your business and we will help you bring your gold catalogue online. Your application is reviewed by Get Gold before products are published."}</p>
          <div className="mt-7 space-y-3">
            {(arabic ? [["01", "قدّم طلبك خلال دقائق", "شارك بيانات التواصل والمتجر."], ["02", "مراجعة البيانات", "يتحقق فريقنا من معلومات نشاطك."], ["03", "ابدأ عرض منتجاتك", "أضف المنتجات والأسعار وخيارات التسليم."]] : [["01", "Apply in a few minutes", "Share your contact and store details."], ["02", "Get reviewed", "Our team checks the business information."], ["03", "Start listing", "Add products, live prices and fulfilment options."]]).map(([step, title, body]) => <div key={step} className="flex gap-3 rounded-2xl border border-jade-900/10 bg-white/70 p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jade-900 text-xs font-semibold text-white">{step}</span><div><p className="font-semibold text-jade-950">{title}</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{body}</p></div></div>)}
          </div>
          <div className="mt-7 rounded-2xl border border-gold-300/50 bg-gold-50 p-4 text-sm leading-relaxed text-jade-950"><strong>{arabic ? "معلومة مهمة:" : "Good to know:"}</strong> {arabic ? "نسخ الرخصة التجارية والهوية الإماراتية اختيارية في الطلب الأول ويمكن رفعها لاحقاً من لوحة المتجر الخاصة." : "Trade licence and Emirates ID copies are optional on this first application. You can upload them later from your private vendor dashboard."}</div>
        </aside>
        <section>
      <div className="card mt-6 p-6">
        <VendorOnboardingForm initial={existing ?? null} language={arabic ? "ar" : "en"} />
      </div>
        </section>
      </div>
    </div>
  );
}
