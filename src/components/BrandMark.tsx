export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl border ${
        inverse
          ? "border-gold-300/35 bg-white/10"
          : "border-jade-900/10 bg-jade-900 shadow-sm"
      }`}
      aria-hidden="true"
    >
      <span className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-gold-300/50 blur-sm" />
      <svg viewBox="0 0 32 32" className="relative h-6 w-6" fill="none">
        <path
          d="M16 3.75 26.6 9.9v12.2L16 28.25 5.4 22.1V9.9L16 3.75Z"
          className={inverse ? "stroke-gold-200" : "stroke-gold-300"}
          strokeWidth="1.5"
        />
        <path
          d="M20.7 11.5a6.2 6.2 0 1 0 .05 8.95v-4.1h-4.9"
          className={inverse ? "stroke-white" : "stroke-bone-soft"}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
