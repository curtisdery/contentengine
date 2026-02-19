"""Scheduled event model for the smart calendar and publishing system."""

import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScheduledEvent(Base):
    __tablename__ = "scheduled_events"
    __table_args__ = (
        UniqueConstraint(
            "generated_output_id",
            name="uq_scheduled_event_output",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    generated_output_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generated_outputs.id"), nullable=False
    )
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(50), default="scheduled"
    )  # scheduled/publishing/published/failed/cancelled
    publish_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    priority: Mapped[int] = mapped_column(
        Integer, default=5
    )  # 1=highest, 10=lowest. Manual publishes=1, autopilot=5
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    generated_output: Mapped["GeneratedOutput"] = relationship(
        "GeneratedOutput", backref="scheduled_event"
    )
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", backref="scheduled_events"
    )


from app.models.content import GeneratedOutput  # noqa: E402, F811
from app.models.organization import Workspace  # noqa: E402, F811
