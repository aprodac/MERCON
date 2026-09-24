# MERCON — Project UI/UX & Engineering Guidelines

## 0. STRICT GIT BRANCHING & REMOTE PUSHING RULES
- **NEVER PUSH DIRECTLY TO `origin/dev` OR `origin/main` SERVER BRANCHES.**
- **ALL commits and pushes MUST be pushed ONLY to the `Adarsh` branch (`origin/Adarsh`) unless the USER explicitly specifies otherwise.**
- **Never push to `dev` or `main` server environments without explicit, written instruction from the USER.**

---

## 1. Purpose
This file is the single project-wide UI/UX reference for MERCON.

The goal is to make MERCON feel like one coherent, professional logistics operating system — not a collection of unrelated dashboard templates.

These rules apply to:
- dashboards
- operational screens
- ledgers
- forms
- detail pages
- master data
- dialogs
- drawers
- import workflows
- reports
- settings
- reusable components

The rules are guidelines, not a rigid page template.
**Choose the clearest interface for the user's task. Do not force every page into the same structure.**

---

## 2. Core Product Principles

### 2.1 User task first
Before building or redesigning a screen, determine:
- What is the user trying to accomplish?
- What information do they need first?
- What action should be easiest?
- What information can be progressively disclosed?
- What can be removed entirely?

*Do not start by copying an existing page layout.*

### 2.2 Remove before adding
When a screen feels cluttered:
- remove duplicate content
- remove unnecessary descriptions
- remove redundant badges
- remove unnecessary cards
- remove unnecessary tabs
- remove unnecessary filters
- remove unnecessary view switches
- then decide what needs to be added

*Do not solve clutter by adding another container or another section.*

### 2.3 No duplication
Never repeat the same information unnecessarily.

Examples:
- If the page already says `Commercial Quotations`, do not repeat `Commercial Quotations Module`, `Manage Commercial Quotations`, or `Commercial Quotations Ledger` unless each serves a genuinely different purpose.
- If a Kanban column is named `In Transit`, do not put `In Transit` on every card inside that column.
- If a customer is selected in a sidebar, do not repeat the same customer context in multiple large headers.

*Every piece of text should earn its space.*

---

## 3. MERCON Visual System

### 3.1 Brand palette
The core MERCON palette is:
- **Coral Red**: `#FA634E`
- **Dark Charcoal**: `#3E3C3D`
- **Light Cool Gray**: `#EEF1F6`
- **White**: `#FFFFFF`

#### Coral Red — `#FA634E`
Use for:
- primary actions
- active navigation
- important selected states
- important brand emphasis
- critical actions where appropriate

*Do not use Coral as a page background or flood the interface with it.*

#### Dark Charcoal — `#3E3C3D`
Use for:
- primary text
- headings
- navigation
- important values

#### Light Cool Gray — `#EEF1F6`
Use for:
- page backgrounds
- subtle surfaces
- inactive controls
- quiet separators
- low-emphasis containers

#### White
Use for:
- primary content surfaces
- cards where a card is actually needed
- inputs
- tables
- drawers/dialogs

### 3.2 Semantic colors
Semantic colors may be used when they communicate real meaning:
- **Green** = active / valid / healthy / completed
- **Amber** = warning / attention
- **Red** = critical / expired / failed
- **Blue / Indigo** = informational / secondary state

*Do not assign random colors simply to make the interface more colorful. Color must not be the only way a state is communicated.*

---

## 4. shadcn/ui — Maximum Reuse

### 4.1 Default rule
Use shadcn/ui components and existing project primitives as much as possible.
Before creating custom UI, check whether shadcn already provides the required interaction.

Prefer existing shadcn components such as:
- Button, Badge, Card, Input, Textarea, Label, Select, Combobox, Command, DropdownMenu, ContextMenu, Popover, Tooltip, Dialog, AlertDialog, Sheet, Drawer, Tabs, Accordion, Collapsible, Table, Checkbox, RadioGroup, Switch, Calendar, DatePicker, Pagination, Breadcrumb, Separator, Skeleton, Alert, Toast / Sonner, Progress, ScrollArea, Avatar, HoverCard.

