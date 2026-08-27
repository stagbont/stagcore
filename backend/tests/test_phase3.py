import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_location_crud(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create
    res = await client.post("/api/v1/locations/", json={"name": "Main Warehouse"}, headers=headers)
    assert res.status_code == 201, res.text
    loc = res.json()
    loc_id = loc["id"]
    assert loc["name"] == "Main Warehouse"
    # Duplicate name 409
    res = await client.post("/api/v1/locations/", json={"name": "Main Warehouse"}, headers=headers)
    assert res.status_code == 409
    # List
    res = await client.get("/api/v1/locations/", headers=headers)
    assert res.status_code == 200
    assert any(l["id"] == loc_id for l in res.json())
    # Get
    res = await client.get(f"/api/v1/locations/{loc_id}", headers=headers)
    assert res.status_code == 200
    # Update
    res = await client.patch(f"/api/v1/locations/{loc_id}", json={"name": "Main Wh v2"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Main Wh v2"
    # Delete
    res = await client.delete(f"/api/v1/locations/{loc_id}", headers=headers)
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_location_scoping(client: AsyncClient, auth_user, db_session):
    from datetime import datetime, timedelta, timezone
    from app.models.auth import Session, User
    from app.models.business import Business, BusinessUser, UserRole
    from app.models.feature import BusinessFeature, FEATURE_KEYS

    user_id2 = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token2 = f"tok2-{uuid.uuid4()}"
    email2 = f"loc2-{uuid.uuid4().hex[:4]}@test.com"
    user2 = User(id=user_id2, name="Other", email=email2, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user2)
    db_session.add(Session(id=str(uuid.uuid4()), token=token2, userId=user_id2, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
    biz_id2 = str(uuid.uuid4())
    db_session.add(Business(id=biz_id2, name="Other Biz2", slug=f"other2-{uuid.uuid4().hex[:4]}", created_at=now, updated_at=now))
    db_session.add(BusinessUser(id=str(uuid.uuid4()), business_id=biz_id2, user_id=user_id2, role=UserRole.OWNER.value, created_at=now))
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=biz_id2, feature_key=key, enabled=True, created_at=now, updated_at=now))
    await db_session.commit()
    headers1 = {"Authorization": f"Bearer {auth_user['token']}"}
    headers2 = {"Authorization": f"Bearer {token2}"}
    res = await client.post("/api/v1/locations/", json={"name": "LocA"}, headers=headers1)
    assert res.status_code == 201
    loc_id = res.json()["id"]
    res = await client.get(f"/api/v1/locations/{loc_id}", headers=headers2)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_inventory_receive_sell_adjust(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create category and product for inventory
    res = await client.post("/api/v1/categories/", json={"name": "InvCat"}, headers=headers)
    assert res.status_code == 201
    cat_id = res.json()["id"]
    res = await client.post("/api/v1/products/", json={"name": "InvProd", "sku": f"INV-{uuid.uuid4().hex[:4]}", "category_id": cat_id, "cost_price": "1.00", "selling_price": "2.00", "minimum_stock_level": 5}, headers=headers)
    assert res.status_code == 201, res.text
    prod_id = res.json()["id"]
    # Stock should be 0 initially
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["current_stock"] == 0
    # Receive 10
    res = await client.post("/api/v1/inventory/receive", json={"product_id": prod_id, "quantity": 10}, headers=headers)
    assert res.status_code == 201, res.text
    assert res.json()["quantity"] == 10
    # Stock should be 10
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10
    # Sell 3
    res = await client.post("/api/v1/inventory/sell", json={"product_id": prod_id, "quantity": 3}, headers=headers)
    assert res.status_code == 201
    assert res.json()["quantity"] == -3
    # Stock should be 7
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 7
    # Sell more than stock should 400
    res = await client.post("/api/v1/inventory/sell", json={"product_id": prod_id, "quantity": 100}, headers=headers)
    assert res.status_code == 400
    # Adjust out 2
    res = await client.post("/api/v1/inventory/adjust", json={"product_id": prod_id, "quantity": 2, "direction": "out"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["quantity"] == -2
    # Stock should be 5
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 5
    # Adjust in 5
    res = await client.post("/api/v1/inventory/adjust", json={"product_id": prod_id, "quantity": 5, "direction": "in"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["quantity"] == 5
    # Stock should be 10
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10
    # Customer return 2
    res = await client.post("/api/v1/inventory/return", json={"product_id": prod_id, "quantity": 2, "kind": "customer"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["quantity"] == 2
    # Stock should be 12
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 12
    # Supplier return 2
    res = await client.post("/api/v1/inventory/return", json={"product_id": prod_id, "quantity": 2, "kind": "supplier"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["quantity"] == -2
    # Stock should be 10
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10
    # Movements history should have 6 entries (receive, sell, adjust out, adjust in, customer return, supplier return)
    res = await client.get(f"/api/v1/inventory/movements?product_id={prod_id}", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 6
    # Low stock: product has minimum 5, current is 10, so not low
    res = await client.get("/api/v1/inventory/low-stock", headers=headers)
    assert res.status_code == 200
    # Sell to make it low
    res = await client.post("/api/v1/inventory/sell", json={"product_id": prod_id, "quantity": 6}, headers=headers)
    assert res.status_code == 201
    res = await client.get("/api/v1/inventory/low-stock", headers=headers)
    assert any(item["product_id"] == prod_id for item in res.json())
    # Cleanup
    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)
    await client.delete(f"/api/v1/categories/{cat_id}", headers=headers)


@pytest.mark.asyncio
async def test_inventory_with_location(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create location
    res = await client.post("/api/v1/locations/", json={"name": "LocForInv"}, headers=headers)
    assert res.status_code == 201
    loc_id = res.json()["id"]
    # Create product

    res = await client.post("/api/v1/products/", json={"name": "LocProd", "sku": f"LOC-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers)
    assert res.status_code == 201
    prod_id = res.json()["id"]
    # Receive at location
    res = await client.post("/api/v1/inventory/receive", json={"product_id": prod_id, "quantity": 10, "location_id": loc_id}, headers=headers)
    assert res.status_code == 201
    # Stock global should be 10
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers)
    assert res.json()["current_stock"] == 10
    # Stock at location should be 10
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}?location_id={loc_id}", headers=headers)
    assert res.json()["current_stock"] == 10
    # Stock at other location should be 0 (create second loc)
    res = await client.post("/api/v1/locations/", json={"name": "Loc2"}, headers=headers)
    assert res.status_code == 201
    loc2_id = res.json()["id"]
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}?location_id={loc2_id}", headers=headers)
    assert res.json()["current_stock"] == 0
    # Cleanup: need to delete movements first? But we can just delete product (SET NULL) and locations
    # Our service doesn't block, but we can just delete product and locations after checking low-stock doesn't depend
    # Delete movements via direct? Instead just delete product (will SET NULL product_id in movements, but that's okay for test)
    await client.delete(f"/api/v1/products/{prod_id}", headers=headers)
    # Delete locations: need to ensure no movements reference them? But we have movements with location_id, so delete should 409
    res = await client.delete(f"/api/v1/locations/{loc_id}", headers=headers)
    assert res.status_code == 409
    # So we need to keep them; just leave for test isolation (in-memory DB will be dropped)
    # For now, just verify the 409 is correct
    # Create a new loc with no movements and delete it
    res = await client.post("/api/v1/locations/", json={"name": "TempLoc"}, headers=headers)
    assert res.status_code == 201
    temp_id = res.json()["id"]
    res = await client.delete(f"/api/v1/locations/{temp_id}", headers=headers)
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_inventory_tenant_isolation(client: AsyncClient, auth_user, db_session):
    from datetime import datetime, timedelta, timezone
    from app.models.auth import Session, User
    from app.models.business import Business, BusinessUser, UserRole
    from app.models.feature import BusinessFeature, FEATURE_KEYS

    # Create second user/business
    user_id2 = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    token2 = f"tok2-{uuid.uuid4()}"
    email2 = f"iso2-{uuid.uuid4().hex[:4]}@test.com"
    user2 = User(id=user_id2, name="Iso", email=email2, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user2)
    db_session.add(Session(id=str(uuid.uuid4()), token=token2, userId=user_id2, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now))
    biz_id2 = str(uuid.uuid4())
    db_session.add(Business(id=biz_id2, name="Iso Biz", slug=f"iso-{uuid.uuid4().hex[:4]}", created_at=now, updated_at=now))
    db_session.add(BusinessUser(id=str(uuid.uuid4()), business_id=biz_id2, user_id=user_id2, role=UserRole.OWNER.value, created_at=now))
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=biz_id2, feature_key=key, enabled=True, created_at=now, updated_at=now))
    await db_session.commit()
    headers1 = {"Authorization": f"Bearer {auth_user['token']}"}
    headers2 = {"Authorization": f"Bearer {token2}"}
    # Create product as user1
    res = await client.post("/api/v1/products/", json={"name": "IsoProd", "sku": f"ISO-{uuid.uuid4().hex[:4]}", "cost_price": "1.00", "selling_price": "2.00"}, headers=headers1)
    assert res.status_code == 201
    prod_id = res.json()["id"]
    # User2 should not see it
    res = await client.get(f"/api/v1/inventory/stock/{prod_id}", headers=headers2)
    assert res.status_code == 404
    # User2 should not be able to receive stock for it
    res = await client.post("/api/v1/inventory/receive", json={"product_id": prod_id, "quantity": 5}, headers=headers2)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_device_status_creates_ledger(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create device

    serial = f"SN-LEDGER-{uuid.uuid4().hex[:6]}"
    res = await client.post("/api/v1/devices/", json={"product_name": "TestPhone", "serial_number": serial, "cost_price": "100.00", "selling_price": "200.00"}, headers=headers)
    assert res.status_code == 201
    dev_id = res.json()["id"]
    # Initial status is in_stock, no ledger yet (creation doesn't create ledger)
    # Change to sold via PATCH (should create ledger)
    res = await client.patch(f"/api/v1/devices/{dev_id}", json={"status": "sold"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "sold"
    # Check movements: should have one for device
    res = await client.get(f"/api/v1/inventory/movements?limit=100", headers=headers)
    assert res.status_code == 200
    movs = res.json()
    # Find movement with device_id == dev_id
    dev_movs = [m for m in movs if m["device_id"] == dev_id]
    assert len(dev_movs) >= 1, f"Expected ledger for device, got {movs[:2]}"
    assert dev_movs[0]["type"] == "SALE"
    assert dev_movs[0]["quantity"] == -1
    # Change back to in_stock
    res = await client.patch(f"/api/v1/devices/{dev_id}", json={"status": "in_stock"}, headers=headers)
    assert res.status_code == 200
    # Should have second ledger
    res = await client.get(f"/api/v1/inventory/movements?limit=100", headers=headers)
    dev_movs = [m for m in res.json() if m["device_id"] == dev_id]
    assert len(dev_movs) >= 2
    await client.delete(f"/api/v1/devices/{dev_id}", headers=headers)
