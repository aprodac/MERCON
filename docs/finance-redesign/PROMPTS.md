# MERCON Finance Redesign — Development Prompts

Paste these into the coding agent **one at a time, in order**. Each prompt is one reviewable
commit. Don't start the next one until the previous is built, checked in the browser and committed.

- Spec: `docs/finance-redesign/DESIGN.md`
- Mockup: https://claude.ai/artifact/GvqbVUT7nqwYw3rXenZ8CZ
- Branch: `feature/finance-ui-revamp`

| # | Prompt | Area | Backend? |
|---|---|---|---|
| 00 | Foundations (helpers, tokens) | Kit | – |
| 01 | Kit A — list & page primitives | Kit | – |
| 02 | Kit B — record & document components | Kit | – |
| 03 | Kit C — report components | Kit | – |
| 04 | Sidebar grouping | Shell | – |
| 05 | Summary, filter & activity endpoints | API | ✅ |
| 06 | Invoices list | Sales | – |
| 07 | Invoice record page + payment sheet | Sales | – |
| 08 | Invoice create/edit page | Sales | – |
| 09 | Bills (list, record, create) | Purchases | – |
| 10 | Journal entries (list, record, create) | Accounting | – |
| 11 | Chart of Accounts + Accounting Periods | Accounting | – |
| 11b | **Period Close workspace** (replaces the periods half of 11) | Accounting | ✅ lock rule + reopen |
| 12 | Banking (accounts, reconciliation, advances) | Banking | – |
| 12a | **Advances**: list, record page, create page (replaces the advances part of 12) | Banking | small |
| 12b | **Bank & Cash Accounts**: overview cards, account page, editor, transfer sheet | Banking | ✅ read-only |
| 13 | Statements (P&L, Balance Sheet, Trial Balance, Cash Flow) | Reports | – |
| 14 | Ageing reports + General Ledger | Reports | – |
| 14a | **AP Ageing payables workspace**: coverage, insights, drill-down, pay run (+ ageing bug fixes) | Reports | ✅ fixes + detail |
| 15 | Final QA, docs & cleanup | All | – |

---

## Running prompts in parallel chats

Yes, you can, with two conditions.

