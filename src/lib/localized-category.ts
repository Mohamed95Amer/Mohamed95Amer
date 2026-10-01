const arabicCategories: Record<string, string> = {
  ring: "خاتم",
  necklace: "قلادة",
  bracelet: "سوار",
  cuff: "كف",
  earring: "قرط",
  bangle: "إسوارة",
  set: "طقم",
  chain: "سلسلة",
  pendant: "تعليقة",
  bar: "سبائك الذهب (Ingots)",
  coin: "عملة ذهبية",
  other: "أخرى",
};

const englishCategories: Record<string, string> = {
  ring: "Rings",
  necklace: "Necklaces",
  bracelet: "Bracelets",
  cuff: "Cuffs",
  earring: "Earrings",
  bangle: "Bangles",
  set: "Jewellery sets",
  chain: "Chains",
  pendant: "Pendants",
  bar: "Gold bars / ingots",
  coin: "Gold coins",
  other: "Other",
};

export function localizedCategoryLabel(category: string, arabic: boolean): string {
  const labels = arabic ? arabicCategories : englishCategories;
  return labels[category] ?? category;
}
