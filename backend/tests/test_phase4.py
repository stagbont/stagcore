import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_purchase_crud(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create product for purchase
    res = await client.post("/api/v1/products/", json={"name": "PurProd", "sku": f"PUR-{uuid.uuid4().hex[:4]}", "cost_price": "5.00", "selling_price": "10.00"}, headers=headers)
    assert res.status_code == 201, res.text
    prod_id = res.json()["id"]

    # Create draft purchase with product item
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-{uuid.uuid4().hex[:4]}", "payment_status": "pending", "items": [{"product_id": prod_id, "quantity": 5, "unit_cost": "5.00"}]}, headers=headers)
    assert res.status_code == 201, res.text
    pur = res.json()
    pur_id = pur["id"]
    assert pur["status"] == "draft"
    assert len(pur["items"]) == 1

    # List should contain it
    res = await client.get("/api/v1/purchases", headers=headers)
    assert res.status_code == 200
    assert any(p["id"] == pur_id for p in res.json())

    # Get single
    res = await client.get(f"/api/v1/purchases/{pur_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["id"] == pur_id

    # Patch (draft)
    res = await client.patch(f"/api/v1/purchases/{pur_id}", json={"invoice_reference": "INV-UPDATED"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["invoice_reference"] == "INV-UPDATED"

    # Delete draft succeeds
    res = await client.delete(f"/api/v1/purchases/{pur_id}", headers=headers)
    assert res.status_code == 204

    # Verify gone
    res = await client.get(f"/api/v1/purchases/{pur_id}", headers=headers)
    assert res.status_code == 404

    # Create again and receive then try delete should 409
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV2-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 2, "unit_cost": "5.00"}]}, headers=headers)
    assert res.status_code == 201
    pur_id2 = res.json()["id"]
    res = await client.post(f"/api/v1/purchases/{pur_id2}/receive", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "received"
    # Delete should fail
    res = await client.delete(f"/api/v1/purchases/{pur_id2}", headers=headers)
    assert res.status_code == 409
    # Patch should fail
    res = await client.patch(f"/api/v1/purchases/{pur_id2}", json={"invoice_reference": "X"}, headers=headers)
    assert res.status_code == 409

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_purchase_receive_increases_stock(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.post("/api/v1/products/", json={"name": "StockProd", "sku": f"SP-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    assert res.status_code == 201
    prod_id = res.json()["id"]

    # Stock 0
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 0

    # Create purchase qty 10
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-STOCK-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 10, "unit_cost": "1.00"}]}, headers=headers)
    assert res.status_code == 201
    pur_id = res.json()["id"]

    # Stock still 0 before receive
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 0

    # Receive
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 200

    # Stock now 10
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10

    # Movements should have PURCHASE
    res = await client.get(f"/api/v1/inventory/movements?product_id={prod_id}", headers=headers)
    assert res.status_code == 200
    assert any(m["type"] == "PURCHASE" and m["quantity"] == 10 for m in res.json())

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_purchase_device_receive_creates_devices(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    serial = f"SN-PUR-{uuid.uuid4().hex[:6]}"
    imei = f"IMEI{uuid.uuid4().hex[:8]}"
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-DEV-{uuid.uuid4().hex[:4]}", "items": [{"product_name": "iPhone 14", "serial_number": serial, "imei": imei, "quantity": 1, "unit_cost": "300.00"}]}, headers=headers)
    assert res.status_code == 201, res.text
    pur_id = res.json()["id"]

    # Device should not exist yet
    res = await client.get("/api/v1/devices/", headers=headers)
    assert not any(d["serial_number"] == serial for d in res.json())

    # Receive
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 200, res.text

    # Device should exist now
    res = await client.get("/api/v1/devices/", headers=headers)
    assert any(d["serial_number"] == serial for d in res.json())
    dev = [d for d in res.json() if d["serial_number"] == serial][0]
    assert dev["status"] == "in_stock"
    assert dev["imei"] == imei

    # Ledger should have device movement
    res = await client.get("/api/v1/inventory/movements?limit=100", headers=headers)
    assert any(m["device_id"] == dev["id"] for m in res.json())

    await client.delete(f"/api/v1/devices/{dev['id']}", headers=headers)


@pytest.mark.asyncio
async def test_purchase_tenant_isolation(client: AsyncClient, auth_user, db_session):
    from datetime import datetime, timedelta, timezone
    from app.models.auth import Session, User
    from app.models.business import Business, BusinessUser, UserRole
    from app.models.feature import BusinessFeature, FEATURE_KEYS

    # Create second business/user
    user_id2 = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token2 = f"tok2-{uuid.uuid4()}"
    email2 = f"puriso-{uuid.uuid4().hex[:4]}@test.com"
    user2 = User(id=user_id2, name="Iso2", email=email2, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user2)
    db_session.add(Session(id=str(uuid.uuid4()), token=token2, userId=user_id2, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
    biz_id2 = str(uuid.uuid4())
    db_session.add(Business(id=biz_id2, name="IsoPur Biz", slug=f"isopur-{uuid.uuid4().hex[:4]}", created_at=now, updated_at=now))
    db_session.add(BusinessUser(id=str(uuid.uuid4()), business_id=biz_id2, user_id=user_id2, role=UserRole.OWNER.value, created_at=now))
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=biz_id2, feature_key=key, enabled=True, created_at=now, updated_at=now))
    await db_session.commit()

    headers1 = {"Authorization": f"Bearer {auth_user['token']}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    # User1 creates product and purchase
    res = await client.post("/api/v1/products/", json={"name": "IsoPurProd", "sku": f"IP-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers1)
    assert res.status_code == 201
    prod_id = res.json()["id"]
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-ISO-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 3, "unit_cost": "1.00"}]}, headers=headers1)
    assert res.status_code == 201
    pur_id = res.json()["id"]

    # User2 cannot see or receive
    res = await client.get(f"/api/v1/purchases/{pur_id}", headers=headers2)
    assert res.status_code == 403
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers2)
    assert res.status_code in (403, 404)
    # User2 create with product from other business should 400
    res = await client.post("/api/v1/purchases", json={"invoice_reference": "INV-X", "items": [{"product_id": prod_id, "quantity": 1, "unit_cost": "1.00"}]}, headers=headers2)
    assert res.status_code == 400

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers1)


