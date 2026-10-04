# Web dashboard — scenario & feature test plan (2026-10-03)

**Where:** dev.mercon.tech, signed in as `claude_ai` (Operator). Enabled modules on dev: Dashboard, Live map, Trips, Quotations, Customers, Locations, Drivers, Vehicles, Maintenance, Third-party fleet, Documents, Recycle bin. Finance / Expenses / Reports are switched off on dev and are out of scope.

**Test data rules:** everything created is named `ZZ QA …` (plates `ZZQA-…`), customer **Tabuk Agro Farms** for trips/quotations, a new `ZZ QA` driver with no phone app (no real push). Real customers (JDL, iMile, …) are only read. Everything created is deleted at the end; the cleanup list is kept as we go.

**Viewports:** desktop 1440×900 and phone 390×844 for the key pages.

**What counts as a finding:** 🔴 broken (error, wrong data, lost work) · 🟠 confusing / bad UX (unclear wording, dead end, too many steps, misleading state) · 🟡 polish (layout, consistency, small copy).

---

## A. End-to-end scenarios (a new customer's first week)

| # | Scenario | Steps | Expect |
|---|---|---|---|
| S1 | Onboard a customer | Customers → New → fill → save → open details → edit → add a location | Saved, appears in list/search, details show contacts, locations, trips (0) |
| S2 | Add a driver | Drivers → New → fill (phone, licence, iqama, expiry dates) → save → details → documents → edit | Validation clear; expiry warnings visible; driver shows Available |
| S3 | Add a truck | Vehicles → New → plate, class, capacity → save → details → documents → assign default driver | Appears in Create Trip truck picker for its class |
| S4 | Price the lane | Quotations → New (Tabuk, Riyadh → Dammam, 20 TON, Extra, rate + payout) → list → details → edit price | History records the change; shows in Create Trip |
| S5 | Book a trip | Create Trip → customer → quotation → date → driver + truck → confirm | Trip Scheduled, correct price/payout, driver + truck OnTrip rules |
| S6 | Run the trip | Trip page → pin stops → status Loading → In transit → Delayed (reason) → Completed → charges/settlement | Status, stop times, margin, Done list consistent everywhere |
| S7 | Change of plan | Reassign driver, reassign truck, edit trip (date, route), cancel a 2nd trip | Clear messages, assets freed, notifications logic sane |
| S8 | Truck breaks down | Maintenance → New for the truck → check it is blocked in Create Trip for those dates → close maintenance | Blocking + messages clear |
| S9 | Monthly contract | Trips → Monthly → new monthly roster for the customer (if usable) | Roster creates the right trips |
| S10 | Clean up | Delete trips, quotation, vehicle, driver, customer, locations → Recycle bin → restore one → delete again | Deletion rules explain links; recycle bin works |

## B. Feature checks per module

- **Home / dashboard:** KPIs make sense vs. trips list; links go to the right filtered lists; empty/loading states.
- **Live map:** tabs (active, attention, scheduled, fleet, done), status menu, search, card → trip page.
- **Trips list:** search, filters (status, date, customer), sort, pagination, bulk select (status, assign, delete), quick status, export, kanban view.
- **Trip details:** header actions (share, edit, ⋯ menu), financial card, stops panel + pins, documents upload, driver trail, tracking link.
- **Create / Edit trip:** validation messages, round trip, intermediate stops, 3PL switch, monthly tab, define-quotation inline, past-date handling.
- **Quotations:** list filters, search, details, edit, history, duplicate, delete, documents.
- **Customers:** list, search, details tabs, edit, tracking links, delete with linked data.
- **Locations:** list, pin status filter, set pin, edit, delete with links.
- **Drivers:** list filters, details (documents, trips, phone), edit, status, delete.
- **Vehicles:** list, details, documents, financials page, edit, delete.
- **Maintenance:** list, new, details, close.
- **Third-party fleet:** list, provider details.
- **Documents:** list, expiry view, upload, open.
- **Notifications, Learning, Recycle bin, Settings (what an Operator can see).**

## C. Cross-cutting checks

Navigation & back buttons · page titles · consistent names (Truck vs Vehicle, Trip vs Job) · dates/times in Saudi time · SAR formatting · error messages in plain words (no API codes) · confirm before destructive actions · phone width (no sideways scroll, tappable targets) · dark mode on 2–3 key pages · console errors.

## D. Report

Findings table (severity · where · what happened · suggested fix), plus a short "top 10 to fix before delivery" list.
