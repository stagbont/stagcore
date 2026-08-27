# PRD.md — Stagcore

**Companion docs:** DESIGN.md (visual/UX spec), STACK.md (tech stack + build order for coding agent) — build those next if not already generated. This file is the entry point.

## Overview

Stagcore is an inventory + POS system built specifically for small-to-medium independent gadget/electronics shops (phones, laptops, tablets, accessories, repairs) with 1–3 branches. It is not a generic inventory CRUD app — the product is scoped around two facts that generic tools miss: (1) phones and laptops are serialized units that need per-device tracking (IMEI/serial, cost, warranty, buyer), while accessories are quantity-based; (2) stock levels must be derived from an immutable inventory ledger, never edited directly, so an owner can always answer "why do I have 14 instead of 20?"

Target customer: an independent gadget shop owner currently using Excel, WhatsApp, paper, or a generic POS, who cannot answer "which exact phone did we sell?" or "is this customer's warranty still active?" in under a minute.

## Goals

- Ship a working vertical slice — create business → add product/device → receive stock → sell → stock decreases → dashboard reflects it — before any UI polish.
- Support both serialized (IMEI/serial-tracked) and non-serialized (quantity-tracked) inventory from day one; this is the core differentiator, not a v2 add-on.
- Every stock change must be traceable to an `InventoryMovement` record. No code path may write to a stock/quantity field directly.
- Multi-tenant from day one (`business_id` on every business-owned table), even though v1 ships to one pilot shop.
- Validate with one real pilot shop (design partner) before building a second business-specific feature.

## Non-Goals (v1)

- Accounting, payroll, HR, CRM, e-commerce, business financing
- AI forecasting / demand prediction
- Offline-first POS with local sync (only build if the pilot shop proves unreliable internet is a blocker)
- Native mobile apps
- Multi-country tax handling
- Marketplace integrations, WhatsApp automation
- Complex multi-step purchasing approval workflows

## User Personas

0. **Platform Admin** (Bob / Stagcore operator) — not a member of any business. Controls which modules are enabled per business via an admin panel. Not gated by pricing tier — all modules available to every business, admin decides what's switched on for each one based on that business's actual need.
1. **Owner** — full access, views profit, manages users, sets reorder levels.
2. **Manager** — day-to-day operations, sees profit, cannot manage users.
3. **Cashier** — makes sales, views inventory, no cost/profit visibility.
4. **Inventory Clerk** — adds products/devices, adjusts stock, purchases stock, no sales, no profit visibility.

## User Stories

- As **Platform Admin**, I want to enable or disable modules (Warranty, Repairs, Multi-location, Barcode scanning, etc.) per business from an admin panel, so each shop only sees what it actually needs.
- As an **Owner**, I want to see today's sales, gross profit, and low-stock items the moment I open the dashboard.
- As an **Inventory Clerk**, I want to scan or type an IMEI when receiving a phone shipment so the device is tracked individually from the moment it enters stock.
- As a **Cashier**, I want to search a product or scan a barcode, add it to a sale, take payment, and complete the sale in under 30 seconds.
- As an **Owner**, I want to type an IMEI into search and immediately see purchase cost, sale price, buyer, sale date, and warranty status for that exact unit.
- As a **Manager**, I want a low-stock list with recommended reorder quantities so I know what to order before I run out.
- As an **Owner**, I want to open a supplier and see total purchases, outstanding balance, and products supplied.
- As a **Cashier**, I want to record a customer's name and phone number at time of sale without filling a long form.

## Functional Requirements

### Auth & Tenancy
- Register creates: `User` + `Business` + `BusinessUser` (role = owner).
- Every business-owned table carries `business_id`; every query is scoped to it. Complete tenant isolation — no cross-business queries, ever.
- Roles: OWNER, MANAGER, CASHIER, INVENTORY_CLERK. Permission matrix:

| Action | Owner | Manager | Cashier | Clerk |
|---|---|---|---|---|
| View inventory | ✓ | ✓ | ✓ | ✓ |
| Add products/devices | ✓ | ✓ | | ✓ |
| Make sale | ✓ | ✓ | ✓ | |
| Purchase stock | ✓ | ✓ | | ✓ |
| Adjust stock | ✓ | ✓ | | ✓ |
| View profit | ✓ | ✓ | | |
| Manage users | ✓ | | | |

