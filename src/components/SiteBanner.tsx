import Image from "next/image";
import Link from "next/link";
import { publicStorageUrl } from "@/lib/storage";
import { MARKETING_ASSET_BUCKET, type ActiveSiteBanner } from "@/lib/marketing";

export function SiteBanner({ banner }: { banner: ActiveSiteBanner }) {
  const mediaUrl = banner.imagePath ? publicStorageUrl(banner.imagePath, MARKETING_ASSET_BUCKET) : null;
  const content = (
    <div className="relative isolate overflow-hidden rounded-3xl border border-gold-300/40 bg-gradient-to-r from-jade-950 via-jade-900 to-jade-700 px-6 py-7 text-white shadow-lift sm:px-9">
      {mediaUrl && banner.mediaType === "video" ? <video src={mediaUrl} aria-label={banner.imageAlt ?? undefined} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 z-0 h-full w-full object-cover opacity-35" /> : null}
      {mediaUrl && banner.mediaType === "image" ? <Image src={mediaUrl} alt={banner.imageAlt ?? ""} fill sizes="100vw" className="z-0 object-cover opacity-30" /> : null}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-jade-950/95 via-jade-900/75 to-jade-900/25" />
      <div className="relative z-20">
        <span className="inline-flex rounded-full border border-white/20 bg-black/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">Ad</span>
        <h2 className="mt-3 max-w-2xl font-serif text-2xl font-semibold sm:text-3xl">{banner.title}</h2>
        {banner.body && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">{banner.body}</p>}
        {banner.ctaLabel && <span className="mt-5 inline-flex rounded-full bg-gold-300 px-4 py-2 text-sm font-bold text-jade-950">{banner.ctaLabel} →</span>}
      </div>
    </div>
  );
  return banner.ctaHref ? <Link href={banner.ctaHref}>{content}</Link> : content;
}

export function SiteBannerStack({ banners }: { banners: ActiveSiteBanner[] }) {
  if (banners.length === 0) return null;
  return <div className="grid gap-4">{banners.map((banner) => <SiteBanner key={banner.id} banner={banner} />)}</div>;
}