*Use shadcn primitives as the foundation and customize their styling to match MERCON.*

### 4.2 Do not reinvent standard interactions
Do not create custom dropdowns, tooltips, dialogs, confirmation modals, tabs, selects, or popovers when an existing shadcn component can handle them.
If an existing component does not fit visually:
- customize the component rather than replacing the interaction pattern.

### 4.3 Reuse project components
Before creating a new component, inspect the existing component library.

Reuse:
- buttons, badges, inputs, filters, drawers, dialogs, table patterns, page headers, empty states, loading states, confirmation dialogs, route displays, status indicators.

*Do not create multiple versions of the same component with slightly different styling.*

---

## 5. Layout Philosophy

### 5.1 Compact and intentional
MERCON is a desktop-first operational system.

The UI should be:
- **Dense enough for work, clean enough to scan.**

Prefer:
- compact rows, efficient columns, clear grouping, predictable spacing, strong hierarchy, progressive disclosure.

Avoid:
- giant empty sections, oversized cards, excessive padding, excessive rounded containers, unnecessary vertical gaps, large explanatory paragraphs, nested scroll areas.

### 5.2 Less scrolling
Design screens so users can see the important information without unnecessary scrolling.

Prefer:
- horizontal organization when appropriate, compact table rows, side-by-side sections, drawers for contextual details, expandable rows, progressive disclosure, sticky headers where useful.

Avoid:
- long stacks of oversized cards, one-field-per-row forms when fields can logically sit together, huge headers, repeated section descriptions, deeply nested scroll containers.

---

## 6. Page Architecture
Pages should use only the sections necessary for the task.

A common pattern is:
- Global Application Shell
- Page Header (Title, Optional short context, Actions)
- Main Content (Primary workflow, Secondary information)
- Progressive detail when needed

*Do not automatically add scope selector, KPI cards, tabs, filters, or view switchers unless the page needs them.*

---

## 7. Application Shell

### 7.1 Global navigation
Keep the main navigation consistent. The global shell should communicate the application identity.

### 7.2 Do not repeat company identity
Do not place a large company/building icon, MERCON Logistics label, or fake company selector in every page header.
A company/scope selector should exist **only if the user can actually change scope**.
*Do not add UI just because an old template contained it.*

### 7.3 Page header
A good header communicates:
```
Back / Breadcrumb     Page Title

                       Secondary Action
                       Primary Action
```
Use a short subtitle only when it adds useful context. Never write a paragraph just to explain what an obvious page does.

---

## 8. Actions

### Primary action
Every workflow should have one clear primary action where applicable (e.g. `+ New Trip`, `+ New Quotation`, `+ Add Option`).
- Coral Red `#FA634E`
- clear label
- appropriate size
- not surrounded by competing filled buttons

### Secondary actions
Use outline, ghost, icon, or dropdown treatments for Export, Refresh, More, Import, View, Filter. Do not overload the header.

### Icon buttons
Use icon-only buttons only for actions users can reasonably understand. Always provide Tooltip and accessible label.

---

## 9. Cards & Containers
Cards are optional. Use a card when it creates meaningful grouping. Do not turn every section into a card.
Avoid nested cards (`Card -> Card -> Card -> Card`).
Prefer page background, subtle border, section divider, and whitespace before adding another card.

---

## 10. Typography & Copywriting
Use a clear hierarchy: Page title -> Section title -> Primary value -> Body -> Supporting metadata.
Do not use uppercase text everywhere. Uppercase is appropriate for small metadata labels, not major content.

