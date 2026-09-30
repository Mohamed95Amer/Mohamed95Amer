const arabicCategories: Record<string, string> = {
  ring: "خاتم",
  necklace: "قلادة",
  bracelet: "سوار",
  earring: "قرط",
  bangle: "إسوارة",
  chain: "سلسلة",
  pendant: "تعليقة",
  bar: "سبيكة",
  coin: "عملة ذهبية",
  other: "أخرى",
};

export function localizedCategoryLabel(category: string, arabic: boolean): string {
  return arabic ? arabicCategories[category] ?? category : category;
}
