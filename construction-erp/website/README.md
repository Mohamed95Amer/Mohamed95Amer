# majalops.com — the Majal product site

A static site. Plain HTML and one stylesheet, no build step, no npm, no
framework, no CDN, no remote fonts. Every asset it loads is in this directory.

The contact endpoint is intentionally one level above this static directory,
at `functions/api/contact.js`, because Cloudflare Pages discovers Functions
from the Pages project root.

```
website/
├── index.html                        Home (its own stylesheet, home.css)
├── features.html                     Everything the product does, one long page with a sticky contents rail
├── about.html                        Customer story, delivery options and demo status
├── contact.html                      Contact / book a demo form
├── thanks.html                       Where the form lands without JavaScript (noindex)
├── videos.html                       The three industry walkthroughs
├── robots.txt, sitemap.xml
├── insights/
│   ├── index.html                    Article index
│   ├── approval-trails.html
│   ├── offline-on-site.html
│   ├── bim-colour.html
│   └── verified-recovery.html
├── assets/
│   ├── css/majal.css                 Every page except the home page
│   ├── css/home.css                  The home page only — deliberately standalone
│   ├── js/industry-tabs.js           The only external script on the site (videos.html)
│   ├── video/                        The three walkthrough files the pages reference
│   ├── fonts/                        Big Shoulders + Instrument Sans, bundled with the site
│   └── img/                          The logo mark, and README.md saying which screenshot goes where
└── README.md
```

## Deploying to Cloudflare Pages

Connect the repository and use these settings:

| Setting | Value |
|---|---|
| Framework preset | **None** |
| Build command | `exit 0` |
| Build output directory | `construction-erp/website` |
| Root directory | *(repository root — leave as `/`)* |

The Pages Function lives at the repository root (`/functions/api/contact.js`),
as required by Cloudflare Pages. It is intentionally outside the static output
directory; Cloudflare discovers it during the Pages deployment and routes
`/api/contact` to it. Do not move it into `construction-erp/website/`.

Then attach `majalops.com` and `www.majalops.com` as custom domains in the
Pages project. Cloudflare creates the DNS records itself; there is no A record
to add by hand.

### The contact form needs two environment variables

`/functions/api/contact.js` is a Pages Function. Cloudflare picks it up because
`functions/` sits at the root of the Pages project, so it deploys with the site
and there is no separate service to run. It sends through
[Resend](https://resend.com) — one REST call, no SDK, no dependency to install.

Set these in the Pages project under **Settings → Environment variables**, for
**Production and Preview** both:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_…` from the Resend dashboard. Mark it **encrypted**. |
| `CONTACT_TO` | Optional override; defaults to `Support@majalops.com`. |
| `CONTACT_FROM` | e.g. `Majal <noreply@majalops.com>` — must be on a domain verified in Resend. |

`CONTACT_FROM` cannot be the sender's own address: Resend will not send as a
domain you have not proven you own. The sender goes in `Reply-To` instead, so
replying to the notification still reaches them.

Until `RESEND_API_KEY` and `CONTACT_FROM` are set the endpoint answers **503** and
says the form is not configured. That is deliberate — a form that silently
swallows messages is worse than one that admits it is not wired up yet.

Swapping Resend for another provider means changing one `fetch` call in
`functions/api/contact.js`; nothing else on the site knows what sends the mail.

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
- **The Majal palette is canonical.** Deep Teal `#02496D`, Teal `#057B8A`,
  Aqua `#0B9C9A`, Mid Teal `#05617B`, Soft Background `#F3F8F8`, Dark Text
  `#123844` and Pure White `#FFFFFF` are the public brand colours. Functional
  success and danger states may use their dedicated semantic tokens.
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
  repository: 38 Majal modules in `custom-addons/`, six document types wired
  into the approval engine (`docs/approvals.md`), 44 test modules, the 2000-per-run
  clash cap and 300 MB indexing cap (`docs/bim.md`), seven recovery slots
  (`docs/administration-and-recovery.md`), five AI provider modes
  (`docs/majal-intelligence.md`).
- **No pricing.** The repository does not state any.
- **Public docs and anonymous demo URLs are not advertised until verified.**
  Navigation points to the live documentation-status section and the contact
  form. Guided demonstrations use isolated synthetic-data environments. When a
  permanent public service is verified, update those internal links deliberately.
- **State the limits.** The BIM section carries the limitations from
  `docs/bim.md` — bounding-box clash testing, unread IFC units, no DWG, no IFC
  writing — because a page that is vague about them gets trusted for things the
  product cannot do.

## Accessibility and browser support

Semantic landmarks, one `h1` per page, heading order preserved, a skip link,
visible `:focus-visible` outlines, and alt text on every image. Both colour
schemes were checked for contrast against WCAG AA.

**JavaScript is progressive enhancement only, and there is very little of it.**
Three pages carry a script and all three work fully without it:

- `contact.html` — client-side validation and a fetch submit that gives real
  loading / success / error states. With JS off the form falls back to a plain
  `POST` to the same `action`, and `/api/contact` answers a 303 redirect to
  `thanks.html` instead of JSON. Nothing is lost but the in-place status line.
- `features.html` and `about.html` — an `IntersectionObserver` that marks which
  section you are reading in the contents rail. With JS off the rail is still a
  complete, working list of links.
- `videos.html` — `assets/js/industry-tabs.js`, the site's only external script.
  It collapses the three walkthroughs into a tab strip and honours a deep link
  like `/videos.html#facilities`. With JS off the CSS shows all three panels
  stacked and hides the tab row, so the page still carries its videos rather
  than presenting tabs above nothing. The script signals it can take over by
  adding `.js-tabs`; that class, not the markup, is what enables tab mode.

No page depends on a script to render or to navigate.
