import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Delivery & collection", description: "How delivery and shop collection work for Get Gold reservations.", alternates: { canonical: "/delivery-and-collection" } };

export default function DeliveryPolicyPage() {
  return <PolicyPage eyebrow="Receiving your order" title="Delivery & collection" intro="The listed vendor fulfils the order. Availability, handover method and any applicable delivery charge must be confirmed before payment." sections={[
    { title: "Choose and confirm", paragraphs: ["The current MVP does not assign a courier automatically. After accepting a reservation, the vendor confirms whether the item will be collected in store or delivered and provides the expected timing."] },
    { title: "Delivery charges", paragraphs: ["Any configured delivery fee is shown separately in the product price breakdown and captured in the reservation snapshot. If the vendor proposes a different fee or method, the customer should approve the change before paying."] },
    { title: "Secure handover", bullets: ["Check the tamper seal, invoice, weight, hallmark and certificate where applicable.", "Do not share an OTP until the parcel and recipient details have been verified.", "Report visible damage, missing documents or a mismatched item immediately."] },
    { title: "Delays and risk", paragraphs: ["The vendor is responsible for the delivery method it selects and should explain insurance or loss coverage before dispatch. Get Gold should not be described as providing insured delivery unless a specific integrated service is shown in the reservation."] },
  ]} />;
}
