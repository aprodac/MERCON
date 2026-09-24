# Mercon Operator (mobile)

Expo app for **Operators and Admins** — bundle ID `tech.mercon.operator`.
Drivers use the separate driver app (`../driver-app`, `tech.mercon.driver`).

## Run

```bash
cd frontend/mobile-app && npm install   # once: installs both apps + shared code
cd operator-app && npm start
```

Needs a `.env` with `EXPO_PUBLIC_API_URL` (same as the driver app).

## Layout

```
src/
  app/          routes only — each file renders one screen from features/
  features/     one folder per area: trips, customers, drivers, vehicles,
                quotations, invoices, dashboard, documents, expenses,
                maintenance, third-party, more
                (each with screens/, components/, hooks/, api/, services/, types/ as needed)
  lib/          cross-feature operator data layer (operator.ts) and sign-in (auth.ts)
  components/   app-wide pieces (sidebar drawer, new-trip menu)
  navigation/   bottom nav
```

Code both apps use (API client, auth, login screen, theme, UI kit,
translations, brand assets, build tooling) lives in `../shared`
(`@mercon/mobile-shared`). Never import from `../driver-app` — move shared
code to `../shared` instead.

## EAS builds

This app needs its own EAS project. Run `eas init` here once, then add the
printed `projectId` under `extra.eas` in `app.config.ts`.
