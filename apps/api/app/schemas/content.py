"""Pydantic schemas for content upload and DNA card endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ContentUploadRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content_type: str = Field(..., pattern="^(blog|video_transcript|podcast_transcript)$")
    raw_content: str = Field(..., min_length=10)
    source_url: Optional[str] = None


class ContentDNAResponse(BaseModel):
    core_idea: str
    key_points: list[dict]
    best_hooks: list[dict]
    quotable_moments: list[str]
    emotional_arc: list[dict]
    content_type_classification: str
    suggested_platforms: list[dict]


class ContentUploadResponse(BaseModel):
    id: UUID
    title: str
    content_type: str
    status: str
    content_dna: Optional[dict] = None
    source_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContentListResponse(BaseModel):
    items: list[ContentUploadResponse]
    total: int


class ContentUpdateRequest(BaseModel):
    """Update emphasis/focus of the DNA card before generation."""
    emphasis_notes: Optional[str] = None
    focus_hook_index: Optional[int] = None
    additional_context: Optional[str] = None
