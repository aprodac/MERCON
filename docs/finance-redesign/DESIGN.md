# MERCON Finance — Design Spec (v1)

> Source of truth for the Finance module UI/UX redesign.
> Visual reference (interactive mockup, sample data): https://claude.ai/artifact/GvqbVUT7nqwYw3rXenZ8CZ
> Branch: `feature/finance-ui-revamp` (cut from `ilan`).
> Pattern references: Odoo Accounting (record views, status bar, chatter), Zoho Books (list tabs + counts, payment summary, report toolbar).

This spec **extends** `frontend/web-dashboard/UI_GUIDELINES.md`. Where the two differ, this file wins for
`/finance/*` pages only. Same brand, same colours: the goal is "the current app, but more polished",
not a different product.

---

## 0. Scope

Pages in scope (all under `frontend/web-dashboard/src/pages/finance/`):

| Area | Pages |
|---|---|
| Sales | `InvoicesPage`, `InvoiceCreatePage`, **new** `InvoiceDetailPage`, `ARAgeingPage` |
| Purchases | `BillsPage`, `BillCreatePage`, **new** `BillDetailPage`, `APAgeingPage` |
| Banking | `BankAccountsPage`, `ReconciliationPage`, `AdvancesPage` |
| Accounting | `JournalEntriesPage`, `GeneralLedgerPage`, `ChartOfAccountsPage`, `AccountingPeriodsPage` |
| Reports | `ProfitAndLossPage`, `BalanceSheetPage`, `TrialBalancePage`, `CashFlowPage` |
| Shell | Finance group in `components/layout/Sidebar.tsx` |

Out of scope for v1: Quotations, Expenses, Vehicle P&L pages (they only move in the sidebar grouping),
the mobile app, and any Prisma schema change.

---

## 1. Principles

1. **Same brand, more craft.** Coral `#FA634E` for primary actions and "you are here". Charcoal `#3E3C3D` for hero/total surfaces. Canvas `#EEF1F6`.
2. **Documents are pages, not popups.** An invoice, bill or journal entry opens a full record page with a status bar, the document itself, and a side panel (payments / journal / activity). Modals are only for short confirmations.
3. **Numbers are first-class.** Every amount is right-aligned, tabular, monospaced, 2 decimals, with the currency shown once per context (column header, total or hero), not on every cell.
4. **Always show the accounting consequence.** Any action that posts to the GL (issue, approve, pay, void) shows a "Will post" preview of the Dr/Cr lines before the user confirms.
5. **Status is visible and consistent.** One pill component and one colour map for every finance status (section 5).
6. **Filters are tabs + chips.** Status becomes tabs with counts; everything else is a chip in the filter bar.
7. **Reports share one shell.** Same toolbar, same grouped table, same export/print everywhere.
8. **No `window.confirm()`, no `alert()`.** Use `ConfirmModal` / the payment `Sheet`.

---

## 2. Design tokens

Use the existing CSS variables in `src/index.css` where they exist. Finance-specific values below;
implement them as Tailwind arbitrary values or add them to `:root` under a `/* Finance */` block.

### 2.1 Colour