### Feature Flags (Platform Admin control)
- Every module beyond the core (Products, Devices, Inventory, Purchases, Sales, Dashboard, basic Reports) is togglable per business: `BusinessFeature(business_id, feature_key, enabled)`.
- Togglable features: `warranty`, `repairs`, `multi_location`, `barcode_scanning`, `suppliers`, `customers`, `advanced_reports`. Core inventory/sales/purchasing flow is never toggled off — it's the product foundation.
- Only Platform Admin (Bob) can flip these — via a separate admin panel, not exposed in the business's own settings UI. No self-service toggle for owners/managers.
- Not tied to pricing tier — every business has access to every feature; Platform Admin decides what's switched on per business based on that business's actual workflow (e.g. a phone-only shop with no repairs desk gets `repairs` off).
- Disabled features must be fully hidden from nav/UI for that business, not just disabled-but-visible. Toggling `repairs` off, for example, removes the Repairs module from menus and blocks its API routes for that business_id — existing repair records aren't deleted, just inaccessible until re-enabled.
- Toggling should not require redeploying the app — flags are read at request time from the `BusinessFeature` table, not baked into config.

### Products (non-serialized: accessories, cables, chargers, cases, etc.)
Fields: name, SKU, barcode, category_id, brand, cost_price, selling_price, current_quantity (derived, read-only), minimum_stock_level, supplier_id, unit_of_measurement, status (active/inactive), product_image.

### Devices (serialized: phones, laptops, tablets, some watches/consoles)
Fields: product_name/model, serial_number, IMEI (nullable — not all devices have one), category_id, brand, spec attributes (RAM, storage, condition, battery_health — flexible/JSON), cost_price, selling_price, supplier_id, status (in_stock / sold / in_repair / returned), business_id, location_id.
- A device is a single trackable unit, not a quantity. "Stock" for a serialized product = count of devices with status `in_stock`.

### Inventory Ledger
- No table stores an editable `quantity` as source of truth for non-serialized products. Every change is an `InventoryMovement` row: `id, product_id, type, quantity, reference, unit_cost, created_by, created_at, notes`.
- Movement types: `PURCHASE, SALE, CUSTOMER_RETURN, SUPPLIER_RETURN, DAMAGE, LOSS, ADJUSTMENT_IN, ADJUSTMENT_OUT, TRANSFER_IN, TRANSFER_OUT`.
- Current stock for a non-serialized product = sum of its movements. For serialized products, the "movement" is a status transition on the `Device` row plus a corresponding ledger entry for reporting consistency.

### Purchasing
- `Purchase`: supplier_id, purchase_date, invoice_reference, payment_status, business_id.
- `PurchaseItem`: purchase_id, product_id OR device_id, quantity (for products) or serial/IMEI list (for devices), unit_cost.
- Receiving a purchase creates `InventoryMovement` (type=PURCHASE, +qty) for products, or creates `Device` rows with status=in_stock for serialized items.

### Sales / POS
- `Sale`: customer_id (nullable), salesperson_id, payment_method, sale_date, business_id, location_id.
- `SaleItem`: sale_id, product_id OR device_id, quantity (products only — always 1 for devices), selling_price, discount.
- Completing a sale creates `InventoryMovement` (type=SALE, -qty) for products, or sets `Device.status = sold` + records buyer/date for devices. A completed sale must never reduce stock without this movement/status-change existing in the same transaction.
- Payment methods (v1): Cash, Mobile Money, Card. No credit/installment sales in v1 — confirmed pilot shop is cash/MoMo/card only. Credit and installment stay out of scope until a shop that needs them comes on.

### Warranty
- Warranty length is set per **category**, not globally (e.g. phones = 12 months, laptops = 6 months) — `Category.default_warranty_months`. Overridable per sale for edge cases (used/refurbished units, supplier terms).
- Auto-created on device sale: `WarrantyClaim`-eligible record with warranty_months (from category default, overridable at sale time), expires_at = sale_date + warranty_months.
- Claim flow: create claim → identify device (by IMEI/serial) → check warranty validity → record diagnosis → resolution (repair/replace/reject) → close.

