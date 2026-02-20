"""Pydantic schemas for autopilot, A/B testing, and security endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Autopilot Schemas
# ---------------------------------------------------------------------------


class AutopilotConfigResponse(BaseModel):
    """Response schema for autopilot configuration."""

    id: UUID
    workspace_id: UUID
    platform_id: str
    enabled: bool
    total_outputs_reviewed: int
    approved_without_edit: int
    approval_rate: float
    required_approval_rate: float
    required_minimum_reviews: int
    enabled_at: Optional[datetime] = None
    auto_publish_count: int

    model_config = {"from_attributes": True}


class AutopilotEligibilityResponse(BaseModel):
    """Response schema for autopilot eligibility check."""

    eligible: bool
    current_approval_rate: float
    required_approval_rate: float
    reviews_completed: int
    reviews_required: int
    message: str


class AutopilotSummaryResponse(BaseModel):
    """Response schema for autopilot summary across all platforms."""

    total_platforms: int
    autopilot_enabled: int
    eligible_not_enabled: int
    not_eligible: int
    total_auto_published: int
    platforms: list[dict]


class EnableAutopilotRequest(BaseModel):
    """Request schema to enable autopilot for a platform."""

    platform_id: str


class UpdateThresholdsRequest(BaseModel):
    """Request schema to update autopilot thresholds."""

    required_approval_rate: Optional[float] = Field(None, ge=0.5, le=1.0)
    required_minimum_reviews: Optional[int] = Field(None, ge=5, le=100)


class RecordReviewRequest(BaseModel):
    """Request schema to record a content review."""

    platform_id: str
    was_edited: bool


# ---------------------------------------------------------------------------
# A/B Testing Schemas
# ---------------------------------------------------------------------------


class ABTestCreateRequest(BaseModel):
    """Request schema to create an A/B test."""

    content_upload_id: UUID
    platform_id: str
    variant_a_output_id: UUID
    variant_b_output_id: UUID


class ABTestResponse(BaseModel):
    """Response schema for an A/B test."""

    id: UUID
    workspace_id: UUID
    content_upload_id: UUID
    platform_id: str
    variant_a_output_id: UUID
    variant_b_output_id: UUID
    status: str
    winner_output_id: Optional[UUID] = None
    variant_a_metrics: Optional[dict] = None
    variant_b_metrics: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Audit / Security Schemas
# ---------------------------------------------------------------------------


class AuditLogResponse(BaseModel):
    """Response schema for a single audit log entry."""

    id: UUID
    user_id: Optional[UUID] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: Optional[dict] = Field(None, validation_alias="event_metadata")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class AuditLogListResponse(BaseModel):
    """Response schema for paginated audit log entries."""

    items: list[AuditLogResponse]
    total: int


class SessionResponse(BaseModel):
    """Response schema for a user session."""

    id: UUID
    device_fingerprint: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    expires_at: datetime
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
