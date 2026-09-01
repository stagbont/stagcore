"""
Realistic 30-day demo seed for Stagcore Flagship Store.

Story: 30 days at a Ghanaian gadget shop — stocking, sales ramp,
peak week, edge cases (low/out/critical stock, returns, transfers,
warranty claims, repairs FSM). See plan.md for full narrative and
target volumes.

Invariants:
- All stock via InventoryService / SalesService / PurchasingService
  (API receive/sell/adjust/transfer/return) — never direct quantity edits.
- Every row business_id = demo business (strict multi-tenancy).
- Idempotent wipe: deleting only the demo business partition on --reset.
- All 7 feature flags enabled so every nav group shows.

Usage:
  python scripts/seed_demo_data.py              # wipe + seed (default)
  python scripts/seed_demo_data.py --no-reset  # upsert (no wipe)
  python scripts/seed_demo_data.py --today-only # minimal fast path (legacy 4 sales)
"""
import argparse
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx

sys.path.insert(0, os.path.abspath("backend"))

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

DEMO_USER = {
    "name": "Alex Morgan",
    "email": "demo@stagcore.local",
    "password": "Password123!",
    "business_name": "Stagcore Flagship Store",
    "business_slug": "stagcore-flagship",
}

TEAM_USERS = [
    {"name": "Kwesi Mensah", "email": "manager@stagcore.local", "password": "Password123!", "role": "MANAGER"},
    {"name": "Ama Owusu", "email": "cashier@stagcore.local", "password": "Password123!", "role": "CASHIER"},
    {"name": "Kojo Asare", "email": "clerk@stagcore.local", "password": "Password123!", "role": "INVENTORY_CLERK"},
]


def get_engine_url() -> str:
    # Prefer DATABASE_URL env (postgres) else local sqlite file
    url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_UNPOOLED") or "sqlite+aiosqlite:///backend/stagcore.db"
    # Normalize postgres driver to asyncpg
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    # Ensure sqlite path is absolute-ish for async engine
    return url


def ghs(v: str | Decimal | int | float) -> str:
    return str(v)


def dt_days_ago(days: int, jitter_hours: int = 0) -> str:
    # Returns ISO datetime in UTC, jitter 09:00-18:00
    base = datetime.now(timezone.utc) - timedelta(days=days)
    # jitter: 9-18h plus random minutes
    hour = random.randint(9, 18) if jitter_hours == 0 else jitter_hours
    minute = random.randint(0, 59)
    dt = base.replace(hour=hour, minute=minute, second=random.randint(0, 59), microsecond=0)
    return dt.isoformat()


async def wipe_demo_partition(business_id: str):
    print(f"\n🧹 Wiping demo partition for business {business_id} (slug=stagcore-flagship guard)...")
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    # Guard: verify slug
    engine_url = get_engine_url()
    engine = create_async_engine(engine_url, echo=False, future=True)
    try:
        async_session = async_sessionmaker(engine, expire_on_commit=False)
        async with async_session() as session:
            # Guard check
            try:
                r = await session.execute(text("SELECT slug FROM businesses WHERE id=:bid"), {"bid": business_id})
                row = r.mappings().first()
                slug = row["slug"] if row else ""
                if slug != "stagcore-flagship":
                    print(f"  ! Guard refused: business slug is {slug!r}, expected stagcore-flagship — abort wipe")
                    return
            except Exception as e:
                print(f"  ! Guard check failed (continuing): {e}")

            # Deletes for child tables without business_id via subquery
            # Must be done before parent deletes.
            statements = [
                # sale_return_items via sale_returns
                "DELETE FROM sale_return_items WHERE sale_return_id IN (SELECT id FROM sale_returns WHERE business_id=:bid)",
                # purchase_return_items via purchase_returns
                "DELETE FROM purchase_return_items WHERE purchase_return_id IN (SELECT id FROM purchase_returns WHERE business_id=:bid)",
                # sale_items via sales
                "DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE business_id=:bid)",
                # purchase_items via purchases
                "DELETE FROM purchase_items WHERE purchase_id IN (SELECT id FROM purchases WHERE business_id=:bid)",
                # direct business_id tables
                "DELETE FROM warranty_claims WHERE business_id=:bid",
                "DELETE FROM warranties WHERE business_id=:bid",
                "DELETE FROM repairs WHERE business_id=:bid",
                "DELETE FROM stock_transfers WHERE business_id=:bid",
                "DELETE FROM inventory_movements WHERE business_id=:bid",
                "DELETE FROM sale_returns WHERE business_id=:bid",
                "DELETE FROM purchase_returns WHERE business_id=:bid",
                "DELETE FROM sales WHERE business_id=:bid",
                "DELETE FROM purchases WHERE business_id=:bid",
                "DELETE FROM devices WHERE business_id=:bid",
                "DELETE FROM products WHERE business_id=:bid",
                # Keep business_features (will be re-enabled), but clean others
                "DELETE FROM customers WHERE business_id=:bid",
                "DELETE FROM suppliers WHERE business_id=:bid",
                "DELETE FROM locations WHERE business_id=:bid",
                "DELETE FROM categories WHERE business_id=:bid",
            ]
            total = 0
            for sql in statements:
                try:
                    res = await session.execute(text(sql), {"bid": business_id})
                    cnt = res.rowcount if res.rowcount != -1 else 0
                    total += cnt
                    # print(f"  wiped {sql.split()[2]}: {cnt}")
                except Exception as e:
                    # Table may not exist yet (e.g. sale_return_items on fresh DB)
                    print(f"  wipe skip {sql.split()[2]}: {e}")
                    await session.rollback()
            await session.commit()
            print(f"  ✓ Wipe complete — touched ~{total} rows (some counts may be -1 on SQLite)")
    finally:
        await engine.dispose()


async def ensure_all_features(business_id: str):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    engine_url = get_engine_url()
    engine = create_async_engine(engine_url, echo=False, future=True)
    FEATURE_KEYS = ["warranty", "repairs", "multi_location", "barcode_scanning", "suppliers", "customers", "advanced_reports"]
    try:
        async_session = async_sessionmaker(engine, expire_on_commit=False)
        async with async_session() as session:
            for key in FEATURE_KEYS:
                try:
                    # Try update
                    res = await session.execute(
                        text("UPDATE business_features SET enabled=1, updated_at=:now WHERE business_id=:bid AND feature_key=:key"),
                        {"bid": business_id, "key": key, "now": datetime.now(timezone.utc)},
                    )
                    if res.rowcount == 0:
                        # Insert
                        await session.execute(
                            text("INSERT INTO business_features (id, business_id, feature_key, enabled, created_at, updated_at) VALUES (:id, :bid, :key, 1, :now, :now)"),
                            {"id": str(uuid.uuid4()), "bid": business_id, "key": key, "now": datetime.now(timezone.utc)},
                        )
                except Exception as e:
                    print(f"  feature {key} upsert warn: {e}")
                    await session.rollback()
            await session.commit()
        print(f"✓ All feature flags enabled for {business_id}")
    finally:
        await engine.dispose()


