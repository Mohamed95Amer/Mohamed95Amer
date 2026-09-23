export type OrderMessage = {
  id: string;
  reservation_id: string;
  sender_user_id: string;
  sender_role: "customer" | "vendor";
  message_type: "text" | "payment_link";
  body: string;
  payment_url: string | null;
  created_at: string;
};

/** Payment links must leave no room for local-network or credential-in-URL tricks. */
export function isSecureExternalPaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local"))
      return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd"))
      return false;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      if (octets.some((part) => part > 255)) return false;
      if (
        octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function paymentLinkHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "vendor payment page";
  }
}
