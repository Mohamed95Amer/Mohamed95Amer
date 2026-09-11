import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { GoldPriceProvider } from "@/components/GoldPriceProvider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: {
    default: "GoldHub — Buy gold from verified UAE jewellers",
    template: "%s | GoldHub",
  },
  description:
    "GoldHub is a UAE marketplace for verified gold and jewellery shops. Live, transparent pricing — vendors remain the seller of record.",
  metadataBase: new URL(env.siteUrl()),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_AE",
    siteName: "GoldHub",
    title: "GoldHub — Buy gold from verified UAE jewellers",
    description: "Compare transparently priced gold and jewellery from verified UAE shops.",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-full bg-jade-950 px-4 py-2 text-sm font-semibold text-white transition focus:translate-y-0"
        >
          Skip to content
        </a>
        <GoldPriceProvider>
          <SiteHeader />
          <main id="main-content" className="flex-1">{children}</main>
          <SiteFooter />
        </GoldPriceProvider>
      </body>
    </html>
  );
}
