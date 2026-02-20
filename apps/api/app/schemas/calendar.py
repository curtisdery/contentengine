"""Pydantic schemas for calendar, scheduling, and platform connection endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Calendar / Scheduling Schemas
# ---------------------------------------------------------------------------


class ScheduleOutputRequest(BaseModel):
    """Schedule a single output for publishing."""
    output_id: UUID
    scheduled_at: datetime  # ISO 8601 with timezone


class ScheduleBatchRequest(BaseModel):
    """Schedule multiple outputs at once."""
    items: list[ScheduleOutputRequest] = Field(..., min_length=1)


class AutoScheduleRequest(BaseModel):
    """Use the distribution arc to auto-schedule all approved outputs for a content piece."""
    content_id: UUID
    start_date: datetime  # When to start the distribution arc


class RescheduleRequest(BaseModel):
    """Reschedule an event to a new time (e.g. drag-and-drop on calendar)."""
    scheduled_at: datetime


class ScheduledEventResponse(BaseModel):
    """Response schema for a single scheduled event."""
    id: UUID
    workspace_id: UUID
    generated_output_id: UUID
    platform_id: str
    scheduled_at: datetime
    published_at: Optional[datetime] = None
    status: str
    publish_error: Optional[str] = None
    retry_count: int
    priority: int
    created_at: datetime
    updated_at: datetime
    # Nested output info (populated from joined data)
    output_content: Optional[str] = None
    output_format_name: Optional[str] = None
    content_title: Optional[str] = None

    model_config = {"from_attributes": True}


class CalendarEventsResponse(BaseModel):
    """Response schema for a list of calendar events."""
    events: list[ScheduledEventResponse]
    total: int


class ContentGapResponse(BaseModel):
    """Response schema for a single content gap analysis result."""
    platform_id: str
    platform_name: str
    last_scheduled_at: Optional[datetime] = None
    days_since_last: int
    recommended_cadence_days: int
    gap_severity: str  # none/mild/moderate/severe
    suggestion: str


class CalendarStatsResponse(BaseModel):
    """Response schema for calendar overview statistics."""
    total_scheduled: int
    total_published: int
    total_failed: int
    upcoming_today: int
    upcoming_this_week: int
    platforms_active: int
    content_gaps: list[ContentGapResponse]


class PublishNowResponse(BaseModel):
    """Response schema for an immediate publish attempt."""
    event: ScheduledEventResponse
    publish_result: dict


# ---------------------------------------------------------------------------
# Platform Connection Schemas
# ---------------------------------------------------------------------------


class ConnectPlatformRequest(BaseModel):
    """Store OAuth connection data for a platform."""
    platform_user_id: Optional[str] = None
    platform_username: Optional[str] = None
    access_token: str
    refresh_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    scopes: list[str] = Field(default_factory=list)


class PlatformConnectionResponse(BaseModel):
    """Response schema for a platform connection."""
    id: UUID
    workspace_id: UUID
    platform_id: str
    platform_user_id: Optional[str] = None
    platform_username: Optional[str] = None
    is_active: bool
    token_expires_at: Optional[datetime] = None
    scopes: list = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlatformConnectionStatusResponse(BaseModel):
    """Response schema for a platform connection status check."""
    connected: bool
    platform_id: str
    platform_username: Optional[str] = None
    token_expired: bool
    is_active: bool


class OAuthAuthorizeResponse(BaseModel):
    """Response containing the OAuth authorize URL to redirect the user to."""
    authorize_url: str


class AppPasswordRequest(BaseModel):
    """Request body for Bluesky app-password authentication."""
    handle: str
    app_password: str
