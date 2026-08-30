from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text as sql_text

from app.core.database import get_db
from app.core.deps import get_current_user, require_platform_admin
from app.models.business import Business, BusinessUser
from app.models.feature import BusinessFeature

router = APIRouter()


@router.get("/businesses")
async def admin_list_businesses(
    current_user: dict = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    # List ALL businesses with owner + feature summary. Platform admin only.
    # Fetch businesses ordered by created_at desc
    biz_res = await db.execute(select(Business).order_by(Business.created_at.desc()))
    businesses = biz_res.scalars().all()

    # Preload owners (OWNER role) and feature counts in bulk
    # Map business_id -> owner
    bu_res = await db.execute(
        select(BusinessUser).where(BusinessUser.role == "OWNER")
    )
    owner_map: dict[str, BusinessUser] = {}
    for bu in bu_res.scalars().all():
        # keep first owner per business (should be unique)
        if bu.business_id not in owner_map:
            owner_map[bu.business_id] = bu

    # Owner user details from "user" table (Better Auth)
    user_ids = [bu.user_id for bu in owner_map.values()]
    user_map: dict[str, dict] = {}
    if user_ids:
        # Use raw SQL for Better Auth table
        # Build IN clause safely via param expansion
        placeholders = ",".join([f":uid{i}" for i in range(len(user_ids))])
        params = {f"uid{i}": uid for i, uid in enumerate(user_ids)}
        # Fetch id, email, name
        q = sql_text(f'SELECT id, email, name FROM "user" WHERE id IN ({placeholders})')
        r = await db.execute(q, params)
        for row in r.mappings().all():
            user_map[row["id"]] = dict(row)

    # Feature counts per business (compute in Python for SQLite/Postgres portability)
    all_feats = (await db.execute(select(BusinessFeature))).scalars().all()
    feat_map: dict[str, dict] = {}
    for f in all_feats:
        entry = feat_map.setdefault(f.business_id, {"total": 0, "enabled": 0})
        entry["total"] += 1
        if f.enabled:
            entry["enabled"] += 1

    result = []
    for b in businesses:
        bu = owner_map.get(b.id)
        owner = user_map.get(bu.user_id) if bu else None
        feat = feat_map.get(b.id, {"total": 0, "enabled": 0})
        result.append(
            {
                "id": b.id,
                "name": b.name,
                "slug": b.slug,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "updated_at": b.updated_at.isoformat() if b.updated_at else None,
                "owner_name": owner["name"] if owner else None,
                "owner_email": owner["email"] if owner else None,
                "owner_user_id": bu.user_id if bu else None,
                "features_total": feat["total"],
                "features_enabled": feat["enabled"],
            }
        )
    return result
