# MERCON Visual Design System

This document is the **single source of truth** for MERCON's current visual design system as implemented across the project (`frontend/web-dashboard`, `frontend/mobile-app`, global CSS design tokens, and shared UI primitives).

---

## Brand & Visual Direction

### Visual Character
MERCON is a desktop-first, highly efficient logistics operating system designed for speed, clarity, and dense operational decision-making. The visual language emphasizes **compact operational density**, **strong visual hierarchy**, and **progressive disclosure** — avoiding unnecessary decorative elements, giant empty containers, or redundant text clutter.

### Core Brand Colors

| Role | Color Name | Hex / Value | Usage |
|------|------------|-------------|-------|
| **Brand Primary** | Coral Red | `#FA634E` | Primary buttons, active navigation states, key brand emphasis, active borders, progress fills |
| **Brand Hover** | Deep Coral | `#DF4834` | Primary button hover & active states |
| **Brand Light** | Tinted Coral | `#FEF1EF` | Primary button hover background tint, active badge surfaces |
| **Brand Border** | Translucent Coral | `rgba(250, 99, 78, 0.25)` | Focus ring outline, active card highlights |
| **Sidebar & Dark Surfaces** | Dark Charcoal | `#3E3C3D` | Left navigation sidebar, executive dark card surfaces, hero headers |
| **Sidebar Alt** | Deep Charcoal | `#2D2B2C` | User profile footer background in sidebar |
| **Canvas Background** | Light Cool Gray | `#EEF1F6` | Main scrollable page background canvas across all protected pages |
| **Surface Background** | Pure White | `#FFFFFF` | Standard cards, data tables, form inputs, modals, drawers |

### Semantic Palette

| Semantic State | Base Hex | Light Background Hex | Usage |
|----------------|----------|----------------------|-------|
| **Success / Completed / Active** | `#10B981` / `#16A34A` | `#ECFDF5` (`bg-emerald-50`) | Completed trips, active drivers/vehicles, paid invoices, verified documents |
| **Warning / Attention / Delayed** | `#F59E0B` / `#D97706` | `#FFFBEB` (`bg-amber-50`) | Delayed trips, maintenance alerts, expiring documents, pending actions |
| **Error / Critical / Danger** | `#EF4444` / `#DC2626` | `#FEF2F2` (`bg-rose-50`) | Cancelled trips, emergency alerts, expired compliance, system errors |
| **Info / In Transit** | `#3B82F6` / `#2563EB` | `#EFF6FF` (`bg-blue-50`) | In-transit trips, customer contexts, informational chips |
| **Purple / Highlight** | `#7C3AED` / `#6366F1` | `#F5F3FF` (`bg-purple-50`) | Monthly trip contracts, rate highlights, premium indicators |

### Page-Specific Accent Tokens

Each operational domain utilizes a dedicated accent color token for subtler page-specific visual grounding (used in KPI borders and header icons):

*   **Trips**: Coral Red (`#FA634E`, light `#FEF1EF`)
*   **Monthly Trips**: Purple (`#7C3AED`, light `#FAF7FF`)
*   **Drivers**: Emerald Green (`#10B981`, light `#F2FCF7`)
*   **Vehicles**: Blue (`#3B82F6`, light `#F3F7FF`)
*   **Third-Party Fleet**: Teal (`#0F9F9A`, light `#F0FCFB`)
*   **Maintenance**: Red (`#EF3340`, light `#FFF5F6`)
*   **Customers**: Deep Blue (`#2563EB`, light `#EFF6FF`)
*   **Invoices / Expenses**: Amber (`#D97706`, light `#FFFBEB`)
*   **Documents**: Indigo (`#6366F1`, light `#EEF2FF`)
*   **Reports**: Sky Blue (`#0EA5E9`, light `#F0F9FF`)
*   **Settings**: Slate (`#64748B`, light `#F8FAFC`)

