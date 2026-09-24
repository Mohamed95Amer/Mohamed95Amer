import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#072F28", color: "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, color: "#E9BD50", fontSize: 34, letterSpacing: 5, textTransform: "uppercase" }}>Get Gold · UAE</div>
      <div style={{ marginTop: 35, maxWidth: 900, fontSize: 76, lineHeight: 1.05, fontWeight: 700, fontFamily: "serif" }}>See the price. Get the gold.</div>
      <div style={{ marginTop: 28, maxWidth: 820, fontSize: 30, lineHeight: 1.4, color: "#AFDCCA" }}>Live market-linked totals from verified UAE gold shops.</div>
    </div>,
    size,
  );
}
