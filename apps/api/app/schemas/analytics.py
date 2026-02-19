"""Pydantic schemas for analytics dashboard and Multiplier Score endpoints."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Snapshot Schemas
# ---------------------------------------------------------------------------


class RecordSnapshotRequest(BaseModel):
    """Record a point-in-time analytics snapshot for a published output."""
    output_id: UUID
    impressions: int = 0
    engagements: int = 0
    engagement_rate: float = 0.0
    saves_bookmarks: int = 0
    shares_reposts: int = 0
    comments: int = 0
    clicks: int = 0
    follows_gained: int = 0
    platform_specific: Optional[dict] = None


class AnalyticsSnapshotResponse(BaseModel):
    """Response schema for a single analytics snapshot."""
    id: UUID
    generated_output_id: UUID
    platform_id: str
    snapshot_time: datetime
    impressions: int
    engagements: int
    engagement_rate: float
    saves_bookmarks: int
    shares_reposts: int
    comments: int
    clicks: int
    follows_gained: int
    platform_specific: Optional[dict] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Multiplier Score Schemas
# ---------------------------------------------------------------------------


class MultiplierScoreResponse(BaseModel):
    """Response schema for a content piece's Multiplier Score."""
    id: UUID
    content_upload_id: UUID
    multiplier_value: float
    original_reach: int
    total_reach: int
    total_engagements: int
    platforms_published: int
    platform_breakdown: list
    best_platform_id: Optional[str] = None
    best_platform_reach: int
    calculated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Performance Insight Schemas
# ---------------------------------------------------------------------------


class PlatformPerformanceResponse(BaseModel):
    """Per-platform performance aggregation."""
    platform_id: str
    platform_name: str
    total_impressions: int
    total_engagements: int
    avg_engagement_rate: float
    total_saves: int
    total_shares: int
    total_clicks: int
    total_follows: int
    post_count: int
    trend: str  # improving/stable/declining


class ContentTypePerformanceResponse(BaseModel):
    """Performance breakdown by content type."""
    content_type: str
    avg_engagement_rate: float
    total_reach: int
    post_count: int
    avg_multiplier_score: float


class HookPerformanceResponse(BaseModel):
    """Performance by hook type used in generated outputs."""
    hook_type: str
    avg_engagement_rate: float
    total_reach: int
    usage_count: int
    best_platform_for_hook: Optional[str] = None


class TimeHeatmapEntry(BaseModel):
    """Single entry in the day/hour engagement heatmap."""
    day_of_week: int  # 0=Mon, 6=Sun
    hour: int  # 0-23
    avg_engagement_rate: float
    post_count: int


class AudienceIntelligenceResponse(BaseModel):
    """Audience insights across platforms."""
    fastest_growing_platform: Optional[dict] = None
    best_engagement_platform: Optional[dict] = None
    platform_rankings: list[dict]
    recommendations: list[str]


class ContentStrategySuggestion(BaseModel):
    """A data-driven content strategy suggestion."""
    type: str  # topic/format/timing/platform
    suggestion: str
    confidence: float
    data_points: int


# ---------------------------------------------------------------------------
# Dashboard Schemas
# ---------------------------------------------------------------------------


class AnalyticsDashboardResponse(BaseModel):
    """Main analytics dashboard overview."""
    total_content_pieces: int
    total_outputs_generated: int
    total_published: int
    total_reach: int
    total_engagements: int
    avg_multiplier_score: float
    best_multiplier_score: float
    platforms_active: int
    top_performing_content: list[dict]
    recent_performance: list[dict]