### Color Usage Rules
1.  **Canvas rule**: Every protected page uses `#EEF1F6` as the background canvas. Pure white `#FFFFFF` is reserved strictly for content cards, inputs, tables, and dialog surfaces.
2.  **Single dominant action**: Keep one primary Coral Red (`#FA634E`) action button per workflow. Secondary actions stay neutral.
3.  **Semantic tinting**: Backgrounds for status chips or alerts use a 10% to 15% opacity tint of the base semantic color (e.g. `#ECFDF5` for success).

---

## Typography

### Font Families

*   **Primary Sans-Serif**: `'Plus Jakarta Sans'`, `'Inter'`, `system-ui`, `sans-serif` (Used for all headings, labels, body text, buttons, and navigation).
*   **Monospace Font**: `'JetBrains Mono Variable'`, `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `monospace` (Used exclusively for Trip IDs, Vehicle IDs, Driver IDs, currency codes, and keyboard shortcut badges).
*   **Numerical Tabular Font**: `Geist Mono Numbers` (Applied via `@font-face` for numeric ranges `0-9`, `.`, `,`, `$`, `%`, `€` to ensure aligned numerical values).

### Type Hierarchy & Tokens

| Element / Token | Font Size | Weight | Line Height / Style | Typical Usage |
|-----------------|-----------|--------|---------------------|---------------|
| **Page Title** | 18px (sm) / 24px (xl) | 900 (`font-black`) | Leading tight, tracking tight | Header title on main screens |
| **Section Title** | 14px (sm) / 16px (base) | 800 (`font-extrabold`) | Leading snug | Card section titles, modal headers |
| **KPI Display Number** | 30px | 700 (`font-bold`) | Leading none, tracking tight | Primary numbers in KPI summary cards |
| **Table Header / Technical Label** | 10px | 700 (`font-bold`) | Uppercase, tracking-wider (`0.06em`), text-slate-500 | Table column headers, field metadata labels |
| **Standard Body** | 12px (xs) / 14px (sm) | 500 (`font-medium`) | Leading normal | Data table cell values, form input text |
| **Secondary Body / Description** | 12px (xs) | 400 (`font-normal`) | Text-slate-500 | Subtitles, help descriptions, table footer summaries |
| **Micro Caption / Badge** | 9.5px / 11px | 700 (`font-bold`) | Leading none | Status badges, keyboard shortcuts, record counts |
| **Monospace ID** | 11px / 12px | 700 (`font-mono`) | Font-mono | Trip numbers (`TRP-8821`), Vehicle plates, Driver IDs |

---

## Layout Architecture

### Global Shell & Dimensions

```
+---------------------------------------------------------------------------------------+
|  Global Header (Height: 72px Mobile / 88px Desktop)                                   |
|  [Back] / [Route Icon] Page Title                      [Operations Quick-Nav Strip]    |
+-------------------+-------------------------------------------------------------------+
|  Sidebar          |  Main Scrollable Content Canvas (Background: #EEF1F6)             |
|  (Width: 230px /  |  Page Container (px-6 pb-6)                                       |
|   Collapsed: 76px)|                                                                   |
|                   |  +-----------------------+  +-----------------------------------+ |
|  Dark Charcoal    |  | KPI Card Grid         |  | KPI Card Grid                     | |
|  (#3E3C3D)        |  +-----------------------+  +-----------------------------------+ |
|                   |                                                                   |
|                   |  +--------------------------------------------------------------+ |
|                   |  | Data Table Container (bg-white, rounded-lg, border)          | |
|                   |  +--------------------------------------------------------------+ |
+-------------------+-------------------------------------------------------------------+
```

*   **Page Width**: Fluid responsive desktop container up to 1440px with a max content width of 1200px.
*   **Content Padding**: `px-6 pb-6` (24px horizontal and bottom padding on main content area).
*   **Grid Structure**: CSS Grid / Flexbox with standard gaps `gap-4` (16px) or `gap-5` (20px).
*   **Sidebar Dimensions**:
    *   Desktop Expanded: `lg:w-[230px]`
    *   Desktop Collapsed Rail: `lg:w-[76px]`
    *   Mobile Drawer: `w-[280px]` (Off-canvas with backdrop overlay)
*   **Header Bar Dimensions**: Height `72px` (mobile) / `88px` (desktop). Fixed top/shrink-0 with bottom border `border-slate-200`.

---

## Cards & Containers

### Container Variants

#### 1. Standard Content Card
*   **Background**: Pure White `#FFFFFF` (`bg-card` / `var(--color-surface)`)
*   **Border**: `border border-black/[0.06]` to `border-black/[0.08]` or `border-slate-200/80`
*   **Radius**: `rounded-lg` (10px) or `rounded-xl` (12px / 14px)
*   **Shadow**: `shadow-xs` (`0 1px 2px rgba(15,23,42,0.04)`)
*   **Internal Padding**: `p-4` (16px) for KPI cards, `p-5` or `p-6` (20px-24px) for full content section cards

#### 2. Dark / Executive Card
*   **Background**: Dark Charcoal `#3E3C3D` (`--sidebar-bg-alt`)
*   **Border**: `border border-white/10`
*   **Radius**: `rounded-2xl` (24px)
*   **Text**: White `#FFFFFF` primary text, `#EEF1F6` secondary text

---

## Buttons & Actions

### Component Standard
All interactive action buttons use the `<Btn>` primitive (built on top of shadcn `<Button>`).

```tsx
<Btn 
  label="New Trip" 
  variant="primary" 
  icon={<Plus size={14} />} 
  shortcut={{ key: "n", metaOrControl: true }} 
  onClick={handleCreate} 
/>
```

### Button Variants & Styling

| Variant | Visual Styling | Usage |
|---------|----------------|-------|
| `primary` | `bg-[#FA634E] hover:!bg-[#d03e0d] text-white font-bold shadow-xs border border-orange-600/30 rounded-md` | Dominant CTA per page (e.g., `+ New Trip`, `+ Add Customer`) |
| `secondary` | `border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 font-semibold rounded-md shadow-xs` | Export, Filter, Refresh, Cancel actions |
| `outline` | `border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 font-semibold rounded-md` | Secondary selection toggles |
| `ghost` | `text-slate-600 hover:bg-slate-100 font-semibold rounded-md` | Icon buttons, inline table actions |
| `success` | `bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-semibold rounded-md` | Approval, verification, payment triggers |
| `danger` | `bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-semibold rounded-md` | Delete, cancel, rejection triggers |
| `warning` | `bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-semibold rounded-md` | Hold, maintenance flags |

### Button Sizes
*   **Small (`sm`)**: `h-8 px-3 text-xs`
*   **Default / Medium (`md`)**: `h-8.5` / `h-9 px-3.5 py-2 text-xs font-semibold`
*   **Large (`lg`)**: `h-10 px-8 text-sm`

### Keyboard Shortcuts
Buttons support built-in keyboard shortcuts rendered via a `<kbd>` chip (e.g. `⌘N`, `⌘↵`, `⌥R`).

---

## Forms & Inputs

### Input Styling
*   **Container**: `<FormInput>` / shadcn `<Input>`
*   **Height & Padding**: `h-9 px-3.5 py-2` (36px total height)
*   **Background**: `#FFFFFF` or `#F5F5F7`
*   **Borders**: `1.5px solid transparent` or `border-slate-200`
*   **Corners**: `rounded-md` (6px) or `rounded-xl` (12px)
*   **Typography**: `text-xs` / `text-sm font-medium text-slate-900`
*   **Placeholder**: `text-[#9898A4]` / `text-slate-400`
*   **Focus State**: `focus-visible:ring-brand/20 focus-visible:border-brand` (`box-shadow: 0 0 0 3px rgba(250, 99, 78, 0.08)`)
*   **Disabled State**: `opacity-55 cursor-not-allowed`

---

## Data Tables & Ledgers

### Structure & Pattern (`<DataTable>`)

```
+---------------------------------------------------------------------------------------+
| Toolbar Header                                                                        |
|  Table Title   [142 records]   [Search input...]   [Filters...]  [Select]  [Export]   |
+---------------------------------------------------------------------------------------+
|  [ ] | TRIP ID  | CUSTOMER     | ROUTE              | DRIVER     | STATUS    | ACTIONS|
+------+----------+--------------+--------------------+------------+-----------+--------+
|  [ ] | TRP-9021 | SABIC        | Riyadh -> Dammam   | Tariq Khan | Completed | [...]  |
|  [ ] | TRP-9022 | Aramco       | Jeddah -> Yanbu    | Hassan Ali | In Transit| [...]  |
+---------------------------------------------------------------------------------------+
| Pagination Footer                                                                     |
|  Rows per page: [10 v]  Showing 1 to 10 of 142 entries        [|<] [<] [1/15] [>] [>|]|
+---------------------------------------------------------------------------------------+
```

### Table Specifications
*   **Container**: `bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden`
*   **Header Cells (`th`)**: `text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50/80 h-8 px-2 py-1.5`
*   **Row Height & Padding**: `px-2 py-1.5` (compact) or `px-3 py-2`, `text-xs font-medium text-slate-800`
*   **Hover State**: `hover:bg-slate-50/70 cursor-pointer transition-colors`
*   **Selected Row State**: `bg-indigo-50/25 dark:bg-indigo-950/20`
*   **Multi-Select & Bulk Actions**: Selection mode toggle exposes row checkboxes and triggers floating `<BulkActionBar>` at the bottom of the screen.
*   **Mobile View**: Automatically transforms into stacked cards (`md:hidden`) using `mobilePriority` column configurations (`primary`, `secondary`, `meta`, `hidden`).

---

## Status & Badges

### Component (`<StatusBadge>`)

```tsx
<StatusBadge status="Completed" />
<StatusBadge status="In Transit" />
<StatusBadge status="Delayed" />
```

### Badge Mapping

| Status Input | Label | Icon | Style Classes |
|--------------|-------|------|---------------|
| `Completed`, `Delivered`, `Verified`, `Active`, `Available`, `Paid` | Completed / Active | `Check` / `FileText` | `bg-emerald-50 text-emerald-700 border-emerald-200/80` |
| `In Transit`, `On Trip` | In Transit | `Truck` | `bg-amber-50 text-amber-800 border-amber-200/80` |
| `Scheduled`, `Dispatched`, `Draft` | Scheduled | `Clock` | `bg-indigo-50 text-indigo-700 border-indigo-200/80` |
| `Loading`, `At Pickup` | Loading | `MapPin` | `bg-sky-50 text-sky-700 border-sky-200/80` |
| `Delayed`, `Maintenance`, `In Shop` | Delayed / Maintenance | `AlertTriangle` / `Wrench` | `bg-rose-50 text-rose-700 border-rose-200/80` |
| `Emergency` | Emergency | `AlertTriangle` | `bg-red-100 text-red-800 border-red-300` |
| `Cancelled`, `Expired`, `Inactive`, `Overdue` | Cancelled / Expired | `XCircle` / `AlertTriangle` | `bg-rose-50 text-rose-700 border-rose-200/80` |

### Shape & Typography
Badges use `rounded-full`, `text-[9.5px]` or `text-[11px] font-bold leading-none px-1.5 py-0.5 inline-flex items-center gap-1 border`.

---

## Navigation

### Sidebar (`Sidebar.tsx`)
*   **Surface**: Dark Charcoal `#3E3C3D`
*   **Top Logo Transition**: Angled parallelogram SVG pattern transitioning into Dark Charcoal
*   **Navigation Groups**: `FINANCE`, `COMPLIANCE & REPORTS`, `MASTER DATA`, `ACCOUNT`
*   **Active Item**: Coral Red background (`bg-[#FA634E] text-white font-bold shadow-2xs`)
*   **Rail Mode**: Collapse button (`⌘B` shortcut or toggle button) collapses sidebar from `230px` to `76px`

### Top Header (`Header.tsx`)
*   **Surface**: `#FFFFFF` (light mode) / `#090D16` (dark mode), border-b `border-slate-200`
*   **Contents**: Mobile menu trigger, page Back button, route icon, Page Title, and Operations Quick-Nav Strip (`Trips | Monthly Trips | Drivers | Vehicles | 3rd Party Fleet | Maintenance | Customers`).

---

## Icons & Visuals

*   **Icon Library**: Strictly `lucide-react`.
*   **Icon Sizing**:
    *   Badges / Micro: `size={10}` or `size={11}`
    *   Buttons / Inputs: `size={13}` or `size={14}`
    *   Sidebar / Table Actions / Nav bar: `size={16}` or `size={17}`
    *   KPI Cards / Header icons / Back button: `size={18}` or `size={20}`
    *   Modal headers / Empty states: `size={24}` to `size={36}`

---

## Charts & Data Visualization

*   **Chart Engine**: Recharts (`AreaChart`, `Area`, `ResponsiveContainer`, `ChartContainer`).
*   **KPI Card (`<KpiCard>`)**: Standard summary card with header title, primary display number (`30px font-bold`), trend indicator chip (`up` emerald, `down` rose, `neutral` slate), and quiet visual footer options:
    *   **Sparkline Chart**: Smooth linear area gradient fill (`opacity 0.16` to `0`).
    *   **SegmentBar**: Slim distribution bar with dot legend indicators (`SegmentBar`).
    *   **Completion Gauge**: Horizontal progress bar showing completion percentage.
    *   **Live Pulse Tracker**: Real-time status text with animated pinging status dot.

---

## Spacing & Sizing Scale

*   `4px` (`gap-1`, `p-1`) — Micro gaps between icons and text chips
*   `8px` (`gap-2`, `p-2`) — Tight button padding, filter tag gaps
*   `12px` (`gap-3`, `p-3`) — Input icon offsets, compact card padding
*   `16px` (`gap-4`, `p-4`) — Standard card grid spacing, KPI card internal padding
*   `20px` (`gap-5`, `p-5`) — Form section gaps, modal content padding
*   `24px` (`px-6`, `pb-6`) — Main page canvas padding
*   `32px` (`p-8`, `gap-8`) — Large dialog section spacing

---

## Border Radius Hierarchy

*   `--radius-sm` (`6px` / `rounded-md`) — Buttons, inputs, small tags, table cells
*   `--radius-md` (`10px` / `rounded-lg`) — KPI cards, data table containers, filter popovers
*   `--radius-lg` / `--radius-xl` (`14px` / `rounded-xl`) — Form section panels, modal cards
*   `rounded-2xl` (`24px`) — Hero cards, large dialog windows
*   `--radius-full` (`9999px` / `rounded-full`) — Status badges, avatar circles, filter chips, navigation pills

---

## Elevation & Shadows

*   `shadow-2xs` / `shadow-xs`: Default for buttons, inputs, table container border shadow (`0 1px 2px rgba(15,23,42,0.04)`).
*   `shadow-sm`: Standard content cards (`0 1px 3px rgba(15,23,42,0.06)`).
*   `shadow-md`: Floating popovers, dropdown menus, user profile avatar (`0 4px 12px rgba(15,23,42,0.06)`).
*   `shadow-lg` / `shadow-xl`: Modal dialogs, off-canvas drawers, floating bulk action bar (`0 20px 40px rgba(15,23,42,0.14)`).

---

## Interaction States

*   **Hover**: Button background shift, scale `hover:scale-[1.02]`, table row highlight `hover:bg-slate-50/70`, `transition-all duration-150`.
*   **Focus**: Visible ring `focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1`.
*   **Active / Touch**: Button press scale feedback `active:scale-[0.98]`.
*   **Disabled**: Dimmed opacity `opacity-50` / `opacity-55`, `pointer-events-none cursor-not-allowed`.
*   **Loading**: Button label replaced with spinning `<Loader2 className="animate-spin" />` icon, table body displays animated shimmer skeletons.
*   **Entrance Motion**: `animate-fade-in` (`fadeIn 0.20s ease`), `animate-slide-in`, `animate-entrance` with `--anim-duration: 550ms`. Respects `prefers-reduced-motion`.

---

## Responsive Design & Breakpoints

*   **Desktop First (`lg: 1024px+`)**: Full desktop layout with persistent sidebar (`230px`), top header, and inline multi-column operations navigation.
*   **Tablet & Mobile (`<1024px`)**:
    *   Sidebar shifts off-canvas into a slide-over drawer (`w-[280px]`) toggled by hamburger menu.
    *   Operations quick-nav bar transforms into a horizontal scrollable strip below the header.
    *   Data tables automatically convert into stacked cards (`md:hidden`) displaying `mobilePriority` fields.

---

## Mobile App (React Native / Expo)

`frontend/mobile-app/mercon-app` is the Operator + Driver mobile app. It does **not** share the web dashboard's Tailwind/shadcn stack — its canonical design source is a plain RN token file, and screens are expected to read from it (via inline `style` props or `StyleSheet.create`) rather than hardcoding hex/shadow values or leaning on NativeWind's generic utility classes (`shadow-sm`, `bg-[#hex]`), which was the exact drift found and fixed on the Drivers list page (2026-09).

### Token Source (`src/theme/tokens.ts`)

All mobile screens should import `Colors`, `Spacing`, `Radius`, `Typography`, `Shadows` from this file. Never redeclare these values locally.

**Colors** (subset — see file for full neutral/semantic ramps):

| Token | Hex | Notes |
|---|---|---|
| `Colors.primary` | `#FA634E` (client-overridable via `app.config.ts` → `extra.brandColor`) | Matches the web dashboard's Coral Red — the mobile app's actual primary, **not** the `#E8450F` in `tailwind.config.js` (see Known Inconsistencies) |
| `Colors.primaryLight` / `primaryDark` | `#FFF0EB` / `#D94E38` | |
| `Colors.accent` | `#F24822` | Drivers-feature accent (status pills, "On Trip" banner) — intentionally distinct from `primary`, do not merge |
| `Colors.charcoal` / `charcoalDark` | `#3E3C3D` / `#2D2B2C` | Primary text, dark/executive surfaces — matches web's Dark Charcoal |
| `Colors.coolGray` | `#EEF1F6` | Card borders / canvas — matches web's Canvas Background |
| `Colors.success` / `warning` / `danger` / `info` | `#16A34A` / `#D97706` / `#DC2626` / `#2563EB` | Same semantic hexes as the web dashboard's semantic palette |

**Spacing** (8pt-ish grid): `xs 4 · sm 8 · md 12 · base 16 · lg 20 · xl 24 · 2xl 32 · 3xl 40 · 4xl 48 · 5xl 64`

**Radius**: `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · full 9999`

**Shadows** (named RN `shadow*`+`elevation` pairs — always use these, never a one-off inline shadow object):
| Token | shadowOffset | shadowOpacity | shadowRadius | elevation |
|---|---|---|---|---|
| `sm` | 0/1 | 0.06 | 3 | 2 |
| `md` | 0/4 | 0.08 | 12 | 4 |
| `lg` | 0/8 | 0.12 | 24 | 8 |
| `xl` | 0/12 | 0.16 | 32 | 12 |
| `primary` | 0/4 | 0.35 (colored `#E8450F`) | 12 | 6 | Coral CTA shadows |
| `nav` | 0/8 | 0.45 | 24 | 12 | Bottom tab bar |

### List / Card Pattern (established on the Drivers screen, reusable for Vehicles/Trips-style lists)

- **Search bar**: white pill, `Radius.lg`, `Shadows.sm`, `Colors.coolGray` border — not NativeWind's bare `shadow-sm` (that class has no real `shadowColor`/`elevation` and renders as an off-brand default shadow).
- **List card**: white, `Radius.xl` corners, `Shadows.sm`, `Colors.coolGray` 1px border, `Spacing.md` internal padding rhythm.
  - Header row: circular avatar (with status dot overlay) → name + status pill + secondary meta (phone) → an optional trailing quantity (e.g. trip count).
  - Divider (`Colors.coolGray`), then one or more **contextual info rows** (icon + text) for the item's operational state.
  - **Conditional warning chip(s)**: icon (`TriangleAlert`) + colored text (`Colors.warning`/`Colors.danger`), rendered *only* when the condition is actually true (e.g. license/document expiring within 30 days) — never shown as a permanent/empty row. Multiple warnings stack rather than collapsing into one generic line.
  - Full card surface is the primary tap target (opens details); nested interactive rows (e.g. an active-trip banner, the bottom action buttons) own their own tap handling and must not double-fire the card's navigation.
  - Footer: full-width row of 2 action buttons (`DriverActionButton`-style: icon + label, white, `Radius.md`, `Shadows.sm`, `Colors.gray100` border).
- **Loading skeletons must structurally mirror the real component** (same corner radius, avatar shape, row order, footer shape) — a skeleton built against an older card design causes a visible layout "pop" once real data replaces it. Keep skeleton and real component in sync whenever the card layout changes.
- **Icons**: `lucide-react-native`, same icon vocabulary as the web dashboard's `lucide-react` (e.g. `Truck`, `Navigation`, `TriangleAlert`, `FileText`).

---

## Known Design Inconsistencies

During the design system audit, the following inconsistencies and legacy deviations were identified for future cleanup:

1.  **Mobile App vs. Web Dashboard Brand Color Divergence** (still open as of 2026-09):
    *   `frontend/mobile-app/mercon-app/tailwind.config.js` (`mercon.DEFAULT`) still defines `primary` as `#E8450F` (an older orange), and `Shadows.primary` in `theme/tokens.ts` still uses that same `#E8450F` for its `shadowColor` (colored CTA shadow) — a leftover from before the token file was updated to `#FA634E`.
    *   `theme/tokens.ts`'s `Colors.primary` itself is already correct (`#FA634E`, matching the Web Dashboard's Coral Red) and is what components should — and increasingly do — import from; the divergence is specifically in the unused Tailwind config value and the one stale shadow color, not in the actual token values screens consume.
    *   Fix: update `tailwind.config.js`'s `mercon.DEFAULT` to `#FA634E` (or remove it if nothing still resolves classes from it — check usage first) and update `Shadows.primary.shadowColor` in `theme/tokens.ts` to `#FA634E`.
2.  **Legacy Dark Card Surfaces**:
    *   Older documentation specified `#1C1C2E` (Dark Navy Blue) for dark cards.
    *   The active codebase (`index.css`, `UI_GUIDELINES.md`, `Sidebar.tsx`) uses **Dark Charcoal (`#3E3C3D`)**.
3.  **Dual Button Implementations**:
    *   Both pure shadcn `<Button>` (`components/ui/button.tsx`) and custom wrapper `<Btn>` (`components/ui/Btn.tsx`) are present in `frontend/web-dashboard/src/components/ui/`, creating slight prop and variant overlap.
4.  **Border Radius Variations**:
    *   Visually equivalent container components alternate between `rounded-md` (6px), `rounded-lg` (10px), `rounded-xl` (12px/14px), and `rounded-2xl` (24px).
5.  **Hardcoded Tailwind Colors vs. Central CSS Tokens**:
    *   Components such as `StatusBadge.tsx` use hardcoded Tailwind utility classes (`bg-emerald-50 text-emerald-700`) rather than resolving values directly from CSS variable tokens or central helper theme functions.
