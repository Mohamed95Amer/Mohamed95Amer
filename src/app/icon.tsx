import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: "#072F28", color: "#E9BD50", fontSize: 25, letterSpacing: -3, fontWeight: 700, fontFamily: "serif" }}>GG</div>,
    size,
  );
}
