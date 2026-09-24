# PHASE 14B — LOCATION DETAILS / EDIT REPORT

## Executive Summary

Phase 14B has built and verified the canonical **Location Details / Edit Page** (`/locations/:id`) for the MERCON Logistics ERP. The page acts as a comprehensive operational record answering *"What is this location, who owns it, where is it, how accurate is its position, and where is it being used?"*

All requirements have been met, including view/edit mode toggle, customer-scoped isolation, Google Maps URL resolver, Leaflet interactive map with draggable pin editing, precision status indicators (`EXACT`, `APPROXIMATE`, `UNKNOWN`), usage panels (commercial quotations and trip stops), soft delete/restore capabilities, and strict historical `TripStop` snapshot immutability.

---

## Routes

- **Canonical Location Details Route**: `/locations/:id`
- **Customer-scoped Location Creation Route**: `/customers/:customerId/locations/create`
- **Global Location Creation Route**: `/locations/create`
- **Location List Ledger Route**: `/locations`

---

## View Mode & Edit Mode

1. **View Mode**:
   - Primary view mode displays read-only operational identity, address, customer relationship, interactive Leaflet map, precision badge, copy action triggers, and operational usage panels.
   - Action header includes `[ Edit Location ]` button and `[ More ▼ ]` menu containing `[ View Customer ]`, `[ Copy Location ID ]`, `[ Open in Google Maps ]`, and `[ Deactivate Location ]` / `[ Restore Location ]`.
2. **Edit Mode**:
   - Triggered by clicking `[ Edit Location ]`.
   - Renders editable fields for Location Code, Location Name, Street Address, City, and Postal Code.
   - Enables map marker dragging and map click-to-repin. Moving the map pin automatically updates `lat`/`lng` and sets precision to `≈ APPROXIMATE` until explicitly re-confirmed as `✓ EXACT`.
   - Customer ownership remains strictly locked and read-only.
   - Action header presents `[ Cancel ]` and `[ Save Changes ]` buttons submitting through `locationService.update`.

---

## Customer Relationship & Isolation

- **Read-Only Ownership**: Customer relationship is displayed with link `[ View Customer ]` (`/customers/:customerId`). Changing customer ownership on an existing Location is blocked to preserve customer isolation and avoid breaking quotations and trips.
- **Duplicate Code Protection**: Code uniqueness is enforced per customer (`@@unique([customerId, code])`). Changing the location code checks for clashes against existing customer locations.

---

## Address & Position Resolution

- **Canonical Location Entity**: Uses the canonical `Location` model with `lat`, `lng`, `address`, `city`, `postalCode`, `coordinate_precision`, `is_active`, and `deletedAt`.
- **Google Maps & WhatsApp Resolver**: Integrated resolution bar accepts full Google Maps URLs (`maps.app.goo.gl`, `g.co/maps`), raw coordinates (`24.7136, 46.6753`), or WhatsApp share text containing links. Automatically extracts coordinates, populates address and city, and defaults precision to `≈ APPROXIMATE`.

---

## Coordinate Precision Logic

1. **`✓ EXACT`**: Pin confirmed as the exact customer facility/dock. Provides `[ Open in Google Maps ]` and `[ Copy Coordinates ]`.
2. **`≈ APPROXIMATE`**: Pin represents the known hub/area. Provides `[ Confirm Exact Facility ]` button to elevate status to `EXACT`.
3. **`○ UNKNOWN`**: No GPS coordinates set (`lat = null, lng = null`). Prominently explains that the location remains fully usable operationally for trips & quotations without coordinates. Provides `[ Resolve Location ]`.

---

## Historical Snapshot Protection & Immutability

- **TripStop Snapshots**: Historical `TripStop` records store snapshot fields (`location_name`, `location_address`, `location_lat`, `location_lng`, `location_coordinate_precision`) at dispatch.
- **Verified Immutability**: Editing master `Location` fields (name, address, lat, lng) updates the `Location` master table and leaves historical `TripStop` snapshots 100% untouched.

---

## Usage & Operational Impact Panels

- **Metrics Strip**: Total linked commercial quotations and trip stops referencing the location.
- **Commercial Quotations Table**: Lists up to 20 quotations linked via `QuotationStop`, displaying route, billing rate, customer, status, and `[ View Quote ]` link (`/quotations/:id`).
- **Trip Stops Table**: Lists up to 20 recent trip stops referencing this location, displaying trip reference, route, stop type (Pickup/Dropoff), status, and `[ View Trip ]` link (`/trips/:id`).

---

## Soft Delete & Restore

- **Deactivation**: Setting status to `INACTIVE` soft-deactivates the location (`deletedAt = now()`, `is_active = false`). Confirms deactivation with reference count warning. Historical trips and quotations remain intact.
- **Restoration**: Inactive locations display `INACTIVE` badge and `[ Restore Location ]` menu action, which clears `deletedAt` and sets `is_active = true`.

---

## Files Changed

1. `backend/api-server/src/controllers/locationController.ts`:
   - Enriched `getLocationById` to include customer data, usage counts (`_count`), related quotation stops, and trip stops.
   - Enriched `updateLocation` to handle soft-delete (`deletedAt`) and restore (`is_active = true`), code clash checking per customer, and coordinate precision resolution.
2. `backend/api-server/src/routes/locationRoutes.ts`:
   - Registered `PATCH /locations/:id` alongside `PUT /locations/:id`.
3. `frontend/web-dashboard/src/pages/locations/LocationDetailsPage.tsx` *(New Component)*:
   - Full-featured Location Details & Edit page supporting View/Edit modes, Leaflet map, resolution workflow, precision badges, and usage panels.
4. `frontend/web-dashboard/src/pages/locations/LocationListPage.tsx`:
   - Updated table columns to include `[ View Location Details ]` button and `onRowClick` navigation to `/locations/:id`.
5. `frontend/web-dashboard/src/pages/customers/CustomerDetailsPage.tsx`:
   - Made Customer Locations tab cards clickable, navigating directly to `/locations/:id`.
6. `frontend/web-dashboard/src/router.tsx`:
   - Registered route `<Route path="/locations/:id" element={<LocationDetailsPage />} />`.

---

## Verification & Test Results

### 1. Prisma & TypeScript Validation
- `npx prisma validate`: **PASSED** (`The schema at prisma\schema.prisma is valid 🚀`).
- Workspace `npm run build`: **PASSED** (Built in 6.70s with **0 compilation/type errors**).

### 2. Operational Verification Script (`scratch/verify_phase14b.ts`)
- Customer lookup: **PASS** (`JDL`).
- Location creation & precision resolution (`EXACT`): **PASS**.
- Duplicate code constraint (`@@unique([customerId, code])`): **PASS** (Enforced DB error on duplicate code).
- Historical `TripStop` snapshot immutability check: **PASS** (Historical `TripStop` snapshot fields remained 100% unchanged after master location coordinate & name edits).
- Cleanup: **PASS**.

---

## Final Verdict

**PHASE_14B_COMPLETE**
