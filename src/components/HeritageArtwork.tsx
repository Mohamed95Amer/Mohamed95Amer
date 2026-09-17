export function HeritageIcon({ kind }: { kind: "shield" | "truck" | "gem" | "store" | "receipt" }) {
  return <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "shield" && <><path d="M14 3 24 7v7c0 6-6 10-10 12C10 24 4 20 4 14V7Z" /><path d="m9 14 3 3 7-7" /></>}
    {kind === "truck" && <><path d="M3 5h14v15H3zM17 10h5l4 5v5h-9" /><path d="M18 11v5h7" /><circle cx="7" cy="21" r="2.5" /><circle cx="22" cy="21" r="2.5" /></>}
    {kind === "gem" && <><path d="m3 10 5-6h12l5 6-11 15Z M3 10h22 M8 4l6 21 6-21 M8 10l6-6 6 6" /></>}
    {kind === "store" && <><path d="M4 12v12h20V12M3 12l3-8h16l3 8M3 12c0 5 6 5 6 0 0 5 5 5 5 0 0 5 5 5 5 0 0 5 6 5 6 0M11 24v-7h6v7" /></>}
    {kind === "receipt" && <><path d="M6 3h16v23l-4-2-4 2-4-2-4 2ZM10 9h8M10 14h8M10 19h5" /></>}
  </svg>;
}

export function UaeRibbon() {
  return <svg className="heritage-ribbon" viewBox="0 0 300 600" fill="none" preserveAspectRatio="none" aria-hidden="true">
    <path d="M258 -30C210 124 330 205 195 315S150 504 17 645" stroke="#a33732" strokeWidth="15" />
    <path d="M279 -30C225 130 346 210 207 329S170 507 38 645" stroke="#fdfbf5" strokeWidth="14" />
    <path d="M299 -30C241 137 365 218 219 342S189 515 59 645" stroke="#11543d" strokeWidth="20" />
    <path d="M320 -30C259 146 384 226 233 354S211 522 81 645" stroke="#242b27" strokeWidth="11" />
  </svg>;
}
