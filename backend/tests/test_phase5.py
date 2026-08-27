import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_sale_crud(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Product for sale
    res = await client.post("/api/v1/products/", json={"name": "SaleProdCrud", "sku": f"SPC-{uuid.uuid4().hex[:4]}", "cost_price": "5.00", "selling_price": "10.00"}, headers=headers)
    assert res.status_code == 201, res.text
    prod_id = res.json()["id"]

    # Need stock: create purchase and receive
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-SC-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 10, "unit_cost": "5.00"}]}, headers=headers)
    assert res.status_code == 201
    pur_id = res.json()["id"]
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 200

    # Create draft sale
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 2, "selling_price": "10.00", "discount": "1.00"}]}, headers=headers)
    assert res.status_code == 201, res.text
    sale = res.json()
    sale_id = sale["id"]
    assert sale["status"] == "draft"
    assert sale["payment_method"] == "cash"
    assert len(sale["items"]) == 1

    # List
    res = await client.get("/api/v1/sales", headers=headers)
    assert res.status_code == 200
    assert any(s["id"] == sale_id for s in res.json())

    # Get
    res = await client.get(f"/api/v1/sales/{sale_id}", headers=headers)
    assert res.status_code == 200

    # Delete draft succeeds
    res = await client.delete(f"/api/v1/sales/{sale_id}", headers=headers)
    assert res.status_code == 204

    # Create again and complete then delete should 409
    res = await client.post("/api/v1/sales", json={"payment_method": "card", "items": [{"product_id": prod_id, "quantity": 1, "selling_price": "10.00"}]}, headers=headers)
    sale_id2 = res.json()["id"]
    res = await client.post(f"/api/v1/sales/{sale_id2}/complete", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"
    res = await client.delete(f"/api/v1/sales/{sale_id2}", headers=headers)
    assert res.status_code == 409

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_sale_complete_decrements_stock(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.post("/api/v1/products/", json={"name": "StockSaleProd", "sku": f"SSP-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    prod_id = res.json()["id"]
    # Purchase 10
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-SS-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 10, "unit_cost": "1.00"}]}, headers=headers)
    pur_id = res.json()["id"]
    await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)

    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10

    # Draft sale qty 3, not yet decremented
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 3, "selling_price": "2.00"}]}, headers=headers)
    assert res.status_code == 201
    sale_id = res.json()["id"]
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10

    # Complete should decrement
    res = await client.post(f"/api/v1/sales/{sale_id}/complete", headers=headers)
    assert res.status_code == 200, res.text
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 7

    # Movements SALE -3
    res = await client.get(f"/api/v1/inventory/movements?product_id={prod_id}", headers=headers)
    assert any(m["type"] == "SALE" and m["quantity"] == -3 for m in res.json())

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_sale_device_by_serial(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    serial = f"SN-SALE-{uuid.uuid4().hex[:6]}"
    imei = f"IM{uuid.uuid4().hex[:8]}"
    # Create purchase with device then receive to get in_stock device
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-DS-{uuid.uuid4().hex[:4]}", "items": [{"product_name": "TestPhone", "serial_number": serial, "imei": imei, "quantity": 1, "unit_cost": "100.00"}]}, headers=headers)
    assert res.status_code == 201
    pur_id = res.json()["id"]
    res = await client.post(f"/api/v1/purchases/{pur_id}/receive", headers=headers)
    assert res.status_code == 200
    # Find device
    res = await client.get("/api/v1/devices/", headers=headers)
    dev = [d for d in res.json() if d["serial_number"] == serial][0]
    assert dev["status"] == "in_stock"
    dev_id = dev["id"]

    # Create draft sale with device
    res = await client.post("/api/v1/sales", json={"payment_method": "mobile_money", "items": [{"device_id": dev_id, "quantity": 1, "selling_price": "200.00", "warranty_months_override": 6}]}, headers=headers)
    assert res.status_code == 201, res.text
    sale_id = res.json()["id"]
    assert res.json()["items"][0]["warranty_months_override"] == 6

    # Complete
    res = await client.post(f"/api/v1/sales/{sale_id}/complete", headers=headers)
    assert res.status_code == 200

    # Device should be sold
    res = await client.get(f"/api/v1/devices/{dev_id}", headers=headers)
    assert res.json()["status"] == "sold"

    # Ledger device SALE -1
    res = await client.get("/api/v1/inventory/movements?limit=100", headers=headers)
    assert any(m["device_id"] == dev_id and m["type"] == "SALE" for m in res.json())

    await client.delete(f"/api/v1/devices/{dev_id}", headers=headers)


@pytest.mark.asyncio
async def test_sale_insufficient_stock_400(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.post("/api/v1/products/", json={"name": "InsufProd", "sku": f"INS-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    prod_id = res.json()["id"]
    # Purchase 2
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-INS-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 2, "unit_cost": "1.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{res.json()['id']}/receive", headers=headers)
    # Try to sell 10
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 10, "selling_price": "2.00"}]}, headers=headers)
    assert res.status_code == 201
    sale_id = res.json()["id"]
    # Complete should 400 and not change status
    res = await client.post(f"/api/v1/sales/{sale_id}/complete", headers=headers)
    assert res.status_code == 400
    assert "Insufficient stock" in res.text
    # Sale still draft
    res = await client.get(f"/api/v1/sales/{sale_id}", headers=headers)
    assert res.json()["status"] == "draft"
    # Stock still 2 (atomic no partial)
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 2

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_sale_cancel_inverse(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.post("/api/v1/products/", json={"name": "CancelProd", "sku": f"CAN-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    prod_id = res.json()["id"]
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-CAN-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 5, "unit_cost": "1.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{res.json()['id']}/receive", headers=headers)

    # Draft cancel (no ledger)
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 1, "selling_price": "2.00"}]}, headers=headers)
    draft_id = res.json()["id"]
    res = await client.post(f"/api/v1/sales/{draft_id}/cancel", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    # Stock still 5
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 5

    # Completed cancel should restock
    res = await client.post("/api/v1/sales", json={"payment_method": "card", "items": [{"product_id": prod_id, "quantity": 2, "selling_price": "2.00"}]}, headers=headers)
    sale_id = res.json()["id"]
    await client.post(f"/api/v1/sales/{sale_id}/complete", headers=headers)
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 3
    res = await client.post(f"/api/v1/sales/{sale_id}/cancel", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 5

    # Device cancel
    serial = f"SN-CAN-{uuid.uuid4().hex[:6]}"
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-CAND-{uuid.uuid4().hex[:4]}", "items": [{"product_name": "PhoneX", "serial_number": serial, "quantity": 1, "unit_cost": "50.00"}]}, headers=headers)
    await client.post(f"/api/v1/purchases/{res.json()['id']}/receive", headers=headers)
    res = await client.get("/api/v1/devices/", headers=headers)
    dev_id = [d for d in res.json() if d["serial_number"] == serial][0]["id"]
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"device_id": dev_id, "quantity": 1, "selling_price": "100.00"}]}, headers=headers)
    sale_id2 = res.json()["id"]
    await client.post(f"/api/v1/sales/{sale_id2}/complete", headers=headers)
    res = await client.get(f"/api/v1/devices/{dev_id}", headers=headers)
    assert res.json()["status"] == "sold"
    res = await client.post(f"/api/v1/sales/{sale_id2}/cancel", headers=headers)
    assert res.status_code == 200
    res = await client.get(f"/api/v1/devices/{dev_id}", headers=headers)
    assert res.json()["status"] == "in_stock"
    await client.delete(f"/api/v1/devices/{dev_id}", headers=headers)
    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)


