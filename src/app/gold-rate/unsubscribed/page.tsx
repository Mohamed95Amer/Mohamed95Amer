import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Unsubscribed", robots: { index: false, follow: false } };

export default async function UnsubscribedPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const arabic = (await searchParams).lang === "ar";
  return (
    <div className="container-pro py-16" dir={arabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-lg rounded-2xl border border-jade-900/10 bg-white p-8 text-center">
        <h1 className="font-serif text-3xl text-jade-950">{arabic ? "تم إلغاء الاشتراك" : "You're unsubscribed"}</h1>
        <p className="mt-3 text-sm text-ink-muted">{arabic ? "لن تصلك رسائل سعر الذهب بعد الآن." : "You won't receive gold rate emails from Get Gold any more."}</p>
        <Link href={arabic ? "/ar/gold-rate" : "/gold-rate"} className="btn-primary mt-6 inline-flex">{arabic ? "سعر الذهب اليوم" : "Gold rate today"}</Link>
      </div>
    </div>
  );
}
