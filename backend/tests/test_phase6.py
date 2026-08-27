import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.models.auth import Session, User
from app.models.business import Business, BusinessUser, UserRole
from app.models.feature import BusinessFeature, FEATURE_KEYS


@pytest.mark.asyncio
async def test_dashboard_summary_and_activity(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}

    # 1. Create a category
    cat_res = await client.post("/api/v1/categories/", json={"name": f"DashCat-{uuid.uuid4().hex[:4]}"}, headers=headers)
    assert cat_res.status_code == 201
    cat_id = cat_res.json()["id"]

    # 2. Create products: one standard (cost 20, price 50, minimum_stock_level 5)
    p1_res = await client.post(
        "/api/v1/products/",
        json={
            "name": f"NonSerDash-{uuid.uuid4().hex[:4]}",
            "sku": f"NSD-{uuid.uuid4().hex[:4]}",
            "category_id": cat_id,
            "cost_price": "20.00",
            "selling_price": "50.00",
            "minimum_stock_level": 5,
        },
        headers=headers,
    )
    assert p1_res.status_code == 201
    p1_id = p1_res.json()["id"]

    # 3. Create purchase & receive: 10 units of p1 @ 20.00
    pur_res = await client.post(
        "/api/v1/purchases",
        json={
            "invoice_reference": f"INV-DASH-{uuid.uuid4().hex[:4]}",
            "items": [
                {"product_id": p1_id, "quantity": 10, "unit_cost": "20.00"},
            ],
        },
        headers=headers,
    )
    assert pur_res.status_code == 201
    pur_id = pur_res.json()["id"]
    rec_res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert rec_res.status_code == 200

    # 4. Create serialized devices directly
    dev_res = await client.post(
        "/api/v1/devices/",
        json={
            "product_name": "iPhone 15 Pro",
            "serial_number": f"SN-{uuid.uuid4().hex[:8]}",
            "imei": f"IMEI-{uuid.uuid4().hex[:8]}",
            "category_id": cat_id,
            "cost_price": "100.00",
            "selling_price": "200.00",
        },
        headers=headers,
    )
    assert dev_res.status_code == 201
    dev1_id = dev_res.json()["id"]

    dev_res2 = await client.post(
        "/api/v1/devices/",
        json={
            "product_name": "iPhone 15 Pro",
            "serial_number": f"SN-{uuid.uuid4().hex[:8]}",
            "imei": f"IMEI-{uuid.uuid4().hex[:8]}",
            "category_id": cat_id,
            "cost_price": "100.00",
            "selling_price": "200.00",
        },
        headers=headers,
    )
    assert dev_res2.status_code == 201

    # 5. Sell 3 units of p1 and 1 device
    sale_res = await client.post(
        "/api/v1/sales",
        json={
            "payment_method": "mobile_money",
            "items": [
                {"product_id": p1_id, "quantity": 3, "selling_price": "50.00", "discount": "0.00"},
                {"device_id": dev1_id, "quantity": 1, "selling_price": "200.00", "discount": "10.00"},
            ],
        },
        headers=headers,
    )
    assert sale_res.status_code == 201
    sale_id = sale_res.json()["id"]

    comp_res = await client.post(f"/api/v1/sales/{sale_id}/complete", headers=headers)
    assert comp_res.status_code == 200

    # 6. Check Dashboard Summary
    dash_res = await client.get("/api/v1/dashboard/summary", headers=headers)
    assert dash_res.status_code == 200
    dash = dash_res.json()

    # Revenue = (3 * 50) + (200 - 10) = 150 + 190 = 340.00
    # COGS = (3 * 20) + (1 * 100) = 60 + 100 = 160.00
    # Profit = 340 - 160 = 180.00
    assert Decimal(str(dash["today_sales_total"])) >= Decimal("340.00")
    assert dash["today_sales_count"] >= 1
    assert Decimal(str(dash["today_gross_profit"])) >= Decimal("180.00")

    # Remaining stock: p1 has 7 units (val = 7 * 20 = 140), p2 device in stock has 1 unit (val = 1 * 100 = 100) -> total val >= 240.00
    assert Decimal(str(dash["total_inventory_value"])) >= Decimal("240.00")
    assert len(dash["top_selling_products"]) >= 1

    # 7. Check Dashboard Activity
    act_res = await client.get("/api/v1/dashboard/activity", headers=headers)
    assert act_res.status_code == 200
    activities = act_res.json()
    assert len(activities) >= 2
    types = {a["activity_type"] for a in activities}
    assert "sale" in types
    assert "purchase" in types


