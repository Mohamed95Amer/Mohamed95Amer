import type { Metadata } from "next";
import Link from "next/link";
import { BuyerRequestForm } from "@/components/BuyerRequestForm";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Request a gold piece", description: "Tell verified UAE gold stores what you want and compare their offers." };

export default async function NewBuyerRequestPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  return (
    <main className="container-pro max-w-4xl py-10 sm:py-14">
      <p className="eyebrow text-jade-600">{t("Get Gold Request", "طلب Get Gold")}</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950 sm:text-5xl">{t("Can’t find it? Let stores find it for you.", "لم تجد القطعة المناسبة؟ دع المتاجر تبحث عنها لك.")}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{t("Share the style, purity, budget and timing once. Verified UAE jewellers can respond without making you visit every shop in the souq.", "حدد التصميم والعيار والميزانية والموعد مرة واحدة، وستتمكن متاجر المجوهرات الإماراتية المعتمدة من الرد دون أن تزور كل محل في السوق.")}</p>
      <div className="mt-8"><BuyerRequestForm arabic={arabic} /></div>
      <p className="mt-5 text-sm text-ink-muted">{t("Already submitted?", "قدمت طلبًا بالفعل؟")} <Link href="/account/requests" className="font-semibold text-jade-700 underline">{t("View your requests", "عرض طلباتك")}</Link></p>
    </main>
  );
}
