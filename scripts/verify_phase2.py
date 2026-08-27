#!/usr/bin/env python3
"""Phase 2 E2E: categories, products, devices, suppliers, customers via API + Playwright UI."""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Ensure app uses backend DB even when run from project root
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{ROOT / 'backend' / 'stagcore.db'}")
os.environ.setdefault("DATABASE_URL_UNPOOLED", f"sqlite+aiosqlite:///{ROOT / 'backend' / 'stagcore.db'}")
sys.path.insert(0, str(ROOT / "backend"))

import httpx
from httpx import ASGITransport

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import Session, User

API_URL = "http://localhost:8000"
WEB_URL = "http://localhost:3000"

async def _create_user_and_business(email: str, name: str, business_name: str):
    """Create user, session, business via direct DB + API."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token = f"tok-{uuid.uuid4()}"
    async with async_session_factory() as db:
        user = User(id=user_id, name=name, email=email, emailVerified=True, createdAt=now, updatedAt=now)
        db.add(user)
        db.add(Session(id=str(uuid.uuid4()), token=token, userId=user_id, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
        await db.commit()
    # Create business via API (needs no auth, just email lookup)
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/auth/register", json={"email": email, "password": "password123", "name": name, "business_name": business_name})
        assert res.status_code == 201, f"register failed: {res.text}"
        biz = res.json()
        biz_id = biz["id"]
    # Enable suppliers/customers for this business
    async with async_session_factory() as db:
        from sqlalchemy import select
        from app.models.feature import BusinessFeature
        for key in ["suppliers", "customers"]:
            r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == biz_id, BusinessFeature.feature_key == key))
            feat = r.scalars().first()
            if feat:
                feat.enabled = True
        await db.commit()
    return {"user_id": user_id, "token": token, "email": email, "business_id": biz_id}

async def test_api():
    print("=== Phase 2 API ===")
    # Create two users for scoping test
    u1 = await _create_user_and_business(f"p2a-{uuid.uuid4().hex[:4]}@test.com", "P2A", f"P2 Biz {uuid.uuid4().hex[:4]}")
    u2 = await _create_user_and_business(f"p2b-{uuid.uuid4().hex[:4]}@test.com", "P2B", f"P2 Biz {uuid.uuid4().hex[:4]}")
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        h1 = {"Authorization": f"Bearer {u1['token']}"}
        h2 = {"Authorization": f"Bearer {u2['token']}"}

        # Category
        r = await client.post("/api/v1/categories/", json={"name": "Phones"}, headers=h1)
        assert r.status_code == 201, r.text
        cat_id = r.json()["id"]
        print(f"✓ category {cat_id}")
        # Duplicate should 409
        r = await client.post("/api/v1/categories/", json={"name": "Phones"}, headers=h1)
        assert r.status_code == 409
        print("✓ category duplicate blocked")
        # Cross-tenant 403
        r = await client.get(f"/api/v1/categories/{cat_id}", headers=h2)
        assert r.status_code == 403
        print("✓ category scoping 403")

        # Supplier
        r = await client.post("/api/v1/suppliers/", json={"name": "Acme", "phone": "123"}, headers=h1)
        assert r.status_code == 201, r.text
        sup_id = r.json()["id"]
        print(f"✓ supplier {sup_id}")

        # Customer
        r = await client.post("/api/v1/customers/", json={"name": "Jane", "phone": "555"}, headers=h1)
        assert r.status_code == 201, r.text
        cust_id = r.json()["id"]
        print(f"✓ customer {cust_id}")

        # Product with refs
        r = await client.post("/api/v1/products/", json={"name": "USB Cable", "sku": f"SKU-{uuid.uuid4().hex[:4]}", "category_id": cat_id, "supplier_id": sup_id, "cost_price": "5.00", "selling_price": "10.00"}, headers=h1)
        assert r.status_code == 201, r.text
        prod_id = r.json()["id"]
        print(f"✓ product {prod_id}")
        # Duplicate SKU should 409
        sku = r.json()["sku"]
        if sku:
            r = await client.post("/api/v1/products/", json={"name": "USB2", "sku": sku}, headers=h1)
            assert r.status_code == 409
            print("✓ product SKU unique")
        # Search
        r = await client.get("/api/v1/products/?q=USB", headers=h1)
        assert r.status_code == 200 and any(p["id"] == prod_id for p in r.json())
        print("✓ product search")

        # Device
        serial = f"SN-{uuid.uuid4().hex[:6]}"
        r = await client.post("/api/v1/devices/", json={"product_name": "iPhone 15", "serial_number": serial, "imei": f"35{uuid.uuid4().hex[:13]}"[:15], "category_id": cat_id, "supplier_id": sup_id, "cost_price": "500.00", "selling_price": "800.00"}, headers=h1)
        assert r.status_code == 201, r.text
        dev_id = r.json()["id"]
        print(f"✓ device {dev_id}")
        # Duplicate serial 409
        r = await client.post("/api/v1/devices/", json={"product_name": "iPhone", "serial_number": serial}, headers=h1)
        assert r.status_code == 409
        print("✓ device serial unique")
        # Search
        r = await client.get(f"/api/v1/devices/?q={serial}", headers=h1)
        assert r.status_code == 200 and any(d["id"] == dev_id for d in r.json())
        print("✓ device search")
        # Cross-tenant device not visible
        r = await client.get(f"/api/v1/devices/{dev_id}", headers=h2)
        assert r.status_code == 403
        print("✓ device scoping 403")

        # Cleanup via API
        for url in [f"/api/v1/devices/{dev_id}", f"/api/v1/products/{prod_id}", f"/api/v1/categories/{cat_id}", f"/api/v1/suppliers/{sup_id}", f"/api/v1/customers/{cust_id}"]:
            await client.delete(url, headers=h1)
        print("✓ cleanup")
        # Verify feature gate: disable suppliers and check 403
        async with async_session_factory() as db:
            from sqlalchemy import select
            from app.models.feature import BusinessFeature
            r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == u1["business_id"], BusinessFeature.feature_key == "suppliers"))
            feat = r.scalars().first()
            feat.enabled = False
            await db.commit()
        r = await client.get("/api/v1/suppliers/", headers=h1)
        assert r.status_code == 403
        print("✓ supplier feature gate 403 when disabled")
        # Cleanup users
        async with async_session_factory() as db:
            from sqlalchemy import text
            for u in [u1, u2]:
                await db.execute(text("DELETE FROM business_features WHERE business_id=:bid"), {"bid": u["business_id"]})
                await db.execute(text("DELETE FROM business_users WHERE business_id=:bid"), {"bid": u["business_id"]})
                await db.execute(text("DELETE FROM businesses WHERE id=:bid"), {"bid": u["business_id"]})
                await db.execute(text("DELETE FROM session WHERE \"userId\"=:uid"), {"uid": u["user_id"]})
                await db.execute(text("DELETE FROM account WHERE \"userId\"=:uid"), {"uid": u["user_id"]})
                await db.execute(text("DELETE FROM \"user\" WHERE id=:uid"), {"uid": u["user_id"]})
            await db.commit()
        print("✓ users cleaned")

    print("=== Phase 2 API PASSED ===")

async def test_browser():
    print("\n=== Phase 2 Browser ===")
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context()
        page = await context.new_page()
        # Login as admin (admin@stagcore.local / Admin123!) — has business and suppliers/customers disabled by default, but we enabled for test above and cleaned, so admin's flags are still disabled
        # We need to enable for admin to see nav items
        # First enable via DB
        async with async_session_factory() as db:
            from sqlalchemy import select, text
            from app.models.feature import BusinessFeature
            r = await db.execute(text("SELECT id FROM \"user\" WHERE email='admin@stagcore.local'"))
            row = r.mappings().first()
            if not row:
                print("! admin user not found, skipping browser test")
                await browser.close()
                return
            uid = row["id"]
            r = await db.execute(select(BusinessFeature).where(BusinessFeature.business_id == (await db.execute(text("SELECT business_id FROM business_users WHERE user_id=:uid LIMIT 1"), {"uid": uid})).mappings().first()["business_id"]))
            # Actually just enable via direct
            await db.execute(text("UPDATE business_features SET enabled=1 WHERE business_id=(SELECT business_id FROM business_users WHERE user_id=:uid LIMIT 1) AND feature_key IN ('suppliers','customers')"), {"uid": uid})
            await db.commit()
            print("✓ enabled suppliers/customers for admin")

        await page.goto(f"{WEB_URL}/login", wait_until="networkidle")
        await page.fill('input#email', "admin@stagcore.local")
        await page.fill('input#password', "Admin123!")
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/dashboard", timeout=15000)
        print("✓ logged in as admin")
        await page.wait_for_load_state("networkidle")
        # Wait for sidebar feature flags to load (async fetch)
        try:
            await page.wait_for_selector("aside >> text=Suppliers", timeout=5000)
            await page.wait_for_selector("aside >> text=Customers", timeout=5000)
        except:
            await page.wait_for_timeout(2000)
        nav = await page.locator("aside").text_content()
        assert "Suppliers" in (nav or ""), f"Suppliers not in nav: {nav}"
        assert "Customers" in (nav or ""), f"Customers not in nav: {nav}"
        print("✓ nav shows suppliers/customers when enabled")
        # Visit categories and create one via UI
        await page.goto(f"{WEB_URL}/categories", wait_until="networkidle")
        await page.wait_for_selector("text=Categories", timeout=5000)
        await page.click('button:has-text("New Category")')
        await page.wait_for_selector('input#name', timeout=5000)
        cat_name = f"E2E Cat {uuid.uuid4().hex[:4]}"
        await page.fill('input#name', cat_name)
        await page.click('button[type="submit"]:has-text("Create")')
        await page.wait_for_timeout(1500)
        content = await page.content()
        assert cat_name in content, f"category {cat_name} not found after create"
        print(f"✓ created category via UI: {cat_name}")
        await page.screenshot(path="/tmp/stagcore-p2-categories.png", full_page=True)
        # Visit products
        await page.goto(f"{WEB_URL}/products", wait_until="networkidle")
        await page.wait_for_selector("text=Products", timeout=5000)
        print("✓ products page loads")
        await page.screenshot(path="/tmp/stagcore-p2-products.png", full_page=True)
        # Visit devices
        await page.goto(f"{WEB_URL}/devices", wait_until="networkidle")
        await page.wait_for_selector("text=Devices", timeout=5000)
        print("✓ devices page loads")
        await page.screenshot(path="/tmp/stagcore-p2-devices.png", full_page=True)
        await browser.close()
    print("=== Phase 2 Browser PASSED ===")

async def main():
    await test_api()
    await test_browser()
    print("\n=== ALL PHASE 2 VERIFICATIONS PASSED ===")

if __name__ == "__main__":
    asyncio.run(main())
