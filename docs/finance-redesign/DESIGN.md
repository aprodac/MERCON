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
| Advances | Track money held on account | List + tabs, record page with apply-credits sheet, create page (§4.5c) | Small: held balance per party type |
| Bank Accounts | See where the cash is | **Card grid** + account page + editor (§4.5d) | Compact strip: total cash, in/out this month, needs reconciliation |
| Reconciliation | Match statement to books | **Two panes** + sticky difference bar | No |
| Chart of Accounts | Maintain structure | **Tree** grouped by account type | No |
| Accounting Periods | Close the books month by month | **Close workspace**: fiscal-year ribbon + close checklist + period details (§4.6b) | No |
| Statements (P&L, BS, TB, CF) | Read results | **Statement paper** in the report shell | Yes: 4 result tiles |
| Ageing | Chase / plan payments | Buckets + stacked bars per party | Yes: bucket tiles |
| General Ledger | Trace an account | Running-balance ledger | No: opening/closing rows instead |

### 4.0a Page shell convention (owner decision, applies to every finance page)

The app's top bar already shows the page title (from `<DashboardLayout title="…">`) and the back button.
Pages must NOT render their own title, subtitle or breadcrumbs (don't use `FinancePageHeader` on pages).
Reference implementation: `pages/finance/AdvancesPage.tsx`.

```
<DashboardLayout active="finance" title="Advances">          ← the title lives in the top bar only
  <div className="p-4 space-y-3.5 max-w-[1400px] mx-auto">
    Row 1 · toolbar (border-b pb-2): segmented category tabs on the left
            (track bg-[#F4F4F5] p-1 rounded-xl; active tab = white + shadow-xs + coloured icon + solid count pill)
            ·  compact actions on the right (h-8 text-xs rounded-lg: outline secondaries, coral primary / split button)
    Row 2 · compact SummaryStrip (p-3.5 rounded-xl) — only where the page needs figures (§4.0)
    Row 3 · content card(s); list filters (search, selects, toggles) live INSIDE the table card header, not in a separate bar
```

- Record and editor pages follow the same rule: no page title block. The record's identity (number, status pill, chips)
  lives in its first card or hero, and actions sit in the toolbar row.
- Dropdowns use the shadcn Radix `Select` (not native selects); menus use `DropdownMenu`; confirmations use `AlertDialog`
  / `ConfirmModal`; side panels use `Sheet`.

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

### 4.5c Advances (list, record page, create page)

Advances are money held on account: a customer paid before being invoiced, or we paid a provider or
employee up front. The pages answer three questions: **how much is still held, with whom, and where did it
get used?** Patterns: Zoho Books "unused credits" + "Apply credits" (allocate across several invoices at
once, oldest first), Odoo "outstanding credits" (show the available advance where it can be used), and
printable receipt/payment vouchers.

**Colour language (chips carry meaning, never decoration):**

| Chip | Light | Meaning |
|---|---|---|
| Customer | sky (`bg-sky-50 text-sky-700`, dot `sky-500`) | party type |
| Provider | violet (`bg-violet-50 text-violet-700`, dot `violet-500`) | party type |
| Employee | teal (`bg-teal-50 text-teal-700`, dot `teal-500`) | party type |
| ↓ Money in | emerald + `ArrowDownLeft` | direction Received |
| ↑ Money out | orange + `ArrowUpRight` | direction Paid |
| Age | slate → amber (>30 days) → orange (>60 days) | days an advance has stayed open |

Each chip has a matching `dark:` pair (`*-950/40` bg, `*-300` text). Party avatars use initials on the party-type tint.

**Business rules the UI encodes** (from `advanceEngine.ts`):
- Received → Customer only; Paid → Provider or Employee.
- Customer advances apply to that customer's invoices; provider advances to that provider's bills; employee advances can't be applied to documents.
- You can't apply more than the remaining balance or the document's balance due. Applying posts on today's date, so an Open period must cover today.
- Void only when nothing has been applied.
- Creating needs an Open period covering the advance date and the default advance account in Settings.

**List** `/finance/advances`: header (Export, split button "New advance ▾" with the 3 types) → SummaryStrip with 3
cells (customer advances held · provider advances outstanding · employee advances outstanding, each with a count;
the only figures on the page) → StatusTabs (All · Open · Partially applied · Fully applied · Void) → FilterBar
(search, Type chips, Direction, Party, Date) + a "Group by party" toggle → rows: ref · party avatar + name + type chip ·
direction chip · date + age chip · amount · applied progress bar + remaining · status pill · ⋯.

**Record** `/finance/advances/:id`: RecordLayout, status bar Open → Partially applied → Fully applied (Void variant),
charcoal BalanceHeroCard "Remaining", details card, applications table, **Apply sheet** (open documents of that party,
per-row amount, Auto-allocate oldest-first, remaining meter, Will-post preview), side tabs Journal · Timeline ·
Other advances with this party, Print voucher.

**Create** `/finance/advances/new`: a full page. Type as 3 radio cards → party combobox → amount + date → "Deposit to / Paid
from" as bank-account radio cards → memo; right rail with a live Will-post preview and readiness checks (open period,
settings account); sticky footer Cancel · Save · Save & apply.

