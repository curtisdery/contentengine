"""Analytics models for engagement tracking and Multiplier Score."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Float, Integer, String, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.types import JSONB

from app.database import Base


class AnalyticsSnapshot(Base):
    """Point-in-time engagement data for a published output."""
    __tablename__ = "analytics_snapshots"
    __table_args__ = (
        Index(
            "ix_analytics_snapshots_output_time",
            "generated_output_id",
            "snapshot_time",
        ),
        Index(
            "ix_analytics_snapshots_workspace_time",
            "workspace_id",
            "snapshot_time",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    generated_output_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generated_outputs.id"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)
    snapshot_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Unified metrics
    impressions: Mapped[int] = mapped_column(BigInteger, default=0)
    engagements: Mapped[int] = mapped_column(BigInteger, default=0)
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)
    saves_bookmarks: Mapped[int] = mapped_column(Integer, default=0)
    shares_reposts: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    follows_gained: Mapped[int] = mapped_column(Integer, default=0)

    # Platform-specific raw data
    platform_specific: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # Relationships
    generated_output: Mapped["GeneratedOutput"] = relationship(
        "GeneratedOutput", backref="analytics_snapshots"
    )
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", backref="analytics_snapshots"
    )


class MultiplierScore(Base):
    """Cached Multiplier Score for each content upload."""
    __tablename__ = "multiplier_scores"
    __table_args__ = (
        UniqueConstraint(
            "content_upload_id",
            name="uq_multiplier_score_content",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    content_upload_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_uploads.id"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )

    # The score
    multiplier_value: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # Breakdown
    original_reach: Mapped[int] = mapped_column(BigInteger, default=0)
    total_reach: Mapped[int] = mapped_column(BigInteger, default=0)
    total_engagements: Mapped[int] = mapped_column(BigInteger, default=0)
    platforms_published: Mapped[int] = mapped_column(Integer, default=0)

    # Per-platform breakdown stored as JSONB
    platform_breakdown: Mapped[list | None] = mapped_column(
        JSONB, default=list
    )

    # Best performer
    best_platform_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    best_platform_reach: Mapped[int] = mapped_column(BigInteger, default=0)

    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    content_upload: Mapped["ContentUpload"] = relationship(
        "ContentUpload", backref="multiplier_score"
    )
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", backref="multiplier_scores"
    )


from app.models.content import ContentUpload, GeneratedOutput  # noqa: E402, F811
from app.models.organization import Workspace  # noqa: E402, F811
