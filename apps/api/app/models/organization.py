import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="owned_organizations")
    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", lazy="selectin"
    )
    workspaces: Mapped[list["Workspace"]] = relationship(
        "Workspace", back_populates="organization", lazy="selectin"
    )
    subscription: Mapped["Subscription"] = relationship(
        "Subscription", back_populates="organization", uselist=False, lazy="selectin"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        "ApiKey", back_populates="organization", lazy="selectin"
    )


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # owner/admin/member
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="members"
    )
    user: Mapped["User"] = relationship("User", back_populates="organization_memberships")


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_workspace_org_slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="workspaces"
    )
    content_uploads: Mapped[list["ContentUpload"]] = relationship(
        "ContentUpload", back_populates="workspace", lazy="selectin"
    )
    brand_voice_profiles: Mapped[list["BrandVoiceProfile"]] = relationship(
        "BrandVoiceProfile", back_populates="workspace", lazy="selectin"
    )
    platform_connections: Mapped[list["PlatformConnection"]] = relationship(
        "PlatformConnection", back_populates="workspace", lazy="selectin"
    )


# Forward references
from app.models.user import User  # noqa: E402, F811
from app.models.subscription import Subscription  # noqa: E402, F811
from app.models.audit_log import ApiKey  # noqa: E402, F811
from app.models.content import ContentUpload  # noqa: E402, F811
from app.models.brand_voice import BrandVoiceProfile  # noqa: E402, F811
from app.models.platform_connection import PlatformConnection  # noqa: E402, F811
