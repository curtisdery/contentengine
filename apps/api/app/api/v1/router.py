from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.billing import router as billing_router
from app.api.v1.content import router as content_router
from app.api.v1.voice import router as voice_router
from app.api.v1.generation import router as generation_router
from app.api.v1.calendar import router as calendar_router
from app.api.v1.connections import router as connections_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.autopilot import router as autopilot_router
from app.api.v1.ab_tests import router as ab_tests_router
from app.api.v1.security import router as security_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(billing_router, prefix="/billing", tags=["billing"])
api_router.include_router(content_router, prefix="/content", tags=["content"])
api_router.include_router(voice_router, prefix="/voice", tags=["voice"])
api_router.include_router(generation_router, prefix="/generation", tags=["generation"])
api_router.include_router(calendar_router, prefix="/calendar", tags=["calendar"])
api_router.include_router(connections_router, prefix="/connections", tags=["connections"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])
api_router.include_router(autopilot_router, prefix="/autopilot", tags=["autopilot"])
api_router.include_router(ab_tests_router, prefix="/ab-tests", tags=["ab-tests"])
api_router.include_router(security_router, prefix="/security", tags=["security"])