### 10.1 Concise Titles & Zero Subtitle Clutter
- **No verbose titles or numbered prefixes**: Avoid artificial numbered step prefixes (e.g. `01 · `, `02 · `, `03 · `) or long phrase titles. Keep section titles concise, direct, and minimal (e.g. `Customer`, `Contract Terms`, `Commercial Routes`, `Origin`, `Destination`, `Surcharges`).
- **No unnecessary paragraph descriptions**: Do not add explanatory subtitle paragraphs under section headers or form cards (e.g. *"Optional extra fees (e.g. Same-Day Delivery, Labor Charges...)"*). Users understand standard logistics terminology without paragraph explanations cluttering the view.
- **Clean summary cards**: Display clear values (`1 Route`, `10 TON`, `Single Trip`) without redundant supporting metadata descriptions underneath every metric pill.

---

## 11. Search & Filters
Default pattern: `Search | Primary Filters | More Filters`
Only expose frequently used filters. Secondary filters belong in More Filters, Popover, or Sheet / Drawer.
Search placeholders should describe real searchable fields.

---

## 12. Tabs
Tabs represent meaningful contexts (e.g., `Overview | History | Surcharges | Documents`).
Do not use `All | Active | Inactive` tabs when a filter dropdown would be clearer.

---

## 13. View Switchers
A view switcher is allowed only when different views genuinely improve the task. Do not automatically add `List | Grid | Calendar | Kanban` unless needed. A single well-designed list/table is often better.

---

## 14. Tables / Ledgers
Use tables for record-heavy workflows.
- primary identity first
- important fields visible
- actions consistent
- concise headers
- no duplicate columns
- sensible density

The UI should represent the user's workflow, not the database schema.

---

## 15. Progressive Disclosure
Use progressive disclosure to reduce clutter (Collapsible, Accordion, Expandable table row, HoverCard, Tooltip, Popover, Sheet, Drawer, Dialog).
Essential information must not be hidden behind hover.

---

## 16. Sidebars / Drawers vs Detail Pages
Use a side panel / Sheet when the user needs quick inspection while keeping the list visible.
Use a detail page when the record is complex with multiple related sections.

---

## 17. Forms
Forms must follow the user's mental workflow, not expose the database schema directly.
Group related fields horizontally when screen width allows.

---

## 18. Empty / Loading / Error States
Empty states should be compact and actionable. Avoid long explanations.
Loading states should use shadcn Skeleton.

---

## 19. Dashboard Rules
A dashboard is not automatically a collection of four KPI cards. Use KPI cards only when metrics help the user make a decision.
Operational dashboards should prioritize actions, exceptions, live operational state, and important metrics.

---

## 20. Operator Dashboard
The operator dashboard should feel like an operational command center:
- Operator Action Center (prioritize delayed trips, missing POD, operational blockers)
- Important Reminders (group related compliance issues by owner/entity; do not repeat vehicle numbers on every child issue)

---

## 21. Trips
Trips are operational records. Prioritize trip identity, customer, route, driver, vehicle, current state, timing, and commercial rate.
Kanban: The column communicates status. **Do not put status badges on every trip card inside a status column.**

---

## 22. Commercial Quotations
Commercial Quotations are the source of commercial pricing truth.
Relationship: `Customer -> Commercial Quotation -> Route Rate Line -> Operational Trip`
Multi-stop routes: A source row like `RIYADH -> AL HASA + DMM + JUBAIL` represents one multi-stop commercial route with one rate.
Stop semantics: Use `Origin`, `Stop`, `Destination`. Do not invent Pickup/Dropoff semantics when the source does not specify them.
Quotation matching: Changing the route on a trip must trigger rate re-evaluation.

---

## 23. AI Import
Extraction + review workflow. Answer: What did AI extract? What did AI normalize? What needs review? What will be created?
Locations: Canonicalize against Location Master (`Location.id`). Do not create duplicates (`DMM`, `Dammam`, `DAMMAM`).
Driver charge: **Never fabricate driver charges.** If not specified, set `Driver Charge: —` (`NULL`). Never copy the billing rate.

---

## 24. Master Data / Taxonomy
Master Data is configuration, not analytics. It should feel like a controlled registry/settings page.
Primary groups: Vehicle Classes (`3–4 TON`, `5 TON`, `10 TON`, `20 TON`, `40 FEET`, custom), Line Types (`Single Trip`, `Round Trip`, `10 Hours Duty`, `12 Hours Duty`), Billing Types (`Monthly`, `Extra`).
**Do not call Monthly / Extra "Operation Types" when their meaning is billing type.**
Avoid meaningless KPI cards. Use compact configuration rows. Prefer deactivate/archive over deletion.

