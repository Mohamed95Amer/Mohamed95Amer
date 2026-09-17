import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 42, background: "#072F28", color: "#E9BD50", fontSize: 70, letterSpacing: -8, fontWeight: 700, fontFamily: "serif" }}>GG</div>,
    size,
  );
}
