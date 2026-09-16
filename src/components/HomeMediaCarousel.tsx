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

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % slides.length), 5_500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;
  const slide = slides[Math.min(active, slides.length - 1)];

  return (
    <section
      aria-label="Get Gold highlights"
      className="container-pro py-7 sm:py-9"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative isolate min-h-[320px] overflow-hidden rounded-[2rem] border border-gold-300/35 bg-jade-950 shadow-lift sm:min-h-[390px]">
        {slide.mediaPath && slide.mediaType === "video" ? (
          <video key={slide.id} src={slide.mediaPath} aria-label={slide.mediaAlt} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 z-0 h-full w-full object-cover" />
        ) : slide.mediaPath ? (
          <Image key={slide.id} src={slide.mediaPath} alt={slide.mediaAlt} fill priority sizes="100vw" className="z-0 object-cover" />
        ) : null}
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-jade-950 via-jade-950/78 to-jade-950/18" />
        <div className="relative z-20 flex min-h-[320px] max-w-2xl flex-col justify-end p-7 text-white sm:min-h-[390px] sm:p-11">
          <span className="w-fit rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
            {slide.sponsored ? "Ad" : "Discover Get Gold"}
          </span>
          <h2 className="mt-4 font-serif text-3xl font-semibold leading-tight sm:text-5xl">{slide.title}</h2>
          {slide.body && <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">{slide.body}</p>}
          {slide.ctaHref && slide.ctaLabel && <Link href={slide.ctaHref} className="mt-6 inline-flex w-fit items-center rounded-full bg-gold-300 px-5 py-2.5 text-sm font-bold text-jade-950 transition hover:bg-gold-200">{slide.ctaLabel} →</Link>}
        </div>

        {slides.length > 1 && (
          <>
            <div className="absolute right-5 top-5 z-30 flex gap-2">
              <button type="button" aria-label="Previous highlight" onClick={() => setActive((value) => (value - 1 + slides.length) % slides.length)} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/25 text-lg text-white backdrop-blur transition hover:bg-black/45">‹</button>
              <button type="button" aria-label="Next highlight" onClick={() => setActive((value) => (value + 1) % slides.length)} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/25 text-lg text-white backdrop-blur transition hover:bg-black/45">›</button>
            </div>
            <div className="absolute bottom-5 right-5 z-30 flex items-center gap-2" role="tablist" aria-label="Choose highlight">
              {slides.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={index === active} aria-label={`Show highlight ${index + 1}: ${item.title}`} onClick={() => setActive(index)} className={`h-2 rounded-full transition-all ${index === active ? "w-7 bg-gold-300" : "w-2 bg-white/55 hover:bg-white"}`} />)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
