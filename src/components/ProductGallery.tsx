"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ProductImage, productPhotos } from "@/components/ProductImage";

export function ProductGallery({
  name,
  category,
  karat,
  images,
  arabic = false,
}: {
  name: string;
  category: string;
  karat: number;
  images: unknown;
  arabic?: boolean;
}) {
  const photos = productPhotos(images);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const t = (en: string, ar: string) => arabic ? ar : en;

  const close = useCallback(() => {
    setOpen(false);
    setZoom(1);
  }, []);

  const move = useCallback((delta: number) => {
    if (photos.length < 2) return;
    setActive((index) => (index + delta + photos.length) % photos.length);
    setZoom(1);
  }, [photos.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [close, move, open]);

  return (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-jade-900/10 bg-jade-50 shadow-card">
        <button
          type="button"
          className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-4 focus-visible:outline-jade-500"
          onClick={() => photos.length > 0 && setOpen(true)}
          aria-label={photos.length ? t("Open product photo gallery and zoom", "افتح معرض صور المنتج وكبّر الصورة") : t("Product illustration", "رسم توضيحي للمنتج")}
          disabled={photos.length === 0}
        >
          <ProductImage
            category={category}
            karat={karat}
            name={name}
            images={photos.length ? [photos[active]] : images}
            sizes="(max-width: 1024px) 100vw, 60vw"
            priority
          />
        </button>
        {photos.length > 0 && (
          <span className="pointer-events-none absolute bottom-4 end-4 z-20 rounded-full bg-jade-950/80 px-3 py-1.5 text-xs font-medium text-white">
            {photos.length > 1 ? t("Tap to view · photos", "اضغط للعرض · الصور") : t("Tap to zoom", "اضغط للتكبير")}
            {photos.length > 1 ? ` ${active + 1}/${photos.length}` : ""}
          </span>
        )}
        <span className="pointer-events-none absolute start-4 top-4 z-20 rounded-full border border-white/25 bg-white/90 px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-jade-950 shadow-sm backdrop-blur">
          {karat}K
        </span>
      </div>

      {photos.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label={t("Product photos", "صور المنتج")}>
          {photos.map((photo, index) => (
            <button
              type="button"
              key={photo}
              onClick={() => setActive(index)}
              className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-white ${active === index ? "border-jade-700 ring-2 ring-jade-700/20" : "border-transparent hover:border-jade-300"}`}
              aria-label={t(`View photo ${index + 1}`, `عرض الصورة ${index + 1}`)}
              aria-current={active === index}
            >
              <Image src={photo} alt={`${name} ${index + 1}`} fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {open && photos.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 text-white sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={t(`${name} photo gallery`, `معرض صور ${name}`)}
          onClick={close}
        >
          <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-3 sm:inset-x-8 sm:top-6">
            <p className="max-w-[55vw] truncate text-sm font-medium sm:text-base">{name} · {active + 1}/{photos.length}</p>
            <div className="flex items-center gap-2">
              <button type="button" className="min-h-11 min-w-11 rounded-full bg-white/10 px-3 text-lg hover:bg-white/20" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.max(1, value - 0.5)); }} aria-label={t("Zoom out", "تصغير")}>−</button>
              <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" className="min-h-11 min-w-11 rounded-full bg-white/10 px-3 text-lg hover:bg-white/20" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.min(3, value + 0.5)); }} aria-label={t("Zoom in", "تكبير")}>+</button>
              <button type="button" className="min-h-11 min-w-11 rounded-full bg-white/10 text-xl hover:bg-white/20" onClick={close} aria-label={t("Close gallery", "إغلاق المعرض")}>×</button>
            </div>
          </div>

          {photos.length > 1 && <button type="button" className="absolute start-2 z-10 min-h-12 min-w-12 rounded-full bg-white/10 text-3xl hover:bg-white/20 sm:start-6" onClick={(event) => { event.stopPropagation(); move(-1); }} aria-label={t("Previous photo", "الصورة السابقة")}>‹</button>}
          <div className="relative h-[78vh] w-full max-w-6xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <Image
              src={photos[active]}
              alt={`${name} ${active + 1}`}
              fill
              priority
              sizes="100vw"
              className="object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
          {photos.length > 1 && <button type="button" className="absolute end-2 z-10 min-h-12 min-w-12 rounded-full bg-white/10 text-3xl hover:bg-white/20 sm:end-6" onClick={(event) => { event.stopPropagation(); move(1); }} aria-label={t("Next photo", "الصورة التالية")}>›</button>}
          <p className="absolute bottom-4 text-center text-xs text-white/70">{t("Use +/− to zoom · arrow keys to change photos · Esc to close", "استخدم +/− للتكبير · الأسهم لتغيير الصورة · Esc للإغلاق")}</p>
        </div>
      )}
    </>
  );
}
