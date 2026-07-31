# majalops.com — the Majal product site

A static site. Plain HTML and one stylesheet, no build step, no npm, no
framework, no CDN, no remote fonts. Every asset it loads is in this directory.

```
website/
├── index.html                        Home
├── features.html                     Everything the product does, one long page with a TOC
├── about.html                        Stack, licensing, self-hosting, demo status
├── insights/
│   ├── index.html                    Article index
│   ├── approval-trails.html
│   ├── offline-on-site.html
│   ├── bim-colour.html
│   └── verified-recovery.html
├── assets/
│   ├── css/majal.css                 The whole stylesheet
│   └── img/README.md                 Which screenshot goes where (PNGs dropped in here)
└── README.md
```

## Deploying to Cloudflare Pages

Connect the repository and use these settings:

| Setting | Value |
|---|---|
| Framework preset | **None** |
| Build command | *(leave empty — there is no build step)* |
| Build output directory | `construction-erp/website` |
| Root directory | *(repository root — leave as `/`)* |

Then attach `majalops.com` and `www.majalops.com` as custom domains in the
Pages project. Cloudflare creates the DNS records itself; there is no A record
to add by hand.

To preview locally, serve the directory over HTTP rather than opening the files
directly — links are root-absolute (`/features.html`), so `file://` will not
resolve them:

```bash
python3 -m http.server 8080 --directory construction-erp/website
```

## Conventions worth keeping

- **Links are root-absolute.** `/features.html`, `/assets/css/majal.css`,
  `/insights/`. This is what lets the same markup work at the site root and in
  the `insights/` subdirectory.
- **One stylesheet, custom-property driven.** Colours live in `:root` and are
  overridden wholesale in a `prefers-color-scheme: dark` block. Both modes are
  chosen, not derived — do not add a hard-coded colour outside the token block.
- **Logical properties.** `padding-inline`, `border-inline-start`,
  `margin-inline-end`, `text-align: start`. The product is bilingual and the
  site may follow; nothing here assumes left-to-right.
- **Wide content scrolls in its own container.** Tables live inside
  `<div class="table-scroll">`; `body` has `overflow-x: hidden` as a backstop,
  not as the mechanism.
- **Figures reserve their space.** `figure.shot img` has a fixed
  `aspect-ratio` and a placeholder background, so the page does not reflow when
  the real screenshots land. See `assets/img/README.md`.

## The content rules this site was written under

These are not style preferences; breaking them makes the site wrong.

- **No invented social proof.** No customer names, logos, testimonials, case
  studies, ratings or awards. There are none on the site and none should be
  added that are not real and attributable.
- **No invented statistics.** Every number here is verifiable in the
  repository: 37 Majal modules in `custom-addons/`, six document types wired
  into the approval engine (`docs/approvals.md`), 44 test modules, the 2000-per-run
  clash cap and 300 MB indexing cap (`docs/bim.md`), seven recovery slots
  (`docs/administration-and-recovery.md`), five AI provider modes
  (`docs/majal-intelligence.md`).
- **No pricing.** The repository does not state any.
- **The hosted demo is not live.** `demo.majalops.com` and
  `docs.majalops.com` are both labelled as planned. When they go live, update
  `about.html#demo` and the "soon" badge in the nav of every page.
- **State the limits.** The BIM section carries the limitations from
  `docs/bim.md` — bounding-box clash testing, unread IFC units, no DWG, no IFC
  writing — because a page that is vague about them gets trusted for things the
  product cannot do.

## Accessibility and browser support

Semantic landmarks, one `h1` per page, heading order preserved, a skip link,
visible `:focus-visible` outlines, and alt text on every image. Both colour
schemes were checked for contrast. No JavaScript is loaded at all, so nothing
degrades when it is unavailable.