| Token | Light | Dark (`.dark`) | Use |
|---|---|---|---|
| `canvas` | `#EEF1F6` | `slate-950` | Page background |
| `surface` | `#FFFFFF` | `slate-900` | Cards |
| `surface-sunken` | `#F7F8FA` | `slate-900/50` | Inset blocks (doc meta, "Will post", subtotal rows) |
| `surface-header` | `#FAFAFB` | `slate-800/40` | Table header, group rows |
| `row-hover` | `#FAFAFB` | `slate-800/40` | Table row hover |
| `row-selected` | `#FFF8F6` | `rgba(250,99,78,.08)` | Selected row |
| `border` | `rgba(0,0,0,.06)` | `slate-800` | Card borders, dividers |
| `border-strong` | `rgba(0,0,0,.08)` | `slate-700` | Inputs, secondary buttons |
| `text` | `#111111` | `slate-100` | Titles, figures |
| `text-2` | `#6E6E80` | `slate-400` | Subtitles, secondary cells |
| `text-3` | `#757583` | `slate-500` | Labels, table headers (**replaces `#9898A4` in finance — contrast**) |
| `brand` | `#FA634E` | same | Primary button, active tab underline, active nav |
| `brand-hover` | `#EE553F` | same | |
| `brand-tint` | `#FFF4F2` | `rgba(250,99,78,.10)` | Current step, balance-due row, bulk bar |
| `charcoal` | `#3E3C3D` | `#2D2B2C` | Hero cards, net-profit row, completed step dot |
| `positive` | `#15803D` on `#ECFDF3` | `emerald-400` on `emerald-950/40` | Paid, collected, favourable variance |
| `negative` | `#C2410C` on `#FEF1EE` | `orange-400` on `orange-950/40` | Overdue, unfavourable variance |
| `info` | `#1D4ED8` on `#EEF3FF` | `blue-300` on `blue-950/40` | Issued/Approved, links to trips |
| `warning` | `#B45309` on `#FFF6E5` | `amber-300` on `amber-950/40` | Partially paid/applied |
| `neutral` | `#4B4B57` on `#F1F2F5` | `slate-300` on `slate-800` | Draft |
| `muted` | `#6E6E80` on `#F4F4F6` | `slate-400` on `slate-800/60` | Void / Voided |

### 2.2 Shape

| Element | Radius | Border | Shadow |
|---|---|---|---|
| Page cards (list, report, document, side panels) | `rounded-[20px]` | `1px border` token | `0 1px 2px rgba(16,24,40,.04)` |
| Toolbar card / status bar | `rounded-2xl` (16px) | `1px border` | none |
| Buttons, inputs, selects, filter chips | `rounded-xl` (12px) / chips `rounded-[10px]` | `border-strong` | primary only: `0 1px 2px rgba(250,99,78,.25)` |
| Segmented control track | `rounded-xl`, inner buttons `rounded-[9px]` | none, track `#F1F2F5` | active segment `0 1px 2px rgba(16,24,40,.08)` |
| Pills / count badges | `rounded-full` | none | none |
| Side sheet (drawer) | `rounded-l-[24px]` | none | `-12px 0 40px rgba(0,0,0,.12)` |

Never `border-slate-200`, `border-gray-300`, `shadow-lg` on cards, or sharp corners.

### 2.3 Typography

Font stays `var(--font-sans)` (Plus Jakarta Sans). Figures use **Geist Mono** (already loaded in `index.html`).

| Role | Class |
|---|---|
| Page title | `text-[26px] font-extrabold tracking-[-0.01em]` |
| Record title (doc number) | `text-2xl font-semibold fin-num` |
| Section / card title | `text-[15px] font-bold` |
| Label / table header | `text-[10px] font-bold uppercase tracking-[0.1em] text-[#757583]` |
| Body / cells | `text-[13px]` |
| Meta / sub-line in cells | `text-[11.5px] text-[#757583]` |
| Hero figure | `text-[28px]–[30px] font-semibold fin-num tracking-[-0.02em]` |
| KPI figure | `text-xl font-semibold fin-num` |

Add once to `index.css`:

```css
.fin-num { font-family: 'Geist Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
```

### 2.4 Spacing & layout

- Page content: `px-7 pt-5 pb-6`, vertical rhythm `gap-4` / `gap-[18px]`.
- Card padding: `p-5`/`p-6`; list rows `h-14` (56px); report rows `h-10`; group rows `h-11`.
- Table side padding `px-[22px]`.
- Record page: document column `flex-1`, side panel fixed `w-[360px]`, `gap-[18px]`.
- Max content width: none (full width) — ERPs use the whole screen; tables need it.
- Responsive: under `lg` the record page stacks (side panel below the document); lists use `DataTable`'s existing mobile card mode (`mobilePriority`).

### 2.5 Iconography & motion