@pytest.mark.asyncio
async def test_sale_tenant_isolation(client: AsyncClient, auth_user, db_session):
    from datetime import datetime, timedelta, timezone
    from app.models.auth import Session, User
    from app.models.business import Business, BusinessUser, UserRole
    from app.models.feature import BusinessFeature, FEATURE_KEYS

    user_id2 = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token2 = f"tok2-{uuid.uuid4()}"
    email2 = f"saleiso-{uuid.uuid4().hex[:4]}@test.com"
    user2 = User(id=user_id2, name="Iso", email=email2, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user2)
    db_session.add(Session(id=str(uuid.uuid4()), token=token2, userId=user_id2, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
    biz_id2 = str(uuid.uuid4())
    db_session.add(Business(id=biz_id2, name="IsoSale Biz", slug=f"isosale-{uuid.uuid4().hex[:4]}", created_at=now, updated_at=now))
    db_session.add(BusinessUser(id=str(uuid.uuid4()), business_id=biz_id2, user_id=user_id2, role=UserRole.OWNER.value, created_at=now))
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=biz_id2, feature_key=key, enabled=True, created_at=now, updated_at=now))
    await db_session.commit()

    headers1 = {"Authorization": f"Bearer {auth_user['token']}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    res = await client.post("/api/v1/products/", json={"name": "IsoSaleProd", "sku": f"ISP-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers1)
    prod_id = res.json()["id"]
    # Also need stock: purchase and receive as user1
    res = await client.post("/api/v1/purchases", json={"invoice_reference": f"INV-ISO-{uuid.uuid4().hex[:4]}", "items": [{"product_id": prod_id, "quantity": 5, "unit_cost": "1.00"}]}, headers=headers1)
    await client.post(f"/api/v1/purchases/{res.json()['id']}/receive", headers=headers1)
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 1, "selling_price": "2.00"}]}, headers=headers1)
    sale_id = res.json()["id"]

    res = await client.get(f"/api/v1/sales/{sale_id}", headers=headers2)
    assert res.status_code == 403
    res = await client.post(f"/api/v1/sales/{sale_id}/complete", headers=headers2)
    assert res.status_code in (403, 404)
    # User2 cannot create sale with product from other business
    res = await client.post("/api/v1/sales", json={"payment_method": "cash", "items": [{"product_id": prod_id, "quantity": 1, "selling_price": "2.00"}]}, headers=headers2)
    assert res.status_code == 400

    await client.delete(f"/api/v1/products/{prod_id}", headers=headers1)