async def seed(today_only: bool = False, do_wipe: bool = True):
    parser_label = "TODAY-ONLY (minimal)" if today_only else "FULL 30-DAY"
    print("=" * 58)
    print(f"🌱 SEEDING STAGCORE DEMO DATA — {parser_label}")
    print(f"   Backend: {BACKEND_URL}  Frontend: {FRONTEND_URL}")
    print("=" * 58)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Sign up user via Better Auth
        print(f"\n1. Creating Better Auth user ({DEMO_USER['email']})...")
        signup_res = await client.post(
            f"{FRONTEND_URL}/api/auth/sign-up/email",
            headers={"Origin": FRONTEND_URL},
            json={
                "name": DEMO_USER["name"],
                "email": DEMO_USER["email"],
                "password": DEMO_USER["password"],
            },
        )
        if signup_res.status_code in [200, 201]:
            print("✓ Better Auth user created.")
        else:
            print(f"Notice: sign-up {signup_res.status_code} (likely exists, will login) — {signup_res.text[:200]}")

        # 2. Login via Better Auth to obtain session token
        login_res = await client.post(
            f"{FRONTEND_URL}/api/auth/sign-in/email",
            headers={"Origin": FRONTEND_URL},
            json={
                "email": DEMO_USER["email"],
                "password": DEMO_USER["password"],
            },
        )
        if login_res.status_code not in [200, 201]:
            print(f"Login failed: {login_res.text[:500]}")
            return

        login_data = login_res.json()
        token = login_data.get("token") or login_data.get("session", {}).get("token")
        if not token:
            token = login_res.cookies.get("better-auth.session_token")
        if not token:
            # Try extracting from set-cookie header
            for v in login_res.headers.get_list("set-cookie") if hasattr(login_res.headers, "get_list") else []:
                if "better-auth.session_token" in v:
                    token = v.split("better-auth.session_token=")[1].split(";")[0]
                    break
        print(f"✓ Obtained auth token: {token[:15]}..." if token else "✗ No token!")
        if not token:
            print("Cannot proceed without token")
            return
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Register Business in Backend (if not already)
        print("\n2. Initializing Business Workspace...")
        reg_biz_res = await client.post(
            f"{BACKEND_URL}/api/v1/auth/register",
            json={
                "email": DEMO_USER["email"],
                "name": DEMO_USER["name"],
                "password": DEMO_USER["password"],
                "business_name": DEMO_USER["business_name"],
                "business_slug": DEMO_USER["business_slug"],
            },
        )
        if reg_biz_res.status_code == 201:
            print(f"✓ Business created: {reg_biz_res.json()}")
        else:
            print(f"  Register business response {reg_biz_res.status_code}: {reg_biz_res.text[:200]}")

        # Get business id
        biz_res = await client.get(f"{BACKEND_URL}/api/v1/business/", headers=headers)
        if biz_res.status_code != 200:
            print(f"Error fetching businesses: {biz_res.status_code} {biz_res.text[:500]}")
            return
        businesses = biz_res.json()
        if not businesses:
            print("Error: No business found for user.")
            return
        business = businesses[0]
        biz_id = business["id"]
        print(f"✓ Active Business: {business['name']} (ID: {biz_id}) slug={business.get('slug')}")

        # Wipe if requested
        if do_wipe:
            await wipe_demo_partition(biz_id)
        else:
            print("\n↷ Skipping wipe (--no-reset)")

        # 4. Enable All Features
        print("\n3. Enabling All Platform Modules & Feature Flags...")
        await ensure_all_features(biz_id)

        # Helpers to create or get by name
        async def post_or_get(url: str, payload: dict, dedup_key: str = "name"):
            res = await client.post(url, json=payload, headers=headers)
            if res.status_code == 201:
                return res.json()
            # Try list and find
            list_res = await client.get(url, headers=headers)
            if list_res.status_code == 200:
                for existing in list_res.json():
                    if existing.get(dedup_key) == payload.get(dedup_key):
                        return existing
                    # For categories, match slug
                    if dedup_key == "name" and existing.get("slug") == payload.get("slug"):
                        return existing
            print(f"  POST {url} failed {res.status_code}: {res.text[:200]} payload={payload}")
            # Return None
            return None

        async def get_or_create_category(data: dict):
            res = await client.post(f"{BACKEND_URL}/api/v1/categories/?business_id={biz_id}", json=data, headers=headers)
            if res.status_code == 201:
                return res.json()
            # fetch
            lst = await client.get(f"{BACKEND_URL}/api/v1/categories/?business_id={biz_id}", headers=headers)
            for e in lst.json():
                if e["name"] == data["name"] or e["slug"] == data["slug"]:
                    return e
            print(f"  category create failed {res.status_code} {res.text[:300]}")
            return None

        # 5. Create Categories
        print("\n4. Creating Product Categories...")
        categories_data = [
            {"name": "Smartphones", "slug": "smartphones", "default_warranty_months": 12},
            {"name": "Laptops & Tablets", "slug": "laptops-tablets", "default_warranty_months": 12},
            {"name": "Audio & Wearables", "slug": "audio-wearables", "default_warranty_months": 6},
            {"name": "Charging & Power", "slug": "charging-power", "default_warranty_months": 6},
            {"name": "Protection & Cases", "slug": "protection-cases", "default_warranty_months": 3},
        ]
        cat_map = {}
        for c in categories_data:
            row = await get_or_create_category(c)
            if row:
                cat_map[c["name"]] = row["id"]
        print(f"✓ {len(cat_map)} categories configured: {list(cat_map.keys())}")

        # 6. Create Locations
        print("\n5. Creating Store Locations...")
        loc_map = {}
        locations_data = [
            {"name": "Main Showroom Floor", "address": "Suite 101, Oxford Street, Osu, Accra"},
            {"name": "Warehouse Depot A", "address": "Bay 4, Tema Industrial Park, Tema"},
        ]
        for l in locations_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/locations/?business_id={biz_id}", json=l, headers=headers)
            if res.status_code == 201:
                loc_map[l["name"]] = res.json()["id"]
            else:
                lst = await client.get(f"{BACKEND_URL}/api/v1/locations/?business_id={biz_id}", headers=headers)
                for existing in lst.json():
                    loc_map[existing["name"]] = existing["id"]
                if l["name"] not in loc_map:
                    print(f"  location {l['name']} failed: {res.status_code} {res.text[:200]}")
        print(f"✓ {len(loc_map)} locations configured: {list(loc_map.keys())}")
        main_loc = loc_map.get("Main Showroom Floor")
        warehouse_loc = loc_map.get("Warehouse Depot A")

        # 7. Create Suppliers — Ghana-localized
        print("\n6. Creating Suppliers...")
        supp_map = {}
        suppliers_data = [
            {"name": "Apple Authorized Global Distro", "phone": "+233 24 111 0199", "email": "supply@apple-distro.com", "address": "1 Infinite Loop, Cupertino CA — Ghana hub, Accra"},
            {"name": "Samsung Direct Wholesale", "phone": "+233 24 222 0188", "email": "orders@samsung-direct.com", "address": "Ridgefield Park, NJ — West Africa Distribution, Accra"},
            {"name": "Anker Innovations Official", "phone": "+233 24 333 0177", "email": "b2b@anker.com", "address": "Seattle, WA — Ghana Partner, Tema"},
            {"name": "Xiaomi Ghana Distro", "phone": "+233 24 444 0288", "email": "supply@xiaomi-gh.com", "address": "Spintex Road, Accra"},
            {"name": "TechHub Accra (Accessories)", "phone": "+233 20 555 0399", "email": "orders@techhub.com.gh", "address": "Circle, Accra — Electronics Market"},
        ]
        for s in suppliers_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/suppliers/?business_id={biz_id}", json=s, headers=headers)
            if res.status_code == 201:
                supp_map[s["name"]] = res.json()["id"]
            else:
                lst = await client.get(f"{BACKEND_URL}/api/v1/suppliers/?business_id={biz_id}", headers=headers)
                for existing in lst.json():
                    supp_map[existing["name"]] = existing["id"]
                if s["name"] not in supp_map:
                    print(f"  supplier {s['name']} failed: {res.status_code} {res.text[:200]}")
        print(f"✓ {len(supp_map)} suppliers configured")

        # 8. Create Customers — Ghanaian names
        print("\n7. Creating Customers...")
        cust_map = {}
        customers_data = [
            {"name": "Sarah Jenkins", "phone": "+233 24 123 0143", "email": "sarah.j@example.com"},
            {"name": "Michael Chang", "phone": "+233 24 234 0182", "email": "m.chang@example.com"},
            {"name": "Apex Tech Solutions Ltd", "phone": "+233 30 299 0199", "email": "procurement@apextech.com.gh"},
            {"name": "Ama Owusu", "phone": "+233 24 111 2222", "email": "ama.owusu@gmail.com"},
            {"name": "Kwame Asare", "phone": "+233 24 222 3333", "email": "kwame.asare@gmail.com"},
            {"name": "Efua Mensah", "phone": "+233 20 345 6789", "email": "efua.mensah@yahoo.com"},
            {"name": "Kojo Badu", "phone": "+233 24 333 4444", "email": None},
            {"name": "Abena Osei", "phone": "+233 24 444 5555", "email": "abena.osei@gmail.com"},
            {"name": "Yaw Boateng", "phone": "+233 27 555 6666", "email": None},
            {"name": "Ghana Edu Supplies", "phone": "+233 30 277 0808", "email": "orders@ghanaedu.edu.gh"},
        ]
        for cu in customers_data:
            payload = {"name": cu["name"], "phone": cu["phone"]}
            if cu["email"]:
                payload["email"] = cu["email"]
            res = await client.post(f"{BACKEND_URL}/api/v1/customers/?business_id={biz_id}", json=payload, headers=headers)
            if res.status_code == 201:
                cust_map[cu["name"]] = res.json()["id"]
            else:
                lst = await client.get(f"{BACKEND_URL}/api/v1/customers/?business_id={biz_id}", headers=headers)
                for existing in lst.json():
                    cust_map[existing["name"]] = existing["id"]
                if cu["name"] not in cust_map:
                    print(f"  customer {cu['name']} failed: {res.status_code} {res.text[:200]}")
        print(f"✓ {len(cust_map)} customers configured")

        # 8b. Create Team Members (Owner can manage)
        print("\n7b. Creating Team Members (Manager/Cashier/Clerk)...")
        team_ids = {}
        for tm in TEAM_USERS:
            res = await client.post(f"{BACKEND_URL}/api/v1/business/{biz_id}/members", json=tm, headers=headers)
            if res.status_code == 201:
                team_ids[tm["email"]] = res.json()
                print(f"  ✓ {tm['role']} {tm['email']}")
            else:
                # May already exist — fetch members
                lst = await client.get(f"{BACKEND_URL}/api/v1/business/{biz_id}/members", headers=headers)
                if lst.status_code == 200:
                    for m in lst.json():
                        if m["email"].lower() == tm["email"].lower():
                            team_ids[tm["email"]] = m
                            break
                    if tm["email"] not in team_ids:
                        print(f"  team {tm['email']} failed: {res.status_code} {res.text[:300]}")
                else:
                    print(f"  team list failed: {lst.status_code} {lst.text[:200]}")
        print(f"✓ Team configured: {list(team_ids.keys())}")

        # 9. Create Products — 12 SKUs, Ghana GHS pricing
        print("\n8. Creating Products & Inventory Ledger Items...")
        products_data = [
            {
                "name": "Anker 65W GaN Fast Wall Charger",
                "sku": "ANK-65W-GAN",
                "barcode": "848061054321",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "Anker",
                "cost_price": "18.00",
                "selling_price": "39.99",
                "minimum_stock_level": 15,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "Apple MagSafe 15W Wireless Charger",
                "sku": "APL-MAG-15W",
                "barcode": "194252192580",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Apple Authorized Global Distro"),
                "brand": "Apple",
                "cost_price": "22.00",
                "selling_price": "49.00",
                "minimum_stock_level": 10,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "Anker PowerLine+ III USB-C to USB-C 2M",
                "sku": "ANK-CC-2M",
                "barcode": "848061099882",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "Anker",
                "cost_price": "4.50",
                "selling_price": "14.99",
                "minimum_stock_level": 25,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "iPhone 15 Pro Tempered Glass (2-Pack)",
                "sku": "TG-IP15P-2PK",
                "barcode": "719324018241",
                "category_id": cat_map.get("Protection & Cases"),
                "supplier_id": supp_map.get("TechHub Accra (Accessories)"),
                "brand": "ArmorShield",
                "cost_price": "2.50",
                "selling_price": "12.99",
                "minimum_stock_level": 20,
                "unit_of_measurement": "pack",
            },
            {
                "name": "Apple AirPods Pro (2nd Gen, USB-C)",
                "sku": "APL-APP2-USBC",
                "barcode": "195949052521",
                "category_id": cat_map.get("Audio & Wearables"),
                "supplier_id": supp_map.get("Apple Authorized Global Distro"),
                "brand": "Apple",
                "cost_price": "160.00",
                "selling_price": "249.00",
                "minimum_stock_level": 6,
                "unit_of_measurement": "unit",
            },
            {
                "name": "Sony WH-1000XM5 Wireless Headphones",
                "sku": "SNY-XM5-BLK",
                "barcode": "027242923591",
                "category_id": cat_map.get("Audio & Wearables"),
                "supplier_id": supp_map.get("TechHub Accra (Accessories)"),
                "brand": "Sony",
                "cost_price": "240.00",
                "selling_price": "399.99",
                "minimum_stock_level": 4,
                "unit_of_measurement": "unit",
            },
            {
                "name": "Baseus 20W Type-C Fast Charger",
                "sku": "BSU-20W-C",
                "barcode": "693217260123",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("TechHub Accra (Accessories)"),
                "brand": "Baseus",
                "cost_price": "12.00",
                "selling_price": "29.99",
                "minimum_stock_level": 12,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "Anker PowerLine III USB-C 1M",
                "sku": "ANK-CC-1M",
                "barcode": "848061099883",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "Anker",
                "cost_price": "3.20",
                "selling_price": "10.99",
                "minimum_stock_level": 20,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "JBL Tune 235NC Earbuds",
                "sku": "JBL-T235-BLK",
                "barcode": "050036389421",
                "category_id": cat_map.get("Audio & Wearables"),
                "supplier_id": supp_map.get("TechHub Accra (Accessories)"),
                "brand": "JBL",
                "cost_price": "38.00",
                "selling_price": "79.99",
                "minimum_stock_level": 8,
                "unit_of_measurement": "unit",
            },
            {
                "name": "HP HDMI 2.0 Cable 2M",
                "sku": "HP-HDMI-2M",
                "barcode": "196337554321",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("TechHub Accra (Accessories)"),
                "brand": "HP",
                "cost_price": "6.00",
                "selling_price": "18.50",
                "minimum_stock_level": 10,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "Lenovo Wireless Mouse M300",
                "sku": "LEN-M300-BLK",
                "barcode": "195477412340",
                "category_id": cat_map.get("Protection & Cases"),
                "supplier_id": supp_map.get("TechHub Accra (Accessories)"),
                "brand": "Lenovo",
                "cost_price": "9.00",
                "selling_price": "22.00",
                "minimum_stock_level": 10,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "iPhone 14 Silicone Case",
                "sku": "APL-CASE-IP14",
                "barcode": "194252710001",
                "category_id": cat_map.get("Protection & Cases"),
                "supplier_id": supp_map.get("Apple Authorized Global Distro"),
                "brand": "Apple",
                "cost_price": "8.00",
                "selling_price": "19.99",
                "minimum_stock_level": 15,
                "unit_of_measurement": "pcs",
            },
        ]
        prod_map = {}
        for p in products_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/products/?business_id={biz_id}", json=p, headers=headers)
            if res.status_code == 201:
                prod_map[p["name"]] = res.json()["id"]
            else:
                lst = await client.get(f"{BACKEND_URL}/api/v1/products/?business_id={biz_id}", headers=headers)
                for existing in lst.json():
                    prod_map[existing["name"]] = existing["id"]
                if p["name"] not in prod_map:
                    print(f"  product {p['name']} failed: {res.status_code} {res.text[:300]}")
        print(f"✓ {len(prod_map)} standard products created")

        # Helper to get product id by name (handles not found)
        def pid(name: str) -> str:
            return prod_map[name]

        # 10. Purchase Orders & Goods Receiving
        print("\n9. Receiving Inventory Stock via Purchases (30-day window)...")
        # All purchases at Main for stock availability; one draft + one cancelled
        purchases_spec = [
            {
                "label": "INV-ANK-8841 (Anker bulk)",
                "supplier": "Anker Innovations Official",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-ANK-8841",
                "days_ago": 28,
                "action": "receive",
                "items": [
                    {"product_id": pid("Anker 65W GaN Fast Wall Charger"), "quantity": 40, "unit_cost": "18.00"},
                    {"product_id": pid("Anker PowerLine+ III USB-C to USB-C 2M"), "quantity": 43, "unit_cost": "4.50"},
                    {"product_id": pid("iPhone 15 Pro Tempered Glass (2-Pack)"), "quantity": 50, "unit_cost": "2.50"},
                    {"product_id": pid("Sony WH-1000XM5 Wireless Headphones"), "quantity": 3, "unit_cost": "240.00"},
                ],
            },
            {
                "label": "INV-APL-9021 (Apple lot)",
                "supplier": "Apple Authorized Global Distro",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-APL-9021",
                "days_ago": 26,
                "action": "receive",
                "items": [
                    {"product_id": pid("Apple MagSafe 15W Wireless Charger"), "quantity": 30, "unit_cost": "22.00"},
                    {"product_id": pid("Apple AirPods Pro (2nd Gen, USB-C)"), "quantity": 15, "unit_cost": "160.00"},
                ],
            },
            {
                "label": "INV-XIA-7730 (Xiaomi/TechHub mix)",
                "supplier": "TechHub Accra (Accessories)",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-XIA-7730",
                "days_ago": 21,
                "action": "receive",
                "items": [
                    {"product_id": pid("Baseus 20W Type-C Fast Charger"), "quantity": 25, "unit_cost": "12.00"},
                    {"product_id": pid("Anker PowerLine III USB-C 1M"), "quantity": 30, "unit_cost": "3.20"},
                    {"product_id": pid("JBL Tune 235NC Earbuds"), "quantity": 12, "unit_cost": "38.00"},
                    {"product_id": pid("HP HDMI 2.0 Cable 2M"), "quantity": 20, "unit_cost": "6.00"},
                    {"product_id": pid("Lenovo Wireless Mouse M300"), "quantity": 15, "unit_cost": "9.00"},
                ],
            },
            {
                "label": "INV-APL-9022 (Cases restock)",
                "supplier": "Apple Authorized Global Distro",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-APL-9022",
                "days_ago": 16,
                "action": "receive",
                "items": [
                    {"product_id": pid("iPhone 14 Silicone Case"), "quantity": 30, "unit_cost": "8.00"},
                    {"product_id": pid("iPhone 15 Pro Tempered Glass (2-Pack)"), "quantity": 20, "unit_cost": "2.50"},
                    {"product_id": pid("HP HDMI 2.0 Cable 2M"), "quantity": 10, "unit_cost": "6.00"},
                ],
            },
            {
                "label": "INV-TECH-9050 (AirPods+Charger top-up)",
                "supplier": "TechHub Accra (Accessories)",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-TECH-9050",
                "days_ago": 10,
                "action": "receive",
                "items": [
                    {"product_id": pid("Apple AirPods Pro (2nd Gen, USB-C)"), "quantity": 10, "unit_cost": "160.00"},
                    {"product_id": pid("Anker 65W GaN Fast Wall Charger"), "quantity": 20, "unit_cost": "18.00"},
                ],
            },
            {
                "label": "INV-APL-9055 (Pending — draft)",
                "supplier": "Apple Authorized Global Distro",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-APL-9055",
                "days_ago": 2,
                "action": "draft",
                "items": [
                    {"product_id": pid("Sony WH-1000XM5 Wireless Headphones"), "quantity": 5, "unit_cost": "240.00"},
                    {"product_id": pid("JBL Tune 235NC Earbuds"), "quantity": 8, "unit_cost": "38.00"},
                ],
            },
            {
                "label": "INV-ANK-9060 (Duplicate — cancelled)",
                "supplier": "Anker Innovations Official",
                "location": "Main Showroom Floor",
                "invoice_reference": "INV-ANK-9060",
                "days_ago": 14,
                "action": "cancel",
                "items": [
                    {"product_id": pid("Lenovo Wireless Mouse M300"), "quantity": 10, "unit_cost": "9.00"},
                    {"product_id": pid("Baseus 20W Type-C Fast Charger"), "quantity": 10, "unit_cost": "12.00"},
                ],
            },
        ]
        purchase_map = {}  # invoice -> id
        for spec in purchases_spec:
            loc_id = loc_map.get(spec["location"])
            supp_id = supp_map.get(spec["supplier"])
            payload = {
                "supplier_id": supp_id,
                "location_id": loc_id,
                "invoice_reference": spec["invoice_reference"],
                "purchase_date": dt_days_ago(spec["days_ago"]),
                "payment_status": "paid" if spec["action"] == "receive" else "pending",
                "items": spec["items"],
            }
            pres = await client.post(f"{BACKEND_URL}/api/v1/purchases?business_id={biz_id}", json=payload, headers=headers)
            if pres.status_code != 201:
                print(f"  Purchase {spec['label']} failed: {pres.status_code} {pres.text[:400]}")
                continue
            pid_ = pres.json()["id"]
            purchase_map[spec["invoice_reference"]] = pid_
            if spec["action"] == "receive":
                rres = await client.post(f"{BACKEND_URL}/api/v1/purchases/{pid_}/receive?business_id={biz_id}", headers=headers)
                if rres.status_code not in [200, 201]:
                    print(f"  Receive {spec['label']} failed: {rres.status_code} {rres.text[:300]}")
                else:
                    print(f"  ✓ {spec['label']} received")
            elif spec["action"] == "cancel":
                cres = await client.post(f"{BACKEND_URL}/api/v1/purchases/{pid_}/cancel?business_id={biz_id}", headers=headers)
                if cres.status_code != 200:
                    print(f"  Cancel {spec['label']} failed: {cres.status_code} {cres.text[:200]}")
                else:
                    print(f"  ✓ {spec['label']} cancelled (draft)")
            else:
                print(f"  ✓ {spec['label']} left as draft")
        print(f"✓ Purchases processed: {len(purchase_map)} (5 received, 1 draft, 1 cancelled)")

        # 11. Create Serialized Devices — 18 units, round-robin Main/Warehouse
        print("\n10. Registering Serialized Devices (IMEI / Serial units)...")
        # Keep original 8 + 10 new = 18
        devices_to_create = [
            # Original 8
            {"product_name": "iPhone 15 Pro 128GB Black Titanium", "serial_number": "DNP98271KL81", "imei": "358921098234111", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "780.00", "selling_price": "999.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "iPhone 15 Pro 128GB Natural Titanium", "serial_number": "DNP98271KL82", "imei": "358921098234112", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "780.00", "selling_price": "999.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "iPhone 15 Pro Max 256GB Natural Titanium", "serial_number": "DNP99112KL91", "imei": "358921098234221", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "920.00", "selling_price": "1199.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "iPhone 15 Pro Max 256GB Blue Titanium", "serial_number": "DNP99112KL92", "imei": "358921098234222", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "920.00", "selling_price": "1199.00", "location": "Warehouse Depot A", "brand": "Apple"},
            {"product_name": "Samsung Galaxy S24 Ultra 512GB Titanium Gray", "serial_number": "R5CW10892KL1", "imei": "354029108234331", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Samsung Direct Wholesale"), "cost_price": "950.00", "selling_price": "1299.00", "location": "Main Showroom Floor", "brand": "Samsung"},
            {"product_name": "Samsung Galaxy S24 Ultra 512GB Titanium Black", "serial_number": "R5CW10892KL2", "imei": "354029108234332", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Samsung Direct Wholesale"), "cost_price": "950.00", "selling_price": "1299.00", "location": "Main Showroom Floor", "brand": "Samsung"},
            {"product_name": "MacBook Air 13\" M3 16GB/512GB Space Gray", "serial_number": "C02G9012MD61", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "1050.00", "selling_price": "1399.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "iPad Pro 11\" M4 256GB Wi-Fi Silver", "serial_number": "DMPL4091MD71", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "750.00", "selling_price": "999.00", "location": "Main Showroom Floor", "brand": "Apple"},
            # New 10
            {"product_name": "iPhone 14 128GB Midnight", "serial_number": "DNP98271KL83", "imei": "358921098234113", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "680.00", "selling_price": "899.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "Samsung Galaxy A54 256GB Awesome Black", "serial_number": "R5CW10892KL3", "imei": "354029108234333", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Samsung Direct Wholesale"), "cost_price": "280.00", "selling_price": "449.00", "location": "Main Showroom Floor", "brand": "Samsung"},
            {"product_name": "Xiaomi Redmi Note 13 Pro 256GB Midnight Black", "serial_number": "XM8829100AA1", "imei": "359111098234401", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Xiaomi Ghana Distro"), "cost_price": "220.00", "selling_price": "349.00", "location": "Warehouse Depot A", "brand": "Xiaomi"},
            {"product_name": "MacBook Air 15\" M2 8GB/512GB Starlight", "serial_number": "C02G9012MD62", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "1100.00", "selling_price": "1499.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "HP Pavilion 15 i5 16GB/512GB Silver", "serial_number": "5CD2345XYZ1", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "supplier_id": supp_map.get("TechHub Accra (Accessories)"), "cost_price": "620.00", "selling_price": "899.00", "location": "Warehouse Depot A", "brand": "HP"},
            {"product_name": "iPad 10th Gen 64GB Blue Wi-Fi", "serial_number": "DMPL4091MD72", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "320.00", "selling_price": "449.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "Apple Watch Series 9 GPS 45mm Midnight", "serial_number": "F17LQ00XYZ9", "imei": "358921098234501", "category_id": cat_map.get("Audio & Wearables"), "supplier_id": supp_map.get("Apple Authorized Global Distro"), "cost_price": "300.00", "selling_price": "429.00", "location": "Main Showroom Floor", "brand": "Apple"},
            {"product_name": "Samsung Galaxy S23 128GB Cream", "serial_number": "R5CW10892KL4", "imei": "354029108234334", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Samsung Direct Wholesale"), "cost_price": "620.00", "selling_price": "849.00", "location": "Main Showroom Floor", "brand": "Samsung"},
            {"product_name": "Xiaomi 13T 256GB Alpine Blue", "serial_number": "XM8829100AA2", "imei": "359111098234402", "category_id": cat_map.get("Smartphones"), "supplier_id": supp_map.get("Xiaomi Ghana Distro"), "cost_price": "480.00", "selling_price": "699.00", "location": "Main Showroom Floor", "brand": "Xiaomi"},
            {"product_name": "Lenovo Tab M11 128GB Luna Grey", "serial_number": "LTAB00112233", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "supplier_id": supp_map.get("TechHub Accra (Accessories)"), "cost_price": "140.00", "selling_price": "199.00", "location": "Warehouse Depot A", "brand": "Lenovo"},
        ]
        for dev in devices_to_create:
            loc_id = loc_map.get(dev.pop("location"))
            payload = {**dev, "location_id": loc_id}
            # Remove None imei? Keep as null, API handles
            res = await client.post(f"{BACKEND_URL}/api/v1/devices/?business_id={biz_id}", json=payload, headers=headers)
            if res.status_code != 201:
                print(f"  device {dev['serial_number']} failed: {res.status_code} {res.text[:300]}")

        dev_list_res = await client.get(f"{BACKEND_URL}/api/v1/devices/?business_id={biz_id}", headers=headers)
        created_devices = dev_list_res.json() if dev_list_res.status_code == 200 else []
        print(f"✓ {len(created_devices)} serialized devices registered (in_stock)")
        # Map serial -> device
        dev_by_serial = {d["serial_number"]: d for d in created_devices}
        dev_by_id = {d["id"]: d for d in created_devices}

        # Helper to find in_stock device by serial
        def pick_device(serial: str):
            return dev_by_serial.get(serial)

        # 12. Generate Sales — spread over 30 days
        if today_only:
            print("\n11. Generating Today's Completed POS Sales (today-only mode)...")
            in_stock_devices = [d for d in created_devices if d.get("status") == "in_stock"]
            dev_sold_1 = in_stock_devices[0] if len(in_stock_devices) > 0 else created_devices[0]
            dev_sold_2 = in_stock_devices[1] if len(in_stock_devices) > 1 else created_devices[1]
            sales_batch = [
                {
                    "customer_id": cust_map.get("Sarah Jenkins"),
                    "location_id": main_loc,
                    "payment_method": "card",
                    "sale_date": dt_days_ago(0),
                    "items": [
                        {"device_id": dev_sold_1["id"], "quantity": 1, "selling_price": "999.00", "discount": "0.00"},
                        {"product_id": pid("Apple MagSafe 15W Wireless Charger"), "quantity": 1, "selling_price": "49.00", "discount": "5.00"},
                        {"product_id": pid("iPhone 15 Pro Tempered Glass (2-Pack)"), "quantity": 1, "selling_price": "12.99", "discount": "0.00"},
                    ],
                    "action": "complete",
                },
                {
                    "customer_id": cust_map.get("Michael Chang"),
                    "location_id": main_loc,
                    "payment_method": "mobile_money",
                    "sale_date": dt_days_ago(0),
                    "items": [
                        {"product_id": pid("Apple AirPods Pro (2nd Gen, USB-C)"), "quantity": 1, "selling_price": "249.00", "discount": "10.00"},
                        {"product_id": pid("Anker 65W GaN Fast Wall Charger"), "quantity": 2, "selling_price": "39.99", "discount": "0.00"},
                    ],
                    "action": "complete",
                },
                {
                    "customer_id": None,
                    "location_id": main_loc,
                    "payment_method": "cash",
                    "sale_date": dt_days_ago(0),
                    "items": [
                        {"product_id": pid("Anker PowerLine+ III USB-C to USB-C 2M"), "quantity": 3, "selling_price": "14.99", "discount": "2.00"},
                        {"product_id": pid("iPhone 15 Pro Tempered Glass (2-Pack)"), "quantity": 2, "selling_price": "12.99", "discount": "0.00"},
                    ],
                    "action": "complete",
                },
                {
                    "customer_id": cust_map.get("Apex Tech Solutions Ltd"),
                    "location_id": main_loc,
                    "payment_method": "card",
                    "sale_date": dt_days_ago(0),
                    "items": [
                        {"device_id": dev_sold_2["id"], "quantity": 1, "selling_price": "1299.00", "discount": "50.00"},
                        {"product_id": pid("Sony WH-1000XM5 Wireless Headphones"), "quantity": 1, "selling_price": "399.99", "discount": "20.00"},
                        {"product_id": pid("Anker 65W GaN Fast Wall Charger"), "quantity": 2, "selling_price": "39.99", "discount": "0.00"},
                    ],
                    "action": "complete",
                },
            ]
        else:
            print("\n11. Generating Historical & Today's Sales (30-day distribution)...")
            # Build sales plan to hit target velocities. List defines days_ago and items.
            # Keep today's 4 anchor sales plus ~24 backdated.
            in_stock = {d["serial_number"]: d for d in created_devices if d.get("status") == "in_stock"}
            # Ensure we have enough devices — pick by serial
            def did(serial):
                d = in_stock.get(serial) or dev_by_serial.get(serial)
                return d["id"] if d else None

            sales_plan = [
                # TODAY (4) — anchor, same as before for deterministic KPIs
                {"label": "today-1 device+acc", "days_ago": 0, "customer": "Ama Owusu", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "DNP98271KL81", "price": "999.00", "discount": "0.00"},
                    {"product": "Apple MagSafe 15W Wireless Charger", "qty": 1, "price": "49.00", "discount": "5.00"},
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 1, "price": "12.99"},
                ], "action": "complete"},
                {"label": "today-2 audio+charger", "days_ago": 0, "customer": "Kwame Asare", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "Apple AirPods Pro (2nd Gen, USB-C)", "qty": 1, "price": "249.00", "discount": "10.00"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 2, "price": "39.99"},
                ], "action": "complete"},
                {"label": "today-3 walk-in cables", "days_ago": 0, "customer": None, "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 3, "price": "14.99", "discount": "2.00"},
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 2, "price": "12.99"},
                ], "action": "complete"},
                {"label": "today-4 flagship bundle", "days_ago": 0, "customer": "Apex Tech Solutions Ltd", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "DNP98271KL82", "price": "999.00", "discount": "50.00"},
                    {"product": "Sony WH-1000XM5 Wireless Headphones", "qty": 1, "price": "399.99", "discount": "20.00"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 2, "price": "39.99"},
                ], "action": "complete"},

                # YESTERDAY & DAY 2
                {"label": "d1 high-value", "days_ago": 1, "customer": "Ghana Edu Supplies", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "DNP99112KL91", "price": "1199.00"},
                    {"product": "iPhone 14 Silicone Case", "qty": 2, "price": "19.99"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 1, "price": "39.99"},
                ], "action": "complete"},
                {"label": "d1 momo accessories", "days_ago": 1, "customer": "Efua Mensah", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "Baseus 20W Type-C Fast Charger", "qty": 2, "price": "29.99"},
                    {"product": "HP HDMI 2.0 Cable 2M", "qty": 1, "price": "18.50"},
                ], "action": "complete"},
                {"label": "d2 walk-in", "days_ago": 2, "customer": None, "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "JBL Tune 235NC Earbuds", "qty": 1, "price": "79.99"},
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 2, "price": "14.99"},
                ], "action": "complete"},

                # DAY 3-7
                {"label": "d3 phone sale", "days_ago": 3, "customer": "Kojo Badu", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "DNP98271KL83", "price": "899.00"},
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 1, "price": "12.99"},
                ], "action": "complete"},
                {"label": "d4 cables", "days_ago": 4, "customer": "Abena Osei", "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 4, "price": "14.99", "discount": "3.00"},
                    {"product": "Anker PowerLine III USB-C 1M", "qty": 2, "price": "10.99"},
                ], "action": "complete"},
                {"label": "d5 acc bulk", "days_ago": 5, "customer": "Ama Owusu", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 3, "price": "39.99"},
                    {"product": "Baseus 20W Type-C Fast Charger", "qty": 2, "price": "29.99"},
                    {"product": "iPhone 14 Silicone Case", "qty": 3, "price": "19.99"},
                ], "action": "complete"},
                {"label": "d6 headphones", "days_ago": 6, "customer": "Yaw Boateng", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"product": "Sony WH-1000XM5 Wireless Headphones", "qty": 1, "price": "399.99"},
                    {"product": "HP HDMI 2.0 Cable 2M", "qty": 2, "price": "18.50"},
                ], "action": "complete"},
                {"label": "d7 glass+case", "days_ago": 7, "customer": None, "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 5, "price": "12.99"},
                    {"product": "iPhone 14 Silicone Case", "qty": 4, "price": "19.99"},
                ], "action": "complete"},

                # DAY 8-14
                {"label": "d8 samsung", "days_ago": 8, "customer": "Michael Chang", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "R5CW10892KL3", "price": "449.00"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 1, "price": "39.99"},
                ], "action": "complete"},
                {"label": "d9 chargers", "days_ago": 9, "customer": "Kwame Asare", "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 5, "price": "14.99"},
                    {"product": "Baseus 20W Type-C Fast Charger", "qty": 3, "price": "29.99"},
                ], "action": "complete"},
                {"label": "d10 airpods", "days_ago": 10, "customer": "Sarah Jenkins", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "Apple AirPods Pro (2nd Gen, USB-C)", "qty": 2, "price": "249.00", "discount": "15.00"},
                    {"product": "Anker PowerLine III USB-C 1M", "qty": 2, "price": "10.99"},
                ], "action": "complete"},
                {"label": "d11 cables again", "days_ago": 11, "customer": None, "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 6, "price": "14.99"},
                    {"product": "Lenovo Wireless Mouse M300", "qty": 1, "price": "22.00"},
                ], "action": "complete"},
                {"label": "d13 macbook", "days_ago": 13, "customer": "Apex Tech Solutions Ltd", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "C02G9012MD62", "price": "1499.00"},
                    {"product": "HP HDMI 2.0 Cable 2M", "qty": 1, "price": "18.50"},
                    {"product": "Lenovo Wireless Mouse M300", "qty": 2, "price": "22.00"},
                ], "action": "complete"},
                {"label": "d14 jbl+charger", "days_ago": 14, "customer": "Efua Mensah", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "JBL Tune 235NC Earbuds", "qty": 2, "price": "79.99"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 4, "price": "39.99"},
                ], "action": "complete"},

                # DAY 15-21 peak
                {"label": "d15 ipad", "days_ago": 15, "customer": "Ghana Edu Supplies", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "DMPL4091MD72", "price": "449.00"},
                    {"product": "iPhone 14 Silicone Case", "qty": 5, "price": "19.99"},
                ], "action": "complete"},
                {"label": "d16 sony", "days_ago": 16, "customer": "Kwame Asare", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"product": "Sony WH-1000XM5 Wireless Headphones", "qty": 1, "price": "399.99"},
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 2, "price": "14.99"},
                ], "action": "complete"},
                {"label": "d17 watch", "days_ago": 17, "customer": "Ama Owusu", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"device": "F17LQ00XYZ9", "price": "429.00"},
                    {"product": "Baseus 20W Type-C Fast Charger", "qty": 1, "price": "29.99"},
                ], "action": "complete"},
                {"label": "d18 cables peak", "days_ago": 18, "customer": None, "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 8, "price": "14.99", "discount": "5.00"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 5, "price": "39.99"},
                ], "action": "complete"},
                {"label": "d19 airpods+ cables", "days_ago": 19, "customer": "Kojo Badu", "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Apple AirPods Pro (2nd Gen, USB-C)", "qty": 1, "price": "249.00"},
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 4, "price": "14.99"},
                ], "action": "complete"},
                {"label": "d20 s24 ultra", "days_ago": 20, "customer": "Yaw Boateng", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "R5CW10892KL1", "price": "1299.00"},
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 2, "price": "12.99"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 2, "price": "39.99"},
                ], "action": "complete"},
                {"label": "d21 glass bulk", "days_ago": 21, "customer": "Abena Osei", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 4, "price": "12.99"},
                    {"product": "iPhone 14 Silicone Case", "qty": 2, "price": "19.99"},
                ], "action": "complete"},

                # DAY 22-29 trailing + draft/cancel
                {"label": "d22 cables", "days_ago": 22, "customer": None, "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker PowerLine+ III USB-C to USB-C 2M", "qty": 7, "price": "14.99"},
                    {"product": "Baseus 20W Type-C Fast Charger", "qty": 2, "price": "29.99"},
                ], "action": "complete"},
                {"label": "d24 chargers", "days_ago": 24, "customer": "Efua Mensah", "pay": "mobile_money", "loc": "Main Showroom Floor", "items": [
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 6, "price": "39.99"},
                    {"product": "HP HDMI 2.0 Cable 2M", "qty": 3, "price": "18.50"},
                ], "action": "complete"},
                {"label": "d26 samsung s23", "days_ago": 26, "customer": "Michael Chang", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"device": "R5CW10892KL4", "price": "849.00"},
                    {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 1, "price": "12.99"},
                ], "action": "complete"},
                {"label": "d27 draft abandoned", "days_ago": 1, "customer": "Kwame Asare", "pay": "card", "loc": "Main Showroom Floor", "items": [
                    {"product": "JBL Tune 235NC Earbuds", "qty": 1, "price": "79.99"},
                    {"product": "Anker 65W GaN Fast Wall Charger", "qty": 1, "price": "39.99"},
                ], "action": "draft"},
                {"label": "d28 cancelled", "days_ago": 2, "customer": "Abena Osei", "pay": "cash", "loc": "Main Showroom Floor", "items": [
                    {"device": "XM8829100AA2", "price": "699.00"},
                ], "action": "cancel_after_complete? no, draft cancel"},
            ]

            # Normalize sales_plan to API payloads
            sales_batch = []
            for entry in sales_plan:
                # Handle cancelled special: we create draft then cancel via API
                action = entry.get("action", "complete")
                # Build items
                items = []
                for it in entry["items"]:
                    if "device" in it:
                        dserial = it["device"]
                        did_ = did(dserial)
                        if not did_:
                            print(f"  ! device {dserial} not found for sale {entry['label']}")
                            continue
                        items.append({"device_id": did_, "quantity": 1, "selling_price": it.get("price", "0.00"), "discount": it.get("discount", "0.00")})
                    else:
                        prod_name = it["product"]
                        pid_ = prod_map.get(prod_name)
                        if not pid_:
                            print(f"  ! product {prod_name} not found")
                            continue
                        items.append({"product_id": pid_, "quantity": it.get("qty", 1), "selling_price": it.get("price", "0.00"), "discount": it.get("discount", "0.00")})
                cust_name = entry.get("customer")
                cust_id = cust_map.get(cust_name) if cust_name else None
                loc_name = entry.get("loc", "Main Showroom Floor")
                loc_id = loc_map.get(loc_name)
                sales_batch.append({
                    "label": entry["label"],
                    "customer_id": cust_id,
                    "location_id": loc_id,
                    "payment_method": entry.get("pay", "cash"),
                    "sale_date": dt_days_ago(entry["days_ago"]),
                    "items": items,
                    "action": action,
                })

        # Execute sales batch
        sale_records = []  # keep for returns
        draft_sales = []
        for s_data in sales_batch:
            label = s_data.pop("label", "sale")
            action = s_data.pop("action", "complete")
            # For d28 cancelled we want draft then cancel
            if label == "d28 cancelled":
                action = "draft_then_cancel"
            payload = {k: v for k, v in s_data.items() if k != "label"}
            # Ensure sale_date is set
            res = await client.post(f"{BACKEND_URL}/api/v1/sales?business_id={biz_id}", json=payload, headers=headers)
            if res.status_code != 201:
                print(f"  ✗ Sale {label} create failed: {res.status_code} {res.text[:400]}")
                continue
            sale_id = res.json()["id"]
            sale_obj = res.json()
            if action == "complete":
                cres = await client.post(f"{BACKEND_URL}/api/v1/sales/{sale_id}/complete?business_id={biz_id}", headers=headers)
                if cres.status_code != 200:
                    print(f"  ✗ Sale {label} complete failed: {cres.status_code} {cres.text[:400]}")
                else:
                    sale_records.append(cres.json())
                    print(f"  ✓ Sale {label} completed ({sale_id[:8]})")
            elif action == "draft":
                draft_sales.append(sale_obj)
                print(f"  ✓ Sale {label} left as draft ({sale_id[:8]})")
            elif action == "draft_then_cancel":
                # Cancel draft
                cres = await client.post(f"{BACKEND_URL}/api/v1/sales/{sale_id}/cancel?business_id={biz_id}", headers=headers)
                if cres.status_code == 200:
                    print(f"  ✓ Sale {label} draft cancelled")
                else:
                    print(f"  ✗ Sale {label} cancel failed: {cres.status_code} {cres.text[:300]}")
                sale_records.append(sale_obj)  # still record but cancelled
            elif action == "cancel":
                cres = await client.post(f"{BACKEND_URL}/api/v1/sales/{sale_id}/cancel?business_id={biz_id}", headers=headers)
                print(f"  cancel {label}: {cres.status_code}")
            else:
                sale_records.append(sale_obj)

        # Handle post-create cancel for one completed sale to demo cancel restock
        # Pick the d26 samsung sale and cancel it? But then device would return — we want returns via return flow, not cancel.
        # Instead we will demo sale return below, not cancel.

        print(f"✓ Sales processed: {len(sale_records)} completed, {len(draft_sales)} drafts")

        # Refresh devices to get sold statuses
        dev_list_res = await client.get(f"{BACKEND_URL}/api/v1/devices/?business_id={biz_id}", headers=headers)
        created_devices = dev_list_res.json() if dev_list_res.status_code == 200 else []
        sold_devices = [d for d in created_devices if d.get("status") == "sold"]
        print(f"  → {len(sold_devices)} devices now sold (warranties auto-created)")

        # 13. Inventory adjustments & movement edge cases
        print("\n12. Creating Inventory Adjustments & Edge Movements...")
        # We use inventory adjust API — these are location-aware
        adjustments = [
            {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "direction": "in", "qty": 5, "notes": "Stocktake found extra — Bay 4"},
            {"product": "JBL Tune 235NC Earbuds", "direction": "out", "qty": 1, "notes": "Damaged unit — dropped in store"},
            {"product": "Lenovo Wireless Mouse M300", "direction": "out", "qty": 2, "notes": "Shrinkage adjustment — audit"},
            {"product": "Baseus 20W Type-C Fast Charger", "direction": "in", "qty": 3, "notes": "Found in warehouse miscount"},
        ]
        for adj in adjustments:
            pid_ = prod_map.get(adj["product"])
            if not pid_:
                continue
            res = await client.post(f"{BACKEND_URL}/api/v1/inventory/adjust?business_id={biz_id}", json={
                "product_id": pid_,
                "quantity": adj["qty"],
                "direction": adj["direction"],
                "location_id": main_loc,
                "notes": adj["notes"],
            }, headers=headers)
            if res.status_code == 201:
                print(f"  ✓ Adjust {adj['direction']} {adj['product']} x{adj['qty']}")
            else:
                print(f"  ✗ Adjust {adj['product']} failed: {res.status_code} {res.text[:200]}")

        # Direct damage/loss via return_stock with kind? Actually adjust already covers. Use inventory return for supplier?
        # We'll also add a CUSTOMER_RETURN and SUPPLIER_RETURN via inventory return endpoint
        # Customer return: +2 for BSU? Simulate via inventory return (adds stock)
        for ret in [
            {"product": "Baseus 20W Type-C Fast Charger", "kind": "customer", "qty": 2, "notes": "Customer return — wrong charger, restocked"},
            {"product": "HP HDMI 2.0 Cable 2M", "kind": "supplier", "qty": 3, "notes": "Supplier return — overstock to TechHub"},
        ]:
            pid_ = prod_map.get(ret["product"])
            res = await client.post(f"{BACKEND_URL}/api/v1/inventory/return?business_id={biz_id}", json={
                "product_id": pid_,
                "quantity": ret["qty"],
                "kind": ret["kind"],
                "location_id": main_loc,
                "notes": ret["notes"],
            }, headers=headers)
            if res.status_code == 201:
                print(f"  ✓ Return {ret['kind']} {ret['product']} x{ret['qty']}")
            else:
                print(f"  ✗ Return {ret['product']} failed: {res.status_code} {res.text[:200]}")

        # 14. Stock Transfers — Main -> Warehouse and device transfer
        print("\n13. Creating Stock Transfers (per-location demo)...")
        # Ensure we have enough stock at Main for transfers (we do: ANK-CC-1M 30, TG 70)
        transfers = [
            {"product": "Anker PowerLine III USB-C 1M", "qty": 10, "from": "Main Showroom Floor", "to": "Warehouse Depot A", "notes": "Rebalance — move slow mover to warehouse"},
            {"product": "iPhone 15 Pro Tempered Glass (2-Pack)", "qty": 15, "from": "Main Showroom Floor", "to": "Warehouse Depot A", "notes": "Overflow to warehouse — shelf space"},
        ]
        for tr in transfers:
            pid_ = prod_map.get(tr["product"])
            res = await client.post(f"{BACKEND_URL}/api/v1/transfers?business_id={biz_id}", json={
                "product_id": pid_,
                "from_location_id": loc_map[tr["from"]],
                "to_location_id": loc_map[tr["to"]],
                "quantity": tr["qty"],
                "notes": tr["notes"],
            }, headers=headers)
            if res.status_code == 201:
                print(f"  ✓ Transfer {tr['product']} {tr['qty']} {tr['from']} → {tr['to']}")
            else:
                print(f"  ✗ Transfer {tr['product']} failed: {res.status_code} {res.text[:300]}")

        # Device transfer: Xiaomi at Warehouse -> Main
        xiaomi_dev = dev_by_serial.get("XM8829100AA1")
        if xiaomi_dev:
            res = await client.post(f"{BACKEND_URL}/api/v1/transfers?business_id={biz_id}", json={
                "device_id": xiaomi_dev["id"],
                "from_location_id": warehouse_loc,
                "to_location_id": main_loc,
                "quantity": 1,
                "notes": "Move Xiaomi to showroom for display",
            }, headers=headers)
            if res.status_code == 201:
                print(f"  ✓ Device transfer Xiaomi {xiaomi_dev['serial_number']} Warehouse → Main")
            else:
                print(f"  ✗ Device transfer failed: {res.status_code} {res.text[:400]}")
        else:
            print("  ! Xiaomi device not found for transfer")

        # 15. Sale Returns — via returns API
        print("\n14. Creating Sale Returns (restock & refund)...")
        # Need completed sales with items; pick first completed sale (today-1 has 3 items)
        # Fetch sales list
        sales_res = await client.get(f"{BACKEND_URL}/api/v1/sales?business_id={biz_id}&status=completed", headers=headers)
        completed_sales = sales_res.json() if sales_res.status_code == 200 else []
        if completed_sales:
            # Pick a recent completed sale with product items for restock true
            sale_for_return = None
            for s in completed_sales:
                # find sale with at least one product item
                items = s.get("items") or []
                if any(it.get("product_id") for it in items):
                    sale_for_return = s
                    break
            if sale_for_return:
                # Build return payload: return first product item qty 1
                first_prod_item = next((it for it in sale_for_return["items"] if it.get("product_id")), None)
                if first_prod_item:
                    ret_payload = {
                        "items": [{"sale_item_id": first_prod_item["id"], "quantity": 1}],
                        "location_id": main_loc,
                        "reason": "wrong_item",
                        "refund_method": "cash",
                        "restock": True,
                        "notes": "Customer bought wrong charger — restocked",
                    }
                    rres = await client.post(f"{BACKEND_URL}/api/v1/returns/sales/{sale_for_return['id']}/return?business_id={biz_id}", json=ret_payload, headers=headers)
                    if rres.status_code == 201:
                        print(f"  ✓ Sale return (restock) for sale {sale_for_return['id'][:8]}")
                    else:
                        print(f"  ✗ Sale return failed: {rres.status_code} {rres.text[:400]}")
            # Second return without restock (refund only) — pick another sale
            if len(completed_sales) > 1:
                sale2 = completed_sales[1]
                prod_item2 = next((it for it in sale2.get("items", []) if it.get("product_id")), None)
                if prod_item2 and sale2["id"] != sale_for_return["id"]:
                    ret2 = {
                        "items": [{"sale_item_id": prod_item2["id"], "quantity": 1}],
                        "location_id": main_loc,
                        "reason": "damaged",
                        "refund_method": "mobile_money",
                        "restock": False,
                        "notes": "Damaged earbud — refund only, not restocked",
                    }
                    rres2 = await client.post(f"{BACKEND_URL}/api/v1/returns/sales/{sale2['id']}/return?business_id={biz_id}", json=ret2, headers=headers)
                    if rres2.status_code == 201:
                        print(f"  ✓ Sale return (no restock) for sale {sale2['id'][:8]}")
                    else:
                        print(f"  ✗ Sale return 2 failed: {rres2.status_code} {rres2.text[:400]}")
        else:
            print("  ! No completed sales found for returns")

        # 16. Purchase Return — overstock to supplier
        print("\n15. Creating Purchase Return (supplier overstock)...")
        # Pick a received purchase with product items
        pur_res = await client.get(f"{BACKEND_URL}/api/v1/purchases?business_id={biz_id}&status=received", headers=headers)
        received_purs = pur_res.json() if pur_res.status_code == 200 else []
        if received_purs:
            pur = received_purs[0]
            pur_items = pur.get("items") or []
            if pur_items:
                # return 2 of first product item
                pi = pur_items[0]
                ret_payload = {
                    "items": [{"purchase_item_id": pi["id"], "quantity": 2}],
                    "location_id": main_loc,
                    "reason": "overstock",
                    "notes": "Overstock — returning 2 units to supplier",
                }
                pres = await client.post(f"{BACKEND_URL}/api/v1/returns/purchases/{pur['id']}/return?business_id={biz_id}", json=ret_payload, headers=headers)
                if pres.status_code == 201:
                    print(f"  ✓ Purchase return for {pur['invoice_reference']} x2")
                else:
                    print(f"  ✗ Purchase return failed: {pres.status_code} {pres.text[:400]}")
        else:
            print("  ! No received purchases for purchase return")

        # 17. Warranty Claims — 4 claims across statuses
        print("\n16. Creating Warranty Claims...")
        warr_res = await client.get(f"{BACKEND_URL}/api/v1/warranties?business_id={biz_id}", headers=headers)
        warranties = warr_res.json() if warr_res.status_code == 200 else []
        print(f"  Found {len(warranties)} warranties auto-created")
        claims_to_create = []
        if warranties:
            # Pick up to 4 warranties for claims
            for idx, w in enumerate(warranties[:4]):
                diag = ["Screen flicker — intermittent", "Battery drains fast — 80% health", "Charging port loose", "Speaker distortion"][idx % 4]
                payload = {"warranty_id": w["id"], "diagnosis": diag}
                # Add customer from warranty if present
                if w.get("customer_id"):
                    payload["customer_id"] = w["customer_id"]
                cres = await client.post(f"{BACKEND_URL}/api/v1/warranty-claims?business_id={biz_id}", json=payload, headers=headers)
                if cres.status_code == 201:
                    claim = cres.json()
                    claims_to_create.append(claim)
                    print(f"  ✓ Claim {idx+1} for device {w.get('device_id','?')[:8]}")
                else:
                    print(f"  ✗ Claim create failed: {cres.status_code} {cres.text[:300]}")
            # Transition claims to varied statuses
            # Claim 0 stays open, 1 -> diagnosis, 2 -> approved, 3 -> rejected
            for idx, claim in enumerate(claims_to_create):
                if idx == 0:
                    continue  # open
                elif idx == 1:
                    pres = await client.patch(f"{BACKEND_URL}/api/v1/warranty-claims/{claim['id']}?business_id={biz_id}", json={"status": "diagnosis", "diagnosis": claim["diagnosis"] + " — diagnosed"}, headers=headers)
                    print(f"  → Claim {claim['id'][:8]} → diagnosis: {pres.status_code}")
                elif idx == 2:
                    # open -> diagnosis -> approved
                    await client.patch(f"{BACKEND_URL}/api/v1/warranty-claims/{claim['id']}?business_id={biz_id}", json={"status": "diagnosis"}, headers=headers)
                    pres = await client.patch(f"{BACKEND_URL}/api/v1/warranty-claims/{claim['id']}?business_id={biz_id}", json={"status": "approved", "resolution": "repair"}, headers=headers)
                    print(f"  → Claim {claim['id'][:8]} → approved/repair: {pres.status_code}")
                elif idx == 3:
                    await client.patch(f"{BACKEND_URL}/api/v1/warranty-claims/{claim['id']}?business_id={biz_id}", json={"status": "diagnosis"}, headers=headers)
                    pres = await client.patch(f"{BACKEND_URL}/api/v1/warranty-claims/{claim['id']}?business_id={biz_id}", json={"status": "rejected", "resolution": "reject", "resolution_notes": "Out of warranty period — physical damage"}, headers=headers)
                    print(f"  → Claim {claim['id'][:8]} → rejected: {pres.status_code}")
        else:
            print("  ! No warranties to claim")

        # 18. Repairs — 6 across FSM
        print("\n17. Creating Repairs (FSM coverage)...")
        # Need customer map and device map
        # Prepare repair payloads
        # We need sold devices for some repairs, and walk-in for others
        sold_list = [d for d in created_devices if d["status"] == "sold"]  # after sales, status sold
        # But after sales, sold status via API, we refreshed? Use updated list
        # Fetch again
        dev_res2 = await client.get(f"{BACKEND_URL}/api/v1/devices/?business_id={biz_id}", headers=headers)
        all_devs2 = dev_res2.json() if dev_res2.status_code == 200 else created_devices
        sold_list = [d for d in all_devs2 if d["status"] == "sold"]
        # Pick devices
        rep_defs = [
            {"label": "sold iphone crack", "device": sold_list[0]["id"] if sold_list else None, "desc": None, "problem": "Cracked screen — front glass shattered, touch still works", "tech": "Samuel Tetteh", "cust": cust_map.get("Ama Owusu"), "est": "120.00", "target": "ready_for_pickup"},
            {"label": "walk-in samsung water", "device": None, "desc": "Samsung Galaxy A12 — IMEI 359111098234999 — water damage, no power", "problem": "Water damage — device submerged, corrosion on charging port", "tech": "Kwabena Ofori", "cust": cust_map.get("Kojo Badu"), "est": "85.00", "target": "diagnosis"},
            {"label": "macbook keyboard", "device": sold_list[1]["id"] if len(sold_list) > 1 else None, "desc": None, "problem": "Keyboard keys sticky — spill, requires cleaning + replacement", "tech": "Efua Mensah", "cust": cust_map.get("Ghana Edu Supplies"), "est": "200.00", "target": "awaiting_parts"},
            {"label": "ipad battery", "device": sold_list[2]["id"] if len(sold_list) > 2 else None, "desc": None, "problem": "Battery drains in 2 hours — health 78%, needs replacement", "tech": "Samuel Tetteh", "cust": cust_map.get("Efua Mensah"), "est": "150.00", "target": "repairing"},
            {"label": "apple watch collected", "device": sold_list[3]["id"] if len(sold_list) > 3 else None, "desc": None, "problem": "Watch band broken + screen scratch", "tech": "Ama Owusu", "cust": cust_map.get("Yaw Boateng"), "est": "60.00", "target": "collected"},
            {"label": "walk-in tecno cancelled", "device": None, "desc": "Tecno Spark 10 — IMEI 358921098234777 — no network signal", "problem": "No network — antenna issue, customer declined quote", "tech": "Kojo Asare", "cust": cust_map.get("Kwame Asare"), "est": "40.00", "target": "cancelled"},
        ]
        repair_ids = []
        for rd in rep_defs:
            payload = {
                "problem_description": rd["problem"],
                "technician_name": rd["tech"],
                "estimated_cost": rd["est"],
                "location_id": main_loc,
            }
            if rd["device"]:
                payload["device_id"] = rd["device"]
                # device_description optional when device_id present — omit
            else:
                payload["device_description"] = rd["desc"]
            if rd["cust"]:
                payload["customer_id"] = rd["cust"]
            res = await client.post(f"{BACKEND_URL}/api/v1/repairs?business_id={biz_id}", json=payload, headers=headers)
            if res.status_code != 201:
                print(f"  ✗ Repair {rd['label']} failed: {res.status_code} {res.text[:400]}")
                continue
            rep = res.json()
            rid = rep["id"]
            repair_ids.append((rid, rd["label"], rd["target"]))
            print(f"  ✓ Repair {rd['label']} created {rid[:8]} status=received")

        # Step FSM to target
        status_steps = ["received", "diagnosis", "awaiting_parts", "repairing", "ready_for_pickup", "collected"]
        for rid, label, target in repair_ids:
            if target == "received":
                continue
            if target == "cancelled":
                pres = await client.post(f"{BACKEND_URL}/api/v1/repairs/{rid}/transition?business_id={biz_id}", json={"to_status": "cancelled"}, headers=headers)
                print(f"    → {label} → cancelled: {pres.status_code}")
                continue
            # Walk stepwise
            cur_idx = 0  # received
            tgt_idx = status_steps.index(target)
            for step in range(cur_idx + 1, tgt_idx + 1):
                to_stat = status_steps[step]
                pres = await client.post(f"{BACKEND_URL}/api/v1/repairs/{rid}/transition?business_id={biz_id}", json={"to_status": to_stat}, headers=headers)
                if pres.status_code not in [200, 201]:
                    print(f"    → {label} step {to_stat} failed: {pres.status_code} {pres.text[:200]}")
                    break
            print(f"    → {label} advanced to {target}")

        # 19. Summary checks
        print("\n" + "=" * 58)
        print("🎉 SEEDING COMPLETE! LIVE DASHBOARD OVERVIEW:")
        print("=" * 58)
        summary_res = await client.get(f"{BACKEND_URL}/api/v1/dashboard/summary?business_id={biz_id}", headers=headers)
        if summary_res.status_code == 200:
            s_data = summary_res.json()
            print(f"• Today's Revenue:       GH₵{float(s_data['today_sales_total']):,.2f} ({s_data['today_sales_count']} orders)")
            print(f"• Today's Gross Profit:  GH₵{float(s_data['today_gross_profit']):,.2f}")
            print(f"• Total Inventory Val:   GH₵{float(s_data['total_inventory_value']):,.2f}")
            print(f"• Active Items:          {s_data['total_products_count']}")
            print(f"• Low Stock Items:       {s_data['low_stock_count']} low + {s_data['out_of_stock_count']} out = {(s_data['low_stock_count'] + s_data['out_of_stock_count'])} attention")
            if s_data.get("low_stock_items"):
                print("  Low stock list:")
                for it in s_data["low_stock_items"][:6]:
                    print(f"    - {it['product_name']} ({it['sku']}): {it['current_stock']} vs min {it['minimum_stock_level']}")
            if s_data.get("top_selling_products"):
                print("  Top sellers today:")
                for tp in s_data["top_selling_products"][:3]:
                    print(f"    - {tp['product_name']}: {tp['units_sold']} units GH₵{float(tp['total_revenue']):,.2f}")
        else:
            print(f"  Summary fetch failed: {summary_res.status_code} {summary_res.text[:300]}")

        # Intelligence overview
        intel_res = await client.get(f"{BACKEND_URL}/api/v1/intelligence/overview?business_id={biz_id}&window_days=30&sort_by=urgency&limit=100", headers=headers)
        if intel_res.status_code == 200:
            intel = intel_res.json()
            print(f"\n• Intelligence (30d): {intel.get('total_items')} items — critical {intel.get('critical_count')} | low {intel.get('low_count')} | out {intel.get('out_of_stock_count')} | stable {intel.get('stable_count')} | ok {intel.get('ok_count')}")
            # Show top urgent
            items = intel.get("items", [])[:4]
            for it in items:
                print(f"    - {it['name']}: stock {it['current_stock']} v={float(it['daily_velocity']):.2f}/d dso={it['days_until_stockout']} status={it['stock_status']} suggest={it['suggested_order_qty']}")

        # Activity
        act_res = await client.get(f"{BACKEND_URL}/api/v1/dashboard/activity?business_id={biz_id}&limit=10", headers=headers)
        if act_res.status_code == 200:
            acts = act_res.json()
            print(f"\n• Recent Activity ({len(acts)}):")
            for a in acts[:6]:
                print(f"    - [{a['activity_type']}] {a['title']}: {a['description']}")

        print("\n" + "-" * 58)
        print("🔑 LOGIN CREDENTIALS:")
        print(f"• Owner (demo):  {DEMO_USER['email']} / {DEMO_USER['password']} → {FRONTEND_URL}/login → /dashboard")
        for tm in TEAM_USERS:
            print(f"• {tm['role'].title():<16} {tm['email']} / {tm['password']} → /login")
        print(f"• Admin:         admin@stagcore.local / Password123! → /login → /admin/businesses")
        print("=" * 58)
        print(f"Business: {business['name']} ({business.get('slug')}) • All feature flags ON • GH₵ pricing")
        print("=" * 58)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Seed Stagcore demo data — realistic 30-day scenario")
    ap.add_argument("--no-reset", action="store_true", help="Do not wipe demo partition; upsert instead")
    ap.add_argument("--today-only", action="store_true", help="Minimal mode: only 4 today's sales (legacy)")
    ap.add_argument("--reset", action="store_true", help="Force wipe (default)")
    args = ap.parse_args()
    do_wipe = not args.no_reset
    # --reset explicitly enables wipe even if --no-reset set? Prefer --no-reset wins? Keep simple: do_wipe = not no_reset
    if args.reset:
        do_wipe = True
    random.seed(42)  # deterministic
    asyncio.run(seed(today_only=args.today_only, do_wipe=do_wipe))
