"""Redis-based rate limiting middleware using a sliding window algorithm."""

import logging
import time

import redis.asyncio as redis
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-user and per-IP rate limiting using Redis sliding window.

    Rate limits are enforced per minute with endpoint-specific overrides.
    Gracefully degrades if Redis is unavailable (allows all requests through).
    """

    def __init__(self, app, redis_url: str):
        super().__init__(app)
        self.redis_url = redis_url
        self._redis: redis.Redis | None = None

        # Default limits (requests per minute)
        self.default_limit = 60
        self.auth_limit = 10  # stricter for auth endpoints
        self.generation_limit = 5  # expensive AI operations

        # Endpoint-specific overrides (prefix matching)
        self.endpoint_limits = {
            "/api/v1/auth/login": self.auth_limit,
            "/api/v1/auth/signup": self.auth_limit,
            "/api/v1/auth/refresh": 20,
            "/api/v1/generation/": self.generation_limit,
            "/api/v1/content/": 30,
            "/api/v1/analytics/": 30,
        }

    async def _get_redis(self) -> redis.Redis | None:
        """Lazy-initialize Redis connection."""
        if self._redis is None:
            try:
                self._redis = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=2,
                )
                # Test the connection
                await self._redis.ping()
            except Exception as exc:
                logger.warning("Redis unavailable for rate limiting: %s", exc)
                self._redis = None
        return self._redis

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip rate limiting for health check
        if request.url.path == "/api/v1/health":
            return await call_next(request)

        redis_client = await self._get_redis()

        # If Redis is unavailable, allow the request through
        if redis_client is None:
            return await call_next(request)

        # Determine rate limit key (user_id if authenticated, IP otherwise)
        key = self._get_rate_key(request)
        limit = self._get_limit(request.url.path)

        try:
            # Check rate limit using sliding window
            allowed = await self._check_rate(redis_client, key, limit)

            if not allowed:
                return Response(
                    content=(
                        '{"error": "Rate limit exceeded", '
                        '"detail": "Too many requests. Please try again later.", '
                        '"status_code": 429}'
                    ),
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": "60"},
                )

            response = await call_next(request)

            # Add rate limit headers
            remaining = await self._get_remaining(redis_client, key, limit)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(max(0, remaining))

            return response

        except Exception as exc:
            # If Redis fails mid-request, log and allow through
            logger.warning("Rate limit check failed: %s", exc)
            self._redis = None  # Reset connection for next attempt
            return await call_next(request)

    def _get_rate_key(self, request: Request) -> str:
        """Build the rate limit key. Uses user_id if available, falls back to IP."""
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"rate:user:{user_id}"
        client_ip = request.client.host if request.client else "unknown"
        return f"rate:ip:{client_ip}"

    def _get_limit(self, path: str) -> int:
        """Get the rate limit for a given path using prefix matching."""
        for prefix, limit in self.endpoint_limits.items():
            if path.startswith(prefix):
                return limit
        return self.default_limit

    async def _check_rate(
        self, redis_client: redis.Redis, key: str, limit: int
    ) -> bool:
        """Sliding window rate check. Returns True if the request is allowed."""
        now = time.time()
        window = 60  # 1 minute window

        pipe = redis_client.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window + 1)
        results = await pipe.execute()

        count = results[2]
        return count <= limit

    async def _get_remaining(
        self, redis_client: redis.Redis, key: str, limit: int
    ) -> int:
        """Get the number of remaining requests in the current window."""
        count = await redis_client.zcard(key)
        return limit - count