- `lucide-react` only. 14px in buttons, 16px in nav, 16px inside 36px icon tiles.
- `transition-colors duration-150` on everything interactive. No scale-on-hover in tables.
- Chevrons rotate `-90deg` when a group is collapsed.
- Keep `animate-fade-in` on the page wrapper.

---

## 3. Components (the Finance UI kit)

Location: `frontend/web-dashboard/src/components/finance/kit/` with an `index.ts` barrel.
Helpers: `frontend/web-dashboard/src/lib/finance/`.
Build on existing primitives — **do not re-implement** `Btn`, `DataTable`, `ConfirmModal`, `sheet`,
`tabs`, `toggle-group`, `tooltip`, `popover`, `skeleton`, `select`, `ExportModal`, `date-range-picker`.

### 3.1 Helpers (`lib/finance/`)

| File | Exports |
|---|---|
| `format.ts` | `formatMoney(n, {sign?, currency?})` → `12,650.00` / `SAR 12,650.00` / `+1,200.00` / `−1,200.00` (U+2212); `formatDate(d)` → `15 Sep 2026`; `formatPct(n, digits=1)`; `dueLabel(due_date, status, balance)` → `Due in 22 days` / `Due today` / `Overdue 4 days` / `Paid 12 Sep` / `—` |
| `status.ts` | `FIN_STATUS` map (section 5) and `getDisplayStatus(doc)` which returns `Overdue` for Issued/Approved/PartiallyPaid docs with `due_date < today` and balance > 0 |
| `variance.ts` | `varianceTone(delta, isCost)` → `positive` / `negative` / `flat` (cost going down is positive) |

### 3.2 Components

| Component | Purpose | Key props |
|---|---|---|
| `FinancePageHeader` | Breadcrumb + title + subtitle + right-side actions | `crumbs: {label, to?}[]`, `title`, `subtitle?`, `actions?` |
| `MoneyText` | Formatted amount | `value`, `currency?`, `tone?: 'default'|'positive'|'negative'|'muted'`, `size?`, `signed?` |
| `StatusPill` | Dot + label pill for any finance status | `status`, `kind: 'invoice'|'bill'|'journal'|'period'|'advance'|'reconciliation'`, `size?` |
| `SummaryStrip` | One card split into 3–4 metric cells with dividers; first cell may be wide with a stacked bar | `items: {label, value, sub?, tone?, bar?: {segments}}[]` |
| `StatusTabs` | Underline tabs with count badges | `tabs: {key, label, count?}[]`, `value`, `onChange` |
| `FilterBar` + `FilterChip` | Search field + chips (`Label: Value ▾`) + "Add filter" + right slot | chips open a `popover` |
| `DocStatusBar` | Odoo-style stepper for a document's lifecycle | `steps: {key, label, at?}[]`, `current`, `voided?` |
| `RecordLayout` | Record page frame: header row, status bar, main + side columns, pager | `header`, `statusBar`, `main`, `side`, `pager?: {index,total,prevTo,nextTo}` |
| `BalanceHeroCard` | Charcoal card: label, big amount, progress bar, footnote | `label`, `amount`, `progress?`, `left?`, `right?` |
| `SidePanelTabs` | Segmented tabs inside the side card | `tabs`, `value`, `onChange`, children |
| `JournalLinesTable` | Dr/Cr lines (compact) — used for "Journal" tab and "Will post" previews | `lines: {account, debit?, credit?}[]`, `title?`, `variant: 'posted'|'preview'` |
| `ActivityTimeline` | Vertical timeline | `items: {title, meta, tone}[]` |
| `DocumentPaper` | The printable-looking document body (company, bill-to, meta grid, lines, totals) | composition slots |
| `LineItemsGrid` | Editable line table for create pages (add row, remove row, inline inputs, keyboard Enter = new row) | `rows`, `columns`, `onChange` |
| `TotalsBlock` | Subtotal / VAT / Total / Paid / Balance due | `rows`, `emphasis` |
| `RecordPaymentSheet` | Right-side `Sheet` for invoice/bill payments with "Pay in full" + "Will post" preview | `doc`, `kind: 'invoice'|'bill'`, `onDone` |
| `ReportShell` | Header + toolbar + tiles slot + table slot for every report | `title`, `crumbs`, `basisLabel?`, `period`, `onPeriodChange`, `compare`, `onCompareChange`, `onExport`, `onPrint`, `expandAll?` |
| `PeriodPicker` | Segmented Month / Quarter / Year / Custom + date-range display | `value: {preset, from, to}`, `onChange` |
| `ReportTable` | Grouped, collapsible statement table with optional comparison columns and sub-total rows | `sections: {key, name, rows, subtotal?, isCost?}[]`, `compare`, `grandTotal`, `onRowClick?` |
| `FinanceEmptyState` | Icon tile + title + text + optional CTA | |