### Repairs
- Walk-in repairs are in scope for v1 — the shop accepts repairs for devices it did not sell, not only its own sold units.
- `Repair`: customer_id, device_id (nullable — null when the device wasn't sold by this shop, i.e. a walk-in), device_description (free text, used when device_id is null — model/IMEI as given by the customer), problem_description, technician_id, status (received → diagnosis → awaiting_parts → repairing → ready_for_pickup → collected), estimated_cost, actual_cost.

### Suppliers
Fields: name, phone, email, address, business_id. Derived views: total purchases, outstanding balance, products supplied, last purchase date.

### Customers
Fields: name, phone, email, business_id. Derived views: purchase history, repair history, warranty claims, outstanding balance (for credit sales).

### Dashboard
Today's sales, today's gross profit, inventory value, low-stock count, warranty claims open, repairs active, top-selling products, low-stock list with reorder recommendation, today's activity feed (recent movements/sales/purchases).

### Reports
Sales (today/week/month/custom), Inventory (current stock, low-stock, out-of-stock, valuation, movement history), Profit (revenue, COGS, gross profit, discounts, returns), Product performance (best-selling, slow-moving, most profitable), Supplier report (purchases by supplier, outstanding balances).

## Data Model (core tables)

`businesses, users, business_users, roles, business_features, products, devices, categories, units, suppliers, customers, sales, sale_items, purchases, purchase_items, inventory_movements, payments, warranty_claims, repairs, locations, stock_transfers, audit_logs`

Central relationship — the architectural rule the whole system depends on:

```
Product/Device ── Purchase
              ── Sale
              ── Adjustment
              ── Return
                   ↓
            InventoryMovement / Device.status
                   ↓
               Stock Level (derived, never stored as truth)
```

## Tech Stack

See STACK.md. Decided already: Next.js + TypeScript + Tailwind + shadcn/ui (frontend), FastAPI + Python (backend), Neon PostgreSQL + SQLAlchemy + Alembic (DB/migrations), Cloudflare R2 (S3 storage), Railway (unified deployment platform), JWT/session auth, Pydantic validation. Redis, offline sync, and mobile apps are explicitly deferred past v1. Local development is the primary priority during build.

## Non-Functional Requirements

- Complete tenant isolation on every business-owned query (no cross-tenant leakage, tested explicitly).
- Every completed sale/purchase must be atomic with its inventory movement — no partial states where a sale exists but stock wasn't decremented, or vice versa.
- IMEI/serial search must return a full device history (purchase → sale → warranty → repairs) in one query, not multiple manual joins by the user.
- System must remain usable by a cashier with no accounting background — no double-entry concepts exposed in the UI.
- Feature-flag checks must happen server-side on every route/query, not just hidden client-side — a disabled feature's API must reject requests, not merely hide the button.

## MVP Milestones

1. **Phase 1** — Auth, Business creation, User/role system, `BusinessFeature` table + admin-panel toggle UI (build this early — every later module checks its own flag before rendering/routing)
2. **Phase 2** — Products, Devices (serialized), Categories, Suppliers, Customers
3. **Phase 3** — Inventory ledger engine (`InventoryService`: receive_stock, sell_stock, adjust_stock, return_stock, get_current_stock), Locations
4. **Phase 4** — Purchasing + goods receiving (products and devices)
5. **Phase 5** — Sales/POS (products and devices), Payments
6. **Phase 6** — Dashboard, basic Reports, low-stock alerts
7. **Phase 7** — Warranty claims, Repairs module
8. **Phase 8** — Barcode/IMEI scanning via phone camera, Returns, Stock transfers between locations
9. **Phase 9** — Inventory intelligence: average sales velocity, stockout estimate, recommended reorder point

First milestone to demo to the pilot shop: Login → Dashboard → Products/Devices → Purchases → Sales → Inventory ledger → Stock level, working end-to-end, before any dashboard polish.

## Open Questions

- **Locations** — not yet confirmed whether the pilot shop runs 1 location or 2–3 branches. Architecture ships with `Location` as a first-class table regardless (per the multi-location design principle — model inventory as Product/Device → Location → Stock, not one global quantity), so this doesn't block Phase 3. Confirm with owner before Phase 8 (stock transfers) is scoped, since that phase only matters if branches exist.
- **Barcode scanning hardware** — not yet confirmed whether phone camera scanning is sufficient or a dedicated scanner is needed. Default to phone camera for the Phase 8 pilot build (cheaper, no procurement delay); revisit if the owner reports scan reliability issues during the pilot.
