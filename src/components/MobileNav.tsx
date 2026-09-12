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
}

const publicLinks = [
  ["/marketplace", "Marketplace"],
  ["/vendors", "Verified stores"],
  ["/live-price", "Gold insights"],
  ["/how-it-works", "How it works"],
  ["/trust", "Trust & verification"],
] as const;

export function MobileNav({ signedIn, displayName, isVendor, isAdmin, isDeliveryCompany, isCustomer }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const accountLinks: Array<readonly [string, string]> = signedIn
    ? [
        ["/profile", displayName ? `${displayName}'s profile` : "My profile"],
        ...(isCustomer ? [["/account", "Purchase history"]] as const : []),
        ...(isVendor ? [["/vendor", "Vendor dashboard"]] as const : []),
        ...(isDeliveryCompany ? [["/delivery", "Delivery dashboard"]] as const : []),
        ...(isAdmin ? [["/admin", "Admin dashboard"]] as const : []),
      ]
    : [
        ["/login", "Sign in"],
        ["/register", "Create an account"],
      ];

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-site-menu"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((value) => !value)}
        className="grid h-11 w-11 place-items-center rounded-full border border-jade-900/15 bg-white text-jade-950 shadow-sm"
      >
        <span className="sr-only">Menu</span>
        <span className="grid gap-1.5" aria-hidden="true">
          <span className={`h-0.5 w-5 bg-current transition ${open ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`h-0.5 w-5 bg-current transition ${open ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-5 bg-current transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
        </span>
      </button>

      {open && (
        <div id="mobile-site-menu" className="absolute inset-x-0 top-full border-t border-jade-900/10 bg-white shadow-lift">
          <nav className="container-pro grid gap-1 py-4" aria-label="Mobile navigation">
            {publicLinks.map(([href, label]) => (
              <NavLink key={href} href={href} label={label} active={pathname === href || pathname.startsWith(`${href}/`)} />
            ))}
            <div className="my-2 h-px bg-jade-900/10" />
            {accountLinks.map(([href, label]) => (
              <NavLink key={href} href={href} label={label} active={pathname === href || pathname.startsWith(`${href}/`)} />
            ))}
            {signedIn && <div className="mt-2 [&_button]:w-full"><SignOutButton /></div>}
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
