import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app


TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_user(db_session):
    """Create a user + session + business for testing."""
    from app.models.auth import Session, User
    from app.models.business import Business, BusinessUser, UserRole
    from app.models.feature import BusinessFeature, FEATURE_KEYS

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=7)
    token = f"test-token-{uuid.uuid4()}"

    user = User(id=user_id, name="Test User", email=f"test-{uuid.uuid4().hex[:6]}@stagcore.test", emailVerified=True, createdAt=now, updatedAt=now)
    db_session.add(user)
    sess = Session(id=str(uuid.uuid4()), token=token, userId=user_id, expiresAt=expires, createdAt=now, updatedAt=now)
    db_session.add(sess)

    business_id = str(uuid.uuid4())
    biz = Business(id=business_id, name="Test Biz", slug=f"test-biz-{uuid.uuid4().hex[:6]}", created_at=now, updated_at=now)
    db_session.add(biz)
    bu = BusinessUser(id=str(uuid.uuid4()), business_id=business_id, user_id=user_id, role=UserRole.OWNER.value, created_at=now)
    db_session.add(bu)
    for key in FEATURE_KEYS:
        db_session.add(BusinessFeature(id=str(uuid.uuid4()), business_id=business_id, feature_key=key, enabled=False, created_at=now, updated_at=now))

    await db_session.commit()
    return {"user_id": user_id, "email": user.email, "token": token, "business_id": business_id}
