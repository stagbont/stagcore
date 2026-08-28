import math
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.models.auth import Session, User
from app.models.business import Business, BusinessUser, UserRole
from app.models.feature import BusinessFeature, FEATURE_KEYS


async def _enable_advanced_reports(db_session, business_id: str):
    await db_session.execute(
        update(BusinessFeature)
        .where(BusinessFeature.business_id == business_id, BusinessFeature.feature_key == "advanced_reports")
        .values(enabled=True)
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_intelligence_requires_advanced_reports_flag(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # By default auth_user has advanced_reports disabled via conftest
    res = await client.get("/api/v1/intelligence/overview", headers=headers)
    assert res.status_code == 403
    assert "advanced_reports" in res.text


@pytest.mark.asyncio
async def test_intelligence_overview_correctness_and_suggested_qty(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    # Create products
    p_a = await client.post("/api/v1/products/", json={"name": f"IntA-{uuid.uuid4().hex[:4]}", "sku": f"INTA-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "30.00", "minimum_stock_level": 5}, headers=headers)
    assert p_a.status_code == 201
    p_a_id = p_a.json()["id"]

    p_b = await client.post("/api/v1/products/", json={"name": f"IntB-{uuid.uuid4().hex[:4]}", "sku": f"INTB-{uuid.uuid4().hex[:4]}", "cost_price": "5.00", "selling_price": "15.00", "minimum_stock_level": 10}, headers=headers)
    assert p_b.status_code == 201
    p_b_id = p_b.json()["id"]

    # Stock: A has 30 units, B has 8 units (B will be low but stable if no sales)
    for pid, qty in [(p_a_id, 30), (p_b_id, 8)]:
        pur = await client.post("/api/v1/purchases", json={"items": [{"product_id": pid, "quantity": qty, "unit_cost": "10.00" if pid == p_a_id else "5.00"}]}, headers=headers)
        assert pur.status_code == 201
        await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    # Sales for A: 30 units in last 30 days -> velocity 1.0
    # Create 3 sales each 10 units for A, completed
    for _ in range(3):
        s = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": p_a_id, "quantity": 10, "selling_price": "30.00"}]}, headers=headers)
        assert s.status_code == 201
        comp = await client.post(f"/api/v1/sales/{s.json()['id']}/complete", headers=headers)
        assert comp.status_code == 200

    # Verify remaining stock for A is 0? Wait: started 30, sold 30 => 0. That's out_of_stock.
    # Let's adjust intelligence math expectations accordingly.
    # To test reorder with positive stock, add another product C.
    p_c = await client.post("/api/v1/products/", json={"name": f"IntC-{uuid.uuid4().hex[:4]}", "sku": f"INTC-{uuid.uuid4().hex[:4]}", "cost_price": "20.00", "selling_price": "40.00", "minimum_stock_level": 5}, headers=headers)
    p_c_id = p_c.json()["id"]
    pur_c = await client.post("/api/v1/purchases", json={"items": [{"product_id": p_c_id, "quantity": 20, "unit_cost": "20.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur_c.json()['id']}/receive", headers=headers)
    # Sell 15 units of C in window -> stock 5, velocity 0.5 (15/30), days_until = 10, reorder_point = 0.5*10=5, suggested = ceil(0.5*37 -5)= ceil(13.5)=14
    for qty in [10, 5]:
        s = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": p_c_id, "quantity": qty, "selling_price": "40.00"}]}, headers=headers)
        await client.post(f"/api/v1/sales/{s.json()['id']}/complete", headers=headers)

    res = await client.get("/api/v1/intelligence/overview?window_days=30&lead_time_days=7&safety_days=3&coverage_days=30&sort_by=name", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["params"]["window_days"] == 30
    assert data["params"]["lead_time_days"] == 7
    assert data["total_items"] >= 3

    by_id = {item["product_id"]: item for item in data["items"]}

    # Product A: 0 stock after selling all -> out_of_stock, velocity 1.0, days 0
    item_a = by_id[p_a_id]
    assert Decimal(str(item_a["daily_velocity"])) == Decimal("1.00")
    assert item_a["current_stock"] == 0
    assert item_a["stock_status"] == "out_of_stock"
    assert item_a["days_until_stockout"] == 0
    assert item_a["total_units_sold_in_window"] == 30
    # reorder_point = 1.0 * 10 = 10.00
    assert Decimal(str(item_a["reorder_point"])) == Decimal("10.00")
    # suggested = ceil(1*37 -0)=37
    assert item_a["suggested_order_qty"] == 37

    # Product B: no sales -> velocity 0, stable, no stockout date
    item_b = by_id[p_b_id]
    assert Decimal(str(item_b["daily_velocity"])) == Decimal("0.00")
    assert item_b["total_units_sold_in_window"] == 0
    assert item_b["stock_status"] == "stable"
    assert item_b["days_until_stockout"] is None
    assert item_b["estimated_stockout_date"] is None
    # reorder_point 0 when velocity 0
    assert Decimal(str(item_b["reorder_point"])) == Decimal("0.00")
    assert item_b["suggested_order_qty"] == 0

    # Product C: 5 stock, 15 sold -> velocity 0.50
    item_c = by_id[p_c_id]
    assert Decimal(str(item_c["daily_velocity"])) == Decimal("0.50")
    assert item_c["current_stock"] == 5
    # days_until = floor(5 / 0.5) = 10
    assert item_c["days_until_stockout"] == 10
    assert Decimal(str(item_c["reorder_point"])) == Decimal("5.00")
    assert item_c["suggested_order_qty"] == math.ceil(float(Decimal("0.50") * Decimal(37) - Decimal(5)))  # 14


@pytest.mark.asyncio
async def test_intelligence_zero_sales_and_stable(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    p = await client.post("/api/v1/products/", json={"name": f"Stable-{uuid.uuid4().hex[:4]}", "sku": f"STB-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "20.00"}, headers=headers)
    p_id = p.json()["id"]
    pur = await client.post("/api/v1/purchases", json={"items": [{"product_id": p_id, "quantity": 10, "unit_cost": "10.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    res = await client.get("/api/v1/intelligence/overview?window_days=30&sort_by=name", headers=headers)
    assert res.status_code == 200
    by_id = {i["product_id"]: i for i in res.json()["items"]}
    item = by_id[p_id]
    assert item["stock_status"] == "stable"
    assert item["days_until_stockout"] is None


@pytest.mark.asyncio
async def test_intelligence_location_scoping(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    # Create two locations
    loc_a = await client.post("/api/v1/locations/", json={"name": f"LocA-{uuid.uuid4().hex[:4]}"}, headers=headers)
    assert loc_a.status_code == 201, loc_a.text
    loc_a_id = loc_a.json()["id"]
    loc_b = await client.post("/api/v1/locations/", json={"name": f"LocB-{uuid.uuid4().hex[:4]}"}, headers=headers)
    loc_b_id = loc_b.json()["id"]

    p = await client.post("/api/v1/products/", json={"name": f"LocProd-{uuid.uuid4().hex[:4]}", "sku": f"LP-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "25.00"}, headers=headers)
    p_id = p.json()["id"]

    # Receive 10 at loc A and 10 at loc B
    for loc_id in [loc_a_id, loc_b_id]:
        r = await client.post("/api/v1/inventory/receive", json={"product_id": p_id, "quantity": 10, "location_id": loc_id}, headers=headers)
        assert r.status_code == 201, r.text

    # Global stock should be 20
    res_all = await client.get(f"/api/v1/intelligence/overview?window_days=30&sort_by=name&limit=100", headers=headers)
    assert res_all.status_code == 200
    item_all = next(i for i in res_all.json()["items"] if i["product_id"] == p_id)
    assert item_all["current_stock"] == 20

    # Sell 8 from loc A only
    s = await client.post("/api/v1/sales", json={"payment_method": "cash", "location_id": loc_a_id, "items": [{"product_id": p_id, "quantity": 8, "selling_price": "25.00"}]}, headers=headers)
    assert s.status_code == 201
    await client.post(f"/api/v1/sales/{s.json()['id']}/complete", headers=headers)

    # Scoped to loc A: stock 2 (10-8), velocity 8/30
    res_a = await client.get(f"/api/v1/intelligence/overview?window_days=30&location_id={loc_a_id}&sort_by=name", headers=headers)
    item_a = next(i for i in res_a.json()["items"] if i["product_id"] == p_id)
    assert item_a["current_stock"] == 2
    assert item_a["total_units_sold_in_window"] == 8

    # Scoped to loc B: stock 10, velocity 0
    res_b = await client.get(f"/api/v1/intelligence/overview?window_days=30&location_id={loc_b_id}&sort_by=name", headers=headers)
    item_b = next(i for i in res_b.json()["items"] if i["product_id"] == p_id)
    assert item_b["current_stock"] == 10
    assert item_b["total_units_sold_in_window"] == 0
    assert item_b["stock_status"] == "stable"


@pytest.mark.asyncio
async def test_intelligence_draft_sales_excluded(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    p = await client.post("/api/v1/products/", json={"name": f"Draft-{uuid.uuid4().hex[:4]}", "sku": f"DR-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "20.00"}, headers=headers)
    p_id = p.json()["id"]
    pur = await client.post("/api/v1/purchases", json={"items": [{"product_id": p_id, "quantity": 10, "unit_cost": "10.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    # Create draft sale (not completed) - 5 units
    s = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": p_id, "quantity": 5, "selling_price": "20.00"}]}, headers=headers)
    assert s.status_code == 201
    # Do not complete

    res = await client.get("/api/v1/intelligence/overview?window_days=30&sort_by=name", headers=headers)
    item = next(i for i in res.json()["items"] if i["product_id"] == p_id)
    assert item["total_units_sold_in_window"] == 0
    assert item["current_stock"] == 10  # draft sale does not affect ledger


@pytest.mark.asyncio
async def test_intelligence_tenant_isolation(client: AsyncClient, auth_user, db_session):
    headers_a = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    pa = await client.post("/api/v1/products/", json={"name": "TenantA_IntProd", "sku": f"TA-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "30.00"}, headers=headers_a)
    pa_id = pa.json()["id"]
    pur_a = await client.post("/api/v1/purchases", json={"items": [{"product_id": pa_id, "quantity": 10, "unit_cost": "10.00"}]}, headers=headers_a)
    await client.post(f"/api/v1/purchases/{pur_a.json()['id']}/receive", headers=headers_a)
    sa = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": pa_id, "quantity": 5, "selling_price": "30.00"}]}, headers=headers_a)
    await client.post(f"/api/v1/sales/{sa.json()['id']}/complete", headers=headers_a)

    # Create tenant B
    user_id2 = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token2 = f"tok-int-{uuid.uuid4()}"
    email2 = f"other-int-{uuid.uuid4().hex[:4]}@test.com"
    user2 = User(id=user_id2, name="OtherInt", email=email2, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user2)
    db_session.add(Session(id=str(uuid.uuid4()), token=token2, userId=user_id2, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
    biz_id2 = str(uuid.uuid4())
    db_session.add(Business(id=biz_id2, name="Other Biz Int", slug=f"other-int-{uuid.uuid4().hex[:4]}", created_at=now, updated_at=now))
    db_session.add(BusinessUser(id=str(uuid.uuid4()), business_id=biz_id2, user_id=user_id2, role=UserRole.OWNER.value, created_at=now))
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=biz_id2, feature_key=key, enabled=True, created_at=now, updated_at=now))
    await db_session.commit()
    headers_b = {"Authorization": f"Bearer {token2}"}

    # Tenant B overview must not contain tenant A product, and counts are zero for B's own empty catalog
    res_b = await client.get("/api/v1/intelligence/overview?window_days=30&sort_by=name", headers=headers_b)
    assert res_b.status_code == 200
    ids_b = {i["product_id"] for i in res_b.json()["items"]}
    assert pa_id not in ids_b
    # Tenant A can still see its product
    res_a = await client.get("/api/v1/intelligence/overview?window_days=30&sort_by=name", headers=headers_a)
    assert any(i["product_id"] == pa_id for i in res_a.json()["items"])

    # Product detail cross-tenant must 404
    res = await client.get(f"/api/v1/intelligence/product/{pa_id}", headers=headers_b)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_intelligence_product_detail_and_validation(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    p = await client.post("/api/v1/products/", json={"name": f"Detail-{uuid.uuid4().hex[:4]}", "sku": f"DT-{uuid.uuid4().hex[:4]}", "cost_price": "15.00", "selling_price": "30.00"}, headers=headers)
    p_id = p.json()["id"]
    pur = await client.post("/api/v1/purchases", json={"items": [{"product_id": p_id, "quantity": 5, "unit_cost": "15.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    res = await client.get(f"/api/v1/intelligence/product/{p_id}?window_days=30", headers=headers)
    assert res.status_code == 200
    assert res.json()["product_id"] == p_id

    # Invalid sort param
    bad = await client.get("/api/v1/intelligence/overview?sort_by=not_a_sort", headers=headers)
    assert bad.status_code == 400

    # Not found
    nf = await client.get(f"/api/v1/intelligence/product/{uuid.uuid4()}", headers=headers)
    assert nf.status_code == 404


@pytest.mark.asyncio
async def test_intelligence_no_mutation(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    p = await client.post("/api/v1/products/", json={"name": f"NoMut-{uuid.uuid4().hex[:4]}", "sku": f"NM-{uuid.uuid4().hex[:4]}", "cost_price": "10.00", "selling_price": "20.00"}, headers=headers)
    p_id = p.json()["id"]
    pur = await client.post("/api/v1/purchases", json={"items": [{"product_id": p_id, "quantity": 10, "unit_cost": "10.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    from app.models.inventory import InventoryMovement

    before = (await db_session.execute(select(InventoryMovement).where(InventoryMovement.business_id == auth_user["business_id"]))).scalars().all()
    before_count = len(before)

    await client.get("/api/v1/intelligence/overview?window_days=30", headers=headers)
    await client.get(f"/api/v1/intelligence/product/{p_id}?window_days=7", headers=headers)
    await client.get("/api/v1/intelligence/overview?window_days=7&lead_time_days=10&safety_days=5&coverage_days=60", headers=headers)

    after = (await db_session.execute(select(InventoryMovement).where(InventoryMovement.business_id == auth_user["business_id"]))).scalars().all()
    assert len(after) == before_count


@pytest.mark.asyncio
async def test_intelligence_search_and_filters(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    await _enable_advanced_reports(db_session, auth_user["business_id"])

    cat = await client.post("/api/v1/categories/", json={"name": f"IntelCat-{uuid.uuid4().hex[:4]}"}, headers=headers)
    cat_id = cat.json()["id"]

    p1 = await client.post("/api/v1/products/", json={"name": "Alpha Widget", "sku": f"AW-{uuid.uuid4().hex[:4]}", "category_id": cat_id, "cost_price": "10.00", "selling_price": "20.00"}, headers=headers)
    p1_id = p1.json()["id"]
    p2 = await client.post("/api/v1/products/", json={"name": "Beta Widget", "sku": f"BW-{uuid.uuid4().hex[:4]}", "category_id": cat_id, "cost_price": "10.00", "selling_price": "20.00"}, headers=headers)
    p2_id = p2.json()["id"]
    for pid in [p1_id, p2_id]:
        pur = await client.post("/api/v1/purchases", json={"items": [{"product_id": pid, "quantity": 5, "unit_cost": "10.00"}]}, headers=headers)
        await client.post(f"/api/v1/purchases/{pur.json()['id']}/receive", headers=headers)

    # Search for Alpha only
    res = await client.get("/api/v1/intelligence/overview?search=alpha&sort_by=name", headers=headers)
    assert res.status_code == 200
    ids = {i["product_id"] for i in res.json()["items"]}
    assert p1_id in ids
    assert p2_id not in ids

    # Category filter
    other_cat = await client.post("/api/v1/categories/", json={"name": f"OtherCat-{uuid.uuid4().hex[:4]}"}, headers=headers)
    other_cat_id = other_cat.json()["id"]
    p3 = await client.post("/api/v1/products/", json={"name": "Gamma Other", "sku": f"GO-{uuid.uuid4().hex[:4]}", "category_id": other_cat_id, "cost_price": "10.00", "selling_price": "20.00"}, headers=headers)
    p3_id = p3.json()["id"]
    pur3 = await client.post("/api/v1/purchases", json={"items": [{"product_id": p3_id, "quantity": 5, "unit_cost": "10.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{pur3.json()['id']}/receive", headers=headers)

    res2 = await client.get(f"/api/v1/intelligence/overview?category_id={cat_id}&sort_by=name", headers=headers)
    ids2 = {i["product_id"] for i in res2.json()["items"]}
    assert p1_id in ids2 and p2_id in ids2
    assert p3_id not in ids2
