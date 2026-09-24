import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Cancellations & refunds", description: "Cancellation and refund process for Get Gold marketplace reservations.", alternates: { canonical: "/cancellations-and-refunds" } };

export default function RefundPolicyPage() {
  return <PolicyPage eyebrow="Order changes" title="Cancellations & refunds" intro="A price lock is not a completed purchase. What happens next depends on whether the reservation expired, the vendor accepted it and payment was made." sections={[
    { title: "Before payment", paragraphs: ["An unpaid reservation may expire automatically when its lock ends. If the vendor declines or cannot supply the exact item, the reservation closes and the customer should not pay."] },
    { title: "After payment", paragraphs: ["Because the vendor is the seller of record and receives payment directly, that vendor handles cancellation, refund and warranty requests under its disclosed policy and applicable UAE requirements. Get Gold can preserve the reservation evidence and help route a dispute."] },
    { title: "Incorrect, damaged or misdescribed items", bullets: ["Contact the vendor and Get Gold promptly with the reservation number.", "Keep the invoice, packaging, certificate and photographs of the issue.", "Do not alter or resize the item before the vendor has assessed the concern."] },
    { title: "Custom and price-sensitive products", paragraphs: ["Made-to-order, engraved or altered jewellery may have different cancellation conditions. Gold price movement by itself does not change the price of a completed sale or create a guaranteed resale value."] },
    { title: "Refund timing", paragraphs: ["The vendor should confirm the approved refund amount, method and expected timing. Get Gold does not hold customer money in the current model and cannot issue a refund from funds it did not receive."] },
  ]} />;
}
