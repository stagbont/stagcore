# AGENTS.md

Guidance, architectural standards, and critical invariants for agents working in the Stagcore codebase.

## System Architecture

- **Deployment Target (Unified Railway Project):**
  - **Frontend:** Next.js (App Router, TypeScript, Tailwind CSS, shadcn/ui) deployed to **Railway** as a persistent Node service.
  - **Backend:** FastAPI (Python 3.11+, SQLAlchemy, Alembic, Pydantic) deployed to **Railway** as a persistent containerized service.
  - **Database:** **Neon (PostgreSQL)** (serverless with connection pooling and branching).
  - **File Storage:** **Cloudflare R2** (S3-compatible via `boto3`, $0 egress fees) for product imagery and device attachments.
  - **Internal Network:** Server-side Next.js calls reach FastAPI via Railway private mesh; client browser requests call FastAPI over public HTTPS.

## Local Development & Testing (Priority Workflow)

Local execution is completely decoupled from cloud hosting. Develop and verify locally first:

- **Directory Layout:**
  - `backend/`: FastAPI application, Alembic migrations, Pytest suite.
  - `frontend/`: Next.js App Router application, UI components, Tailwind/shadcn.
- **Backend Dev Server:**
  ```bash
  cd backend
  source .venv/bin/activate
  uvicorn app.main:app --reload --port 8000
  ```
  - Swagger Docs: `http://localhost:8000/docs`
- **Frontend Dev Server:**
  ```bash
  cd frontend
  npm run dev
  ```
  - UI: `http://localhost:3000` (points to `NEXT_PUBLIC_API_URL=http://localhost:8000`)
- **Database & Migrations:**
  - **FastAPI Runtime:** Connects via pooled connection (`DATABASE_URL`).
  - **Alembic Migrations:** Connects via direct/unpooled connection (`DATABASE_URL_UNPOOLED`) to avoid PgBouncer session state conflicts.
  - Command: `alembic upgrade head` from `backend/`.
- **Testing & Verification:**
  - Run backend unit/integration tests: `pytest` from `backend/`.
  - Frontend typecheck/lint: `npm run lint` and `npm run build` from `frontend/`.

## Core Domain Invariants & Rules

- **Immutable Inventory Ledger (Never Edit Stock Directly):**
  - No database table stores a directly editable stock quantity as source of truth.
  - Non-serialized product stock is derived dynamically by summing `InventoryMovement` records.
  - Serialized items (`Device`) are tracked as individual units with status transitions (`in_stock`, `sold`, `in_repair`, `returned`) plus corresponding ledger entries.
  - All stock adjustments must pass through `InventoryService` and execute atomically within the same transaction as the triggering action (sale, purchase, adjustment, return).
- **Strict Multi-Tenancy:**
  - Every business-owned database table must have a `business_id` column.
  - Every query and mutation must enforce `business_id` scoping. Cross-tenant queries are strictly prohibited.
- **Feature Flags (Platform Admin Controlled):**
  - Optional modules (`warranty`, `repairs`, `multi_location`, `barcode_scanning`, `suppliers`, `customers`, `advanced_reports`) are stored in `BusinessFeature` and controlled only by Platform Admin.
  - Enforcement must be server-side on every route (reject requests when toggled off), not just hidden in the UI.
  - UI navigation must completely omit disabled modules (never render them grayed out or locked).
- **Sales & Warranties:**
  - Serialized devices are sold by selecting specific IMEI/serial units (quantity is always 1 per device line item).
  - Device sales auto-create warranty records defaulting to `Category.default_warranty_months` (overridable at point of sale).
- **Repairs:**
  - Support walk-in repairs for items not sold by the store (`Repair.device_id` is nullable; uses `device_description` when null).

## UI & Design Conventions

- **Tokens & Styling:**
  - Strictly use semantic color tokens mapped to CSS variables (`globals.css`) per `DESIGN.md`. Never hardcode raw hex values in components.
  - Blue (`action-primary`) is strictly reserved for interactive actions, links, and focus rings—never for decorative fills or backgrounds.
  - Elevation is achieved via `border-hairline` borders rather than heavy drop shadows (shadows reserved for modals and popovers).
  - All numeric data (prices, stock quantities, IMEIs, serials) must use `font-variant-numeric: tabular-nums`.
  - Tablet/touch controls (POS buttons, keypads) must maintain a minimum 44×44px hit target.

## Out of Scope for v1 (Do Not Introduce)

- No Redis or caching layer.
- No offline-first sync or IndexedDB persistence.
- No credit or installment payment schemes (Cash, Mobile Money, and Card only).
- No native mobile apps or AI demand forecasting.

## Implementation Order

Follow the vertical slice build order from `STACK.md` / `PRD.md`:
1. **Phase 1 — Foundation:** Auth, Business & Role management, `BusinessFeature` table & Admin toggle UI.
2. **Phase 2 — Core Entities:** Products, Devices (serialized), Categories, Suppliers, Customers.
3. **Phase 3 — Inventory Engine:** `InventoryService`, `InventoryMovement` ledger, Locations.
4. **Phase 4 — Purchasing:** Purchases, Purchase Items, Goods Receiving (Products & Devices).
5. **Phase 5 — Sales / POS:** Sales, Sale Items, Payments, Atomic stock/device state updates.
6. **Phase 6 — Dashboard & Reports:** Low-stock alerts, Daily sales/profit summaries, Core reports.
7. **Phase 7 — Warranty & Repairs:** Warranty claims flow, Walk-in & sold device repairs.
8. **Phase 8 — Scanning & Transfers:** Phone camera barcode/IMEI scanning, Stock transfers.
9. **Phase 9 — Inventory Intelligence:** Velocity, Stockout estimates, Reorder point calculations.
