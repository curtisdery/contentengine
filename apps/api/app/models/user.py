import uuid
from datetime import datetime, date

from sqlalchemy import String, Boolean, Integer, DateTime, Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    firebase_uid: Mapped[str | None] = mapped_column(
        String(128), unique=True, nullable=True, index=True
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fcm_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    email_verification_expires: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    password_reset_token: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    password_reset_expires: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    organization_memberships: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="user", lazy="selectin"
    )
    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", lazy="selectin"
    )
    owned_organizations: Mapped[list["Organization"]] = relationship(
        "Organization", back_populates="owner", lazy="selectin"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    device_fingerprint: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="sessions")


# Forward reference for relationship type hints
from app.models.organization import Organization, OrganizationMember  # noqa: E402, F811
