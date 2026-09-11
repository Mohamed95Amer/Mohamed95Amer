import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Terms of use", description: "Terms for using the Get Gold UAE gold marketplace.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <PolicyPage eyebrow="Marketplace terms" title="Terms of use" intro="These terms explain Get Gold’s role, how reservations work and the responsibilities shared by customers, listed vendors and assigned delivery companies." sections={[
    { title: "Get Gold’s role", paragraphs: ["Get Gold provides a marketplace for discovering products, comparing disclosed pricing and reserving inventory from independent UAE vendors. The vendor named on a listing owns the inventory, issues the sale invoice and remains the seller of record.", "Get Gold is not a jeweller, investment adviser, appraiser, payment provider, courier or custodian of customer funds in the current marketplace model."] },
    { title: "Listings and live prices", paragraphs: ["Displayed totals are estimates linked to the latest usable 24K reference price. At reservation, the server recalculates every component and stores the exact market snapshot used.", "Product photography, hallmark details, certificates, availability and non-gold charges are supplied by the vendor and reviewed before publication. Customers should inspect the final invoice and product documents before completing payment."] },
    { title: "Reservations", bullets: ["A reservation is a temporary stock and price hold, not a completed sale.", "The reservation screen shows its expiry and vendor-confirmation status.", "The vendor may decline if the exact item cannot be supplied; no payment should be made for a declined or expired reservation.", "Attempting to manipulate prices, stock, accounts or reviews is prohibited."] },
    { title: "Payments and fulfilment", paragraphs: ["Unless Get Gold explicitly introduces an integrated payment service, the vendor arranges payment directly and remains responsible for invoicing, fulfilment, refunds and product warranties. Customers must verify that any payment request matches the vendor and reservation. Delivery companies remain responsible for services they accept and receive customer data only for assigned fulfilment."] },
    { title: "Accounts and reviews", paragraphs: ["You are responsible for keeping account credentials secure and providing accurate information. Verified-purchase reviews must reflect a genuine completed transaction and must not contain abuse, spam or personal information."] },
    { title: "Changes and availability", paragraphs: ["Gold prices and inventory can change quickly. Get Gold may pause reservations, remove a listing or suspend an account when data is stale, verification expires or marketplace safety requires it."] },
  ]} />;
}