1. **Build the shared kit first, in one chat:** prompts **00 → 01 → 02 → 03**, in order. Every page is built from these
   components. If page chats start before the kit exists, each chat invents its own pills, headers and money
   formatting, and the pages drift apart (exactly the problem we're fixing).
   *Exception:* prompt 10 (Journal Entries) is written to be safe to run on its own. If a kit component it needs
   doesn't exist yet, it creates it in `components/finance/kit/` exactly as DESIGN.md §3 specifies, so later chats reuse it.
   Don't run another page prompt at the same time as that one.
2. **One branch per chat.** Each chat works on its own branch cut from `feature/finance-ui-revamp`
   (e.g. `feature/finance-ui-je`, `feature/finance-ui-bills`). Several chats in the same folder overwrite each other,
   so use separate git worktrees or separate clones. Merge each branch back into
   `feature/finance-ui-revamp` when it's done. Expect small conflicts in `router.tsx`, `financeService.ts`
   and `PROGRESS.md`; that's normal.

Safe to run in parallel **after 00–03**: {04}, {05}, {06→07→08 in one chat}, {09}, {10}, {11}, {12}, {13}, {14}.
06–08 and 09 use the endpoints from 05, so run 05 first or at the same time and merge it before them.

---

## Ground rules (every prompt refers to this section)

1. **Read first:** `CLAUDE.md`, `docs/finance-redesign/DESIGN.md`, `frontend/web-dashboard/UI_GUIDELINES.md`, and every file the prompt names **before** you edit anything.
2. **Branch:** work and commit only on `feature/finance-ui-revamp`, or on the per-chat branch the owner gives you that was cut from it (see "Running prompts in parallel chats"). Check with `git branch --show-current` before committing. **Do not push** and do not merge into `main`, `dev`, `ilan`, `hysam` or `midlaj` unless the owner tells you to in chat.
3. **No schema changes.** Do not touch `backend/api-server/prisma/schema.prisma`. Do not add enum values, roles or seed data.
4. **Roles:** finance is Admin + Operator only. Any new endpoint uses the router's existing `authenticateJWT` + `authorizeRoles('Admin','Operator')` + `requireModuleEnabled('finance')`.
5. **Reuse, don't rebuild:** use `Btn`, `DataTable`, `ConfirmModal`, `ExportModal`, `sheet`, `tabs`, `toggle-group`, `popover`, `tooltip`, `skeleton`, `select`, `date-range-picker`, `DashboardLayout`, and the finance kit (`src/components/finance/kit`) once it exists. Types come from `@mercon/shared-types`.
6. **Keep behaviour:** every existing action (issue, approve, pay, void, delete draft, print, export, post, close period, etc.) must still work after a restyle. You're changing the UI, not the business rules.
7. **No `window.confirm` / `alert`.** Use `ConfirmModal`, toasts from `sonner`, and sheets.
8. **Dark mode:** every new class has a `dark:` counterpart following DESIGN.md §2.1.
9. **Verify before you say it's done:**
   - `cd frontend/web-dashboard && npm run build` passes (0 TS errors)
   - `npm test` (vitest) passes
   - backend changes: `cd backend/api-server && npx tsc --noEmit` plus the relevant `node -r ts-node/register --test …` test files
   - open the page in the running app, click through every action you touched, and check light and dark mode at 1440px and 390px wide
10. **Keep `PROGRESS.md` up to date** (CLAUDE.md Rule 0.5): add or update a "Finance UI revamp" row with the prompt number and what's done, and bump `Last updated`. Only mark ✅ once you've verified it.
11. **Commit** once at the end of each prompt, with a Conventional Commit message (given in each prompt). Don't commit `dist/`, `*.tsbuildinfo` or scratch files.
12. If the spec and the code disagree, or something the spec needs doesn't exist, **stop and ask the owner**. Don't make it up.
13. **Page shell (overrides any older prompt text):** no page title, subtitle or breadcrumbs on finance pages. The top bar shows the title, so don't use `FinancePageHeader` on pages. Use the toolbar-row layout from DESIGN.md §4.0a (reference: `pages/finance/AdvancesPage.tsx`). Where an older prompt says "FinancePageHeader: crumbs …, title …, actions …", keep only the actions and put them in the toolbar row.

---

## 00 — Foundations

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 00 — Foundations for the finance UI revamp.

Read first: docs/finance-redesign/DESIGN.md (§2, §3.1, §5), frontend/web-dashboard/src/index.css,
packages/shared-types/src/index.ts (InvoiceStatus, BillStatus, JournalEntryStatus, PeriodStatus,
AdvanceStatus, ReconciliationStatus), and how formatMoney is currently duplicated across
frontend/web-dashboard/src/pages/finance/*.tsx.

Do:
1. In frontend/web-dashboard/src/index.css add a `/* Finance */` block to :root containing the
   DESIGN.md §2.1 light tokens as CSS variables (e.g. --fin-surface-sunken, --fin-text-3, --fin-brand-tint,
   --fin-positive, --fin-positive-bg, …) and their dark values under `.dark`. Add the `.fin-num` utility
   (Geist Mono + tabular-nums).
2. Create frontend/web-dashboard/src/lib/finance/format.ts:
   formatMoney(value, opts?: { currency?: string; signed?: boolean }) — accepts number | string | null;
   2 decimals, en-US grouping, U+2212 minus when signed, '+' prefix when signed and positive;
   formatDate(d) → "15 Sep 2026"; formatPct(n, digits = 1);
   dueLabel({ due_date, status, balance_due, paid_at? }, today = new Date()) → "Due in N days" | "Due today" |
   "Overdue N days" | "Paid DD Mon" | "—".
3. Create src/lib/finance/status.ts: FIN_STATUS: Record<kind, Record<status, { label, tone }>> exactly as in DESIGN.md §5,
   the tone → class map (bg/fg light+dark), and getDisplayStatus(kind, doc, today) that returns 'Overdue' for
   open docs whose due_date is before today and whose balance is > 0.
4. Create src/lib/finance/variance.ts: varianceTone(delta, isCost) → 'positive' | 'negative' | 'flat'.
5. Create src/lib/finance/index.ts barrel.
6. Unit tests (vitest) for all three files, covering: string amounts, negatives, zero, null, due today, overdue, paid, void,
   and cost vs income variance.
7. Don't change any page yet.

Acceptance: build + vitest pass; nothing changes visually.
Commit: "feat(finance-ui): add finance tokens, formatting, status and variance helpers"
```

## 01 — Kit A: list & page primitives

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 01 — Finance kit, part A.

Read first: DESIGN.md §2–§3 and §4.1; the mockup board "Invoices — list"; components/ui/DataTable.tsx, Btn.tsx,
tabs.tsx, popover.tsx, BulkActionBar.tsx, StatusBadge.tsx; src/lib/finance/*.

Create in frontend/web-dashboard/src/components/finance/kit/ (with index.ts barrel):
- FinancePageHeader — crumbs (react-router Links), title, subtitle, actions slot. Title 26px extrabold; crumbs 12px text-2 with "/" separators; last crumb text + semibold.
- MoneyText — uses formatMoney, `.fin-num`, tone prop (default/positive/negative/muted), optional currency prefix rendered smaller and in text-2.
- StatusPill — kind + status → FIN_STATUS label/tone; 6px dot + label; h-6 px-2.5 rounded-full text-[11.5px] font-bold.
- SummaryStrip — one rounded-[20px] card, grid of cells separated by 1px borders; first cell may be wider (1.5fr) and show a stacked
  bar (h-2 rounded-full) with legend dots; figures in .fin-num; loading = skeletons of the same size.
- StatusTabs — underline tabs (2px brand underline via inset box-shadow), count badge (mono 11px, rounded-full; active badge
  brand-tint/orange text, inactive #F1F2F5/text-2); role="tablist"/"tab", aria-selected; horizontally scrollable on mobile.
- FilterBar + FilterChip — search input (h-[34px], bg #F4F5F8, rounded-[10px], search icon), chips "Label: Value ▾" opening a popover
  slot, dashed "Add filter" chip, right slot. Include a `selectionBar` prop: when provided it replaces the bar with a
  brand-tint row showing "N selected" + action chips + Clear.
- FinanceEmptyState — 48px rounded-2xl icon tile, title, text, optional CTA Btn.

Also add a dev-only showcase route /finance/_kit (FinanceKitPage) that renders every component with sample props, in light and dark.
Only register it when import.meta.env.DEV is true, behind RequireModule "finance".

Acceptance: build + tests pass; the /finance/_kit page matches the mockup's look for these parts; there are no data fetches inside kit components.
Commit: "feat(finance-ui): kit A — page header, money, status pill, summary strip, tabs, filter bar"
```

## 02 — Kit B: record & document components

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 02 — Finance kit, part B.

Read first: DESIGN.md §3.2 and §4.2–§4.3; the mockup board "Invoice — record + record payment"; components/ui/sheet.tsx, select.tsx,
date-picker.tsx, input.tsx; components/finance/InvoicePrintModal.tsx; the existing payment form in pages/finance/InvoicesPage.tsx
and BillsPage.tsx (fields + validation + DTOs RecordInvoicePaymentDTO / RecordBillPaymentDTO in services/financeService.ts).

Create in components/finance/kit/:
- DocStatusBar — rounded-2xl white card, p-1.5, equal grid of steps; done step = charcoal dot with check, current = brand dot + brand-tint bg,
  future = #F1F2F5 dot + muted text; optional right-aligned timestamp per step; `voided` variant ends with a muted "Void" step.
  Use <ol> for the list semantics.
- RecordLayout — header row (crumbs left, optional pager "2 of 142 ‹ ›" right), title row (title + StatusPill + sub-line, actions right),
  status bar slot, then main (flex-1, scrollable) + side (w-[360px]) columns; stacks below lg.
- BalanceHeroCard — charcoal card, 10px label, SAR + 30px .fin-num amount, h-2 progress bar (brand on white/12), footer left/right text.
- SidePanelTabs — segmented control (track #F1F2F5 rounded-xl p-1, active white + small shadow) and a scrollable body.
- JournalLinesTable — compact Account | Debit | Credit grid in a rounded-[14px] bordered box, credit lines indented 12px,
  '—' for empty sides in muted; `variant="preview"` renders a sunken "Will post" block with no header row.
- ActivityTimeline — vertical dots + connecting line, title 13px semibold, meta 11.5px.
- DocumentPaper + TotalsBlock — document card (p-8/p-9), header (company block + "TAX INVOICE" / Arabic subtitle slot), meta grid in a
  sunken rounded-[14px] block, line table (10px uppercase headers, 13px rows, bottom borders), totals block right-aligned 320px
  ending in a brand-tint "Balance due" row. Add `void` prop → diagonal muted "VOID" stamp.
- LineItemsGrid — editable table for create pages: configurable columns (text / number / select / custom cell), add row, remove row,
  Enter on the last cell adds a row, right-aligned numeric inputs in .fin-num, row total column. Controlled (rows + onChange).
- RecordPaymentSheet — right-side Sheet (rounded-l-[24px], 440px): header with doc number + party; Amount with "Pay in full";
  Payment date; Method; Deposit to / Paid from (postable accounts select); Reference; JournalLinesTable preview
  (invoice: Dr <account> / Cr Accounts Receivable; bill: Dr Accounts Payable / Cr <account>); footer Cancel / Record payment.
  It must keep the same validation as today (amount > 0 and ≤ balance due, account required) and call the same
  financeService mutation passed in via props (kind: 'invoice' | 'bill').

Add all of them to /finance/_kit.

Acceptance: build + tests pass; the showcase matches the mockup; RecordPaymentSheet validation has unit tests.
Commit: "feat(finance-ui): kit B — record layout, status bar, document paper, line grid, payment sheet"
```

## 03 — Kit C: report components

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 03 — Finance kit, part C.

Read first: DESIGN.md §4.4; the mockup board "Report — Profit & Loss"; pages/finance/ProfitAndLossPage.tsx, TrialBalancePage.tsx,
BalanceSheetPage.tsx (current grouped/collapsible implementation from commit f68f9b50); components/ui/date-range-picker.tsx,
toggle-group.tsx, switch (if present, else build a small accessible switch in the kit); ExportModal.tsx.

Create in components/finance/kit/:
- PeriodPicker — segmented Month / Quarter / Year / Custom + a date-range chip showing "1 Jul – 30 Sep 2026"; Custom opens the
  date-range-picker; emits { preset, from, to } (ISO dates). Include a helper previousPeriod({from,to,preset}) in lib/finance
  (month → previous month, quarter → previous quarter, year → same span last year, custom → same length immediately before) + tests.
- ReportShell — FinancePageHeader (subtitle "Accrual basis · SAR · <range>"), Print + Export actions, toolbar card
  (PeriodPicker or an "As of" date picker via a `mode: 'range' | 'asOf'` prop, compare switch labelled
  "Compare with previous period", Collapse all / Expand all), a tiles slot (grid of 4) and a table slot.
- ReportTile — label, .fin-num value, optional delta pill ("+7.1%" tone-coloured) + "vs <previous>" text; `hero` variant = charcoal.
- ReportTable — props: sections[{ key, name, isCost?, rows[{ id, code?, name, current, previous?, onClick? }], subtotal?{ name, current, previous? } }],
  grandTotal { name, current, previous? }, compare boolean, currentLabel, previousLabel.
  Grid columns: compare ? "minmax(0,1fr) 160px 160px 140px 90px" : "minmax(0,1fr) 180px". Group rows are buttons (aria-expanded,
  rotating chevron) showing group totals; account rows show mono muted code + name + hover "View ledger →"; variance colours
  via varianceTone; sunken subtotal rows; charcoal grand-total row. Collapse state is controlled from outside so Collapse all works.
- A print stylesheet (@media print) scoped to .fin-report: hide the sidebar, header actions and toolbar; black text; 12pt; no shadows.

Add them to /finance/_kit with the mockup's P&L sample.

Acceptance: build + tests pass; showcase P&L matches the mockup, including compare on/off and collapse all.
Commit: "feat(finance-ui): kit C — report shell, period picker, report table, tiles"
```

## 04 — Sidebar grouping

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 04 — Group the Finance sidebar.

Read first: DESIGN.md §7; frontend/web-dashboard/src/components/layout/Sidebar.tsx (whole file, including the
enabledModules/hiddenModules/permission filtering and collapsed-sidebar mode); the mockup board "Finance sidebar — grouped".

Do:
- Inside the existing FINANCE group, render collapsible sub-groups Sales / Purchases / Banking / Accounting / Reports with exactly the
  items listed in DESIGN.md §7 (all current items, same icons, paths, moduleKey and permissionKey; nothing added or removed).
- Sub-group header: 13px semibold, small tinted chip, chevron; items indented; active item uses the existing active style.
- Open/closed state is saved in localStorage (wrap it in try/catch); the sub-group containing the active route always opens.
- Hide a sub-group entirely if all of its items are filtered out by modules/permissions.
- Collapsed (icon-only) sidebar: keep today's behaviour (show the items flat with tooltips).
- Other nav groups stay exactly as they are.

Acceptance: every finance link still routes correctly; gating still works (turn the finance module off in settings and check
the links disappear); keyboard and aria-expanded work.
Commit: "feat(finance-ui): group finance navigation into Sales, Purchases, Banking, Accounting, Reports"
```

## 05 — Backend: summary, filters, activity

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 05 — Finance API additions (no schema changes).

Read first: DESIGN.md §6; backend/api-server/src/routes/invoiceRoutes.ts, billRoutes.ts, journalEntryRoutes.ts;
controllers/invoiceController.ts (getInvoices), billController.ts, journalEntryController.ts; the AuditLog model in prisma/schema.prisma
(read only); controllers/settingsController.ts getAuditLogs (how audit logs are queried); src/tests/invoiceEngine.test.ts and
src/tests/phase4FinanceEngine.test.ts (test style); frontend services/financeService.ts; packages/shared-types/src/index.ts.

Do:
1. GET /api/invoices/summary → { counts: { all, Draft, Issued, PartiallyPaid, Paid, Void, unpaid, overdue },
   outstanding: { total, current, overdue, overdue_count, oldest_overdue_days }, collected_this_month: { amount, count } }.
   Use Prisma groupBy/aggregate (no loading every row into memory). "Today" and "this month" use the server's configured
   timezone, the same way existing finance code does. Register it BEFORE router.get('/:id').
2. GET /api/bills/summary with the same shape (payables; paid_this_month instead of collected_this_month).
3. Extend the list filters: status=unpaid → Issued|PartiallyPaid (bills: Approved|PartiallyPaid); status=overdue → unpaid AND due_date < today.
   Keep every existing filter working.
4. GET /api/invoices/:id/activity, /api/bills/:id/activity, /api/journal-entries/:id/activity → AuditLog rows for that
   entityType/entityId, newest first, including user { id, username } only (no other user fields). Check which entityType string
   each controller writes; don't guess.
5. Add the types to packages/shared-types (FinanceDocSummary, ActivityItem), rebuild types (npm run build:types), and add
   financeService methods getInvoiceSummary, getBillSummary, getInvoiceActivity, getBillActivity, getJournalEntryActivity.
6. Tests: counts and amounts for a fixture of mixed-status invoices, including overdue boundary (due today = not overdue),
   partial payments, void excluded from outstanding; 403 for a Driver token.

Acceptance: tsc clean; new and existing finance tests pass; the endpoints return the right data when you hit them against local Postgres.
Commit: "feat(finance-api): document summaries, unpaid/overdue filters and activity endpoints"
```

## 06 — Invoices list

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 06 — Redesign pages/finance/InvoicesPage.tsx (list only).

Read first: DESIGN.md §4.1; mockup board "Invoices — list"; the current InvoicesPage.tsx in full; components/finance/kit; financeService.

Do:
- FinancePageHeader: crumbs Finance / Sales / Invoices; subtitle "Bill customers for trips, track what's owed and record what's been paid.";
  actions Export (secondary, opens the existing ExportModal) and New invoice (primary, keeps navigate('/finance/invoices/new'), shortcut N).
- SummaryStrip from getInvoiceSummary (Total outstanding with current/overdue bar, Current, Overdue, Collected this month).
  Remove the old page-computed KPI cards.
- StatusTabs: All, Draft, Unpaid, Overdue, Paid, Void with counts from the summary; each tab maps to the server status filter.
  Store tab, search, page (and later filters) in the URL query string so back/forward and reload work.
- FilterBar: search (debounced 300ms), Date chip (date_from/date_to via date-range-picker), Customer chip (customer_id; reuse the customer
  list query used by InvoiceCreatePage), Sort chip (newest first / oldest first / due date / balance — only options the API supports;
  if it doesn't support sorting, leave the Sort chip out and tell me).
- DataTable columns: checkbox, Number (.fin-num semibold), Customer + sub-line (trip count from lines with tripId), Date (formatDate),
  Due (dueLabel; Overdue text orange bold), Amount (right), Balance (right, semibold), Status (StatusPill with getDisplayStatus),
  row actions ⋯ (hover-reveal DropdownMenu: View, Print, Record payment if open, Delete draft if Draft → ConfirmModal).
- Clicking a row → /finance/invoices/:id (the page comes in prompt 07; until then keep the old View dialog reachable from the menu,
  and remove it in 07). Pass the ordered list of ids in router state for the record-page pager.
- Selection → FilterBar selectionBar with Print (opens InvoicePrintModal for one; for several, print them in sequence),
  Export selected (ExportModal with the selected rows).
- Footer: "Showing a–b of N · Balance in view SAR x" + pagination.
- Loading: skeleton rows. Empty: FinanceEmptyState ("No invoices yet" + New invoice) or "No invoices match these filters" + Clear filters.

Acceptance: every existing capability still works (issue/void/pay/delete via the menu or the old dialog); the counts match the DB;
it looks like the mockup at 1440px; the mobile card view works at 390px; dark mode is right.
Commit: "feat(finance-ui): redesign invoices list with summary, status tabs and filters"
```

## 07 — Invoice record page

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 07 — New InvoiceDetailPage.

Read first: DESIGN.md §4.2; mockup board "Invoice — record + record payment"; pages/finance/InvoicesPage.tsx (the view dialog,
payment modal, issue/void mutations), components/finance/InvoicePrintModal.tsx, router.tsx (finance routes),
financeService.getInvoiceById / getInvoiceActivity, the Invoice type (lines, payments, trips, journalEntry, tax_rate, subtotal, tax_amount).

Do:
- Add route /finance/invoices/:id (after /finance/invoices/new) → pages/finance/InvoiceDetailPage.tsx, lazy-loaded like the others,
  wrapped in RequireModule "finance".
- Build it with RecordLayout: crumbs "Invoices / <ref_id>", pager from router state, title = ref_id (.fin-num) + StatusPill,
  sub-line "<customer> · Issued <date> · <terms if available>".
- Actions by status: Draft → Edit (to the create page in edit mode, see prompt 08) + Issue (primary; ConfirmModal whose body shows
  a JournalLinesTable preview: Dr Accounts Receivable total / Cr revenue subtotal / Cr VAT tax_amount); Issued/PartiallyPaid →
  Record payment (primary → RecordPaymentSheet kind="invoice"); always Print / PDF (InvoicePrintModal); ⋯ menu: Delete draft (Draft),
  Void (Issued only, like today; ConfirmModal isDestructive, message explains the reversal and that trips are unlinked).
- DocStatusBar: Draft → Issued → Partially paid → Paid, with timestamps from createdAt / journalEntry date / payment dates; a voided invoice
  uses the voided variant.
- Main: DocumentPaper with the company block (read company name/VAT/address from wherever InvoicePrintModal gets them; if they aren't
  available, show placeholders and tell me), bill-to, meta grid (invoice date, due date, currency), lines (description, trip ref linking
  to the trip page, qty, rate, amount), TotalsBlock (subtotal, VAT <tax_rate>%, total, paid, balance due).
- Side: BalanceHeroCard (balance due, % collected, "Due <date> · in N days" / "Overdue N days" / "Settled");
  SidePanelTabs Payments (list; empty state) | Journal (invoice.journalEntry lines + "Open in General Ledger →" link) |
  Activity (getInvoiceActivity → ActivityTimeline; map audit action codes to readable text).
- After any mutation: invalidate ['invoices'], ['invoice', id] and the summary query, then show a toast.
- Remove the old View dialog and payment dialog from InvoicesPage (rows and the ⋯ menu now go to the record page / open the sheet).
- 404 / error state: FinanceEmptyState with "Back to invoices".

Acceptance: issue, record a partial payment, then a full payment, then void a different issued invoice — everything posts
exactly as before (compare against the General Ledger); the status bar, balance and activity update without a page reload.
Commit: "feat(finance-ui): invoice record page with status bar, document view and payment sheet"
```

## 08 — Invoice create / edit

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 08 — Redesign InvoiceCreatePage (and add edit mode).

Read first: DESIGN.md §4.3; pages/finance/InvoiceCreatePage.tsx in full (customer select, trip picking, line building, tax, save/issue);
financeService.createDraftInvoice / updateDraftInvoice / issueInvoice; kit LineItemsGrid, DocumentPaper, TotalsBlock.

Do:
- Same header pattern: crumbs Invoices / New invoice (or / <ref_id> / Edit).
- Card 1 "Details": 4-column grid — Customer, Invoice date, Due date (plus quick terms chips: Net 15 / Net 30 / Net 60 that set the due date),
  and any other field the current page already has. Don't add fields the DTO doesn't support.
- Card 2 "Lines": LineItemsGrid (description, trip, qty, rate, amount). The existing trip-selection flow moves into a right Sheet
  "Add trips" (search, multi-select of the customer's uninvoiced trips, the same data source as today); the selected trips become lines.
- Sticky footer: Subtotal · VAT · Total on the left; Cancel, Save draft, Save & issue on the right (Save & issue = create/update, then issue,
  with the same JE-preview confirmation as prompt 07).
- Edit mode: /finance/invoices/:id/edit loads a Draft invoice and uses updateDraftInvoice; non-draft invoices redirect to the record page.
- Unsaved-changes guard when leaving with a dirty form.
- After saving, go to the record page.

Acceptance: create from trips, create manual lines, edit a draft, Save & issue — the totals and JE are the same as the old page produced.
Commit: "feat(finance-ui): redesign invoice create page, add draft edit mode"
```

## 09 — Bills

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 09 — Bills: list, record page, create/edit.

Read first: prompts 06–08 as implemented for invoices (reuse the same structure); pages/finance/BillsPage.tsx and BillCreatePage.tsx
in full; financeService bill methods (getBills, getBillById, createDraftBill, updateDraftBill, deleteDraftBill, approveBill,
recordBillPayment, voidBill, getBillSummary, getBillActivity); the Bill type.

Do, mirroring invoices:
- List: crumbs Finance / Purchases / Bills; SummaryStrip "Total payable (current/overdue) · Current · Overdue · Paid this month";
  tabs All / Draft / Unpaid / Overdue / Paid / Void; vendor/provider chip; the same table pattern with the vendor sub-line.
- Record page /finance/bills/:id: statuses Draft → Approved → Partially paid → Paid; primary action Approve (JE preview Dr expense
  lines / Cr Accounts Payable — use the bill's actual lines/accounts) or Record payment (RecordPaymentSheet kind="bill":
  Dr Accounts Payable / Cr bank). DocumentPaper titled "BILL" with the vendor block.
- Create/edit page with LineItemsGrid using the bill's line fields (expense account per line, if the DTO has it).
- Remove the old dialogs from BillsPage.

Acceptance: approve, part-pay, fully pay and void work and post the same entries as before.
Commit: "feat(finance-ui): redesign bills list, add bill record page and edit mode"
```

## 10 — Journal entries

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 10 — Journal Entries redesign
(daybook list, record page, full-page editor). This prompt can run on its own, before or after the kit prompts.

READ FIRST (don't edit anything until you have):
- CLAUDE.md, docs/finance-redesign/DESIGN.md (all of it, especially §2 tokens, §3 kit, §4.0 and §4.5b Journal Entries, §5 status map, §8)
- frontend/web-dashboard/UI_GUIDELINES.md
- frontend/web-dashboard/src/pages/finance/JournalEntriesPage.tsx (whole file: filters, create modal, post/void/delete mutations,
  the ?search= URL param, export columns)
- frontend/web-dashboard/src/services/financeService.ts (getJournalEntries params: period_id, status, source_type, account_id,
  date_from, date_to, search, page, per_page; plus getJournalEntryById, createDraftJournalEntry, updateDraftJournalEntry,
  deleteDraftJournalEntry, postJournalEntry, voidJournalEntry, getAccounts, getAccountingPeriods)
- packages/shared-types/src/index.ts: JournalEntry (ref_id, entry_date, memo, status, period, source_type, source_id, reversalOf,
  reversedBy, lines, posted_by, posted_at), JournalLine, JournalEntryStatus
- backend/api-server/src/controllers/journalEntryController.ts and routes/journalEntryRoutes.ts: which actions are allowed on which
  entries (e.g. can system-generated entries be edited or voided? can drafts in a closed period be posted?). The UI must show only
  the actions the backend allows.
- router.tsx finance routes, components/ui/combobox.tsx, ConfirmModal.tsx, Btn.tsx, sheet.tsx, dropdown-menu.tsx
- whatever already exists in frontend/web-dashboard/src/components/finance/kit/ and src/lib/finance/

KIT RULE: use the finance kit components when they exist. If one you need is missing (FinancePageHeader, StatusPill, MoneyText,
StatusTabs, FilterBar/FilterChip, FinanceEmptyState, DocStatusBar, RecordLayout, SidePanelTabs, JournalLinesTable, ActivityTimeline,
and the helpers formatMoney/formatDate/FIN_STATUS in src/lib/finance), CREATE it in components/finance/kit/ (or src/lib/finance/)
exactly as DESIGN.md §2–§3 specifies, generic and reusable (no journal-specific logic inside), exported from the barrel, so other pages
can use it later. Don't build page-local look-alikes.

DESIGN INTENT: this page must NOT look like the Invoices page. It's an accountant's daybook (DESIGN.md §4.5b). No KPI cards —
remove the four KpiCards completely.

1) LIST — /finance/journal-entries (rewrite JournalEntriesPage.tsx)
- FinancePageHeader: crumbs Finance / Accounting / Journal Entries; subtitle "Every posting to the general ledger, by date.";
  actions Export (existing ExportModal and columns; add a "Source" column) and "New entry" (primary → /finance/journal-entries/new).
- Drafts notice: only when there's at least one Draft. A slim info bar in brand-tint with an icon: "N draft entries waiting to post ·
  oldest X days" and a "Review drafts" button that switches to the Draft tab. Get N and the oldest date from getJournalEntries({ status:
  'Draft', per_page: 1 }) plus pagination.total (check which sort order the API uses; if you can't get the oldest date reliably,
  leave that part out).
- StatusTabs: All · Draft · Posted · Voided, counts from pagination.total of cheap per_page=1 queries (staleTime 30s).
- FilterBar: search (debounced; keep supporting the incoming ?search= param), Date range chip (date_from/date_to), Period chip
  (period_id, all periods, not just open ones), Source chip (source_type), Account chip (account_id, searchable code + name).
  Keep all filter state + tab + page in the URL query string.
- Daybook: group the current page's entries by entry_date. Each group has a sticky, sunken header: "Tue, 23 Sep 2026 · 4 entries ·
  Dr 58,300.00". Each entry row (h-14, hover row-hover) shows: expand chevron · JE number (.fin-num semibold) · Source badge ·
  memo (truncate) with the account flow summary under it in meta text ("Accounts Receivable → Freight Revenue +1") · total debit
  (MoneyText, right) · StatusPill kind="journal" · a hover-reveal ⋯ menu (Open, Edit/Post/Delete for drafts, Void for posted, as the backend
  allows).
- Clicking a row toggles an inline expansion (several can be open; aria-expanded on the row button; Esc collapses the focused one).
  The expansion shows a JournalLinesTable (account code + name, line description, debit, credit; credit lines indented 12px; totals
  row with a "✓ Balanced" / "Out by X" check), then a meta line: Period · Created by / Posted by + posted_at · reversal link
  ("Reversal of JE-…" / "Reversed by JE-…", both link to the record page), and buttons Open / Edit / Post as allowed.
- Source badge: a small rounded-md chip with a lucide icon + label mapped from source_type:
  Manual (PenLine), Invoice (ReceiptText), InvoicePayment "Invoice payment" (BadgeDollarSign), Bill (FileText), BillPayment
  "Bill payment" (CreditCard), Expense (Wallet), Advance (HandCoins), AdvanceApplication "Advance applied" (ArrowRightLeft),
  BankTransfer "Bank transfer" (Building2), TripSubcontract "Trip subcontract" (Truck), FiscalYearClosing "Year-end closing" (Lock),
  IMPORT "Import" (Upload). Anything else: a neutral chip with the raw value. If a route exists for the source document, the chip links to
  it (Invoice → /finance/invoices/:source_id if that route exists, otherwise /finance/invoices?search=…; Bill likewise). Check what
  source_id refers to in the backend before linking.
- Voided entries: text-2 colours, the amount struck through. Reversal entries show a small "Reversal" tag.
- Footer: "Showing a–b of N" + pagination. Loading: day header + row skeletons. Empty: FinanceEmptyState ("No journal entries yet" +
  New entry / "Nothing matches these filters" + Clear filters).

2) RECORD PAGE — /finance/journal-entries/:id (new JournalEntryDetailPage.tsx, lazy route after /new, inside RequireModule "finance")
- RecordLayout: crumbs Journal Entries / JE-…; title = ref_id (.fin-num) + StatusPill + Source badge; sub-line "Entry date · Period".
- DocStatusBar: Draft → Posted (timestamps createdAt / posted_at); voided → Draft ✓ → Posted ✓ → Voided.
- Main card (ledger-style, not paper): a detail strip in a sunken rounded-[14px] block (Date, Period + its status, Source, Reference,
  Memo), then the full lines table with a totals row and the balance check.
- Side: a "Linked" card (source document link, reversal pair links, period status with a lock icon if Closed/Locked) and an Activity card.
  Activity: use GET /api/journal-entries/:id/activity if it exists. If it doesn't, add it now as DESIGN.md §6 describes (journal
  entries only: AuditLog rows where entityType is whatever journalEntryController writes and entityId = id, newest first, include
  user { id, username } only, same router middleware, registered before any conflicting route), add the shared type + the
  financeService.getJournalEntryActivity method, plus a backend test.
- Actions (only those the backend allows): Draft → Edit, Post (ConfirmModal showing the lines and "This posts to the general ledger
  and can't be edited afterwards."), Delete (ConfirmModal, destructive); Posted → Void (ConfirmModal, destructive, optional reason memo,
  explains that a reversing entry will be posted and links to it after success).
- Loading, 404 and error states.

3) EDITOR — /finance/journal-entries/new and /finance/journal-entries/:id/edit (new JournalEntryEditorPage.tsx; drafts only —
   non-drafts redirect to the record page). Delete the old create modal from the list page.
- Header card: Entry date, Period (defaults to the open period that contains the entry date; only open periods can be picked; show a
  hint if none contains the date), Reference/Memo — only the fields CreateJournalEntryDTO supports.
- Lines card: a spreadsheet-like grid — # · Account (combobox searching code + name, postable accounts only) · Description · Debit ·
  Credit · remove. Keep today's behaviour: typing a debit clears that line's credit and vice versa. Numbers are right-aligned .fin-num
  inputs. Enter on the last cell adds a row. At least 2 lines. On an empty row, show a small "Balance remaining X as debit/credit"
  button that fills in the amount needed to balance.
- Sticky footer bar: Total debit · Total credit · Difference pill (green "Balanced" when it's 0 and totals > 0, otherwise orange
  "Out by X") on the left; Cancel · Save draft · Save & post on the right. Save & post is disabled until the entry is balanced, has at
  least 2 lines, and every line has an account; it saves (create or update) and then posts behind the same ConfirmModal as the record page.
- Keep the existing validation messages. Warn about unsaved changes when leaving with a dirty form. After saving, go to the record page.

DON'T: change the schema, change any business rule, add statuses, or touch other finance pages (besides extracting kit components).

VERIFY (in the running app, light + dark, 1440px and 390px):
- the list groups by day, expands in place, all filters and tabs work, and ?search= deep links still work
- create an unbalanced entry → Save & post disabled → use "Balance remaining" → post → it appears under Posted and in the General Ledger
- edit + delete a draft; void a posted entry → the reversal entry appears and both link to each other
- system-generated entries (e.g. from an invoice) show the right source badge + link and only the allowed actions
- npm run build + vitest pass in frontend/web-dashboard; backend npx tsc --noEmit + your new test pass if you touched the backend

FINISH: update PROGRESS.md (Finance UI revamp → row 10, plus any kit components you created), then commit:
"feat(finance-ui): journal entries daybook, record page and balance-aware editor"
Reply with: what you built, which kit components you created vs reused, any backend change, and anything you had to skip or ask about.
```

## 11 — Chart of Accounts + Accounting Periods

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 11 — ChartOfAccountsPage and AccountingPeriodsPage.

Read first: DESIGN.md §4.6; both pages in full; financeService account/period methods; the Account type (AccountType, is_postable,
parent/children if present, cash_flow_category).

Do:
- Chart of Accounts: FinancePageHeader (Finance / Accounting / Chart of Accounts, action New account); a toolbar with search +
  "Show inactive" switch + type filter chips; a tree table grouped by AccountType using ReportTable-style group rows (collapsible,
  with group counts), child accounts indented under their parents, columns Code (.fin-num) · Name · Type · Postable · Balance
  (only if the API returns it) · Status; row hover "View ledger →"; create/edit in a right Sheet instead of a dialog; delete/deactivate
  via ConfirmModal with the existing rules.
- Accounting Periods: crumbs Finance / Accounting / Periods; a timeline-style list grouped by fiscal year, each period row showing
  name, date range, StatusPill kind="period", and actions Close / Lock (ConfirmModal explaining what each does); a "New period"
  sheet; "Close fiscal year" as a guided Sheet: pick the closing date → show what will happen (reuse the existing closeFiscalYear call;
  show a JE preview only if the API offers a dry run — otherwise just a clear warning) → confirm.

Acceptance: create, edit, deactivate an account; create, close and lock a period; the fiscal year close still works.
Commit: "feat(finance-ui): redesign chart of accounts and accounting periods"
```

## 11b — Period Close workspace

Replaces the "Accounting Periods" half of prompt 11 (the Chart of Accounts half is already done).

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 11b — rebuild
frontend/web-dashboard/src/pages/finance/AccountingPeriodsPage.tsx as a Period Close workspace.

GOAL: the best month-end close screen we can make, not a generic CRUD table. Borrow patterns from:
Odoo (lock date: "books locked through …"), Zoho Books (transaction locking with typed confirmation
for irreversible steps), and Xero/NetSuite (a month-end close checklist). NO KPI cards.

READ FIRST (don't edit before you have):
- CLAUDE.md; docs/finance-redesign/DESIGN.md — all of it, especially §2, §3, §4.0 and §4.6b (the layout for this page)
- The current AccountingPeriodsPage.tsx (every behaviour it has must survive: create period, close, lock,
  close fiscal year, export, Admin-only actions via usePermissions)
- The page I most recently restyled, pages/finance/JournalEntriesPage.tsx, and pages/finance/ChartOfAccountsPage.tsx.
  MATCH THEIR VISUAL LANGUAGE exactly: white cards with light slate borders, small coloured dots as category markers,
  dark header bands where they use them, micro-pills, the same radii/shadows/type scale, and the strict MERCON palette
  (#FA634E, #3E3C3D, #EEF1F6) + the semantic tones from src/lib/finance/status.ts. Minimal, calm colour; each colour
  must carry meaning.
- components/finance/kit/* and src/lib/finance/* (use them; add new generic pieces to the kit if needed)
- Backend rules, so the UI never offers something the API will reject:
  backend/api-server/src/routes/accountingPeriodRoutes.ts, controllers/accountingPeriodController.ts,
  utils/periodClosingEngine.ts, utils/fiscalYearClosingEngine.ts. Current facts (verify them):
    · close: Admin only, Open → Closed, rejected while the period has Draft JEs; writes AccountClosingBalance snapshots
    · lock: Admin only, rejected while Draft JEs exist, permanent; today it ALSO accepts Open periods (skipping the
      snapshot) — Part A1 fixes that. There is no reopen endpoint yet — Part A2 adds one.
    · close fiscal year: Admin only, needs every period in range Closed/Locked + Settings.defaultRetainedEarningsAccountId;
      posts a 'FiscalYearClosing' JE; there is NO dry-run/preview endpoint
    · create: rejects overlapping / invalid ranges; GET list includes _count.journalEntries
- financeService: getAccountingPeriods, createAccountingPeriod, closeAccountingPeriod, lockAccountingPeriod,
  closeFiscalYear, getJournalEntries (period_id, status), getInvoices / getBills (status, date_from, date_to),
  getBankAccounts, getReconciliations, getTrialBalance({ period_id }), getProfitAndLoss({ date_from, date_to }),
  and the settings service (for the retained-earnings account check)
- backend/api-server/src/services/auditService.ts (logAuditEvent) and how invoiceController.ts calls it

PART A — BACKEND (owner-approved rule changes; no schema change). Do this first, with tests.

A1) Lock only from Closed. In lockAccountingPeriod, reject any period whose status isn't 'Closed' with
    400 { code: 'PERIOD_NOT_CLOSED', message: "Only a closed period can be locked. Close '<name>' first so its balances are snapshotted." }.
    Keep the existing ALREADY_LOCKED and UNPOSTED_DRAFTS_EXIST checks.

A2) Reopen a closed period: POST /api/accounting-periods/:id/reopen, authorizeRoles('Admin'), body { reason: string }
    (zod: trimmed, 10–500 chars). Rules, in one prisma transaction:
    - 404 if it doesn't exist; 400 PERIOD_LOCKED if it's Locked ("Locked periods are permanent and can't be reopened");
      400 PERIOD_NOT_CLOSED if it's already Open
    - 400 LATER_PERIOD_CLOSED if any period that starts after this one is Closed or Locked. Periods are reopened
      newest-first, so the "books locked through" date always moves back in order (the same rule Odoo's lock date follows).
    - 400 FISCAL_YEAR_CLOSED if a Posted 'FiscalYearClosing' journal entry exists dated on or after this period's start
      (reopening would invalidate the year-end close). Check how fiscalYearClosingEngine stores that entry.
    - otherwise: status → 'Open', closed_by → null, closed_at → null, updated_by → user; delete this period's
      AccountClosingBalance rows (they're rebuilt when the period is closed again).
    - logAuditEvent PERIOD_REOPENED (entityType 'AccountingPeriod', entityId id) with metadata
      { name, reason, previous_closed_by, previous_closed_at }.
    Register the route next to /:id/close. Add financeService.reopenAccountingPeriod(id, reason).

A3) Audit trail for the other period actions, so the page can show who did what:
    PERIOD_CREATED, PERIOD_CLOSED, PERIOD_LOCKED (metadata { name }), and FISCAL_YEAR_CLOSED
    (entityType 'AccountingPeriod', entityId = the closing period, metadata { closing_date, journalEntryId }).
    Add GET /api/accounting-periods/:id/activity (Admin + Operator, as the router allows) returning that period's
    audit rows newest first with user { id, username } only, plus financeService.getAccountingPeriodActivity(id).

A4) Tests (existing finance test style): lock an Open period → 400 PERIOD_NOT_CLOSED; close → lock works;
    reopen: Locked → 400, reason too short → 400, later period closed → 400, happy path → Open + snapshot rows deleted +
    audit row with the reason; close again → snapshot rebuilt; Operator token → 403 on reopen.
    Run npx tsc --noEmit and the finance tests.

PART B — THE PAGE

1) Header — FinancePageHeader: crumbs Finance / Accounting / Period close; title "Period close";
   subtitle "Close the books month by month. Closed periods stop accepting postings."
   Actions (Admin only): "Generate periods" (secondary), "Close fiscal year" (secondary), "New period" (primary, Sheet).

2) Fiscal-year bar — FY switcher (‹ FY 2025 | FY 2026 ›; fiscal year = calendar year, since there's no FY-start setting)
   and on the right the lock line: lock icon + "Books locked through 31 Jul 2026" = end date of the latest period
   such that it and every earlier period are Closed or Locked ("Nothing closed yet" otherwise).

3) Year ribbon — one tile per period in the selected FY, in chronological order (horizontal scroll on small screens).
   Tile (~88px, rounded-2xl, 1px border): short name (Sep), status visual
     Open  → white, green dot          Closed → amber tint, check icon          Locked → charcoal fill, white text, lock icon
   plus the JE count, and an orange dot + number when the period has drafts. The current month gets a brand ring and a
   "now" tag; the selected tile gets a 2px brand outline. If the FY uses monthly periods, months with no period show as
   dashed "Not created" tiles with a "+" (Admin: click → New period Sheet pre-filled for that month).
   Keyboard: tiles are buttons, arrow keys move the selection, aria-pressed on the selected one.
   Default selection = the earliest Open period (the one you'd close next); otherwise the current month.

4) Close checklist card (left, main column) for the selected period. Header "Close checklist · September 2026" +
   "4 of 6 checks passed" with a thin progress bar. Rows (state icon · title · one-line detail · deep-link action):
   a) BLOCKER  Draft journal entries in this period (getJournalEntries period_id + status Draft, per_page 1 → total)
               → "Review drafts" = /finance/journal-entries?period_id=…&status=Draft (use the query params that page reads)
   b) WARNING  Draft invoices dated in the period (getInvoices status Draft + date range) → invoices list filtered
   c) WARNING  Draft bills dated in the period (getBills likewise) → bills list filtered
   d) WARNING  Bank accounts not reconciled through period end: for each bank account, is there a Completed reconciliation
               with statement_date ≥ period end? List the ones that aren't → "Reconcile" (/finance/reconciliation?bankAccountId=…)
   e) CHECK    Trial balance for the period balances (getTrialBalance({ period_id }): total debit = total credit)
   f) WARNING  Previous period is closed (close in order)
   g) INFO     Invoices overdue at period end (count, link) — informational only, never blocks
   States: ✓ pass (positive), ! warning (warning tone), ✕ blocker (negative), i info (slate). Loading = row skeletons;
   run the checks in parallel with react-query and cache them per period (staleTime 30s).
   Footer of the card, by status:
   - Open: one line explaining what closing does ("Takes a snapshot of every account balance and stops new postings in
     this period.") + primary "Close September 2026". Disabled while any blocker remains (tooltip explains why). If
     warnings remain, confirmation lists them and needs an explicit "Close anyway". Don't use window.confirm.
   - Closed: "Closed by <user> on <date>" + two actions:
       · "Reopen period" (secondary) → Sheet with a required reason textarea (10–500 chars, live counter), a note that the
         balance snapshot will be discarded and rebuilt on the next close, and — if a later period is Closed/Locked or the
         fiscal year is closed — the button disabled with the reason shown (mirror the A2 rules; the API is the source of truth,
         so show its error message if it still refuses).
       · a charcoal "Lock permanently" → ConfirmModal requiring the user to type the period name; the copy says it can't be
         undone, and that locking is only possible because the period is closed.
   - Locked: a calm read-only note with a lock icon ("Locked periods are permanent").
   - A period that was reopened shows a subtle "Reopened <date> · <reason>" note above the checklist (from the activity feed).
   Operators: show the whole checklist, but hide the buttons and show "Only Admins can close, reopen or lock periods."

5) Period details card (right column, ~360px):
   date range + StatusPill kind="period"; a mini status trail Created → Closed → Locked with dates where known;
   an "Activity" list (ActivityTimeline, from getAccountingPeriodActivity): created, closed, reopened (with the reason),
   locked, fiscal year closed — who and when;
   entry counts (posted · draft · voided) from getJournalEntries totals; Revenue, Expenses and Net result for the period,
   computed from getTrialBalance({ period_id }) by account type (MoneyText; net result positive/negative tone) — this is
   context for the selected period, not a KPI strip; links "Trial balance for this period" and "Journal entries in this period".

6) All periods (below, collapsible, closed by default): a compact table of every period (name, range, status pill,
   JE count, closed at) with Export (keep the existing ExportModal and columns). Clicking a row selects it in the ribbon
   (switching FY if needed).

7) New period Sheet (replaces the dialog): name (suggest "September 2026" from the dates), start date, end date, a live
   overlap warning against existing periods, and quick presets "Next month" / "Next quarter". Send the end date as the end of
   that day (23:59:59.999), not midnight, so entries made on the last day fall inside the period — check how the backend parses
   it and how existing periods are stored, and stay consistent with them.

8) Generate periods Sheet: choose FY (and monthly vs quarterly) → preview list of the periods that would be created,
   skipping ones that already exist or overlap → "Create N periods" calls createAccountingPeriod for each one in order,
   showing progress and any per-row error. No new endpoint.

9) Close fiscal year Sheet (guided, replaces the dialog), 4 steps with a small stepper:
   1. Closing date (default 31 Dec of the selected FY)
   2. Pre-checks: every period up to the date is Closed/Locked (list offenders with links), retained-earnings account is
      configured (link to settings if not); Next is disabled until both pass
   3. Preview: net income for the FY from getProfitAndLoss(FY start → closing date), and a JournalLinesTable preview of the
      closing entry (Dr each revenue account, Cr each expense account, net to Retained Earnings). Label it "Estimated
      preview" because there is no dry-run endpoint; check how fiscalYearClosingEngine builds the lines and mirror it.
   4. Typed confirmation "CLOSE FY2026" → call closeFiscalYear → success state with a link to the created JE
      (/finance/journal-entries/<id> if that route exists, otherwise the list filtered by source FiscalYearClosing).

10) After any mutation: invalidate accounting-periods, journal-entries and trial-balance queries; toast; keep the selection.

DON'T: add KPI cards, change the schema, add statuses, or offer an action the backend rejects. The owner has approved
exactly two rule changes (A1 lock only from Closed, A2 reopen); don't change any other business rule.

VERIFY (in the running app with the local demo data from docs/finance-redesign/local-demo, light + dark, 1440 and 390px):
- the ribbon shows Jun–Aug closed, Sep open with 2 drafts, Oct open, Nov–Dec "not created"; the lock line reads 31 Aug 2026
- September: the drafts blocker disables Close; "Review drafts" opens the JE list filtered to those drafts; the reconciliation
  warning lists Al Rajhi (reconciled only to 31 Jul), SNB and Petty Cash; the trial balance check passes
- post or delete the drafts → Close enables → close with warnings → the tile turns amber
- reopen: August can't be reopened while September is closed (clear message); reopen September with a reason → tile turns
  white/green, lock line moves back, the activity shows the reason; close it again → the trial balance for it is unchanged
- then lock September with typed confirmation → tile turns charcoal, and Reopen is no longer offered for it
- the API refuses to lock an Open period (try it with curl/Thunder Client) and the UI never offers it
- generate periods creates Nov + Dec and skips existing ones; the fiscal year sheet blocks at pre-checks while periods are open
- as Operator: everything visible, no action buttons; reopen/lock/close return 403 for an Operator token
- npm run build + vitest pass; backend npx tsc --noEmit + finance tests pass

FINISH: update PROGRESS.md (row 11b), commit backend and frontend as two commits:
"feat(finance-api): lock only closed periods, reopen with reason, period activity" and
"feat(finance-ui): period close workspace with checklist, year ribbon and guided FY close",
and reply with what you built, what you reused or added to the kit, and anything you skipped or need the owner to decide.
```

## 12a — Advances: list, record page, create page

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 12a — rebuild Advances as three pages:
list (/finance/advances), record page (/finance/advances/:id, replaces the details modal) and create page
(/finance/advances/new, replaces the create modal).

GOAL: modern, lively, minimal. Use shadcn components as much as possible, with colourful chips that each mean something,
and Zoho Books / Odoo features for customer credits and prepayments. Match the look of the pages already redone
(JournalEntriesPage, ChartOfAccountsPage, AccountingPeriodsPage): white cards, light slate borders, micro-pills, category
dots, the strict MERCON palette (#FA634E, #3E3C3D, #EEF1F6) plus the semantic tones in src/lib/finance/status.ts.

READ FIRST (don't edit before you have):
- CLAUDE.md; docs/finance-redesign/DESIGN.md — §2, §3, §4.0 and especially §4.5c (layout, chip colours, business rules)
- frontend/web-dashboard/src/pages/finance/AdvancesPage.tsx in full (every current capability must survive: list, filters,
  create, view, apply to invoice/bill, void, export)
- JournalEntriesPage.tsx, JournalEntryDetailPage.tsx, JournalEntryEditorPage.tsx (reuse their patterns: record page layout,
  full-page editor with sticky footer, source/party chips)
- components/finance/kit/* and src/lib/finance/*; components/ui/* (shadcn primitives available: badge, button, card, tabs,
  table, sheet, dialog, dropdown-menu, popover, command, combobox, select, calendar, date-picker, hover-card, tooltip,
  progress, scroll-area, separator, skeleton, checkbox, textarea, toggle-group, avatar, alert, label, input)
- Backend: routes/advanceRoutes.ts, controllers/advanceController.ts, utils/advanceEngine.ts (the rules are summarised in
  DESIGN.md §4.5c — verify them), plus services/financeService.ts (getAdvances, getAdvanceById, createAdvance, applyAdvance,
  voidAdvance, getInvoices({ customer_id, status }), getBills({ provider_id, status }), getBankAccounts, getAccountingPeriods),
  customerService, thirdPartyService, driverService, settingsService.

SHADCN: prefer shadcn primitives over custom markup. If you need one that isn't installed — radio-group (type/bank cards),
switch (group-by toggle), alert-dialog (void confirmation), accordion, breadcrumb — add it with the shadcn CLI
(components.json exists) into components/ui, and mention it in your reply. Don't add other UI libraries.

PART A — BACKEND (small; no schema change)
A1) Party names: advances store only party_type + party_id. In listAdvances and getAdvanceById, attach
    party: { id, name, type } resolved per party_type — Customer → Customer.name, Provider → ThirdPartyProvider.name,
    Employee → Driver (first_name + last_name). Batch the lookups (one findMany per type, not one query per row). Add the
    optional `party` field to the shared Advance type and rebuild the types.
A2) getAdvanceById: include each application's invoice { id, ref_id, invoice_date, total_amount } / bill { id, ref_id, bill_date,
    total_amount } and its journal entry ref, if not already included.
A3) Tests in the existing finance test style for A1 (names resolve for all 3 types; a missing party returns party: null, not a 500).
    Run npx tsc --noEmit + the finance tests.

PART B — LIST PAGE (/finance/advances)
1) FinancePageHeader: crumbs Finance / Banking / Advances; subtitle "Money held on account — received from customers or paid
   out ahead to providers and employees." Actions: Export (existing ExportModal; add Party name and Age columns) and a split
   button "New advance" whose dropdown offers the 3 types → /finance/advances/new?type=customer|provider|employee.
2) SummaryStrip, 3 cells, computed from the list (the API returns every row): "Customer advances held" (sum remaining of
   Received, not Void; sky dot; note "owed back or to be applied"), "Paid to providers" (violet), "Employee advances" (teal);
   each shows its count. These are the only figures on the page.
3) StatusTabs: All · Open · Partially applied · Fully applied · Void, with counts.
4) FilterBar: search (ref, memo, party name), Type chips (Customer / Provider / Employee, multi-select, coloured dots),
   Direction (Money in / Money out), Party (combobox), Date range. State lives in the URL query string.
   Right side: a "Group by party" switch. When it's on, rows group under a sticky party header with a subtotal of remaining.
5) Rows (DataTable, whole row → record page): ref (.fin-num) · party avatar (initials on the type tint) + name + type chip ·
   direction chip (↓ Money in emerald / ↑ Money out orange) · date + age chip for Open/Partially applied (">30 days" amber,
   ">60 days" orange) · amount (MoneyText) · applied: a thin progress bar with "remaining X" under it · StatusPill kind="advance" ·
   a hover ⋯ menu (Open, Apply… if allowed, Print voucher, Void if nothing applied).
6) Empty/loading/error states from the kit.

PART C — RECORD PAGE (/finance/advances/:id, new AdvanceDetailPage.tsx, lazy route declared after /new, RequireModule finance)
1) RecordLayout: crumbs Advances / <ref>; title = ref (.fin-num) + StatusPill + direction chip + party type chip;
   sub-line "<party name> · <date> · via <bank account name>". Pager across the list order (router state), like the JE page.
2) DocStatusBar: Open → Partially applied → Fully applied; a voided advance shows Open ✓ → Void.
3) Actions by state: Apply (primary, only for a Received Customer or Paid Provider advance with remaining > 0 and not Void) ·
   Print voucher (secondary) · ⋯ menu: Void (only when nothing has been applied; alert-dialog, destructive; explains that a
   reversing entry will be posted, with a JournalLinesTable preview of that reversal).
   Employee advances: instead of Apply, show a calm info alert: "Employee advances can't be applied to documents. Settle
   them with a journal entry (e.g. a payroll deduction)." with a link to /finance/journal-entries/new.
4) Main column:
   - Hero row: charcoal BalanceHeroCard "Remaining" with an applied % progress bar and "Applied X of Y"; beside it a details card
     (party with a link to /customers/:id, /third-party/:id or /drivers/:id; date; bank/cash account; advance account; memo;
     created at).
   - "Applications" card: table of date · document (invoice/bill ref — link to the invoice/bill list filtered by that ref, since
     those pages have no record page yet) · amount · journal entry (link to /finance/journal-entries/:id). Empty state with an
     Apply CTA when allowed.
5) Side column (SidePanelTabs): Journal (the advance's own JE plus each application JE, as JournalLinesTable blocks with links) ·
   Timeline (ActivityTimeline built from the data: created, each application, voided) · "Other advances with <party>"
   (getAdvances({ party_type, party_id }): ref, remaining, status; click → that record).
6) APPLY SHEET (the Zoho "Apply credits" pattern): right Sheet listing the party's open documents — customer: getInvoices({
   customer_id, status unpaid }) using Issued + PartiallyPaid; provider: getBills({ provider_id }) using Approved + PartiallyPaid.
   Check the status filters the list endpoints actually support. Columns: doc ref · date · due · balance due · "Amount to apply"
   input. At the top: "Available: X"; buttons "Auto-allocate (oldest first)" and "Clear". A live meter shows Applied / Remaining
   (orange if over). Rows can't exceed their balance due; the total can't exceed remaining. The footer shows a JournalLinesTable
   "Will post" preview (customer: Dr Customer Advances / Cr Accounts Receivable; provider: Dr Accounts Payable / Cr Provider
   Advances), a note that applications post on today's date (an Open period must cover today), and Apply. On Apply, call
   applyAdvance once per row with an amount > 0, in order, and show per-row success/failure. Afterwards refresh the advance,
   the list and the invoices/bills queries. Keep today's single-document apply working through this sheet.
7) PRINT VOUCHER: a print-friendly view (window.print with @media print CSS; no new library) — "Receipt Voucher" for money in /
   "Payment Voucher" for money out: company name + VAT (from settings), voucher no. = ref, date, party, amount in figures and in
   words (write a small en-US amountInWords helper in lib/finance with tests), bank/cash account, memo, signature lines.

PART D — CREATE PAGE (/finance/advances/new, new AdvanceEditorPage.tsx; reads ?type= and optional ?party_id=)
Two columns: a form on the left, a sticky right rail (~360px); a sticky footer bar.
1) "What kind of advance?" as 3 large radio cards (shadcn radio-group styled as cards, icon + title + one line):
   - Customer advance — "Money received from a customer before invoicing" (↓ Money in, sky) → party_type Customer, direction Received
   - Provider advance — "Money paid to a provider ahead of their bill" (↑ Money out, violet) → Provider, Paid
   - Employee advance — "Salary or trip advance paid to a driver" (↑ Money out, teal) → Employee, Paid
   This makes invalid combinations impossible (the engine only allows these three).
2) Party: a combobox (shadcn command) searching customers / providers / drivers depending on the type, showing initials avatars.
   After choosing a party, show a small hover-card/inline hint: customer → open invoices count + total due and existing unused
   advances; provider → open bills count + total due. Party is optional only if the current backend allows it (party_id is
   nullable); if you keep it optional, label the empty choice "General / not linked".
3) Amount: a large .fin-num input with a SAR prefix; Date: date-picker (defaults to today).
4) "Deposit to" (money in) / "Paid from" (money out): bank & cash accounts from getBankAccounts as radio cards (bank name, masked
   number, GL code, cash icon for is_cash). Keep whatever account the current modal used as the source of truth for accountId.
5) Memo / reference: textarea.
6) Right rail, live:
   - "Will post" JournalLinesTable preview: Received: Dr <bank> / Cr <default customer advance account>; Paid: Dr <default provider
     or employee advance account> / Cr <bank>. Resolve the default account names from settings + getAccounts.
   - Readiness checks (✓ / ✕ rows): an Open period covers the date (getAccountingPeriods); the default advance account for this
     type is set in Settings (else ✕ with a link to settings); a bank/cash account is chosen; the amount is > 0.
7) Sticky footer: Cancel · Save advance · (customer/provider only) Save & apply → navigates to the new record with the Apply sheet
   open. Save is disabled until the readiness checks pass. Warn about unsaved changes when leaving a dirty form.
   Errors from the API (e.g. NO_OPEN_PERIOD, SETTINGS_NOT_CONFIGURED) show inline in the rail, not only as a toast.

PART E — CLEAN-UP
Remove the old create/details/apply modals and the raw "Party ID" text input from AdvancesPage. Party is always picked,
never typed. Invalidate advances, invoices, bills, journal-entries and bank-accounts queries after mutations.

DON'T: change the schema, change advance business rules, add statuses, or invent features the API doesn't support (no refunds of
unused advances, no un-apply). If you think one of those is needed, list it in your reply for the owner.

VERIFY (running app with the local demo data from docs/finance-redesign/local-demo; light + dark; 1440 and 390px):
- the list shows 3 advances with party names (Gulf Cement Supply, Desert Hawk Transport, one driver/unknown employee), coloured
  type and direction chips, age chips; the summary strip shows customer 3,000.00 / provider 3,000.00 / employee 2,000.00
- the Gulf Cement advance record shows 2,000.00 applied to its invoice, remaining 3,000.00, and Journal/Timeline tabs filled
- Apply sheet: Auto-allocate spreads 3,000.00 across Gulf Cement's open invoices oldest first, never over a balance due; Apply posts
  and the invoice balances drop (needs an Open period covering today)
- create each of the 3 types from /finance/advances/new; the Will-post preview matches the JE that gets created
- Void works on an unapplied advance and is not offered on an applied one; Print voucher looks right in print preview
- the employee advance shows the settle-by-journal-entry note instead of Apply
- npm run build + vitest pass; backend npx tsc --noEmit + finance tests pass

FINISH: update PROGRESS.md (Finance UI revamp → row 12a) and commit as two commits:
"feat(finance-api): resolve advance party names and application documents" and
"feat(finance-ui): advances list, record page with apply-credits sheet, and create page".
Reply with what you built, which shadcn components you added, and anything you skipped or need the owner to decide.
```

## 12b — Bank & Cash Accounts: overview, account page, create/edit page

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 12b — rebuild Bank Accounts as:
overview (/finance/bank-accounts), account page (/finance/bank-accounts/:id), create/edit page
(/finance/bank-accounts/new and /:id/edit, replacing the create dialog), and a Transfer sheet (replacing the transfer dialog).

GOAL: a modern banking overview in the spirit of Odoo's bank-journal dashboard cards and Zoho Books Banking — colourful but
meaningful chips, lots of shadcn, and correct numbers.

PAGE SHELL — IMPORTANT: follow DESIGN.md §4.0a exactly. The title is already in the top bar: NO page title, subtitle or breadcrumbs
on any of these pages (no FinancePageHeader). Copy the structure and classes of pages/finance/AdvancesPage.tsx (toolbar row with
segmented category tabs + compact actions → compact SummaryStrip → content, with filters inside the table card header), shadcn Radix
Select for every dropdown.

READ FIRST (don't edit before you have):
- CLAUDE.md; docs/finance-redesign/DESIGN.md — §2, §3, §4.0, §4.0a and §4.5d (layout, colours, balance definition)
- pages/finance/BankAccountsPage.tsx in full (everything it does must survive: list, create, transfer, export)
- pages/finance/AdvancesPage.tsx, AdvanceDetailPage.tsx, AdvanceEditorPage.tsx — the reference for shell, record page and editor
- pages/finance/ReconciliationPage.tsx (how it picks a bank account, its query params, and how it uses opening_balance as the
  starting point) and pages/finance/JournalEntriesPage.tsx (SOURCE_CONFIG chips — reuse them; if they're page-local, move them
  into src/lib/finance and import them from both pages)
- components/finance/kit/*, src/lib/finance/*, components/ui/* (incl. chart.tsx = shadcn chart on recharts, toggle-group,
  hover-card, radio-group/switch/alert-dialog if they were added for Advances)
- Backend: routes/bankAccountRoutes.ts, controllers/bankAccountController.ts, utils/cashBankEngine.ts (transferFunds takes
  GL account ids: fromAccountId/toAccountId; needs an Open period covering the date; source_type 'BankTransfer'),
  controllers/financeReportsController.ts (getGeneralLedger, and how reports now count Posted + Voided entries),
  services/financeService.ts bank methods and DTOs.

PART A — BACKEND (read-only additions; no schema change)
A1) Enrich GET /api/bank-accounts (and GET /:id) with computed fields, using aggregate/groupBy queries rather than per-row loops:
    ledger_balance       = Σ(debit − credit) on the linked GL account, journal entries with status Posted or Voided
    book_balance         = opening_balance + ledger_balance
    month_in / month_out = Σ debit / Σ credit of those lines dated in the current calendar month (Settings.timezone)
    last_reconciled_at   = latest Completed reconciliation statement_date (or null); last_reconciled_balance
    unreconciled_count   = those lines with reconciled = false dated up to today
    balance_series       = weekly closing book_balance for the last 13 weeks ([{ date, balance }]) for the card sparkline
    (one $queryRaw with date_trunc is fine; keep it parameterised).
A2) GET /api/bank-accounts/:id/transactions?date_from&date_to&direction=in|out&reconciled=true|false&search&page&per_page →
    { opening_balance (book balance just before date_from), closing_balance, rows: [{ line_id, date, journal_entry { id, ref_id,
    source_type, source_id, memo, status }, description, money_in, money_out, running_balance, reconciled, reconciliation_id }],
    pagination }. Running balance must be correct across pages (compute from the range opening balance, ordered by entry_date,
    createdAt). Same auth as the router.
A3) GET /api/bank-accounts/:id/balance-history?days=30|90|365 → daily [{ date, balance, money_in, money_out }] for the chart.
A4) Shared types + financeService methods for all of the above; tests in the existing finance style (balance = opening + ledger;
    a voided entry and its reversal net to zero; running balance continuity across two pages; unreconciled count). Run
    npx tsc --noEmit + the finance tests.

PART B — OVERVIEW (/finance/bank-accounts)
1) Toolbar row: segmented tabs "All accounts · Bank · Cash" (icons Landmark / Wallet, count pills) · right: a Cards | Table
   toggle-group, "Transfer" (outline, ArrowLeftRight → Transfer sheet), "New account" (coral → /finance/bank-accounts/new).
2) Compact SummaryStrip: Total cash & bank (Σ book_balance of active accounts) · Money in this month · Money out this month ·
   Needs reconciliation (accounts whose last_reconciled_at is before the last month end, or never).
3) Cards grid (default; 3 columns desktop / 1 on mobile). Each card (rounded-2xl, white, light border, hover lift via shadow-sm):
   - top: initials tile on the bank's stable tint (hash of bank name; emerald Wallet tile for cash) · bank name · masked number
     (****4417) · GL code micro-chip · "Cash" chip for is_cash
   - book balance as the hero figure (.fin-num), with an info hover-card if opening_balance ≠ 0 explaining it isn't in the ledger
   - a 90-day sparkline (shadcn chart, no axes) from balance_series in the bank's tint
   - "↓ In 12,450.00 · ↑ Out 8,200.00 this month" (emerald / orange)
   - reconciliation chip (emerald "Reconciled to 31 Aug" / amber older / slate "Never reconciled") + "N unreconciled" link
   - footer: Open · Reconcile (/finance/reconciliation?bankAccountId=… — use whatever param the page reads) · ⋯ DropdownMenu
     (Edit, Transfer from this account, Deactivate/Activate via updateBankAccount isActive with an AlertDialog)
   Card click → account page. A "Show inactive" switch in the toolbar; inactive cards are muted with an "Inactive" chip.
4) Table view: DataTable with the same fields (bank, number, GL, type chip, book balance, in/out this month, reconciliation chip,
   status) and the search inside the table card header. Export keeps the existing ExportModal (add book balance and last reconciled).
5) Empty state: FinanceEmptyState "Add your first bank or cash account" + New account.

PART C — ACCOUNT PAGE (/finance/bank-accounts/:id, new BankAccountDetailPage.tsx, lazy route after /new)
1) Toolbar row: small segmented tabs "Transactions · Reconciliations · Details" (they switch the main content) · right actions:
   Transfer (outline) · Reconcile (outline) · Edit (outline) · ⋯ (Deactivate/Activate).
2) Identity hero (charcoal card): initials tile, bank name + masked number, IBAN with a copy-to-clipboard button (toast),
   SWIFT, currency chip, "GL 1010 · Al Rajhi Bank - Current" (link to /finance/general-ledger?account_id=…), book balance as the
   hero figure "as of today", reconciliation chip, and — if opening_balance ≠ 0 — the "not in ledger" note.
3) Balance chart card: a 30 / 90 / 365 toggle-group, an area line of the balance, plus money-in/money-out bars (shadcn chart +
   tooltip), from balance-history.
4) Transactions tab: DataTable from /transactions with the filters in the card header (date range, In/Out select, Reconciled select,
   search). Columns: date · JE ref (.fin-num, link to /finance/journal-entries/:id) · source chip (SOURCE_CONFIG) · memo/description ·
   money in (emerald) · money out (orange) · running balance · a reconciled ✓ icon with a tooltip. An opening-balance row at the top and a
   closing-balance row at the bottom of the range. Server-side pagination.
5) Reconciliations tab: history of statements (date, closing balance, lines count, reconciled by/at, status pill); "Start reconciliation"
   → reconciliation page for this account.
6) Details tab: every field (bank, number, IBAN, SWIFT, currency, is_cash, opening balance + date, created/updated) + the Edit button.
7) Loading, 404 and error states.

PART D — CREATE / EDIT PAGE (/finance/bank-accounts/new, /finance/bank-accounts/:id/edit — new BankAccountEditorPage.tsx)
Same editor layout as AdvanceEditorPage: form on the left, sticky right rail, sticky footer (Cancel · Save).
1) "Account type" radio cards: Bank account (Landmark) / Cash account (Wallet) → is_cash.
2) Bank name: input with suggestions (a small static list: Al Rajhi Bank, Saudi National Bank, Riyad Bank, SAB, Alinma Bank,
   Banque Saudi Fransi, Arab National Bank, Bank Albilad, Bank AlJazira); hidden for cash accounts.
3) Account number; IBAN — format as you type in groups of 4, validate the Saudi format (SA + 22 digits) and the ISO 13616 mod-97 checksum
   (helper in src/lib/finance with tests; show a ✓ or an error); SWIFT (8 or 11 characters, uppercase).
4) Currency: shadcn Select, defaulting to the settings base currency.
5) Linked GL account: combobox of postable Asset accounts that aren't already linked to a bank account ("code · name"); a "Create GL
   account" link to /finance/chart-of-accounts. When editing: read-only (the update API can't change it) with a note explaining why.
6) Opening balance + opening date, with a warning note: the opening balance is used for reconciliation and cash flow but isn't
   posted to the ledger, so the Balance Sheet won't include it unless a journal entry records it.
7) Right rail: a LIVE CARD PREVIEW (the same card as on the overview, updating as you type: tint, initials, masked number, balance =
   opening balance) and readiness checks (GL account chosen, IBAN valid if entered).
8) API errors (e.g. "A BankAccount is already linked to this GL account") show inline. After saving, go to the account page.

PART E — TRANSFER SHEET (shared by the overview and the account page; replaces the transfer dialog)
From / To as radio cards of active accounts (initials, name, masked number, book balance; the same account can't be both; a swap
button), amount (large .fin-num with a currency prefix; a warning — not a blocker — if it's more than the From book balance), date
(date-picker; readiness check that an Open period covers it), memo; a "Will post" JournalLinesTable preview (Dr To account / Cr From
account); Submit calls transferFunds with the GL account ids. Success toast with a link to the created JE; refresh the accounts,
balances and transactions queries.

DON'T: change the schema or any posting rule, post opening balances, add statuses, or show a title/breadcrumb block. If you think the
opening balance should be posted to the ledger, say so in your reply; that's the owner's decision.

VERIFY (running app with the local demo data from docs/finance-redesign/local-demo; light + dark; 1440 and 390px):
- the overview shows Al Rajhi 166,650.00, SNB 42,440.00 and Petty Cash 6,000.00 (total 215,090.00); Al Rajhi "Reconciled to 31 Jul"
  in amber; SNB and Petty Cash "Never reconciled"; the tabs filter Bank vs Cash; the cards/table toggle works
- the Al Rajhi account page: the transactions running balance ends at 166,650.00 and matches the General Ledger for GL 1010; the
  July lines show ✓ reconciled; the chart shows the June opening jump and later movements
- transfer 1,000.00 Al Rajhi → Petty Cash: the preview matches the JE that gets created; both balances update
- create a cash account and a bank account (IBAN validation catches a mistyped digit); edit one; deactivate/activate
- npm run build + vitest pass; backend npx tsc --noEmit + finance tests pass

FINISH: update PROGRESS.md (Finance UI revamp → row 12b) and commit as two commits:
"feat(finance-api): bank account balances, transactions and balance history" and
"feat(finance-ui): bank accounts overview cards, account page, editor and transfer sheet".
Reply with what you built, which shadcn components you added, and anything you skipped or need the owner to decide.
```

## 12 — Banking

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 12 — BankAccountsPage, ReconciliationPage, AdvancesPage.

Read first: DESIGN.md §4.5; all three pages in full; financeService bank/advance/reconciliation methods and types
(BankAccount, Advance, BankReconciliation). Note commit 2951394b (opening-balance carry-forward in reconciliation) — don't break it.

Do:
- Bank Accounts: header actions Transfer funds (right Sheet, same DTO) + New bank account (Sheet); a responsive grid of account cards
  (rounded-[20px]; bank name, masked account number, linked GL code, current balance hero figure in .fin-num,
  "Last reconciled <date>" if available, and a card ⋯ menu: Edit, Reconcile → /finance/reconciliation?bankAccountId=…, View ledger).
- Reconciliation: header with a bank account select + statement date/closing balance; a two-pane layout (statement vs book
  transactions) using the list row style with checkboxes; a sticky footer with Statement balance · Cleared balance · Difference
  (a pill that's green at 0.00, orange otherwise); Complete is disabled until the difference is 0.00; past reconciliations appear in a side card.
  Keep the current matching logic; only restructure the UI.
- Advances: list pattern with tabs Open / Partially applied / Fully applied / Void (+ All), party type + direction chips,
  columns Number · Party · Direction · Amount · Remaining · Status; New advance and Apply advance as Sheets with a JE preview where the
  entries are known; Void via ConfirmModal.

Acceptance: a transfer, a full reconciliation to zero difference, and create → apply → void an advance all behave the same as before.
Commit: "feat(finance-ui): redesign bank accounts, reconciliation and advances"
```

## 13 — Statements

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 13 — P&L, Balance Sheet, Trial Balance, Cash Flow on ReportShell.

Read first: DESIGN.md §4.4; mockup board "Report — Profit & Loss"; the four pages in full; the response types ProfitAndLossData,
BalanceSheetData, TrialBalanceData, CashFlowData; the existing export code on these pages (commit 252115df).

Do (per page: write a small mapper from the API response → ReportTable sections; don't change the API):
- Profit & Loss: PeriodPicker; compare = a second getProfitAndLoss call with previousPeriod(); tiles Income · Expenses ·
  Net profit (hero) · Net margin (pts delta); sections Income / Cost of services / Operating expenses (use whatever grouping the
  API really returns), Gross profit subtotal only if it can be derived correctly; grand total Net profit.
- Balance Sheet: mode "asOf"; compare = the same as-of date one period earlier (previous month-end by default); tiles Total assets ·
  Total liabilities · Equity · "Balanced ✓" / "Out of balance by X" check tile.
- Trial Balance: period select (the existing period_id); columns Debit / Credit (+ compare adds the previous period's net);
  a totals row with a balanced check.
- Cash Flow: PeriodPicker; sections Operating / Investing / Financing; tiles Opening cash · Net change · Closing cash.
- On every report: account rows link to /finance/general-ledger?account_id=…&date_from=…&date_to=… ; Export keeps the existing
  xlsx/csv output (add the previous-period columns when comparing); Print uses the .fin-report print styles; the period and compare
  state live in the URL query string.

Acceptance: the figures are the same as the old pages for the same period (check at least one period against the Trial Balance);
compare columns and variance colours are correct; print preview is clean.
Commit: "feat(finance-ui): statements on shared report shell with period compare"
```

## 14a — AP Ageing: payables workspace

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 14a — turn
frontend/web-dashboard/src/pages/finance/APAgeingPage.tsx into a payables workspace: ageing that users find genuinely useful
(who do we owe, how late, can we afford what's due, what should we pay this week?) — not just a prettier table.

LOOK & FEEL: modern finance software with colour and life, where every colour means something. Follow the page shell in
DESIGN.md §4.0a exactly (NO page title/subtitle/breadcrumbs — the top bar shows the title; copy the toolbar-row structure and
classes of pages/finance/AdvancesPage.tsx and BankAccountsPage.tsx). Use shadcn components as much as possible (Select,
DropdownMenu, Popover + Calendar, HoverCard, Tooltip, Sheet, Checkbox, ToggleGroup, Progress, Chart, AlertDialog, Skeleton).

READ FIRST (don't edit before you have):
- CLAUDE.md; docs/finance-redesign/DESIGN.md — §2, §3, §4.0a, §4.4 (reports) and §4.5e (this page: views, bucket colour scale, smart pieces)
- APAgeingPage.tsx and ARAgeingPage.tsx (current behaviour), AdvancesPage.tsx and BankAccountsPage.tsx (reference shell and style)
- backend/api-server/src/controllers/ageingReportsController.ts and routes/financeReportsRoutes.ts
- services/financeService.ts: getAPAgeing / getARAgeing and the AgeingRow / AgeingReportData types, getBills({ provider_id, status }),
  recordBillPayment(id, RecordBillPaymentDTO { amount, payment_date, accountId, payment_method, reference }), getBankAccounts
  (now returns book_balance), getAdvances({ party_type: 'Provider', party_id }), getAccountingPeriods
- utils/billEngine.ts (payment rules), components/finance/kit/*, src/lib/finance/*

KNOWN BUGS TO FIX (verify each first):
- The frontend sends `as_of`, but the backend reads `as_of_date`, so the as-of date picker has never worked (AR ageing too).
- The frontend expects `grand_total`, but the backend returns `summary`, so the grand-total row never renders (AR ageing too).
- "As of" isn't historical: it uses today's balance_due and ignores bill dates, so a past date still shows today's payables.

PART A — BACKEND (no schema change; keep the AR endpoint working and compatible)
A1) Params: accept `as_of` (keep `as_of_date` as an alias). Put the ageing logic in one shared helper used by AR and AP.
A2) Historical correctness for a past as_of. Treat as_of as the END of that day in Settings.timezone (23:59:59.999), not midnight
    UTC, so documents dated that day are included. Include bills with bill_date ≤ as_of and status Approved / PartiallyPaid / Paid
    (not Draft or Void). Balance as of that date = total_amount − BillPayments with payment_date ≤ as_of − AdvanceApplications
    with applied_date ≤ as_of. Skip anything ≤ 0. Apply the same rule to AR (invoices, InvoicePayments, AdvanceApplications).
    Document the limitation in a comment: a bill voided after as_of is excluded (no void date is stored).
A3) `basis=due|bill` (default due): age by due_date (falling back to bill_date) or by bill_date.
A4) `include_bills=true` → each row also gets bills: [{ id, ref_id, bill_date, due_date, days_overdue, balance, bucket }]
    (oldest first), and party: { type: 'provider' | 'payee', id, name, phone, email } (provider contact from ThirdPartyProvider).
A5) Response: keep `summary` and add `grand_total` in AgeingRow shape plus `as_of`, `basis` and `bucket_counts` (bills per bucket).
    Update the shared/frontend types so they match what the API really returns.
A6) Tests (existing finance test style): as_of param honoured; a bill dated after as_of is excluded; a payment dated after as_of is
    not subtracted; basis=bill vs due puts a bill in different buckets; include_bills lists bills oldest first; the AR endpoint
    still returns the same shape. Run npx tsc --noEmit + the finance tests.

PART B — THE PAGE
1) Toolbar row: segmented tabs "By vendor · By bill · Payment schedule" (icons Users / FileText / CalendarClock, count pills) ·
   right: as-of control (Popover + Calendar, with presets Today / End of last month / End of last quarter), "Ageing by" ToggleGroup
   (Due date | Bill date), Export (ExportModal: vendor rows with buckets, or bill rows in the By-bill view), Print, and a coral
   "Pay bills" button (opens the Pay run sheet with nothing preselected). All state (view, as_of, basis, filters) lives in the URL.
2) Bucket tiles (replaces a KPI strip; one compact row of 5 tiles + a total): Current / 1–30 / 31–60 / 61–90 / 90+ in the bucket colour
   scale (DESIGN.md §4.5e) — amount, % of total, bill count, and a thin bar showing the share. Clicking a tile filters the current view
   to that bucket (toggle; the active tile gets a ring). A charcoal "Total payables" tile at the end.
3) Cash coverage strip (one slim card): Σ book_balance of active bank + cash accounts vs amounts due in the next 7 and 30 days
   (from the bills' due dates) → a two-segment Progress + text "215,090.00 available · 64,325.00 due in 30 days · Covered ✓"
   (emerald) or "Short by X" (orange), plus the overdue total in orange. Link: "View bank accounts".
4) Insights row (up to 4 small cards; only render the ones that apply, each with an icon, one sentence and an action):
   - Oldest overdue: "<vendor> — BIL-0003 is 14 days overdue (4,600.00)" → Pay
   - Due this week: "<n> bills · <amount> due by <date>" → Select them in the Pay run
   - Advance available: for vendors with open/partially applied Provider advances (getAdvances), "Desert Hawk Transport has 3,000.00
     in advances you can apply" → /finance/advances/:id (with the Apply sheet open if that page supports it)
   - Change vs 30 days ago: fetch the ageing again at as_of − 30 and show "Payables ↑ 12% (+7,000.00)" with a tone (up = orange)
5) BY VENDOR view: a DataTable card with search + "Overdue only" switch + sort Select inside the card header. Columns: vendor (initials
   avatar tinted by a stable hash + name + a "payee" chip for non-provider payees; HoverCard with phone/email and links to the provider
   page, their bills and their advances) · Current · 1–30 · 31–60 · 61–90 · 90+ (heat-tinted cells per §4.5e, "—" for zero) · Total ·
   a mini stacked bar of the buckets · "vs 30d" change chip. Rows expand in place (chevron; several can be open) to show that vendor's
   bills: ref (.fin-num) · bill date · due date · days-overdue chip (bucket colour) · balance · a Pay button (opens the Pay run sheet with
   that bill preselected). Clicking a bucket cell filters the expanded bills to that bucket. Grand-total row in charcoal at the bottom.
6) BY BILL view: a flat DataTable of every open bill (checkbox · ref · vendor · bill date · due date · days-overdue chip · bucket chip ·
   balance), sortable, with the bucket-tile filter and search; a bulk bar when rows are selected: "N selected · 12,345.00 · Pay selected"
   plus "Select all overdue".
7) PAYMENT SCHEDULE view: a forward-looking timeline of what's due — "Overdue", then each of the next 6 weeks (Week of 28 Sep, …), then
   "Later" — as a bar chart (shadcn chart; overdue bar orange, future bars coloured by week) with the running cash-after-payments line
   (starting from the bank + cash total). Under it, collapsible week groups listing the bills due in each week, with checkboxes and Pay.
8) PAY RUN SHEET (Zoho "pay bills in bulk" / Odoo batch payment; right Sheet, wide):
   - the selected bills (removable), each with an editable "Amount to pay" defaulting to the full balance (can't exceed it)
   - quick-select buttons: All overdue · Due in 7 days · Clear
   - "Pay from": bank/cash accounts as radio cards with their book balance; payment date (default today; readiness check that an Open
     period covers it); method (Select: Bank transfer / Cheque / Cash); reference prefix
   - a live summary: total to pay, the bank balance before → after (orange if it goes negative), and the number of bills
   - "Will post" preview: one JournalLinesTable block per bill (Dr Accounts Payable / Cr <bank>), collapsed after the first 2
   - Confirm → AlertDialog → call recordBillPayment once per bill, in order, with progress and a per-row ✓ / ✕ + the error message;
     at the end, a result summary with links to the created JEs. Then refresh ageing, bills, bank accounts and journal entries.
9) Print: a clean @media print layout of the By-vendor table (bucket totals, as-of date, basis, company name from settings).
10) Empty state: FinanceEmptyState "No open payables as of <date>" (no emoji anywhere on the page).
    Loading: skeleton tiles and rows. Error: the kit's error state with Retry.
11) Update ARAgeingPage.tsx only as far as needed to keep it working with the fixed API (param name + summary/grand_total). Its full
    redesign is a separate prompt.

DON'T: change the schema, change payment rules, add statuses, or invent data (no fake "vendor rating", no AI text).

VERIFY (running app with the local demo data from docs/finance-redesign/local-demo; light + dark; 1440 and 390px):
- as of today: tiles show 1–30: 16,600.00 (Desert Hawk 4,600.00 + Falcon Auto 12,000.00), Current: 47,725.00 (Sahara Fuel),
  total 64,325.00, which matches the AP control check in the demo script
- as_of 31 Aug 2026: everything is Current, 64,325.00 in total (nothing was overdue yet; Sahara Fuel's bill dated 31 Aug is included)
- as_of 31 Jul 2026: only Sahara Fuel's July bill, 43,700.00 Current (it was paid on 25 Aug, after that date); the insurance bill paid on
  20 Jul doesn't appear
- Ageing by bill date moves bills between buckets
- the insights show Desert Hawk's 3,000.00 advance and "1 bill · 47,725.00 due by 30 Sep"; coverage shows covered against the bank + cash
  total from the bank accounts page
- expand a vendor → its bills; Pay run: select all overdue → pay from Al Rajhi → the bank balance after is right → payments post, the
  ageing and bank balances update, and the JEs exist
- the AR ageing page still loads and its as-of date now works
- npm run build + vitest pass; backend npx tsc --noEmit + finance tests pass

FINISH: update PROGRESS.md (Finance UI revamp → row 14a) and commit as two commits:
"fix(finance-api): historical as-of ageing, param/response fixes, bill detail and basis" and
"feat(finance-ui): AP ageing payables workspace with coverage, insights and pay run".
Reply with what you built, which shadcn components you added, and anything you skipped or need the owner to decide.
```

## 14 — Ageing + General Ledger

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 14 — ARAgeingPage, APAgeingPage, GeneralLedgerPage.

Read first: DESIGN.md §4.4 (ageing notes); the three pages in full; AgeingReportData and GeneralLedgerData types.

Do:
- Ageing (AR and AP share one component with a `kind` prop): ReportShell in asOf mode; 5 tiles for the buckets (Current, 1–30, 31–60,
  61–90, 90+) with amounts and % of total, with tone increasing from neutral to orange; the table has Party · the bucket columns · Total, plus
  a thin stacked bucket bar under each party name; clicking a party goes to the invoices/bills list filtered by that party with the
  Unpaid tab (or Overdue for the past-due buckets); grand-total row in charcoal; export and print.
- General Ledger: ReportShell with PeriodPicker + an account select (searchable, shows code + name), which reads/writes the
  account_id/date_from/date_to URL params so drill-downs from the reports land correctly; an opening balance row, transaction rows
  (Date · JE number linking to the JE record page · Source link · Memo · Debit · Credit · Running balance), and a closing balance row;
  export and print.

Acceptance: the bucket totals match the old pages; a P&L drill-down opens the GL with the right account and period.
Commit: "feat(finance-ui): redesign ageing reports and general ledger"
```

## 15 — Final QA, docs, cleanup

```
Follow the Ground rules in docs/finance-redesign/PROMPTS.md. Task: Prompt 15 — Finance UI revamp hardening.

Do:
1. Go through every /finance page at 1440px, 1024px and 390px, in light and dark mode. Fix any overflow, clipped text, wrong radii/borders,
   leftover slate-200 borders, leftover KpiCard usage, raw <table> markup outside the kit, window.confirm/alert calls, and duplicated
   formatMoney helpers (grep for all of these). List what you fixed.
2. Accessibility: keyboard-only pass (tab order, visible focus rings, Esc closes sheets, aria-labels on icon buttons,
   aria-expanded/selected on groups and tabs). Contrast of labels ≥ 4.5:1.
3. Performance: each page makes only the queries it needs; summary queries have staleTime 30s; no N+1 fetches in lists.
4. Remove the /finance/_kit route from production builds (keep it DEV-only) and delete any dead code the old dialogs left behind.
5. Docs: add a "Finance pages" section to frontend/web-dashboard/UI_GUIDELINES.md that points to docs/finance-redesign/DESIGN.md and
   the kit; update DESIGN.md wherever the implementation legitimately differs from it; update PROGRESS.md (Finance UI revamp → ✅,
   with verification notes).
6. Run the full web build, vitest, backend tsc and the finance backend tests; paste the results in your final message.

Commit: "chore(finance-ui): QA pass, accessibility fixes and docs"
Then stop and give the owner a summary: what changed, how to test it, and anything you deferred. Don't push.
```

---

## Phase 2 (features) — not yet

After the UI revamp is merged, pick items from DESIGN.md §9 **with the owner**. Items that need schema
changes need a separate owner-approved plan first (production runs `prisma db push --accept-data-loss` on deploy).
Prompts for those will be written per feature once they're approved.
