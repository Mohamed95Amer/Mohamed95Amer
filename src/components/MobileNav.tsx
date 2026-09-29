"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SignOutButton } from "./SignOutButton";

interface MobileNavProps {
  signedIn: boolean;
  displayName?: string | null;
  isVendor: boolean;
  isAdmin: boolean;
  isDeliveryCompany: boolean;
  isCustomer: boolean;
  language: "en" | "ar";
  unreadCount: number;
}

const publicLinks = [
  ["/marketplace", "Marketplace"],
  ["/compare", "GetGold Compare"],
  ["/requests/new", "Request a piece"],
  ["/vendors", "Verified stores"],
  ["/live-price", "Gold insights"],
  ["/how-it-works", "How it works"],
  ["/trust", "Trust & verification"],
] as const;

export function MobileNav({ signedIn, displayName, isVendor, isAdmin, isDeliveryCompany, isCustomer, language, unreadCount }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ar = language === "ar";

  useEffect(() => setOpen(false), [pathname]);

  const localizedPublicLinks = language === "ar" ? [["/marketplace", "السوق"], ["/compare", "قارن المتاجر"], ["/requests/new", "اطلب قطعة"], ["/vendors", "المتاجر الموثقة"], ["/live-price", "أسعار وتحليلات الذهب"], ["/how-it-works", "كيف يعمل"], ["/trust", "الثقة والتحقق"]] as const : publicLinks;
  const accountLinks: Array<readonly [string, string]> = signedIn
    ? [
        ["/profile", displayName ? (ar ? `ملف ${displayName}` : `${displayName}'s profile`) : ar ? "ملفي الشخصي" : "My profile"],
        ...(isCustomer ? [["/account", ar ? "سجل المشتريات" : "Purchase history"], ["/account/requests", ar ? "طلباتي للذهب" : "My gold requests"], ["/account/visits", ar ? "زيارات المتاجر" : "My store visits"]] as const : []),
        ["/account/saved", language === "ar" ? "المحفوظات والتنبيهات" : "Saved & alerts"],
        ["/account/notifications", `${language === "ar" ? "الإشعارات" : "Notifications"}${unreadCount ? ` (${unreadCount})` : ""}`],
        ...(isVendor ? [["/vendor", ar ? "لوحة المتجر" : "Vendor dashboard"]] as const : []),
        ...(isDeliveryCompany ? [["/delivery", ar ? "لوحة التوصيل" : "Delivery dashboard"]] as const : []),
        ...(isAdmin ? [["/admin", ar ? "لوحة الإدارة" : "Admin dashboard"]] as const : []),
      ]
    : [
        ["/login", ar ? "تسجيل الدخول" : "Sign in"],
        ["/register", ar ? "إنشاء حساب" : "Create an account"],
      ];

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-site-menu"
        aria-label={open ? (ar ? "إغلاق القائمة" : "Close navigation") : (ar ? "فتح القائمة" : "Open navigation")}
        onClick={() => setOpen((value) => !value)}
        className="grid h-11 w-11 place-items-center rounded-full border border-jade-900/15 bg-white text-jade-950 shadow-sm"
      >
        <span className="sr-only">{ar ? "القائمة" : "Menu"}</span>
        <span className="grid gap-1.5" aria-hidden="true">
          <span className={`h-0.5 w-5 bg-current transition ${open ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`h-0.5 w-5 bg-current transition ${open ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-5 bg-current transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
        </span>
      </button>

      {open && (
        <div id="mobile-site-menu" className="absolute inset-x-0 top-full border-t border-jade-900/10 bg-white shadow-lift">
          <nav className="container-pro grid gap-1 py-4" aria-label={ar ? "القائمة على الهاتف" : "Mobile navigation"}>
            {localizedPublicLinks.map(([href, label]) => (
              <NavLink key={href} href={href} label={label} active={pathname === href || pathname.startsWith(`${href}/`)} />
            ))}
            <div className="my-2 h-px bg-jade-900/10" />
            {accountLinks.map(([href, label]) => (
              <NavLink key={href} href={href} label={label} active={pathname === href || pathname.startsWith(`${href}/`)} />
            ))}
            {signedIn && <div className="mt-2 [&_button]:w-full"><SignOutButton arabic={ar} /></div>}
          </nav>
        </div>
      )}
    </div>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-jade-50 text-jade-900" : "text-ink-muted hover:bg-jade-50 hover:text-jade-900"
      }`}
    >
      {label}<span aria-hidden="true">→</span>
    </Link>
  );
}
