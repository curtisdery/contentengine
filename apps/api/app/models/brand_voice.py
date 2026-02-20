import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.types import JSONB

from app.database import Base


class BrandVoiceProfile(Base):
    __tablename__ = "brand_voice_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    profile_name: Mapped[str] = mapped_column(String(255), nullable=False)
    voice_attributes: Mapped[list] = mapped_column(JSONB, default=list)
    sample_content: Mapped[list] = mapped_column(JSONB, default=list)
    tone_metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    vocabulary: Mapped[dict] = mapped_column(JSONB, default=dict)
    formatting_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    cta_library: Mapped[list] = mapped_column(JSONB, default=list)
    topic_boundaries: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="brand_voice_profiles"
    )


from app.models.organization import Workspace  # noqa: E402, F811
