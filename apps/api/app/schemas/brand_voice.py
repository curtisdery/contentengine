"""Pydantic schemas for brand voice profile endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class VoiceProfileCreateRequest(BaseModel):
    profile_name: str = Field(..., min_length=1, max_length=255)
    voice_attributes: list[str] = Field(default_factory=list)
    sample_content: list[str] = Field(default_factory=list)
    banned_terms: list[str] = Field(default_factory=list)
    preferred_terms: list[str] = Field(default_factory=list)
    audience_label: str = ""
    signature_phrases: list[str] = Field(default_factory=list)
    emoji_policy: dict = Field(default_factory=dict)
    cta_library: list[str] = Field(default_factory=list)
    approved_topics: list[str] = Field(default_factory=list)
    restricted_topics: list[str] = Field(default_factory=list)
    is_default: bool = False


class VoiceProfileUpdateRequest(BaseModel):
    profile_name: Optional[str] = None
    voice_attributes: Optional[list[str]] = None
    sample_content: Optional[list[str]] = None
    banned_terms: Optional[list[str]] = None
    preferred_terms: Optional[list[str]] = None
    audience_label: Optional[str] = None
    signature_phrases: Optional[list[str]] = None
    emoji_policy: Optional[dict] = None
    cta_library: Optional[list[str]] = None
    approved_topics: Optional[list[str]] = None
    restricted_topics: Optional[list[str]] = None
    is_default: Optional[bool] = None


class VoiceProfileResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    profile_name: str
    voice_attributes: list
    sample_content: list
    tone_metrics: dict
    vocabulary: dict
    formatting_config: dict
    cta_library: list
    topic_boundaries: dict
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VoiceSampleAnalysisRequest(BaseModel):
    samples: list[str] = Field(..., min_length=1, max_length=5)


class VoiceSampleAnalysisResponse(BaseModel):
    tone_metrics: dict
    vocabulary_patterns: dict
    signature_phrases: list[str]
    suggested_attributes: list[str]
