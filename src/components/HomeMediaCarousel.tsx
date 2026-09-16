"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ActiveSiteBanner } from "@/lib/marketing";
import { publicStorageUrl } from "@/lib/storage";

const MARKETING_ASSET_BUCKET = "marketing-assets";

export interface HomeShowcaseSlide {
  id: string;
  title: string;
  body: string | null;
  mediaPath: string | null;
  mediaAlt: string;
  mediaType: "image" | "video";
  ctaLabel: string | null;
  ctaHref: string | null;
  sponsored?: boolean;
}

export function HomeMediaCarousel({ banners, fallbackSlides }: { banners: ActiveSiteBanner[]; fallbackSlides: HomeShowcaseSlide[] }) {
  const slides = useMemo<HomeShowcaseSlide[]>(() => {
    if (banners.length > 0) {
      return banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        body: banner.body,
        mediaPath: banner.imagePath ? publicStorageUrl(banner.imagePath, MARKETING_ASSET_BUCKET) : null,
        mediaAlt: banner.imageAlt ?? banner.title,
        mediaType: banner.mediaType,
        ctaLabel: banner.ctaLabel,
        ctaHref: banner.ctaHref,
        sponsored: true,
      }));
    }
    return fallbackSlides;
  }, [banners, fallbackSlides]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manualPause, setManualPause] = useState(false);

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  useEffect(() => {
    if (paused || manualPause || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % slides.length), 5_500);
    return () => window.clearInterval(timer);
  }, [paused, manualPause, slides.length]);

  if (slides.length === 0) return null;
  const slide = slides[Math.min(active, slides.length - 1)];

  return (
    <section
      aria-label="Get Gold highlights"
      className="container-pro py-5 sm:py-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative isolate min-h-[240px] overflow-hidden rounded border border-bone-deep/60 bg-bone sm:min-h-[220px]">
        {slide.mediaPath && slide.mediaType === "video" ? (
          <video key={slide.id} src={slide.mediaPath} aria-label={slide.mediaAlt} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 z-0 h-full w-full object-cover" />
        ) : slide.mediaPath ? (
          <Image key={slide.id} src={slide.mediaPath} alt={slide.mediaAlt} fill priority sizes="100vw" className="z-0 object-cover" />
        ) : null}
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#eee5d8] via-[#eee5d8]/90 to-transparent" />
        <div className="relative z-20 flex min-h-[240px] max-w-xl flex-col justify-center p-6 text-ink sm:min-h-[220px] sm:p-7">
          <span className="w-fit text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-600">
            {slide.sponsored ? "Ad" : "Discover Get Gold"}
          </span>
          <h2 className="mt-3 max-w-sm font-serif text-2xl leading-tight sm:text-3xl">{slide.title}</h2>
          {slide.body && <p className="mt-2 max-w-sm text-xs leading-relaxed text-ink-soft">{slide.body}</p>}
          {slide.ctaHref && slide.ctaLabel && <Link href={slide.ctaHref} className="mt-4 inline-flex min-h-11 w-fit items-center text-xs font-semibold text-jade-800 underline underline-offset-4">{slide.ctaLabel} →</Link>}
        </div>

        {slides.length > 1 && (
          <>
            <div className="absolute right-3 top-3 z-30 flex gap-1">
              <button type="button" aria-label={manualPause ? "Resume highlight rotation" : "Pause highlight rotation"} aria-pressed={manualPause} onClick={() => setManualPause((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full border border-white/60 bg-white/85 text-xs text-jade-900 backdrop-blur transition hover:bg-white">{manualPause ? "▶" : "Ⅱ"}</button>
              <button type="button" aria-label="Previous highlight" onClick={() => setActive((value) => (value - 1 + slides.length) % slides.length)} className="grid h-11 w-11 place-items-center rounded-full border border-white/60 bg-white/85 text-lg text-jade-900 backdrop-blur transition hover:bg-white">‹</button>
              <button type="button" aria-label="Next highlight" onClick={() => setActive((value) => (value + 1) % slides.length)} className="grid h-11 w-11 place-items-center rounded-full border border-white/60 bg-white/85 text-lg text-jade-900 backdrop-blur transition hover:bg-white">›</button>
            </div>
            <div className="absolute bottom-5 right-5 z-30 flex items-center gap-2" role="tablist" aria-label="Choose highlight">
              {slides.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={index === active} aria-label={`Show highlight ${index + 1}: ${item.title}`} onClick={() => setActive(index)} className="grid h-11 w-11 place-items-center"><span className={`block h-1.5 rounded-full transition-all ${index === active ? "w-7 bg-jade-800" : "w-2 bg-jade-800/35"}`} /></button>)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