@pytest.mark.asyncio
async def test_sales_and_profit_reports(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}

    # Create product
    res = await client.post(
        "/api/v1/products/",
        json={"name": f"RepProd-{uuid.uuid4().hex[:4]}", "sku": f"RP-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "30.00"},
        headers=headers,
    )
    p_id = res.json()["id"]

    # Buy 20 units
    pur = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-REP-{uuid.uuid4().hex[:4]}", "items": [{"product_id": p_id, "quantity": 20, "unit_cost": "10.00"}]}, headers=headers)
    pur_id = pur.json()["id"]
    await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)

    # Sale 1 with Cash ($60, discount $5)
    s1 = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": p_id, "quantity": 2, "selling_price": "30.00", "discount": "5.00"}]}, headers=headers)
    await client.post(f"/api/v1/sales/{s1.json()['id']}/complete", headers=headers)

    # Sale 2 with Card ($30, discount $0)
    s2 = await client.post("/api/v1/sales", json={"payment_method": "card", "items": [{"product_id": p_id, "quantity": 1, "selling_price": "30.00", "discount": "0.00"}]}, headers=headers)
    await client.post(f"/api/v1/sales/{s2.json()['id']}/complete", headers=headers)

    # 1. Sales Report
    rep_res = await client.get("/api/v1/reports/sales", headers=headers)
    assert rep_res.status_code == 200
    sales_rep = rep_res.json()
    assert sales_rep["total_sales_count"] >= 2
    assert sales_rep["total_items_sold"] >= 3
    assert any(pm["payment_method"] == "cash" for pm in sales_rep["payment_methods"])
    assert any(pm["payment_method"] == "card" for pm in sales_rep["payment_methods"])
    assert len(sales_rep["daily_breakdown"]) >= 1

    # 2. Profit Report
    prof_res = await client.get("/api/v1/reports/profit", headers=headers)
    assert prof_res.status_code == 200
    prof = prof_res.json()
    assert Decimal(str(prof["total_revenue"])) > Decimal("0.00")
    assert Decimal(str(prof["total_cogs"])) > Decimal("0.00")
    assert Decimal(str(prof["gross_profit"])) > Decimal("0.00")
    assert Decimal(str(prof["gross_margin_percentage"])) > Decimal("0.00")


@pytest.mark.asyncio
async def test_inventory_and_product_performance_reports(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}

    cat_res = await client.post("/api/v1/categories/", json={"name": f"PerfCat-{uuid.uuid4().hex[:4]}"}, headers=headers)
    cat_id = cat_res.json()["id"]

    p_res = await client.post(
        "/api/v1/products/",
        json={"name": f"PerfProd-{uuid.uuid4().hex[:4]}", "sku": f"PP-{uuid.uuid4().hex[:4]}", "category_id": cat_id, "cost_price": "15.00", "selling_price": "45.00", "minimum_stock_level": 10},
        headers=headers,
    )
    prod_id = p_res.json()["id"]

    # Stock 5 units (below min_stock 10 -> should be low_stock)
    pur = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-PERF-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 5, "unit_cost": "15.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    # 1. Inventory Report
    inv_res = await client.get(f"/api/v1/reports/inventory?category_id={cat_id}", headers=headers)
    assert inv_res.status_code == 200
    inv = inv_res.json()
    assert Decimal(str(inv["total_valuation"])) >= Decimal("75.00")
    assert any(item["product_id"] == prod_id and item["stock_status"] == "low_stock" for item in inv["items"])
    assert any(c["category_id"] == cat_id for c in inv["category_breakdown"])

    # 2. Sell 2 units
    s = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 2, "selling_price": "45.00"}]}, headers=headers)
    await client.post(f"/api/v1/sales/{s.json()['id']}/complete", headers=headers)

    # 3. Product Performance Report
    perf_res = await client.get("/api/v1/reports/product-performance", headers=headers)
    assert perf_res.status_code == 200
    perf = perf_res.json()
    assert any(item["product_id"] == prod_id for item in perf["best_sellers"])
    assert any(item["product_id"] == prod_id for item in perf["most_profitable"])


