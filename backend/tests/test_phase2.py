import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_category_crud(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Create
    res = await client.post("/api/v1/categories/", json={"name": "Phones", "default_warranty_months": 12}, headers=headers)
    assert res.status_code == 201, res.text
    cat = res.json()
    assert cat["name"] == "Phones"
    assert cat["slug"] == "phones"
    cat_id = cat["id"]
    # Duplicate name should 409
    res2 = await client.post("/api/v1/categories/", json={"name": "Phones"}, headers=headers)
    assert res2.status_code == 409
    # Duplicate slug should 409 (case: same name different case)
    # List
    res = await client.get("/api/v1/categories/", headers=headers)
    assert res.status_code == 200
    assert any(c["id"] == cat_id for c in res.json())
    # Get
    res = await client.get(f"/api/v1/categories/{cat_id}", headers=headers)
    assert res.status_code == 200
    # Update
    res = await client.patch(f"/api/v1/categories/{cat_id}", json={"name": "Smartphones"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Smartphones"
    # Delete (no refs)
    res = await client.delete(f"/api/v1/categories/{cat_id}", headers=headers)
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_category_scoping(client: AsyncClient, auth_user, db_session):
    # Create second business/user and try to access first user's category
    import uuid
    from datetime import datetime, timedelta, timezone
    from app.models.auth import Session, User
    from app.models.business import Business, BusinessUser, UserRole
    from app.models.feature import BusinessFeature, FEATURE_KEYS

    # Create second user/business
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

    headers1 = {"Authorization": f"Bearer {auth_user['token']}"}
    headers2 = {"Authorization": f"Bearer {token2}"}
    # Create category as user1
    res = await client.post("/api/v1/categories/", json={"name": "Tablets"}, headers=headers1)
    assert res.status_code == 201
    cat_id = res.json()["id"]
    # User2 should get 403
    res = await client.get(f"/api/v1/categories/{cat_id}", headers=headers2)
    assert res.status_code == 403
    # List for user2 should not contain it
    res = await client.get("/api/v1/categories/", headers=headers2)
    assert res.status_code == 200
    assert not any(c["id"] == cat_id for c in res.json())


@pytest.mark.asyncio
async def test_supplier_feature_gate(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # By default suppliers feature is disabled (enabled=False)
    res = await client.get("/api/v1/suppliers/", headers=headers)
    assert res.status_code == 403
    assert "disabled" in res.text.lower()
    # Enable it
    from sqlalchemy import select
    from app.models.feature import BusinessFeature

    result = await db_session.execute(select(BusinessFeature).where(BusinessFeature.business_id == auth_user["business_id"], BusinessFeature.feature_key == "suppliers"))
    feat = result.scalars().first()
    feat.enabled = True
    await db_session.commit()
    # Now should work
    res = await client.get("/api/v1/suppliers/", headers=headers)
    assert res.status_code == 200
    # Create supplier
    res = await client.post("/api/v1/suppliers/", json={"name": "Acme Supplies", "phone": "123"}, headers=headers)
    assert res.status_code == 201
    sup_id = res.json()["id"]
    # Get
    res = await client.get(f"/api/v1/suppliers/{sup_id}", headers=headers)
    assert res.status_code == 200
    # Update
    res = await client.patch(f"/api/v1/suppliers/{sup_id}", json={"phone": "999"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["phone"] == "999"
    # Delete
    res = await client.delete(f"/api/v1/suppliers/{sup_id}", headers=headers)
    assert res.status_code == 204
    # Disable again for other tests
    feat.enabled = False
    await db_session.commit()


@pytest.mark.asyncio
async def test_customer_feature_gate(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.get("/api/v1/customers/", headers=headers)
    assert res.status_code == 403
    # Enable
    from sqlalchemy import select
    from app.models.feature import BusinessFeature

    result = await db_session.execute(select(BusinessFeature).where(BusinessFeature.business_id == auth_user["business_id"], BusinessFeature.feature_key == "customers"))
    feat = result.scalars().first()
    feat.enabled = True
    await db_session.commit()
    res = await client.get("/api/v1/customers/", headers=headers)
    assert res.status_code == 200
    res = await client.post("/api/v1/customers/", json={"name": "John Doe", "phone": "555-123"}, headers=headers)
    assert res.status_code == 201
    cust_id = res.json()["id"]
    # Search
    res = await client.get("/api/v1/customers/?q=John", headers=headers)
    assert res.status_code == 200
    assert any(c["id"] == cust_id for c in res.json())
    # Cleanup
    res = await client.delete(f"/api/v1/customers/{cust_id}", headers=headers)
    assert res.status_code == 204
    feat.enabled = False
    await db_session.commit()


@pytest.mark.asyncio
async def test_product_crud_and_sku_unique(client: AsyncClient, auth_user, db_session):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Need category and supplier
    from sqlalchemy import select
    from app.models.feature import BusinessFeature

    # Enable suppliers for product's supplier
    result = await db_session.execute(select(BusinessFeature).where(BusinessFeature.business_id == auth_user["business_id"], BusinessFeature.feature_key == "suppliers"))
    feat = result.scalars().first()
    old = feat.enabled
    feat.enabled = True
    await db_session.commit()
    # Create category
    res = await client.post("/api/v1/categories/", json={"name": "Accessories"}, headers=headers)
    assert res.status_code == 201
    cat_id = res.json()["id"]
    # Create supplier
    res = await client.post("/api/v1/suppliers/", json={"name": "ProdSup"}, headers=headers)
    assert res.status_code == 201
    sup_id = res.json()["id"]
    # Create product
    res = await client.post("/api/v1/products/", json={"name": "USB Cable", "sku": "USB-001", "barcode": "123456", "category_id": cat_id, "supplier_id": sup_id, "brand": "Anker", "cost_price": "5.00", "selling_price": "10.00"}, headers=headers)
    assert res.status_code == 201, res.text
    prod_id = res.json()["id"]
    # Duplicate SKU should 409
    res = await client.post("/api/v1/products/", json={"name": "USB Cable 2", "sku": "USB-001"}, headers=headers)
    assert res.status_code == 409
    # Search
    res = await client.get("/api/v1/products/?q=USB", headers=headers)
    assert res.status_code == 200
    assert any(p["id"] == prod_id for p in res.json())
    # Get
    res = await client.get(f"/api/v1/products/{prod_id}", headers=headers)
    assert res.status_code == 200
    # Update
    res = await client.patch(f"/api/v1/products/{prod_id}", json={"selling_price": "12.00"}, headers=headers)
    assert res.status_code == 200
    assert str(res.json()["selling_price"]) == "12.00"
    # Delete
    res = await client.delete(f"/api/v1/products/{prod_id}", headers=headers)
    assert res.status_code == 204
    # Cleanup category/supplier
    await client.delete(f"/api/v1/categories/{cat_id}", headers=headers)
    await client.delete(f"/api/v1/suppliers/{sup_id}", headers=headers)
    feat.enabled = old
    await db_session.commit()


@pytest.mark.asyncio
async def test_device_crud_and_serial_unique(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    res = await client.post("/api/v1/devices/", json={"product_name": "iPhone 15", "serial_number": "SN-001", "imei": "123456789012345", "brand": "Apple", "cost_price": "500.00", "selling_price": "800.00"}, headers=headers)
    assert res.status_code == 201, res.text
    dev_id = res.json()["id"]
    # Duplicate serial should 409
    res = await client.post("/api/v1/devices/", json={"product_name": "iPhone 15", "serial_number": "SN-001"}, headers=headers)
    assert res.status_code == 409
    # Duplicate IMEI should 409
    res = await client.post("/api/v1/devices/", json={"product_name": "iPhone 16", "serial_number": "SN-002", "imei": "123456789012345"}, headers=headers)
    assert res.status_code == 409
    # List with search
    res = await client.get("/api/v1/devices/?q=SN-001", headers=headers)
    assert res.status_code == 200
    assert any(d["id"] == dev_id for d in res.json())
    # Get
    res = await client.get(f"/api/v1/devices/{dev_id}", headers=headers)
    assert res.status_code == 200
    # Update status
    res = await client.patch(f"/api/v1/devices/{dev_id}", json={"status": "sold"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "sold"
    # Delete
    res = await client.delete(f"/api/v1/devices/{dev_id}", headers=headers)
    assert res.status_code == 204
    # Second device without IMEI should be fine
    res = await client.post("/api/v1/devices/", json={"product_name": "MacBook", "serial_number": "SN-MAC-001"}, headers=headers)
    assert res.status_code == 201
    await client.delete(f"/api/v1/devices/{res.json()['id']}", headers=headers)


@pytest.mark.asyncio
async def test_product_device_category_validation(client: AsyncClient, auth_user):
    headers = {"Authorization": f"Bearer {auth_user['token']}"}
    # Invalid category_id should 400
    res = await client.post("/api/v1/products/", json={"name": "BadProd", "category_id": "00000000-0000-0000-0000-000000000000"}, headers=headers)
    assert res.status_code == 400
    res = await client.post("/api/v1/devices/", json={"product_name": "BadDev", "serial_number": "SN-BAD", "category_id": "00000000-0000-0000-0000-000000000000"}, headers=headers)
    assert res.status_code == 400