### 4.5d Bank & Cash Accounts (overview, account page, create/edit page)

Patterns: Odoo's accounting dashboard (one card per bank journal showing balance, "N to reconcile" and a small balance graph)
and Zoho Books Banking (account cards, money in/out, per-account transactions with running balance, transfers
between accounts). The page answers: **how much cash do we have, where, what moved, and what still needs reconciling?**

**Book balance** = `opening_balance` + Σ(debit − credit) of that GL account's lines in Posted + Voided entries (voids net out
with their reversals). This is the same basis the cash-flow report and the reconciliation page use. ⚠️ `opening_balance` is
not posted to the ledger, so the Balance Sheet leaves it out. The UI shows a small info hint on any account whose opening
balance is non-zero (see §9 backlog: "post opening balances as a journal entry").

**Colour language:** each bank gets a stable tint from a hash of its name (one of sky / violet / teal / amber / rose / indigo),
used only for its initials tile and chart line. Cash accounts use emerald with a `Wallet` icon. Money in = emerald `ArrowDownLeft`,
money out = orange `ArrowUpRight`. Reconciliation chip: emerald "Reconciled to 31 Aug" (reconciled through the last month end),
amber "Reconciled to 31 Jul" (older), slate "Never reconciled".

**Overview** `/finance/bank-accounts` (page-shell convention, §4.0a):
- Toolbar: segmented tabs **All · Bank · Cash** (icons, count pills) · right: view toggle (Cards | Table), "Transfer" (outline), "New account" (coral)
- Compact SummaryStrip: Total cash & bank · Money in this month · Money out this month · Accounts needing reconciliation
- **Cards grid** (default): initials tile, bank name, masked number, GL code chip, cash chip, book balance (hero `.fin-num`),
  90-day balance sparkline, in/out this month, reconciliation chip + "N unreconciled", footer: Open · Reconcile · ⋯ (Edit,
  Transfer from here, Deactivate / Activate). "Show inactive" switch; inactive cards appear muted.
- Table view: the same data in DataTable, for many accounts.

**Account page** `/finance/bank-accounts/:id`: an identity hero (charcoal: bank, masked number, IBAN with a copy button, SWIFT,
linked GL account, book balance), actions Transfer · Reconcile · Edit · ⋯; a balance chart card (30 / 90 / 365 days, balance
line + in/out bars); a Transactions card (date · JE ref · source chip · memo · money in · money out · running balance ·
reconciled ✓) with filters (date range, In/Out, Reconciled/Unreconciled, search); side column: Reconciliation history, Details,
Opening balance note.

**Create / edit** `/finance/bank-accounts/new`, `/:id/edit`: type radio cards (Bank account / Cash account), bank name (with
suggestions), account number, IBAN (Saudi format + mod-97 check), SWIFT, currency, linked GL account (combobox of postable Asset
accounts not already linked; read-only when editing, since the API can't change it), opening balance + date; right rail: a **live card
preview** that renders as you type, plus notes. **Transfer** is a Sheet (from/to account cards with balances, amount, date, memo,
Will-post preview).

### 4.5e AP Ageing (payables workspace)

This is more than a report. It answers the questions a finance person actually has: **who do we owe, how late are we, can we
afford what's due, and what should we pay this week?** Patterns: Zoho Books AP ageing (ageing by due date or bill date,
drill into bills), Odoo's "Aged Payable" with expandable partner rows and batch payments, and cash-requirement forecasts
from mid-market ERPs.

**Views** (segmented tabs in the toolbar): **By vendor** (default) · **By bill** · **Payment schedule**.

**Bucket colour scale** (used for tiles, cells, bars and chips; each has a `dark:` pair):
Current = emerald · 1–30 = amber · 31–60 = orange · 61–90 = rose · 90+ = red-700 (bold). Table cells are heat-tinted: the
background opacity scales with the cell's share of that row's total (5% → 20%). Zero shows as a muted "—".