@pytest.mark.asyncio
async def test_supplier_report(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}

    # Enable suppliers feature flag for auth_user's business
    from sqlalchemy import update
    await db_session.execute(
        update(BusinessFeature)
        .where(BusinessFeature.business_id == auth_user["business_id"], BusinessFeature.feature_key == "suppliers")
        .values(enabled=True)
    )
    await db_session.commit()

    # Create supplier
    s_res = await client.post(
        "/api/v1/suppliers/",
        json={"name": f"RepSupplier-{uuid.uuid4().hex[:4]}", "phone": "+1234567890", "email": "supplier@example.com"},
        headers=headers,
    )
    assert s_res.status_code == 201, s_res.text
    supp_id = s_res.json()["id"]

    # Product
    p_res = await client.post(
        "/api/v1/products/",
        json={"name": f"SuppProd-{uuid.uuid4().hex[:4]}", "sku": f"SP-{uuid.uuid4().hex[:4]}", "cost_price": "25.00", "selling_price": "50.00"},
        headers=headers,
    )
    p_id = p_res.json()["id"]

    # Purchase with this supplier
    pur = await client.post(
        "/api/v1/purchases",
        json={"supplier_id": supp_id, "invoice_reference": f"INV-SUPP-{uuid.uuid4().hex[:4]}", "items": [{"product_id": p_id, "quantity": 4, "unit_cost": "25.00"}]},
        headers=headers,
    )
    assert pur.status_code == 201
    await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    # Get supplier report
    rep_res = await client.get("/api/v1/reports/suppliers", headers=headers)
    assert rep_res.status_code == 200
    data = rep_res.json()
    assert data["total_suppliers_count"] >= 1
    matching = [s for s in data["suppliers"] if s["supplier_id"] == supp_id]
    assert len(matching) == 1
    assert matching[0]["total_purchases_count"] == 1
    assert Decimal(str(matching[0]["total_spent"])) == Decimal("100.00")


@pytest.mark.asyncio
async def test_multi_tenant_isolation_reports(client: AsyncClient, auth_user, db_session):
    headers_a = {"Authorization": f"Bearer {auth_user['token']}"}

    # User A creates a product and completes a sale
    pa = await client.post("/api/v1/products/", json={"name": "TenantA_Prod", "sku": f"TAP-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "30.00"}, headers=headers_a)
    pa_id = pa.json()["id"]
    pur_a = await client.post("/api/v1/purchases", json={"items": [{"product_id": pa_id, "quantity": 10, "unit_cost": "10.00"}]}, headers=headers_a)
    await client.post(f"/api/v1/purchases/{pur_a.json()['id']}/receive", headers=headers_a)
    sa = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": pa_id, "quantity": 5, "selling_price": "30.00"}]}, headers=headers_a)
    await client.post(f"/api/v1/sales/{sa.json()['id']}/complete", headers=headers_a)

    # Create second tenant directly in db_session
    user_id2 = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token2 = f"tok2-{uuid.uuid4()}"
    email2 = f"other2-{uuid.uuid4().hex[:4]}@test.com"
    user2 = User(id=user_id2, name="Other", email=email2, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user2)
    db_session.add(Session(id=str(uuid.uuid4()), token=token2, userId=user_id2, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
    biz_id2 = str(uuid.uuid4())
    db_session.add(Business(id=biz_id2, name="Other Biz", slug=f"other-{uuid.uuid4().hex[:4]}", created_at=now, updated_at=now))
    db_session.add(BusinessUser(id=str(uuid.uuid4()), business_id=biz_id2, user_id=user_id2, role=UserRole.OWNER.value, created_at=now))
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=biz_id2, feature_key=key, enabled=True, created_at=now, updated_at=now))
    await db_session.commit()

    headers_b = {"Authorization": f"Bearer {token2}"}

    # User B dashboard and reports should show 0 sales and 0 inventory
    dash_b = await client.get("/api/v1/dashboard/summary", headers=headers_b)
    assert dash_b.status_code == 200
    assert dash_b.json()["today_sales_count"] == 0
    assert Decimal(str(dash_b.json()["today_sales_total"])) == Decimal("0.00")
    assert Decimal(str(dash_b.json()["total_inventory_value"])) == Decimal("0.00")

    sales_rep_b = await client.get("/api/v1/reports/sales", headers=headers_b)
    assert sales_rep_b.status_code == 200
    assert sales_rep_b.json()["total_sales_count"] == 0
    assert Decimal(str(sales_rep_b.json()["total_revenue"])) == Decimal("0.00")
