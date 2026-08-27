import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_auth_me_requires_token(client: AsyncClient):
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_with_token(client: AsyncClient, auth_user):
    res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {auth_user['token']}"})
    assert res.status_code == 200
    assert res.json()["email"] == auth_user["email"]


@pytest.mark.asyncio
async def test_list_businesses(client: AsyncClient, auth_user):
    res = await client.get("/api/v1/business/", headers={"Authorization": f"Bearer {auth_user['token']}"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert any(b["id"] == auth_user["business_id"] for b in data)


@pytest.mark.asyncio
async def test_business_scoping(client: AsyncClient, auth_user, db_session):
    # Try to access a business the user is not a member of
    res = await client.get("/api/v1/business/not-a-real-id", headers={"Authorization": f"Bearer {auth_user['token']}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_list_features(client: AsyncClient, auth_user):
    res = await client.get(f"/api/v1/business/{auth_user['business_id']}/features", headers={"Authorization": f"Bearer {auth_user['token']}"})
    assert res.status_code == 200
    data = res.json()
    assert "features" in data
    assert len(data["features"]) == 7
    keys = {f["feature_key"] for f in data["features"]}
    assert keys == {"warranty", "repairs", "multi_location", "barcode_scanning", "suppliers", "customers", "advanced_reports"}


@pytest.mark.asyncio
async def test_toggle_requires_platform_admin(client: AsyncClient, auth_user):
    res = await client.post(
        f"/api/v1/business/{auth_user['business_id']}/features",
        json={"feature_key": "warranty", "enabled": True},
        headers={"Authorization": f"Bearer {auth_user['token']}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_register_creates_business(client: AsyncClient, db_session):
    import uuid
    from datetime import datetime, timedelta, timezone
    from app.models.auth import Session, User

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    email = f"reg-{uuid.uuid4().hex[:6]}@stagcore.test"
    user = User(id=user_id, name="Reg User", email=email, emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user)
    sess = Session(id=str(uuid.uuid4()), token=f"tok-{uuid.uuid4()}", userId=user_id, expiresAt=now + timedelta(days=7), createdAt=now, updatedAt=now)
    db_session.add(sess)
    await db_session.commit()

    # Need auth to call register — use the same user's token
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "name": "Reg User", "business_name": "Reg Shop"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Reg Shop"
    assert "slug" in data
