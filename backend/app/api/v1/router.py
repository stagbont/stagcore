from fastapi import APIRouter

from app.api.v1 import (
    auth,
    business,
    categories,
    customers,
    dashboard,
    device_history,
    devices,
    features,
    inventory,
    locations,
    products,
    purchases,
    repairs,
    reports,
    sales,
    suppliers,
    warranties,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(business.router, prefix="/business", tags=["business"])
api_router.include_router(features.router, prefix="/business", tags=["features"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["suppliers"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(locations.router, prefix="/locations", tags=["locations"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(purchases.router, prefix="/purchases", tags=["purchases"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(warranties.router, tags=["warranties"])
api_router.include_router(repairs.router, prefix="/repairs", tags=["repairs"])
api_router.include_router(device_history.router, tags=["device_history"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])

