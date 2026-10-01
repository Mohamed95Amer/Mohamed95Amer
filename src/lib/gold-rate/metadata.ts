import type { Metadata } from "next";
import { ratePath, type RateKarat, type RateLocale } from "./core";

const HUB = {
  en: {
    title: "Gold Rate Today in Dubai & UAE (AED per gram)",
    description: "Today's gold rate in Dubai and the UAE for 24K, 22K, 21K and 18K per gram, tola and 8 g in AED, with a daily price summary and free rate alerts.",
  },
  ar: {
    title: "سعر الذهب اليوم في دبي والإمارات بالدرهم",
    description: "سعر الذهب اليوم في دبي والإمارات لعيارات 24 و22 و21 و18 للغرام والتولة و8 غرامات بالدرهم، مع ملخص يومي وتنبيهات مجانية بالسعر.",
  },
} as const;

export function rateMetadata(locale: RateLocale, karat: RateKarat | null, title: string, description: string): Metadata {
  const path = ratePath(locale, karat?.slug);
  return {
    title: { absolute: `${title} | Get Gold` },
    description,
    alternates: {
      canonical: path,
      languages: {
        en: ratePath("en", karat?.slug),
        ar: ratePath("ar", karat?.slug),
        "x-default": ratePath("en", karat?.slug),
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_AE" : "en_AE",
      siteName: "Get Gold",
      title,
      description,
      url: path,
    },
  };
}

export function hubMetadata(locale: RateLocale): Metadata {
  return rateMetadata(locale, null, HUB[locale].title, HUB[locale].description);
}
