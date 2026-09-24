# MERCON — Project UI/UX & Engineering Guidelines

## 0. STRICT GIT BRANCHING & REMOTE PUSHING RULES
- **NEVER PUSH DIRECTLY TO `origin/dev` OR `origin/main` SERVER BRANCHES.**
- **ALL commits and pushes MUST be pushed ONLY to the `Adarsh` branch (`origin/Adarsh`) unless the USER explicitly specifies otherwise.**
- **Never push to `dev` or `main` server environments without explicit, written instruction from the USER.**

---

## 1. Purpose
This file is the single project-wide UI/UX & engineering reference for MERCON.

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

---

## 3. MERCON Visual System

### 3.1 Brand palette
The core MERCON palette is:
- **Coral Red**: `#FA634E`
- **Dark Charcoal**: `#3E3C3D`
- **Light Cool Gray**: `#EEF1F6`
- **White**: `#FFFFFF`

---

## 4. Mandatory Pre-Push Verification Checklist
Before pushing any commit to `origin/Adarsh`:
1. `cd backend/api-server && npx tsc --noEmit` (Must pass with 0 errors)
2. `cd frontend/web-dashboard && npx tsc -b` (Must pass with 0 errors)
3. Check `git status` for new Prisma migration SQL files and verify they are committed.
4. If modifying auto-increment sequence columns, ensure `SELECT setval(...)` is included.
5. **DO NOT push to `origin/dev` or `origin/main`. Only push to `origin/Adarsh`.**
