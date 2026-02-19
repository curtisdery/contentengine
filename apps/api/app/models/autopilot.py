"""Autopilot configuration and A/B testing models."""

import uuid
from datetime import datetime

from sqlalchemy import Float, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AutopilotConfig(Base):
    """Per-workspace, per-platform autopilot configuration and trust metrics."""

    __tablename__ = "autopilot_configs"
    __table_args__ = (
        UniqueConstraint("workspace_id", "platform_id", name="uq_autopilot_workspace_platform"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)

    # Autopilot state
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Trust metrics
    total_outputs_reviewed: Mapped[int] = mapped_column(Integer, default=0)
    approved_without_edit: Mapped[int] = mapped_column(Integer, default=0)
    approval_rate: Mapped[float] = mapped_column(Float, default=0.0)

    # Thresholds
    required_approval_rate: Mapped[float] = mapped_column(Float, default=0.90)
    required_minimum_reviews: Mapped[int] = mapped_column(Integer, default=10)

    # History
    enabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_auto_published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    auto_publish_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", backref="autopilot_configs")


class ABTest(Base):
    """A/B test for generated outputs (Pro tier feature)."""

    __tablename__ = "ab_tests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    content_upload_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_uploads.id"), nullable=False
    )
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)

    # Variants
    variant_a_output_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generated_outputs.id"), nullable=False
    )
    variant_b_output_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generated_outputs.id"), nullable=False
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50), default="pending"
    )  # pending/running/completed/cancelled
    winner_output_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Results
    variant_a_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    variant_b_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", backref="ab_tests")
    content_upload: Mapped["ContentUpload"] = relationship(
        "ContentUpload", backref="ab_tests"
    )
    variant_a_output: Mapped["GeneratedOutput"] = relationship(
        "GeneratedOutput", foreign_keys=[variant_a_output_id], backref="ab_test_as_variant_a"
    )
    variant_b_output: Mapped["GeneratedOutput"] = relationship(
        "GeneratedOutput", foreign_keys=[variant_b_output_id], backref="ab_test_as_variant_b"
    )


# Forward references
from app.models.organization import Workspace  # noqa: E402, F811
from app.models.content import ContentUpload, GeneratedOutput  # noqa: E402, F811
