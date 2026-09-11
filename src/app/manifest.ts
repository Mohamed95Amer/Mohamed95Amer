import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GoldHub UAE",
    short_name: "GoldHub",
    description: "Live-priced gold and jewellery from verified UAE shops.",
    start_url: "/",
    display: "standalone",
    background_color: "#FCFAF5",
    theme_color: "#072F28",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
