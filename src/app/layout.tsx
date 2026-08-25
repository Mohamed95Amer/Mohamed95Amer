import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { GoldPriceProvider } from "@/components/GoldPriceProvider";

export const metadata: Metadata = {
  title: "GoldHub — Buy gold from verified UAE jewellers",
  description:
    "GoldHub is a UAE marketplace for verified gold and jewellery shops. Live, transparent pricing — vendors remain the seller of record.",
  metadataBase: new URL("https://goldhub.example"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <GoldPriceProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </GoldPriceProvider>
      </body>
    </html>
  );
}
