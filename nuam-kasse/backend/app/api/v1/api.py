from fastapi import APIRouter

from app.api.v1.endpoints import auth, cash_periods, categories, expenses, health, overview, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(cash_periods.router)
api_router.include_router(categories.router)
api_router.include_router(expenses.router)
api_router.include_router(health.router)
api_router.include_router(overview.router)
api_router.include_router(users.router)
