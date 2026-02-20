"""Pydantic schemas for content generation and platform output endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    """Request body for triggering content generation."""

    voice_profile_id: Optional[UUID] = None  # None = no voice filter
    selected_platforms: Optional[list[str]] = None  # None = all applicable
    emphasis_notes: Optional[str] = None


class GeneratedOutputResponse(BaseModel):
    """Response schema for a single generated output."""

    id: UUID
    content_upload_id: UUID
    platform_id: str
    format_name: str
    content: str
    metadata: Optional[dict] = Field(None, validation_alias="output_metadata")
    voice_match_score: Optional[float] = None
    status: str
    moderation_result: Optional[dict] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class GeneratedOutputListResponse(BaseModel):
    """Response schema for listing generated outputs for a content piece."""

    items: list[GeneratedOutputResponse]
    total: int
    content_title: str
    content_id: UUID


class OutputUpdateRequest(BaseModel):
    """Request body for editing an output or changing its status."""

    content: Optional[str] = None  # edited content
    status: Optional[str] = Field(
        None, pattern="^(draft|approved|scheduled|published|failed)$"
    )


class BulkApproveRequest(BaseModel):
    """Request body for bulk-approving multiple outputs."""

    output_ids: list[UUID] = Field(..., min_length=1)


class PlatformProfileResponse(BaseModel):
    """Public-facing schema for a platform profile."""

    platform_id: str
    name: str
    tier: int
    native_tone: str
    media_format: str
    posting_cadence: str
    length_range: dict