---

## 25. Locations
Locations are master data. Standalone Locations page is for bulk administration, geocoding, mapping, deduplication, and auditing. Otherwise, location management should be naturally available from quotation/trip workflows.

---

## 26. Surcharges
Keep surcharge rule UI compact. Accessible from quotation/customer commercial workflows.

---

## 27. Documents
Treat source documents as first-class records. Associate source documents with resulting quotations/agreements so users don't re-upload them.

---

## 28. Color / Badge System
Badges communicate meaningful states or categories — do not create a badge for every piece of text.
If taxonomy options have universal colors, configure them centrally and reuse them consistently.

---

## 29. Responsive Design
Desktop is the primary environment. At smaller widths, collapse secondary actions and move secondary filters into a Sheet.

---

## 30. Accessibility
Keyboard accessibility, visible focus, accessible names, sufficient contrast, non-color-only state communication.

---

## 31. Performance & Engineering
Do not sacrifice application performance for visual effects. Prefer efficient lists, virtualization, lazy loading. Avoid over-animation.

---

## 32. Data Integrity & Database Migrations
Protect quotation rates, history, route stops, canonical locations, driver charge `NULL` semantics. Enforce rules on the backend.

### 32.1 Database Schema Migrations & CI/CD
Whenever modifying `backend/api-server/prisma/schema.prisma` or making database DDL structure changes:
- **Always create an official Prisma migration folder** inside `backend/api-server/prisma/migrations/<timestamp>_<migration_name>/migration.sql`.
- **Never rely solely on inline node scripts or local DB alters** for schema changes.
- **Commit and push the migration folder to Git**, because the CI/CD pipeline (`ci-cd-dev.yml` / `ci-cd.yml`) executes `npx prisma migrate deploy` on server container startup. Without a migration SQL folder in Git, the remote deployment database will NOT be updated automatically.

---

## 33. Component Architecture
Prefer reusable components at the correct level: `Shared UI -> MERCON primitives -> Module components -> Page composition`.

---

## 34. Design Review Before Completion
Review every screen for Layout, Content, Components, Visual, Interaction, and Data correctness before declaring complete.

---

## 35. Agent Implementation Workflow
Understand business rules, identify primary user task, remove unnecessary UI, check shadcn components, minimize scrolling, keep first viewport useful.

---

## 36. What "Consistency" Means
Consistency means same visual language, same component behavior, same spacing principles, same typography, same semantic colors, and same interaction conventions — **not identical template cookie-cutters**.

---

## 37. Final Rule
Use the fewest UI elements necessary to make the user's job obvious.

```
clear > clever
compact > oversized
useful > decorative
reusable > duplicated
shadcn > reinvented
progressive disclosure > clutter
workflow > template
business correctness > visual polish
```
MERCON should feel like a serious, efficient logistics operating system — clean, dense, predictable, and easy to operate.

---

## 38. 502 Bad Gateway Troubleshooting & Prevention Rules

A **502 Bad Gateway** on `dev.mercon.tech` occurs when Nginx cannot proxy requests to the backend API container running on host port `3051`. Below are the 5 specific root causes, their official names, how they were resolved, and strict prevention rules.

### 38.1 Root Causes & Resolution Reference

#### 1. TypeScript Strict Compilation Failure (`Docker Container Build Crash`)
- **Name**: `Docker Container Build Failure (TypeScript Strict Mode)`
- **Cause**: Pushing code with TypeScript type errors (e.g. invalid type assignments in `mobileTripController.ts` or missing properties in `whatsappService.ts`) causes `RUN npm run build -w @mercon/api-server` to crash during Docker image build.
- **Symptom**: Docker fails to spawn container `mercon-dev-api`. Nginx gets connection refused on port `3051` -> **502 Bad Gateway**.
- **Fix**: Run `npx tsc --noEmit` locally in `backend/api-server` before pushing.
- **Prevention**: **Never push to `origin/dev` without verifying `npx tsc --noEmit` passes cleanly.**