Rules:
- Every component supports `className` and dark mode.
- No data fetching inside kit components (pages own queries).
- Each component gets a small unit test where logic exists (`format.ts`, `status.ts`, `variance.ts`, `ReportTable` totals).

---

## 4. Page patterns

### 4.0 Same building blocks, different pages

Every finance page uses the **same building blocks**: header, borders, radii, pills, number formatting,
buttons, sheets. That's what makes the module feel like one product. The **layout of each page follows
what the page is for**, so pages don't all look alike. A KPI strip goes only where the user needs a
money figure before they can act.

| Page | Its job | Layout | KPI strip? |
|---|---|---|---|
| Invoices / Bills | Collect / pay money | List + summary strip + status tabs | **Yes**: outstanding, overdue, collected |
| Journal Entries | Record and audit postings | **Daybook**: entries grouped by date, expand in place to see Dr/Cr | **No**: only a "drafts waiting" notice when there are any |
| Advances | Track money held on account | List + tabs | Small: open balance only |
| Bank Accounts | See where the cash is | **Card grid** (one card per account) | No: the cards *are* the figures |
| Reconciliation | Match statement to books | **Two panes** + sticky difference bar | No |
| Chart of Accounts | Maintain structure | **Tree** grouped by account type | No |
| Accounting Periods | Control what's open | **Timeline** by fiscal year | No |
| Statements (P&L, BS, TB, CF) | Read results | **Statement paper** in the report shell | Yes: 4 result tiles |
| Ageing | Chase / plan payments | Buckets + stacked bars per party | Yes: bucket tiles |
| General Ledger | Trace an account | Running-balance ledger | No: opening/closing rows instead |

### 4.1 List page (Invoices, Bills, Advances)

```
FinancePageHeader  [Export] [+ New …]
SummaryStrip       (from /summary endpoint, NOT computed from the current page)
Card ─┬ StatusTabs (All · Draft · Unpaid · Overdue · Paid · Void, with counts)
      ├ FilterBar  (search · Date chip · Customer/Vendor chip · + Add filter ····· Sort)
      │  └ replaced by BulkActionBar when rows are selected (brand-tint background)
      ├ DataTable  (checkbox · Number(mono) · Party + sub-line · Date · Due(relative) · Amount · Balance · Status · ⋯)
      └ Footer     (Showing 1–25 of N · Balance in view SAR x · pager)
```

- Whole row navigates to the record page; checkbox and ⋯ menu stop propagation.
- ⋯ menu shows only on row hover (`opacity-0 group-hover:opacity-100`), contains contextual actions (View, Print, Record payment, Delete draft).
- "Overdue" tab maps to a server filter (`status=overdue`), not client filtering.
- Party sub-line: invoices → `N trips · route summary`; bills → vendor category or line summary.

### 4.2 Record page (Invoice, Bill, Journal Entry)

