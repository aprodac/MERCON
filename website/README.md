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
BASE_PATH=/linaul npm run build   # build for a sub-path (as deployed)
```

## Where it is deployed

For now the site ships inside the web-dashboard image and is served at
**`mercon.tech/linaul/`**: `frontend/web-dashboard/Dockerfile` has a `site`
stage that builds this folder with `BASE_PATH=/linaul`, and
`frontend/web-dashboard/nginx.conf` serves it from `/linaul/`. To move it to its
own domain later, build without `BASE_PATH` and serve `out/` from the root.

## Screenshots

`public/screens/` holds screenshots of the real web dashboard, operator app and
driver app, taken from a local copy running on **fictional sample data** (made-up
customers, drivers, plates and phone numbers) with the Linaul name and mark.
No real customer or driver data is in them. Paths are listed in
`moduleShots` / `apps` / `operatorTour` in `lib/content.ts`. Operator-app shots are
786×1704 (393×852 @2x) WebP.

## Where things live

| Path | What |
|---|---|
| `lib/content.ts` | All copy: modules, apps, workflow, principles, contact email |
| `app/page.tsx` | Overview (home) |
| `app/modules/page.tsx` | Full module catalogue |
| `app/apps/page.tsx` | Web dashboard, operator app, driver app, customer tracking |
| `app/operator-app/page.tsx` | Operator app tour (create trip, live trip, fleet, pricing, people) — copy in `operatorTour` |
| `components/Shots.tsx` | Browser and phone frames for the screenshots |
| `lib/asset.ts` | Prefixes image paths with the base path |
| `app/globals.css` | Swiss design system: 12-col grid, Helvetica, black/white + one orange |

Module list mirrors what exists in the codebase (`MODULE_KEYS` in
`packages/shared-types`, web pages, mobile screens). Anything not yet shipped is
marked `soon: true` and shows an "In development" tag (currently ZATCA).

Before launch: replace `site.contactEmail` in `lib/content.ts` (placeholder).
