# STACK.md — Stagcore

**Companion docs:** PRD.md (what's being built), DESIGN.md (visual/UX spec), AGENTS.md (agent guidance & invariants). This file is the map for an agentic coder — concrete stack choices, local development setup, and literal build order.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | Next.js + TypeScript | App Router, standalone Node output |
| Styling / UI | Tailwind CSS + shadcn/ui | Tokens from DESIGN.md wired as CSS variables |
| Frontend hosting | **Railway** | Runs Next.js as a persistent Node service in the same project |
| Backend framework | FastAPI (Python 3.11+) | REST API |
| Backend hosting | **Railway** | Persistent containerized FastAPI service |
| Database | **Neon (PostgreSQL)** | Serverless Postgres; connection pooling for API runtime, direct connection for migrations |
| ORM | SQLAlchemy | |
| Migrations | Alembic | |
| Validation | Pydantic v2 | |
| Auth | JWT / session-based | Issued by FastAPI, verified on every request; `business_id` scoping enforced server-side per PRD.md |
| File storage | **Cloudflare R2** (S3-compatible) | Product images, device photos (via `boto3`, $0 egress) |
| Deployment packaging | Docker / Nixpacks | Unified Railway project with independent service triggers |

## Architecture & Hosting Model

- **Single Hosting Platform (Railway):** Both Next.js (Frontend) and FastAPI (Backend) run as distinct services within a single Railway project.
  - Server-side calls from Next.js (SSR / Server Components) can reach FastAPI internally over Railway's private mesh network (`http://backend.railway.internal:8000`).
  - Client-side browser requests (POS sales, live scanning) reach FastAPI over public HTTPS.
- **Database (Neon PostgreSQL):**
  - **Runtime API Traffic:** Uses the pooled connection string (`DATABASE_URL`, hostname with `-pooler`).
  - **Alembic Migrations:** Uses the unpooled/direct connection string (`DATABASE_URL_UNPOOLED`) to avoid PgBouncer session state conflicts.
- **Object Storage (Cloudflare R2):** S3-compatible bucket for receipt PDFs, product photos, and device attachments with zero egress fees.

**Explicitly deferred past v1:** Redis, offline-first sync/local IndexedDB, native mobile apps, microservices, AI/forecasting services.

---

## Local Development & Testing Workflow (Primary Focus)

All development and testing happens locally on your machine before any cloud deployment.

### 1. Directory Structure
```
stagcore/
├── backend/                  # FastAPI service
│   ├── app/
│   │   ├── api/              # Route handlers (v1)
│   │   ├── core/             # Config, security, database session
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic (InventoryService, etc.)
│   │   └── main.py           # FastAPI entrypoint
│   ├── alembic/              # DB migrations
│   ├── tests/                # Pytest suite
│   └── requirements.txt
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/              # App router pages & layouts
│   │   ├── components/       # UI components (shadcn/ui + custom)
│   │   └── lib/              # API client, token helpers, utils
│   ├── package.json
│   └── tailwind.config.ts
├── STACK.md
├── PRD.md
├── DESIGN.md
└── AGENTS.md
```

### 2. Backend Local Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run migrations (against local Postgres or Neon dev branch)
alembic upgrade head

# Start backend dev server (hot-reload)
uvicorn app.main:app --reload --port 8000
```
- API root: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

### 3. Frontend Local Setup
```bash
cd frontend
npm install

# Start frontend dev server
npm run dev
```
- Web UI: `http://localhost:3000`
- Configured via `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8000`

### 4. Running Tests
- **Backend tests:** Run `pytest` from the `backend/` directory. Fast unit tests can run against an in-memory SQLite database or isolated test schema.
- **Frontend tests & checks:** `npm run lint` and `npm run build` from `frontend/`.

---

## Recommended Skills & MCP Connectors

- **Skills:**
  - `neon` / `neon-postgres` — guidance for connection pooling, branching, and migration workflows on Neon.
  - `frontend-design` — UI screen design following `DESIGN.md` tokens.
- **MCP Connectors (for cloud deployments later):**
  - **Railway** — trigger deployments and inspect logs.
  - **Neon** — manage dev branches and pull connection strings directly.

---

## MVP Phase Breakdown (build order for the coding agent)

Mirrors PRD.md's milestones — literal implementation order, one vertical slice at a time. Implement and verify each phase locally before starting the next:

1. **Phase 1 — Foundation.** Auth (`/auth/register`, `/auth/login`, `/auth/me`), Business creation, User/role system (OWNER/MANAGER/CASHIER/INVENTORY_CLERK), `BusinessFeature` table + admin-panel toggle UI. Verify: can register, log in, see an empty dashboard, and flip a feature flag as Platform Admin.
2. **Phase 2 — Core entities.** Products (non-serialized), Devices (serialized), Categories, Suppliers, Customers. Verify: CRUD works and every row is correctly scoped to `business_id`.
3. **Phase 3 — Inventory engine.** `InventoryService` (receive_stock, sell_stock, adjust_stock, return_stock, get_current_stock), `InventoryMovement` ledger, Locations table. Verify: stock is never writable directly — only through the service, and every change produces a ledger row.
4. **Phase 4 — Purchasing.** `Purchase`/`PurchaseItem`, goods receiving for both products and devices (device receiving creates individual `Device` rows with serial/IMEI). Verify: receiving a purchase increases stock via a movement, not a direct field edit.
5. **Phase 5 — Sales / POS.** `Sale`/`SaleItem`, Payments (Cash/MoMo/Card only — no credit/installment in v1), device sale flow (picker by serial/IMEI, not quantity). Verify: completing a sale is atomic with its inventory movement/device status change.
6. **Phase 6 — Dashboard & Reports.** Today's sales/profit/inventory value, low-stock alerts, basic Sales/Inventory/Profit/Product-performance/Supplier reports.
7. **Phase 7 — Warranty & Repairs.** Auto-created warranty record on device sale (per-category default length, overridable), claim flow. Repairs module including walk-in devices (`device_id` nullable). Both gated behind their `BusinessFeature` flags.
8. **Phase 8 — Barcode/IMEI scanning, returns, stock transfers.** Phone-camera-based scanning for pilot (no dedicated hardware assumed yet); stock transfers between locations if the pilot shop turns out to be multi-branch.
9. **Phase 9 — Inventory intelligence.** Average sales velocity, stockout estimate, recommended reorder point — only after Phases 1–8 are reliable in the pilot shop.

**First demo milestone:** Login → Dashboard → Products/Devices → Purchases → Sales → Inventory ledger → Stock level, working end-to-end locally.
