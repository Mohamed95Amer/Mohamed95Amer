import Link from "next/link";

export interface PolicySection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export function PolicyPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: PolicySection[] }) {
  return (
    <>
      <section className="bg-jade-950 text-white">
        <div className="container-pro max-w-4xl py-12 sm:py-16">
          <p className="eyebrow text-gold-200">{eyebrow}</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">{intro}</p>
          <p className="mt-5 text-xs text-white/45">Last updated 11 September 2026</p>
        </div>
      </section>

      <div className="container-pro max-w-4xl py-10 sm:py-14">
        <div className="card divide-y divide-jade-900/10 px-5 sm:px-8">
          {sections.map((section) => (
            <section key={section.title} className="py-6 sm:py-8">
              <h2 className="font-serif text-2xl font-semibold text-jade-950">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-ink-muted">
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.bullets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">Questions? <Link href="/contact" className="font-semibold text-jade-700 underline underline-offset-4">Contact GoldHub support</Link>.</p>
      </div>
    </>
  );
}
