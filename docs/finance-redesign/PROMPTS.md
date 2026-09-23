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
| 12 | Banking (accounts, reconciliation, advances) | Banking | – |
| 13 | Statements (P&L, Balance Sheet, Trial Balance, Cash Flow) | Reports | – |
| 14 | Ageing reports + General Ledger | Reports | – |
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