**Smart pieces (deterministic, computed from real data, no AI):**
- **Cash coverage meter:** bank + cash book balance (from the bank accounts API) vs payables due in the next 7 / 30 days, e.g.
  "215,090 available · 64,325 due in 30 days · covered ✓", or in orange "short by X".
- **Insights row** (up to 4 cards, only if they apply): the vendor with the oldest overdue bill; bills due this week (count + amount);
  unapplied provider advances you could use (e.g. "Desert Hawk has a 3,000.00 advance → Apply"); change vs 30 days earlier (ageing
  run at as_of − 30).
- **Vendor rows expand in place** to show their bills (ref, bill date, due date, days overdue chip, balance, bucket chip, Pay).
- **Pay run:** select bills (checkboxes, or "Select all overdue" / "Due this week"), pick the bank account and date, see the bank
  balance after payment, preview the entries, then record all the payments. Built on the existing bill-payment API.
- **As-of presets** (Today · End of last month · End of last quarter · Custom) and **Ageing by** (Due date | Bill date).
- A vendor hover-card with contact (phone, email) and quick links (bills, advances, provider page).

### 4.6 Accounting setup pages

- Chart of Accounts: tree table grouped by `AccountType` (Asset, Liability, Equity, Revenue, Expense) using the `ReportTable` group-row style; inline active/inactive toggle; balance column; "View ledger" on hover.
- Accounting Periods: see §4.6b.

### 4.6b Period Close (Accounting Periods)

Borrowed patterns:
- **Odoo:** a lock date ("books are locked through …")
- **Zoho Books:** transaction locking, with typed confirmation and a reason for anything irreversible
- **Xero / NetSuite:** a month-end close checklist

This is a workspace for closing the books, not a CRUD table. **No KPI cards.**

```
FinancePageHeader  Finance / Accounting / Period close        [Generate periods] [Close fiscal year] [+ New period]
FY switcher  ‹ FY 2025 | FY 2026 ›                          🔒 Books locked through 31 Jul 2026
Year ribbon (one tile per period, chronological):
 ┌Jan┐┌Feb┐ … ┌Jun┐┌Jul┐┌Aug┐┌Sep ● now┐┌Oct┐┌ + Nov ┐┌ + Dec ┐
 │🔒 ││🔒 │   │✓  ││✓  ││✓  ││● 2 drafts││○  ││not     ││not     │
 └───┘└───┘   └───┘└───┘└───┘└─────────┘└───┘└created ┘└created ┘
┌ Close checklist: September 2026 ─────────────────┐ ┌ Period details ─────────────────┐
│ 4 of 6 checks passed  ███████░░░                  │ │ 1 – 30 Sep 2026 · Open           │
│ ✕ 2 draft journal entries      [Review drafts →]  │ │ Created ▸ Closed ▸ Locked (trail) │
│ ! 1 draft invoice dated in period [Review →]      │ │ Entries: 22 posted · 2 draft · 1 │
│ ! Al Rajhi not reconciled past 31 Jul [Reconcile→]│ │ Revenue / Expenses / Net result  │
│ ✓ Trial balance is balanced                       │ │ [Trial balance] [Journal entries]│
│ ✓ Previous period (August) is closed              │ └──────────────────────────────────┘
│ i 5 invoices overdue at period end (info only)    │
│ ──────────────────────────────────────────────── │
│ Closing takes a snapshot of every account balance │
│ and stops new postings.        [Close September]  │
└──────────────────────────────────────────────────┘
All periods (collapsible history table, exportable)
```

- **Year ribbon tiles:** ~88px wide, rounded-2xl, 1px border.
  - Open: white with a green dot. Closed: amber tint with a check. Locked: charcoal fill, white text, lock icon.
  - Missing month (FY uses monthly periods): dashed border, "+", creates that month.
  - The current month gets a brand ring and a "now" tag. The selected tile gets a 2px brand outline.
  - Tiles also show the entry count, plus an orange dot with a count when there are drafts.
- **Lock line:** "Books locked through <date>", the end date of the latest period such that it and every earlier period are Closed/Locked.
- **Checklist rows:** a state icon (✓ pass green, ! warning amber, ✕ blocker red, i info slate), a title, one line of detail, and a deep-link action. Blockers are what the backend enforces (drafts in period); warnings are good practice. The Close button is disabled while any blocker remains; warnings need a "Close anyway" confirmation that lists them.
- **Irreversible actions** (Lock, Close fiscal year) use typed confirmation (type the period name / "CLOSE FY2026").
- **Lifecycle (owner-approved):** Open → Closed → Locked. Only a **Closed** period can be locked, so a balance
  snapshot always exists. A Closed period can be **reopened** by an Admin with a required reason (audit-logged,
  snapshot discarded and rebuilt on the next close). Reopening goes newest-first: it's blocked while a later period
  is closed, or when the fiscal year is already closed. Locked is permanent.
