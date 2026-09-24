# MERCON Logistics Operating System — Product Requirements Document (PRD)

**Version**: 2.0 (Unified Enterprise Edition)  
**Date**: September 2026  
**Target Environment**: MERCON Logistics Services Company (Saudi Arabia Operations)  
**Timezone**: `Asia/Riyadh` | **Currency**: `SAR`  

---

## 1. Executive Summary & Product Vision

MERCON is a desktop-first, highly efficient logistics operating system designed for Saudi Arabia inland transportation and fleet management. Built on a **Trip-Centric Architecture**, the platform connects commercial rate management, driver dispatch, canonical location indexing, AI-powered document extraction, real-time vehicle telemetry, and operator exception management into a unified workspace.

The primary goal of MERCON is to provide a clean, high-density, low-friction command center for dispatchers and operators while providing a seamless mobile workflow for drivers and robust regulatory compliance with Saudi transportation authority requirements (WASL / ICCES).

---

## 2. Core User Roles & Access Control (RBAC)

The system strictly enforces role-based permissions across four primary user personas:

| Role | Access Scope | Key Capabilities |
| :--- | :--- | :--- |
| **SuperAdmin** | Full Platform & Deployment Control | Deployment settings, system branding, global taxonomy, database backups, audit log review, role assignment. |
| **Admin** | System Administration | Master data management, user account management, document requirement configuration, reporting setup. |
| **Operator** | Dispatch & Operations Center | Day-to-day trip dispatch, driver/vehicle assignment, quotation matching, live tracking, delay reason logging, surcharge settlement. |
| **Driver** | Mobile Driver Application | Auth via Mobile + License/PIN, single active trip view, pre-departure checklist, cargo photo upload, geofenced arrival, POD photo upload, emergency alerts. |

---

## 3. Product Principles & UI/UX Standards

1. **User Task First**: Interfaces prioritize immediate operational actions over decorative visuals.
2. **Remove Before Adding**: Redundant badges, verbose descriptions, and artificial step numbers (e.g., `01 ·`, `02 ·`) are strictly omitted.
3. **Desktop-First Operational Density**: Compact rows, clear column alignment, horizontal field grouping, and sticky actions to minimize vertical scrolling.
4. **Color Palette Semantics**:
   - **Coral Red (`#FA634E`)**: Primary actions, active navigation highlight, critical brand emphasis.
   - **Dark Charcoal (`#3E3C3D`)**: Primary text, headings, dark surfaces.
   - **Light Cool Gray (`#EEF1F6`)**: Page backgrounds, neutral container surfaces.
   - **White (`#FFFFFF`)**: Primary content cards, inputs, tables, drawers.

---

## 4. Key Operational Modules & Specifications

### 4.1 Operator Action Center & Dashboard
- **Operator Action Center**: Prioritizes urgent operational blockers, including:
  - Delayed trips awaiting explanation (`delay_reason`).
  - Completed trips missing Proof of Delivery (`POD`).
  - Vehicle maintenance or document expiry blockers.
- **Entity Compliance Radar**: Grouped entity reminders for expiring driver licenses, vehicle registrations, and WASL permits.

### 4.2 Commercial Quotations & Pricing Engine
- **Pricing Hierarchy**: `Customer -> Commercial Quotation -> Route Rate Line -> Operational Trip`.
- **Multi-Stop Routes**: Supports multi-stop corridors (e.g., `RIYADH -> AL HASA + DMM + JUBAIL`) represented as a single commercial route with one agreed billing rate.
- **Stop Semantics**: Strict `Origin`, `Stop`, `Destination` taxonomy.
- **Dynamic Rate Matching**: Modifying a trip's route dynamically re-evaluates applicable customer quotations.
- **Driver Charge Null Semantics**: **Driver charges are never auto-fabricated or copied from billing rates.** Unspecified driver charges default to `NULL` (`—`).

### 4.3 Trip Management & Lifecycle State Machine
- **Trip State Machine**: `Draft` -> `Scheduled` -> `Loading` -> `InTransit` -> `Delayed` -> `Completed` -> `Invoiced` (or `Cancelled`).
- **Contingency & Replacement Auditing**: Dispatch replacement of vehicle or driver logs immutable `TripAssignmentEvent` audit records (`original_vehicle_id`, `original_driver_id`, `contingency_reason`).
- **Third-Party Subcontracting**: Support for third-party rental carriers (`TripSubcontract`, `ThirdPartyProvider`, `ProviderRateCard`) with separate subcontract cost tracking.

### 4.4 Canonical Location Master & Deduplication Engine
- **Canonical Locations**: Every location belongs to a customer (`customerId`, `code`, `slug`) and stores exact GPS coordinates, address, and coordinate precision (`EXACT`, `APPROXIMATE`, `UNKNOWN`).
- **Deduplication**: Automatically normalizes variant spellings (e.g., `DMM`, `Dammam`, `DAMMAM`) against `Location.id`.

### 4.5 AI Import & Normalization Workflow
- **Multi-File Document & Invoice Import**: Batch uploading of vehicle, driver, or trip documents processed via OCR/AI extraction.
- **Proposal Review Table**: Displays AI confidence level (`HIGH`, `MEDIUM`, `LOW`, `NONE`) and proposed owner match. Operators accept, modify, or reject proposals before committing to real `Document` records.

### 4.6 Master Data & Taxonomy Management
- **Vehicle Classes**: `3–4 TON`, `5 TON`, `10 TON`, `20 TON`, `40 FEET`, custom.
- **Line Types**: `Single Trip`, `Round Trip`, `10 Hours Duty`, `12 Hours Duty`.
- **Billing Types**: `Monthly`, `Extra` (strictly designated as billing types, not operation types).
- **Vehicle Compatibility Rules**: Configurable compatibility mapping (`VehicleCompatibilityRule`) between requested rate class and assigned asset class.

### 4.7 Mobile Driver Workflow & Geofencing
- **Single Active Trip Paradigm**: App opens directly to active trip if assigned.
- **Pre-Departure Checklist**: Driver uploads cargo photo before trip transitions to `InTransit`.
- **Automatic Geofenced Arrival**: Detects arrival at destination using a 500-meter GPS radius.
- **Delivery Verification (POD)**: Mandatory POD photo upload required to complete trip.
- **Emergency / Halted Signaling**: Drivers can flag emergencies, immediately transmitting current lat/lng to the Operator Dashboard.

### 4.8 Telemetry & Regulatory Integrations (ICCES / WASL)
- **Live GPS Streaming**: Low-latency WebSocket streaming over Socket.io every 10 seconds.
- **Dual Tracking**: Driver mobile GPS acts as primary source; ICCES vehicle hardware acts as secondary hardware backup.

---

## 5. Non-Functional Requirements

- **Performance**: Dashboard table rendering under 100ms for up to 1,000 active records using optimized React queries.
- **Data Integrity**: Soft deletes (`deletedAt`) across all operational entities.
- **Security & Privacy**: Role-based JWT authentication, password-hash enforcement, strict exclusion of secrets from audit logs.
