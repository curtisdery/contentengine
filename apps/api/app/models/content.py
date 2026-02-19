import uuid
from datetime import datetime

from sqlalchemy import String, Text, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ContentUpload(Base):
    __tablename__ = "content_uploads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # blog/video_transcript/podcast_transcript
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    content_dna: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="uploaded"
    )  # uploaded/analyzing/analyzed/generating/completed/failed
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="content_uploads"
    )
    generated_outputs: Mapped[list["GeneratedOutput"]] = relationship(
        "GeneratedOutput", back_populates="content_upload", lazy="selectin"
    )


class GeneratedOutput(Base):
    __tablename__ = "generated_outputs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    content_upload_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_uploads.id"), nullable=False
    )
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)
    format_name: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    voice_match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="draft"
    )  # draft/approved/scheduled/published/failed
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    platform_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    content_upload: Mapped["ContentUpload"] = relationship(
        "ContentUpload", back_populates="generated_outputs"
    )


from app.models.organization import Workspace  # noqa: E402, F811
