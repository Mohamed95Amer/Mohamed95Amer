"use client";
import { useEffect, useState } from "react";
export default function VendorError({ reset }: { reset: () => void }) {
  const [ar, setAr] = useState(false);
  useEffect(() => setAr(document.documentElement.lang === "ar"), []);
  return <div className="container-pro py-16"><div className="card mx-auto max-w-lg p-8 text-center"><h1 className="font-serif text-2xl">{ar ? "تعذر تحميل بيانات المتجر" : "We couldn’t load your store"}</h1><p className="mt-3 text-sm leading-relaxed text-ink-muted">{ar ? "قد يكون الاتصال متقطعاً. أعد المحاولة لعرض أحدث البيانات." : "The connection may have been interrupted. Retry to load the latest information."}</p><button className="btn-primary mt-6" onClick={reset}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div></div>;
}
