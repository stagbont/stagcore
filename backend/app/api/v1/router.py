from fastapi import APIRouter

from app.api.v1 import auth, business, features

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(business.router, prefix="/business", tags=["business"])
api_router.include_router(features.router, prefix="/business", tags=["features"])
