"""Brand voice service — CRUD operations and voice analysis."""

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_voice import BrandVoiceProfile
from app.services import ai as ai_service
from app.utils.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class BrandVoiceService:
    """Manages brand voice profiles with CRUD and AI-powered analysis."""

    async def create_profile(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        user_id: UUID,
        data: dict,
    ) -> BrandVoiceProfile:
        """Create a new voice profile.

        If is_default is True and other profiles exist, unset other defaults first.
        If sample_content is provided, automatically run voice analysis.
        """
        is_default = data.get("is_default", False)

        # If this profile should be default, unset other defaults in the workspace
        if is_default:
            await db.execute(
                update(BrandVoiceProfile)
                .where(
                    BrandVoiceProfile.workspace_id == workspace_id,
                    BrandVoiceProfile.is_default == True,  # noqa: E712
                )
                .values(is_default=False)
            )

        # Run voice analysis on sample content if provided
        tone_metrics = {}
        vocabulary = {}
        sample_content = data.get("sample_content", [])
        if sample_content:
            analysis = await ai_service.analyze_voice_samples(sample_content)
            tone_metrics = analysis.get("tone_metrics", {})
            vocabulary = {
                "patterns": analysis.get("vocabulary_patterns", {}),
                "avg_sentence_length": analysis.get("avg_sentence_length", 0),
                "active_voice_ratio": analysis.get("active_voice_ratio", 0.5),
            }
            # Merge AI-detected signature phrases with user-provided ones
            ai_phrases = analysis.get("signature_phrases", [])
            user_phrases = data.get("signature_phrases", [])
            merged_phrases = list(set(user_phrases + ai_phrases))
            data["signature_phrases"] = merged_phrases

        # Build formatting config from emoji_policy
        formatting_config = {}
        if data.get("emoji_policy"):
            formatting_config["emoji_policy"] = data["emoji_policy"]

        # Build topic boundaries from approved/restricted topics
        topic_boundaries = {}
        if data.get("approved_topics"):
            topic_boundaries["approved"] = data["approved_topics"]
        if data.get("restricted_topics"):
            topic_boundaries["restricted"] = data["restricted_topics"]

        profile = BrandVoiceProfile(
            workspace_id=workspace_id,
            profile_name=data["profile_name"],
            voice_attributes=data.get("voice_attributes", []),
            sample_content=sample_content,
            tone_metrics=tone_metrics,
            vocabulary=vocabulary,
            formatting_config=formatting_config,
            cta_library=data.get("cta_library", []),
            topic_boundaries=topic_boundaries,
            is_default=is_default,
        )

        db.add(profile)
        await db.flush()
        await db.refresh(profile)

        return profile

    async def get_profiles(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> list[BrandVoiceProfile]:
        """List all voice profiles for a workspace."""
        result = await db.execute(
            select(BrandVoiceProfile)
            .where(BrandVoiceProfile.workspace_id == workspace_id)
            .order_by(BrandVoiceProfile.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_profile(
        self,
        db: AsyncSession,
        profile_id: UUID,
        workspace_id: UUID,
    ) -> BrandVoiceProfile:
        """Get a single profile. Raises NotFoundError if missing."""
        result = await db.execute(
            select(BrandVoiceProfile).where(
                BrandVoiceProfile.id == profile_id,
                BrandVoiceProfile.workspace_id == workspace_id,
            )
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise NotFoundError(
                message="Voice profile not found",
                detail=f"No voice profile found with id {profile_id}",
            )
        return profile

    async def update_profile(
        self,
        db: AsyncSession,
        profile_id: UUID,
        workspace_id: UUID,
        data: dict,
    ) -> BrandVoiceProfile:
        """Update voice profile fields."""
        profile = await self.get_profile(db, profile_id, workspace_id)

        # Handle is_default toggle
        if data.get("is_default") is True:
            await db.execute(
                update(BrandVoiceProfile)
                .where(
                    BrandVoiceProfile.workspace_id == workspace_id,
                    BrandVoiceProfile.is_default == True,  # noqa: E712
                    BrandVoiceProfile.id != profile_id,
                )
                .values(is_default=False)
            )

        # Update simple fields
        simple_fields = [
            "profile_name", "voice_attributes", "sample_content",
            "banned_terms", "preferred_terms", "audience_label",
            "signature_phrases", "cta_library", "is_default",
        ]
        for field in simple_fields:
            if field in data and data[field] is not None:
                if field in ("voice_attributes", "sample_content", "cta_library"):
                    setattr(profile, field, data[field])
                elif field == "profile_name":
                    profile.profile_name = data[field]
                elif field == "is_default":
                    profile.is_default = data[field]

        # Update emoji_policy in formatting_config
        if data.get("emoji_policy") is not None:
            config = profile.formatting_config or {}
            config["emoji_policy"] = data["emoji_policy"]
            profile.formatting_config = config

        # Update topic boundaries
        if data.get("approved_topics") is not None or data.get("restricted_topics") is not None:
            boundaries = profile.topic_boundaries or {}
            if data.get("approved_topics") is not None:
                boundaries["approved"] = data["approved_topics"]
            if data.get("restricted_topics") is not None:
                boundaries["restricted"] = data["restricted_topics"]
            profile.topic_boundaries = boundaries

        # Re-analyze voice if sample_content is updated
        if data.get("sample_content") is not None and data["sample_content"]:
            analysis = await ai_service.analyze_voice_samples(data["sample_content"])
            profile.tone_metrics = analysis.get("tone_metrics", profile.tone_metrics)
            profile.vocabulary = {
                "patterns": analysis.get("vocabulary_patterns", {}),
                "avg_sentence_length": analysis.get("avg_sentence_length", 0),
                "active_voice_ratio": analysis.get("active_voice_ratio", 0.5),
            }

        profile.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(profile)

        return profile

    async def delete_profile(
        self,
        db: AsyncSession,
        profile_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Delete a voice profile. Raises NotFoundError if missing."""
        profile = await self.get_profile(db, profile_id, workspace_id)
        await db.delete(profile)
        await db.flush()

    async def analyze_samples(self, samples: list[str]) -> dict:
        """Call AI service to analyze writing samples and extract voice characteristics.

        This is a stateless analysis — it does not save to any profile.
        """
        return await ai_service.analyze_voice_samples(samples)