```
Breadcrumb (Invoices / INV-…)                        2 of 142  [‹] [›]
INV-2026-0141 [Partially paid]                [⋯] [Print / PDF] [Record payment]
Customer · Issued 15 Sep 2026 · Net 30
DocStatusBar  Draft ✓ — Issued ✓ — Partially paid ● — Paid
┌ DocumentPaper (flex-1, scrolls) ────────────┐ ┌ BalanceHeroCard ───────┐
│ company / TAX INVOICE / Bill to / meta grid │ │ Balance due SAR 6,650  │
│ lines (description · trip · qty · rate · amt)│ │ ███████░░ 47% collected │
│ TotalsBlock                                  │ └────────────────────────┘
└──────────────────────────────────────────────┘ ┌ SidePanelTabs ─────────┐
                                                  │ Payments|Journal|Activity│
                                                  └────────────────────────┘
```

- Primary action depends on status: Draft → **Issue** (bill: **Approve**); Issued/PartiallyPaid → **Record payment**; Paid/Void → none (Print becomes primary-secondary).
- ⋯ menu: Edit (Draft only), Delete draft, Void (with `ConfirmModal`, destructive, message states the reversal that will post).
- Void documents show a muted "VOID" diagonal/stamp on `DocumentPaper` and the status bar collapses to `Draft ✓ — Issued ✓ — Void`.
- Trip references in lines link to the trip page.
- "Journal" tab reads `journalEntry` (+ payment JEs if available) and links "Open in General Ledger →" with the account preselected.
- "Activity" tab reads audit logs for the entity (section 6).
- Pager (`2 of 142`) navigates within the list query the user came from (pass ids via router state; hide when entered directly).

### 4.3 Create / edit page (Invoice, Bill, Journal Entry)

- Same header; breadcrumb ends `New invoice`.
- Top card: party select, dates, terms, reference — 4-column grid.
- `LineItemsGrid` in its own card; trip picker for invoices stays but is restyled as a side `Sheet` ("Add trips").
- Sticky footer bar (white, top border): totals summary on the left, `[Cancel] [Save draft] [Save & issue]` on the right.
- Journal entry create: live **Balanced / Out of balance by X** indicator in the footer (green/orange pill); Post disabled until balanced.

### 4.4 Report page (P&L, Balance Sheet, Trial Balance, Cash Flow, Ageing, General Ledger)

```
FinancePageHeader (Accrual basis · SAR · 1 Jul – 30 Sep 2026)        [Print] [Export ▾]
Toolbar card: [Month|Quarter|Year|Custom] [📅 range]  ····  (●) Compare with previous period | Collapse all
Tiles (4): key figures, each with "+7.1% vs 1,246,500.00" when comparing; hero tile in charcoal
ReportTable: Account | Current | Previous | Change | %   (group rows collapsible, subtotal rows, charcoal grand-total row)
```

- Compare = second API call with the previous equivalent range (no backend change needed for P&L/Cash Flow; Balance Sheet compares two `as_of` dates; Trial Balance compares two periods).
- Account rows show `code` in mono muted before the name, and on hover a "View ledger →" affordance → `/finance/general-ledger?account_id=…&date_from=…&date_to=…`.
- Variance colours via `varianceTone` (income up = green, cost up = orange).
- Ageing reports: stacked bucket bar per customer/vendor row + bucket totals as tiles; clicking a bucket cell opens the filtered list (`/finance/invoices?customer_id=…&tab=overdue`).
- Print uses a clean print stylesheet (no sidebar, no toolbar, black text, 12pt).

### 4.5 Banking pages

- Bank Accounts: grid of account cards (bank name, masked number, GL account code, current balance in `fin-num`, "Reconciled to <date>" line) + "Transfer funds" action in header.
- Reconciliation: two-pane (statement lines vs book lines) with running "Difference" pill in a sticky footer; Complete disabled until difference = 0.00.
- Advances: list pattern (4.1) with tabs Open / Partially applied / Fully applied / Void, apply flow in a `Sheet`.

### 4.5b Journal Entries (daybook)

An accountant's screen: dense, calm, and focused on the *lines*. No KPI cards.

