from typing import Any


class PandocastException(Exception):
    """Base exception for Pandocast."""

    def __init__(
        self,
        message: str = "An unexpected error occurred",
        detail: str | None = None,
        status_code: int = 500,
    ):
        self.message = message
        self.detail = detail or message
        self.status_code = status_code
        super().__init__(self.message)


class AuthenticationError(PandocastException):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str = "Authentication failed",
        detail: str | None = None,
    ):
        super().__init__(message=message, detail=detail, status_code=401)


class AuthorizationError(PandocastException):
    """Raised when the user lacks permission."""

    def __init__(
        self,
        message: str = "Insufficient permissions",
        detail: str | None = None,
    ):
        super().__init__(message=message, detail=detail, status_code=403)


class NotFoundError(PandocastException):
    """Raised when a resource is not found."""

    def __init__(
        self,
        message: str = "Resource not found",
        detail: str | None = None,
    ):
        super().__init__(message=message, detail=detail, status_code=404)


class ValidationError(PandocastException):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str = "Validation error",
        detail: str | None = None,
    ):
        super().__init__(message=message, detail=detail, status_code=422)


class RateLimitError(PandocastException):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        detail: str | None = None,
    ):
        super().__init__(message=message, detail=detail, status_code=429)
