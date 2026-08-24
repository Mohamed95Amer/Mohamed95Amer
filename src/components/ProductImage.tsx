/**
 * Product artwork.
 *
 * Vendors can attach real photos via `products.images`; when that array is
 * empty we fall back to a drawing of the actual item type rather than a
 * generic box, so the artwork always agrees with the product title.
 * The fallback is inline SVG — no remote image host, nothing to break.
 */

export type ProductCategory =
  | "ring"
  | "necklace"
  | "bracelet"
  | "earring"
  | "bangle"
  | "chain"
  | "pendant"
  | "bar"
  | "coin"
  | "other";

const CATEGORIES: ProductCategory[] = [
  "ring", "necklace", "bracelet", "earring", "bangle",
  "chain", "pendant", "bar", "coin", "other",
];

function normalize(category: string | null | undefined): ProductCategory {
  const c = (category ?? "").toLowerCase().trim();
  return (CATEGORIES as string[]).includes(c) ? (c as ProductCategory) : "other";
}

/** Karat drives the gold tone: 24K is the warmest, 18K the palest. */
function tone(karat: number | null | undefined) {
  switch (Number(karat)) {
    case 24: return { light: "#F2E7C6", mid: "#D6B65A", dark: "#A98220" };
    case 22: return { light: "#F2E7C6", mid: "#D2AE55", dark: "#9E7A1F" };
    case 21: return { light: "#EFE3C0", mid: "#CBA753", dark: "#95731D" };
    default: return { light: "#EAE0C8", mid: "#C2A165", dark: "#8A6D28" };
  }
}

export function ProductImage({
  category,
  karat,
  name,
  images,
  className = "",
}: {
  category: string | null | undefined;
  karat: number | null | undefined;
  name: string;
  images?: unknown;
  className?: string;
}) {
  const photo = firstPhoto(images);
  if (photo) {
    // Real vendor upload wins over the drawn fallback.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} className={`h-full w-full object-cover ${className}`} />;
  }

  const kind = normalize(category);
  const t = tone(karat);
  const gid = `g-${kind}-${Number(karat) || 0}`;

  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-label={`${name} — ${kind} illustration`}
      className={`h-full w-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.light} />
          <stop offset="45%" stopColor={t.mid} />
          <stop offset="100%" stopColor={t.dark} />
        </linearGradient>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBF9F4" />
          <stop offset="100%" stopColor="#EDE7DA" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${gid}-bg)`} />
      <Art kind={kind} fill={`url(#${gid})`} stroke={t.dark} />
    </svg>
  );
}

function firstPhoto(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const entry of images) {
    if (typeof entry === "string" && entry.trim()) return entry;
    if (entry && typeof entry === "object") {
      const url = (entry as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) return url;
    }
  }
  return null;
}

function Art({ kind, fill, stroke }: { kind: ProductCategory; fill: string; stroke: string }) {
  const s = { fill: "none", stroke, strokeWidth: 3, strokeLinecap: "round" as const };

  switch (kind) {
    case "ring":
      return (
        <g>
          <ellipse cx="200" cy="192" rx="60" ry="62" fill={fill} />
          <ellipse cx="200" cy="196" rx="41" ry="43" fill="#FBF9F4" />
          {/* prongs holding the stone */}
          <path d="M182 140 l-6 -18 M218 140 l6 -18" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
          {/* faceted stone */}
          <path d="M172 116 h56 l-28 42 z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M172 116 l14 -22 h28 l14 22 z" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M186 94 l-14 22 M214 94 l14 22 M172 116 h56 M186 116 l14 42 M214 116 l-14 42"
            stroke={stroke} strokeWidth="1.5" opacity="0.55" fill="none" />
        </g>
      );

    case "bangle":
      return (
        <g>
          <circle cx="200" cy="150" r="86" fill={fill} />
          <circle cx="200" cy="150" r="62" fill="#FBF9F4" />
          <circle cx="200" cy="150" r="74" {...s} strokeWidth="1.5" opacity="0.55" />
        </g>
      );

    case "bracelet":
      return (
        <g>
          <ellipse cx="200" cy="150" rx="92" ry="66" fill={fill} />
          <ellipse cx="200" cy="150" rx="68" ry="44" fill="#FBF9F4" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <circle key={i} cx={200 + Math.cos(a) * 80} cy={150 + Math.sin(a) * 55}
                r="9" fill={fill} stroke={stroke} strokeWidth="1.5" />
            );
          })}
        </g>
      );

    case "necklace":
      return (
        <g>
          <path d="M108 66 C 108 190, 292 190, 292 66" {...s} strokeWidth="7" />
          <path d="M108 66 C 108 190, 292 190, 292 66" fill="none" stroke={fill} strokeWidth="4" />
          <path d="M200 188 l-16 22 16 30 16 -30 z" fill={fill} stroke={stroke} strokeWidth="2" />
        </g>
      );

    case "chain":
      return (
        <g>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <ellipse
              key={i}
              cx={92 + i * 36}
              cy={150}
              rx="26"
              ry={i % 2 ? 15 : 24}
              fill="none"
              stroke={fill}
              strokeWidth="9"
            />
          ))}
        </g>
      );

    case "pendant":
      return (
        <g>
          <path d="M132 62 C 132 150, 268 150, 268 62" {...s} strokeWidth="5" />
          <path d="M200 146 l-38 40 38 74 38 -74 z" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M162 186 h76" stroke={stroke} strokeWidth="2" opacity="0.6" />
        </g>
      );

    case "earring":
      return (
        <g>
          {[148, 252].map((cx) => (
            <g key={cx}>
              {/* stud */}
              <circle cx={cx} cy="82" r="13" fill={fill} stroke={stroke} strokeWidth="2" />
              {/* connecting link */}
              <path d={`M${cx} 95 v 16`} stroke={stroke} strokeWidth="3.5" strokeLinecap="round" />
              {/* teardrop */}
              <path d={`M${cx} 111 c 26 30, 26 52, 0 74 c -26 -22, -26 -44, 0 -74 z`}
                fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
              <path d={`M${cx} 132 c 11 14, 11 24, 0 36 c -11 -12, -11 -22, 0 -36 z`}
                fill="#FBF9F4" opacity="0.3" />
            </g>
          ))}
        </g>
      );

    case "bar":
      return (
        <g>
          <path d="M116 108 h168 l26 96 h-220 z" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M116 108 h168 l10 20 h-188 z" fill="#FBF9F4" opacity="0.35" />
          <g stroke={stroke} strokeWidth="2" opacity="0.55">
            <path d="M136 150 h128" />
            <path d="M130 172 h140" />
          </g>
        </g>
      );

    case "coin":
      return (
        <g>
          <circle cx="200" cy="150" r="84" fill={fill} stroke={stroke} strokeWidth="2" />
          <circle cx="200" cy="150" r="66" fill="none" stroke={stroke} strokeWidth="2" opacity="0.6" />
          <circle cx="200" cy="150" r="46" fill="#FBF9F4" opacity="0.25" />
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i / 36) * Math.PI * 2;
            return (
              <line key={i}
                x1={200 + Math.cos(a) * 78} y1={150 + Math.sin(a) * 78}
                x2={200 + Math.cos(a) * 84} y2={150 + Math.sin(a) * 84}
                stroke={stroke} strokeWidth="2" opacity="0.5" />
            );
          })}
        </g>
      );

    default:
      return (
        <g>
          <path d="M200 84 l30 52 60 10 -44 42 12 60 -58 -30 -58 30 12 -60 -44 -42 60 -10 z"
            fill={fill} stroke={stroke} strokeWidth="2" />
        </g>
      );
  }
}