```
FinancePageHeader  Finance / Accounting / Journal Entries            [Export] [+ New entry]
(only if drafts > 0)  ⓘ 3 draft entries waiting to post · oldest 6 days      [Review drafts]
Card ─┬ StatusTabs  All · Draft · Posted · Voided (counts)
      ├ FilterBar   search · Date · Period · Source · Account ····· 
      └ Daybook
          ┌ Tue, 23 Sep 2026 ─────────────── 4 entries · Dr 58,300.00 ┐   ← sticky day header (sunken)
          │ ›  JE-2026-0913  [Invoice] Freight — Gulf Cement      AR → Freight Revenue +1   12,650.00  Posted │
          │ ⌄  JE-2026-0914  [Manual]  Accrued fuel September    Fuel → Accrued Expenses     8,400.00  Draft  │
          │    ┌ Account                       Description        Debit        Credit ┐                       │
          │    │ 5000 · Fuel                   Sep accrual     8,400.00            —  │                       │
          │    │   2100 · Accrued Expenses     Sep accrual            —     8,400.00  │                       │
          │    └ Totals  8,400.00 / 8,400.00  ✓ Balanced                               ┘                      │
          │    Period Sep 2026 · created by operator · [Open] [Edit] [Post]                                    │
          └────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Row click expands** the entry in place (accordion, several can be open at once). "Open" goes to the record page.
- **Source badge** (icon + label) from `source_type`: Manual, Invoice, Invoice payment, Bill, Bill payment,
  Expense, Advance, Advance application, Bank transfer, Trip subcontract, Year-end closing, Import. When a
  source document route exists, the badge links to it (e.g. `Invoice` → `/finance/invoices/:source_id`).
  Unknown values fall back to a neutral badge that shows the raw value.
- **Account flow summary**: the first debit account → the first credit account, plus "+N" for the rest.
- Amount = total debit (`.fin-num`, right-aligned). Voided entries: muted row with the amount struck through, and a
  "Reversed by JE-…" link. Reversal entries show "Reversal of JE-…".
- Credit lines are indented 12px (a standard accounting convention); debit and credit columns are always
  separate, never one signed column.
- **Record page** (`/finance/journal-entries/:id`) is ledger-style, not "paper": detail strip (date, period,
  source, reference, memo), then the full lines table with a totals row and a balance check, and a side panel with
  **Linked** (source document, reversal pair, period status) and **Activity**.
- **Editor** (`/new`, `/:id/edit`) is a full page, not a modal. It's a spreadsheet-like grid with an account combobox
  (search by code or name), description, debit and credit. Typing a debit clears that line's credit and vice versa.
  Enter adds a row. There's a "Balance remaining" helper on an empty row. A sticky footer shows Total Dr ·
  Total Cr · a Difference pill (green "Balanced", orange "Out by X"), then Save draft and Save & post.

### 4.6 Accounting setup pages

- Chart of Accounts: tree table grouped by `AccountType` (Asset, Liability, Equity, Revenue, Expense) using the `ReportTable` group-row style; inline active/inactive toggle; balance column; "View ledger" on hover.
- Accounting Periods: timeline/list of periods with `StatusPill kind="period"`; Close / Lock actions via `ConfirmModal`; fiscal year-end closing in a guided `Sheet` that shows the closing JE preview.

---

## 5. Status map

| Kind | Status (enum) | Label | Tone |
|---|---|---|---|
| invoice | `Draft` | Draft | neutral |
| invoice | `Issued` | Issued | info |
| invoice | `PartiallyPaid` | Partially paid | warning |
| invoice | `Paid` | Paid | positive |
| invoice | `Void` | Void | muted |
| invoice/bill | *(derived)* | Overdue | negative |
| bill | `Draft` / `Approved` / `PartiallyPaid` / `Paid` / `Void` | Draft / Approved / Partially paid / Paid / Void | neutral / info / warning / positive / muted |
| journal | `Draft` / `Posted` / `Voided` | Draft / Posted / Voided | neutral / positive / muted |
| period | `Open` / `Closed` / `Locked` | Open / Closed / Locked (lock icon) | positive / warning / neutral |
| advance | `Open` / `PartiallyApplied` / `FullyApplied` / `Void` | Open / Partially applied / Fully applied / Void | info / warning / positive / muted |
| reconciliation | `Draft` / `Completed` | In progress / Completed | neutral / positive |

Enums come from `@mercon/shared-types`. Do not add enum values; "Overdue" is display-only.

---

## 6. Backend additions (no schema changes)

All under existing routers, same middleware (`authenticateJWT`, `authorizeRoles('Admin','Operator')`, `requireModuleEnabled('finance')`).

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/invoices/summary` | `{ counts: {all, Draft, Issued, PartiallyPaid, Paid, Void, unpaid, overdue}, outstanding: {total, current, overdue, overdue_count, oldest_overdue_days}, collected_this_month: {amount, count} }` | Register **before** `/:id` |
| `GET /api/bills/summary` | same shape (payables; `paid_this_month`) | Register before `/:id` |
| `GET /api/invoices?status=overdue` / `status=unpaid` | list filter | `overdue` = status in (Issued, PartiallyPaid) AND `due_date < today`; `unpaid` = status in (Issued, PartiallyPaid). Same for bills (Approved, PartiallyPaid) |
| `GET /api/invoices/:id/activity`, `/api/bills/:id/activity`, `/api/journal-entries/:id/activity` | `AuditLog[]` for `entityType` + `entityId`, newest first, with `user.username` | Existing `/settings/audit-logs` is superadmin-only; these are scoped reads |

