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
      <span className={`relative font-serif text-[13px] font-bold tracking-[-0.08em] ${inverse ? "text-gold-100" : "text-gold-200"}`}>GG</span>
    </span>
  );
}