- **Fiscal year close** is a guided Sheet: date → pre-checks → closing-entry preview (from P&L) → typed confirm → success with a link to the JE.
- **Operators** see everything read-only; action buttons are hidden, with an "Only Admins can close periods" note.

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
| Post bank opening balances as a journal entry (Dr bank / Cr Opening Balance Equity), so the Balance Sheet includes them | Zoho, Odoo | No (needs an equity account + backend) |

---

## 2.6 Visual refinement v2 (Overrides Section 2.1 - 2.3 for /finance pages)

The visual rules below make `/finance` pages feel like a modern, clean financial system (shadcn / Stripe / Linear):

- **R1 One gray family — shadcn tokens only**:
  - `text-slate-900/800/700`, `#111111`, `text-[#3E3C3D]` (as text) → `text-foreground`
  - `text-slate-600/500/400`, `#6E6E80`, `#757583`, `#9898A4` → `text-muted-foreground`
  - `bg-slate-50/100`, `#F7F8FA`, `#FAFAFB`, `#F4F4F5`, `#F1F2F5` → `bg-muted` (or `bg-muted/50`, `bg-muted/30`)
  - `border-slate-*`, `border-black/[0.0x]`, `border-gray-*` → `border-border` (inner dividers: `border-border/60`)
  - `bg-white` (surfaces) → `bg-card` / `bg-background`
  - `focus rings` → `ring-ring`
  - App canvas and sidebar remain app-wide decisions. Brand coral `#FA634E` stays ONLY for active sidebar item, primary CREATE actions on list pages, and focus/selection accents. Charcoal `#3E3C3D` is not used for text or pills inside finance pages.

- **R2 Colour is an accent, never a fill**:
  - Allowed colour: (a) status/semantic badges via R5; (b) result and variance figures — losses/negatives `text-rose-600` (dark: `text-rose-400`), favourable variance `text-emerald-600` (dark: `text-emerald-400`); (c) 6px category dots; (d) charts.
  - NOT allowed: tinted full-width section bands, coloured section titles, coloured link text, coloured ordinary amounts, left-border accent bars, decorative bars carrying no data.

- **R3 Figures in sans UI font with tabular figures — no monospace**:
  - Update `.fin-num`: `font-family: 'Geist Variable', 'Inter Variable', system-ui, sans-serif; font-variant-numeric: tabular-nums;`
  - Remove Geist Mono / JetBrains Mono / `font-mono` from finance pages. Weights: 400 lines, 500 subtotals, 600 totals.
  - Account codes: plain `text-muted-foreground` tabular text in a fixed `w-12` column — no grey code boxes.

- **R4 One container level**:
  - A page section = ONE card: `rounded-xl border bg-card shadow-xs`. Inside: rows separated by `divide-y divide-border/60`; section header rows at most `bg-muted/40`. No bordered boxes inside cards, no nested rounded backgrounds.

- **R5 Badge recipe (StatusPill, source chips, period/basis/currency chips, delta chips)**:
  - `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset`
  - tone → `bg-{hue}-500/10 text-{hue}-700 ring-{hue}-600/20` (dark: `bg-{hue}-400/10 text-{hue}-300 ring-{hue}-400/20`)
  - neutral → `bg-muted text-muted-foreground ring-border`
  - Hues: positive `emerald` · negative `rose` · warning `amber` · info `sky` · `violet`/`teal` only where assigned.

- **R6 Controls**:
  - Segmented view switches use shadcn `Tabs` styling (`TabsList bg-muted p-[3px] rounded-lg; active trigger bg-background text-foreground shadow-sm`) — no black or charcoal active pills.
  - Toolbar buttons: shadcn `Button variant="outline" size="sm"`. Report pages (P&L, Balance Sheet, GL, Trial Balance, Cash Flow, Ageing) have NO filled buttons (Export is outline). List pages keep ONE coral filled create button. Selects/date pickers use shadcn triggers at size `sm` (`h-8`).

- **R7 Two radii only**:
  - `rounded-md` (controls, badges, inputs, menu items) and `rounded-xl` (cards, sheets). Shadows: `shadow-xs` on cards, `shadow-md` only on popovers/menus/sheets, none elsewhere.

- **R8 Type scale**:
  - `11px uppercase tracking-wide text-muted-foreground font-medium` for column labels only; 13–14px body; 15px card titles (`font-semibold`); no other uppercase text. Spacing on a 4px grid; list/statement rows `h-9`; card padding `p-4` (`p-5` max).