Update `financeService.ts` and shared types accordingly. Add integration tests next to the existing finance tests.

---

## 7. Navigation (sidebar)

Finance group becomes collapsible sub-groups (state remembered in `localStorage`, auto-expand the group containing the active route):

- **Sales:** Quotations, Invoices, AR Ageing
- **Purchases:** Bills, Expenses, AP Ageing
- **Banking:** Bank Accounts, Reconciliation, Advances
- **Accounting:** Journal Entries, General Ledger, Chart of Accounts, Accounting Periods
- **Reports:** Profit & Loss, Balance Sheet, Trial Balance, Cash Flow, Vehicle P&L

Keep every item's existing `moduleKey` / `permissionKey` gating. Routes do not change except the new record routes:
`/finance/invoices/:id`, `/finance/bills/:id`, `/finance/journal-entries/:id` (declared after the `/new` routes).

---

## 8. Accessibility & quality bar

- Text contrast ≥ 4.5:1 (hence `#757583` for labels). Coral fills carry bold 13px text only.
- Real `<button>` / `<a>`; icon-only buttons have `aria-label`; tabs use `role="tab"` + `aria-selected`; collapsible groups use `aria-expanded`.
- Keyboard: `/` focuses list search; `N` = new document on list pages (use the existing `Btn` shortcut support); `Esc` closes sheets.
- Loading: skeleton rows matching final row height; never layout-shifting spinners.
- Empty states with a CTA; error states with Retry.
- All amounts from the API are strings/Decimals: always `Number()` before formatting; never float-sum for display totals that the API already returns.
- `npm run build` in the web dashboard must pass with zero TS errors; existing tests stay green.

---

## 9. Feature backlog (phase 2 — needs owner approval per item)

Not part of the UI revamp. Several need schema changes (production impact, see `CLAUDE.md`).

| Feature | Reference | Schema change? |
|---|---|---|
| Credit notes (against invoices) / debit notes (bills) | Odoo, Zoho | Yes |
| Recurring invoices | Zoho | Yes |
| Bulk "Receive payment" across multiple invoices of one customer | Zoho | No (API only) |
| Email invoice PDF to customer | Zoho, Odoo | No (needs mail config) |
| Customer statement of account (PDF) | Zoho | No |
| Payment reminders for overdue invoices | Zoho | Maybe (reminder log) |
| Budgets vs actuals on P&L | Odoo | Yes |
| Saved report views / scheduled report email | Zoho | Yes |
| Attachments on bills (vendor invoice scan) | Odoo | Possibly reuse Documents module |
| Multi-currency | Odoo | Yes |
| Finance overview dashboard (`/finance`) | Zoho "Dashboard" | No |