@pytest.mark.asyncio
async def test_purchase_receive_idempotency(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.post("/api/v1/products/", json={"name": "IdemProd", "sku": f"IDEM-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    prod_id = res.json()["id"]
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-IDEM-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 2, "unit_cost": "1.00"}]}, headers=headers)
    pur_id = res.json()["id"]
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 200
    # Second receive should 409
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 409
    # Cancel should also 409 now
    res = await client.post(f"/api/v1/purchases/{pur_id}/cancel", headers=headers)
    assert res.status_code == 409
    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_purchase_with_location(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create location and product
    res = await client.post("/api/v1/locations/", json={"name": f"LocPur-{uuid.uuid4().hex[:4]}"}, headers=headers)
    assert res.status_code == 201
    loc_id = res.json()["id"]
    res = await client.post("/api/v1/products/", json={"name": "LocPurProd", "sku": f"LP-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    prod_id = res.json()["id"]
    # Create purchase with location
    res = await client.post("/api/v1/purchases", json={"location_id": loc_id, "invoice_reference": f"INV-LOC-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 7, "unit_cost": "1.00"}]}, headers=headers)
    assert res.status_code == 201, res.text
    pur_id = res.json()["id"]
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 200
    # Stock at location should be 7
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}?location_id={loc_id}", headers=headers)
    assert res.json()["current_stock"] == 7
    # Global stock also 7
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 7
    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)
    # Location delete should 409 because movements exist
    res = await client.delete(f"/api/v1/locations/{loc_id}", headers=headers)
    assert res.status_code == 409
