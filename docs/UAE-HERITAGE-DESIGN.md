# UAE Heritage design

Selected by the owner from the supplied homepage reference, September 2026.

## Implementation

- Ivory page and header, emerald commerce buttons, charcoal type, restrained gold line icons and UAE ribbon.
- Editorial jewellery hero, six photo category tiles, three featured jewellers, four product cards and the closing story banner.
- The owner's rotating image/video placement remains immediately before category discovery. Admin banners still override fallback products and retain Ad disclosures.
- Real database catalogue, vendor reputation, paid placements, listing-quality/freshness/licence gates, live pricing, introductory fee offers and VAT remain connected.
- Store cards show the vendor's own catalogue images, labelled as collection imagery. The supplied reference's real-world chain names, fictitious audience counts and insurance promises were not copied.
- Cards lead to product details and the existing checkout; there is no pretend shopping cart. Full product breakdowns remain available, while compact cards show all components summed into the displayed total.
- Shared header/footer, buttons and product cards carry the theme beyond the homepage. Navigation retains account, role dashboards, notifications, language switch, mobile menu and sign-out.

## Brand artwork

Built-in image-generation tool used. Project asset: `public/images/uae-heritage-hero.webp` (204,694 bytes, 1536 × 1024). This decorative illustration is separate from the product catalogue. Original PNG retained in the local design-concepts folder.

Final generation prompt:

> Create a photorealistic premium jewellery website hero background, landscape 3:2 composition. UAE heritage aesthetic, warm ivory limestone blocks and natural sunlit cream walls with soft geometric mashrabiya window shadows. An ornate yellow gold bangle upright near upper centre-right, a hanging circular filigree gold pendant with fine chain, and two matching small filigree earrings on lower limestone block. Products occupy right two thirds; left third is softly illuminated empty warm cream wall with ample negative space for later HTML copy. Sophisticated editorial still life, realistic handcrafted gold details, warm daylight, muted sand and bone palette, luxury without glare. No text, no logos, no watermark, no flags, no website UI, no people. This is illustrative brand photography rather than a purchasable product listing.

The UAE ribbon and five line icons are code-native SVG in `HeritageArtwork.tsx`.

## Validation

- Application tests: 41/41; typecheck and ESLint clean.
- Local and Vercel builds passed with 28/28 generated pages.
- Live visual review at 1440px desktop and 390px mobile; no horizontal overflow or failed images.
- Mobile menu → marketplace → product → checkout opens correctly. No order or identity session was created during the design checks.
- Live quote reports `goldapicom`, with the existing 10-second refresh and 60-second freshness boundary.
- Preview build succeeded but visual access required Vercel login; visual checks were performed on the authorized production deployment.
