import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Privacy policy", description: "How Get Gold handles customer, vendor, delivery partner and marketplace data.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return <PolicyPage eyebrow="Your information" title="Privacy policy" intro="Get Gold collects only the information needed to operate accounts, reservations, partner verification and marketplace safety." sections={[
    { title: "Information we collect", bullets: ["Account details such as name, email and phone number.", "Reservation, purchase, review and support history.", "Vendor identity, licence, address and verification documents.", "Technical and security information such as timestamps, IP address and audit events."] },
    { title: "How we use information", paragraphs: ["We use information to authenticate users, display account history, create price-locked reservations, verify vendors, prevent overselling and fraud, moderate reviews, provide support and maintain legally relevant records."] },
    { title: "Who receives information", paragraphs: ["A vendor receives the customer and reservation information needed to confirm and fulfil that vendor’s order. An approved delivery company receives only the fulfilment information needed after it is assigned. Infrastructure, authentication, hosting and storage providers process information on Get Gold’s behalf. We do not publish private business documents."] },
    { title: "Retention and security", paragraphs: ["Reservation price snapshots and audit records are retained to preserve transaction integrity. Other information is kept only while reasonably needed for its stated purpose. Access controls, private storage and server-side authorization are used to restrict sensitive data."] },
    { title: "Your choices", paragraphs: ["You may ask to access or correct account information or raise a deletion request. Some transaction, fraud-prevention or legal records may need to be retained. Marketing communication will use a separate opt-in if introduced."] },
  ]} />;
}
