import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs every request with structured JSON logging.

    Logs: method, path, status_code, duration_ms, user_id (if set), request_id.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        # user_id will be set by the auth dependency if the user is authenticated
        request.state.user_id = None

        start_time = time.perf_counter()

        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        except Exception as exc:
            raise
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            status_code = response.status_code if response else 500
            user_id = getattr(request.state, "user_id", None)

            logger.info(
                "request_completed",
                method=request.method,
                path=str(request.url.path),
                status_code=status_code,
                duration_ms=duration_ms,
                user_id=user_id,
                request_id=request_id,
                client_ip=request.client.host if request.client else None,
            )
