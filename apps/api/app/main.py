import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import get_settings
from app.middleware.logging import RequestLoggingMiddleware
from app.utils.exceptions import PandocastException

settings = get_settings()

# Configure structlog for structured JSON logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

app = FastAPI(
    title="Pandocast API",
    description="Upload once. Pando everywhere. Analyzes your content's DNA, preserves your brand voice, and generates 18 platform-native formats.",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting middleware (Redis-based, degrades gracefully if Redis is unavailable)
try:
    from app.middleware.rate_limit import RateLimitMiddleware

    app.add_middleware(RateLimitMiddleware, redis_url=settings.REDIS_URL)
except Exception:
    structlog.get_logger().warning(
        "rate_limit_middleware_disabled",
        reason="Failed to initialize rate limiting middleware. App will run without rate limits.",
    )

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)


# Exception handlers
@app.exception_handler(PandocastException)
async def pandocast_exception_handler(request: Request, exc: PandocastException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.message,
            "detail": exc.detail,
            "status_code": exc.status_code,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger = structlog.get_logger()
    logger.error("unhandled_exception", error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": "An unexpected error occurred",
            "status_code": 500,
        },
    )


# Include API routes
app.include_router(api_router)


# Health check endpoint
@app.get("/api/v1/health")
async def health_check() -> dict:
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
    }