#### 2. PostgreSQL Auto-Increment Sequence Desynchronization (`Sequence Desync`)
- **Name**: `PostgreSQL Auto-Increment Sequence Desynchronization`
- **Cause**: Adding `@default(autoincrement())` sequence columns (e.g. `quotation_number`) and backfilling existing records (`1..N`) without advancing the sequence pointer via `SELECT setval(...)`.
- **Symptom**: New `INSERT` queries try to use `nextval = 1`, resulting in duplicate key errors or container crash on startup -> **502 Bad Gateway**.
- **Fix**: Always append sequence synchronization to the migration file:
  `SELECT setval('"Quotation_quotation_number_seq"', COALESCE((SELECT MAX("quotation_number") FROM "Quotation"), 1));`
- **Prevention**: **Always call `setval()` after any SQL backfill on auto-increment columns.**

#### 3. Container Network Interface Isolation (`Loopback Binding`)
- **Name**: `Container Network Interface Isolation (127.0.0.1 Binding)`
- **Cause**: `httpServer.listen(port)` bound to `127.0.0.1` inside Docker container instead of `0.0.0.0`.
- **Symptom**: Container starts, but host Nginx proxy cannot connect to container port `3051` -> **502 Bad Gateway**.
- **Fix**: Bind Express server to `0.0.0.0`: `httpServer.listen(port, '0.0.0.0', ...)` in `src/index.ts`.
- **Prevention**: **All Dockerized Node servers MUST listen on `'0.0.0.0'`.**

#### 4. Ignored Prisma Migration SQL Files (`Dockerignore Exclusion`)
- **Name**: `Missing Prisma Migration SQL Artifacts (.dockerignore Exclusion)`
- **Cause**: `.dockerignore` ignoring `*.sql` files or migration folders, preventing container startup `npx prisma migrate deploy` from finding schema migrations.
- **Symptom**: Container crashes on startup when attempting to query missing columns -> **502 Bad Gateway**.
- **Fix**: Ensure `.dockerignore` contains `!**/prisma/migrations/**/*.sql` and strip UTF-8 BOM encoding from SQL files.
- **Prevention**: **Always verify migration folder is committed and un-ignored in `.dockerignore`.**

#### 5. Unused Variables breaking Build (`TS6133 Unused Parameter`)
- **Name**: `Strict TypeScript Build Failure (TS6133 Unused Parameter)`
- **Cause**: Unused function parameters (e.g. `url` in `getProxyTarget`) breaking `tsc -b` during workspace build.
- **Symptom**: Frontend build step fails in CI pipeline -> **502 Bad Gateway**.
- **Fix**: Remove unused parameters/imports and run `npx tsc -b` locally.
- **Prevention**: **Run `npx tsc -b` in `frontend/web-dashboard` before committing.**

---

### 38.2 Mandatory Pre-Push Verification Checklist
Before pushing any commit to `origin/ilan`:
1. `cd backend/api-server && npx tsc --noEmit` (Must pass with 0 errors)
2. `cd frontend/web-dashboard && npx tsc -b` (Must pass with 0 errors)
3. Check `git status` for new Prisma migration SQL files and verify they are committed.
4. If modifying auto-increment sequence columns, ensure `SELECT setval(...)` is included.

---

## 39. Default Git Branch & Pushing Guidelines

### 39.1 Default Target Branch
- **Primary Development & Push Branch**: From now on, all code changes, commits, and pushes must default to the `ilan` branch (`origin/ilan`).
- **Dev Synchronization**: Keep the `ilan` branch updated with `origin/dev` by pulling from `origin/dev` (`git pull origin dev`) before making major updates.
- **Default Push Behavior**: Do not push directly to `origin/dev` unless explicitly instructed; all automated and agent pushes must target `origin/ilan`.
