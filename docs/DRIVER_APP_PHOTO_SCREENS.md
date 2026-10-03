# Driver app — photo screens: review and changes needed

Status: **documented only, not changed** (2026-10-02, branch `driver-app-ui`).
Checked in English, Urdu and Urdu/English by running the driver app on web
(react-native-web, 390 px wide) against a local API. Confirm on a real Android
phone before and after the changes.

Screens in scope:

| Screen | File | Route |
|---|---|---|
| Loading photos (pickup) | `driver-app/src/screens/PickupVerificationScreen.tsx` | `/trip/pickup` |
| Delivery photos (POD) | `driver-app/src/screens/DeliveryVerificationScreen.tsx` | `/trip/delivery` |
| Intermediate stop photos | `driver-app/src/screens/StopVerificationScreen.tsx` | `/trip/stop` |
| Cargo / POD photo list | `driver-app/src/screens/CargoPodPhotosScreen.tsx` | `/cargo-pod-photos` |
| Photo preview | `driver-app/src/screens/CargoPhotoPreviewScreen.tsx` | `/cargo-photo-preview` |
| Camera sheet | `driver-app/src/components/PhotoCaptureModal.tsx` | — |

Already fixed on this branch (applies to these screens too): bilingual text order
("لوڈنگ / Loading"), long bilingual text stacking instead of cutting off,
upload/save error messages translated, "Choose from gallery" in both languages.

## Problems seen

1. **The photo tiles are below the fold.** The page opens with a large coloured
   header, a stop card with a map thumbnail, then the three photo tiles, then a
   large truck/city illustration at the bottom. On a normal phone the driver has
   to scroll to see the main action; the illustration takes ~40% of the page and
   adds nothing.
2. **The main button is easy to miss.** "Loading complete" / "Delivery complete"
   sits mid-page, greyed out until 3 photos exist, with no counter. Nothing says
   "2 of 3 photos" or which photo is still missing.
3. **Photo tiles say only "Photo 1 / 2 / 3".** No hint of what to shoot (cargo,
   seal/plate, signed paper). Drivers guess, and ops get 3 similar photos.
4. **Stop label column is squeezed.** Next to the map thumbnail the stop type
   wraps into 3–4 lines in Urdu/English ("پک اپ / پوائنٹ / Pickup / Point"),
   pushing the address down.
5. **Header text is crowded in Urdu/English.** Title + instruction ("Load the
   cargo, then take 3 photos") + delay pill + stepper all in the coloured header;
   the instruction wraps to 3–4 lines.
6. **"Choose from gallery" is a small underlined link** under the tiles — hard to
   tap with gloves, and it isn't clear it fills the next empty tile.
7. **No visible upload state per photo.** When a photo fails to upload the only
   feedback is an alert after pressing the main button ("N photo(s) could not be
   uploaded…"). A tile should show uploading / uploaded / failed (tap to retry).
8. **Mixed alignment in Urdu.** Stop type (Urdu) right-aligned, stop name
   (English data) left-aligned in the same card — same issue already fixed on
   Home / Personal info.
9. **Camera button in the section header** (top-right camera icon next to
   "Upload loading photos") duplicates the tiles and is not labelled.

Not reviewed on the device yet: `CargoPodPhotosScreen`, `CargoPhotoPreviewScreen`
and `PhotoCaptureModal` (they need real photos on a phone to judge).

## Changes needed (in order)

1. **Photos first.** Order the page: compact header (title + delay pill on one
   row, instruction as one short line) → stop name/address (one line each) →
   photo tiles → main button. Remove the bottom illustration, or show it only
   when there is spare height.
2. **Sticky bottom button with progress.** Pin "Loading complete" /
   "Delivery complete" to the bottom (safe area aware) and show progress on it:
   "Take 3 photos · 1 of 3" → enabled "Loading complete" when done.
3. **Named tiles.** Give each tile a short label and icon, translated:
   - Loading: *Cargo loaded* / *Truck & plate* / *Paperwork (waybill)*
   - Delivery (POD): *Cargo delivered* / *Signed POD* / *Receiver / site*
   - Stop: *Cargo* / *Paperwork* / *Site*
   Keep the requirement at 3 photos; the labels only guide the driver.
4. **Per-tile status.** Thumbnail with a small badge: uploading (spinner),
   uploaded (tick), failed (red, tap to retry). Retry one photo without
   re-shooting the others. Keep the existing alert as a fallback.
5. **Gallery as a real button.** Replace the link with an outline button
   ("Gallery") next to the tiles, or a long-press on a tile; it fills the first
   empty tile.
6. **Stop card.** Put the stop type as a small pill above the name instead of a
   narrow column next to the map; let the map thumbnail sit on the right.
   Align labels with values (`textAlign: 'left'`) as done on Home.
7. **Header in Urdu/English.** Use `BilingualText` for the title (Urdu large,
   English small) and keep the instruction to one stacked pair; move the stepper
   (pickup → delivery) out of the header into a thin bar under it.
8. **Remove the unlabeled camera icon** in the section header (tiles already
   open the camera), or label it "Add more".
9. **Same layout for all three** (pickup, delivery, stop) — they are near copies
   today (~600–900 lines each). Extract a shared `PhotoStepScreen` layout
   (header, stop card, tiles, sticky button) and keep only the step-specific
   bits (labels, API call, next route) in each screen.

## How to test

- Run on web for a quick look:
  `cd frontend/mobile-app/driver-app && EXPO_PUBLIC_API_URL=<api root> npx expo start --web`
  (the mobile routes are `/mobile/...` on the API root; a browser also needs CORS
  to allow the `X-Install-Id` header).
- Then on an Android phone: take photos with weak signal to check per-tile
  upload status and retry, in all three languages.
