import Link from "next/link";
import { GoldPriceBadge } from "./GoldPriceBadge";
import { SignOutButton } from "./SignOutButton";
import { getCurrentProfile } from "@/lib/auth/server";
import { MobileNav } from "./MobileNav";
import { cookies } from "next/headers";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { getInboxSummary } from "@/lib/notifications/inbox";
import { NotificationBell } from "./NotificationBell";

/**
 * Site header.
 *
 * Reads the session so a signed-in visitor can actually get somewhere: without
 * this the account area — and every reservation a customer has made — has no
 * link anywhere in the app, and the only sign-out control sits on a page you
 * cannot navigate to. Vendors and admins get a link to their own area by role.
 */
export async function SiteHeader() {
  const profile = await getCurrentProfile();
  const language =
    (await cookies()).get("gg_lang")?.value === "ar" ? "ar" : "en";
  const t =
    language === "ar"
      ? {
          market: "السوق",
          request: "اطلب قطعة",
          vendors: "المتاجر",
          insights: "أسعار الذهب",
          how: "كيف يعمل",
          trust: "الثقة",
          tagline: "شاهد السعر. احصل على الذهب.",
          eyebrow: "سوق الذهب في الإمارات",
        }
      : {
          market: "Marketplace",
          request: "Request a piece",
          vendors: "Vendors",
          insights: "Gold insights",
          how: "How it works",
          trust: "Trust",
          tagline: "See the price. Get the gold.",
          eyebrow: "UAE gold marketplace",
        };
  const role = profile?.role as
    | "customer"
    | "vendor"
    | "delivery_company"
    | "admin"
    | "super_admin"
    | undefined;
  const isAdmin = role === "admin" || role === "super_admin";
  const isVendor = role === "vendor";
  const isDeliveryCompany = role === "delivery_company";
  // A notification outage must not take down checkout or the whole marketplace.
  const unreadCount = profile
    ? await getInboxSummary(profile.id)
        .then((r) => r.unread)
        .catch(() => 0)
    : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-bone-deep/60 bg-[#fcfaf7]/95 backdrop-blur-xl">
      <div className="container-pro flex min-h-[76px] items-center justify-between gap-4">
        <Link
          href="/"
          className="shrink-0 font-serif text-[27px] tracking-[-0.035em] text-[#171c18] sm:text-[30px]"
          aria-label="Get Gold home"
        >
          GET GOLD
        </Link>
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-6 text-xs text-ink lg:flex xl:gap-8"
        >
          <Link href="/marketplace" className="py-4 hover:text-jade-600">
            {language === "ar" ? t.market : "Shop"}{" "}
            <span className="ml-1 text-[10px]" aria-hidden="true">
              ⌄
            </span>
          </Link>
          <Link href="/live-price" className="py-4 hover:text-jade-600">
            {language === "ar" ? t.insights : "Gold price"}
          </Link>
          <Link href="/vendors" className="py-4 hover:text-jade-600">
            {language === "ar" ? t.vendors : "Stores"}
          </Link>
          <Link href="/how-it-works" className="py-4 hover:text-jade-600">
            {t.how}
          </Link>
        </nav>
        <div className="hidden border-l border-bone-deep/70 pl-5 xl:block">
          <p className="mb-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            24K gold · market reference
          </p>
          <GoldPriceBadge compact />
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher language={language} />
          {profile ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="px-2 py-3 text-xs hover:text-jade-600"
                >
                  Admin
                </Link>
              )}
              {isVendor && (
                <Link
                  href="/vendor"
                  className="px-2 py-3 text-xs hover:text-jade-600"
                >
                  Vendor
                </Link>
              )}
              {isDeliveryCompany && (
                <Link
                  href="/delivery"
                  className="px-2 py-3 text-xs hover:text-jade-600"
                >
                  Delivery
                </Link>
              )}
              <Link
                href="/profile"
                className="grid h-11 w-11 place-items-center"
                aria-label={`Profile: ${firstName(profile.full_name) ?? "My profile"}`}
              >
                <AccountIcon />
              </Link>
              <NotificationBell
                count={unreadCount}
                arabic={language === "ar"}
              />
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="grid h-11 w-11 place-items-center"
              aria-label="Sign in to your account"
            >
              <AccountIcon />
            </Link>
          )}
          <Link
            href={profile ? "/account" : "/login?next=/account"}
            className="grid h-11 w-11 place-items-center"
            aria-label="My orders"
          >
            <svg
              width="23"
              height="25"
              viewBox="0 0 24 26"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden="true"
            >
              <path d="M5 8h14l2 16H3ZM8 10V6a4 4 0 0 1 8 0v4" />
            </svg>
          </Link>
        </div>
        <div className="flex items-center lg:hidden">
          <LanguageSwitcher language={language} />
          {profile && (
            <NotificationBell count={unreadCount} arabic={language === "ar"} />
          )}
          <MobileNav
            signedIn={Boolean(profile)}
            displayName={firstName(profile?.full_name)}
            isVendor={isVendor}
            isAdmin={isAdmin}
            isDeliveryCompany={isDeliveryCompany}
            isCustomer={role === "customer"}
            language={language}
            unreadCount={unreadCount}
          />
        </div>
      </div>
      <div className="flex min-h-10 justify-center border-t border-bone-deep/40 bg-bone-soft py-1 xl:hidden">
        <GoldPriceBadge compact />
      </div>
    </header>
  );
}

function AccountIcon() {
  return (
    <svg
      width="23"
      height="25"
      viewBox="0 0 24 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M3 24v-3a9 9 0 0 1 18 0v3" />
    </svg>
  );
}

function firstName(full?: string | null): string | null {
  const n = full?.trim().split(/\s+/)[0];
  return n && n.length > 0 ? n : null;
}
