import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), unique=True, nullable=False
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    tier: Mapped[str] = mapped_column(
        String(50), nullable=False, default="starter"
    )  # starter/growth/pro
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="trialing"
    )  # active/past_due/canceled/trialing/incomplete
    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="subscription"
    )


from app.models.organization import Organization  # noqa: E402, F811
