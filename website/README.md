# Linaul — product website

Marketing site for **Linaul**, the productised version of the MERCON logistics
platform. Next.js (App Router) + plain CSS, exported as static HTML.

This folder is standalone: it is **not** part of the root npm workspaces and
does not touch the API, dashboard or mobile apps. Install and run it here.

```bash
cd website
npm install
npm run dev     # http://localhost:3070
npm run build   # static site written to website/out/
npm start       # serve the built out/ folder on :3070
```

## Where things live

| Path | What |
|---|---|
| `lib/content.ts` | All copy: modules, apps, workflow, principles, contact email |
| `app/page.tsx` | Overview (home) |
| `app/modules/page.tsx` | Full module catalogue |
| `app/apps/page.tsx` | Web dashboard, operator app, driver app, customer tracking |
| `components/Mocks.tsx` | Product illustrations built in HTML/CSS (sample data) |
| `app/globals.css` | Swiss design system: 12-col grid, Helvetica, black/white + one orange |

Module list mirrors what exists in the codebase (`MODULE_KEYS` in
`packages/shared-types`, web pages, mobile screens). Anything not yet shipped is
marked `soon: true` and shows an "In development" tag (currently ZATCA).

Before launch: replace `site.contactEmail` in `lib/content.ts` (placeholder).
