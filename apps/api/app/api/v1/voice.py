"""Brand voice profile API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.schemas.brand_voice import (
    VoiceProfileCreateRequest,
    VoiceProfileResponse,
    VoiceProfileUpdateRequest,
    VoiceSampleAnalysisRequest,
    VoiceSampleAnalysisResponse,
)
from app.services.brand_voice import BrandVoiceService
from app.utils.exceptions import NotFoundError

from sqlalchemy import select

router = APIRouter()
voice_service = BrandVoiceService()


async def get_user_workspace(user: User, db: AsyncSession) -> Workspace:
    """Get the user's default workspace (first org's first workspace)."""
    result = await db.execute(
        select(OrganizationMember)
        .where(OrganizationMember.user_id == user.id)
        .limit(1)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise NotFoundError(
            message="No organization found",
            detail="User does not belong to any organization",
        )

    result = await db.execute(
        select(Workspace)
        .where(Workspace.organization_id == membership.organization_id)
        .limit(1)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise NotFoundError(
            message="No workspace found",
            detail="Organization does not have any workspaces",
        )

    return workspace


@router.post(
    "/profiles",
    response_model=VoiceProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_voice_profile(
    request_body: VoiceProfileCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfileResponse:
    """Create a new voice profile for the workspace."""
    workspace = await get_user_workspace(current_user, db)

    profile = await voice_service.create_profile(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        data=request_body.model_dump(),
    )

    return VoiceProfileResponse.model_validate(profile)


@router.get("/profiles", response_model=list[VoiceProfileResponse])
async def list_voice_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VoiceProfileResponse]:
    """List all voice profiles for the workspace."""
    workspace = await get_user_workspace(current_user, db)

    profiles = await voice_service.get_profiles(db=db, workspace_id=workspace.id)

    return [VoiceProfileResponse.model_validate(p) for p in profiles]


@router.get("/profiles/{profile_id}", response_model=VoiceProfileResponse)
async def get_voice_profile(
    profile_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfileResponse:
    """Get a single voice profile."""
    workspace = await get_user_workspace(current_user, db)

    profile = await voice_service.get_profile(
        db=db,
        profile_id=profile_id,
        workspace_id=workspace.id,
    )

    return VoiceProfileResponse.model_validate(profile)


@router.patch("/profiles/{profile_id}", response_model=VoiceProfileResponse)
async def update_voice_profile(
    profile_id: UUID,
    request_body: VoiceProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceProfileResponse:
    """Update an existing voice profile."""
    workspace = await get_user_workspace(current_user, db)

    profile = await voice_service.update_profile(
        db=db,
        profile_id=profile_id,
        workspace_id=workspace.id,
        data=request_body.model_dump(exclude_none=True),
    )

    return VoiceProfileResponse.model_validate(profile)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_voice_profile(
    profile_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a voice profile."""
    workspace = await get_user_workspace(current_user, db)

    await voice_service.delete_profile(
        db=db,
        profile_id=profile_id,
        workspace_id=workspace.id,
    )


@router.post("/analyze-samples", response_model=VoiceSampleAnalysisResponse)
async def analyze_voice_samples(
    request_body: VoiceSampleAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoiceSampleAnalysisResponse:
    """Analyze content samples and return voice characteristics without saving.

    This endpoint is useful for previewing what voice analysis would detect
    before creating or updating a profile.
    """
    analysis = await voice_service.analyze_samples(samples=request_body.samples)

    return VoiceSampleAnalysisResponse(
        tone_metrics=analysis.get("tone_metrics", {}),
        vocabulary_patterns=analysis.get("vocabulary_patterns", {}),
        signature_phrases=analysis.get("signature_phrases", []),
        suggested_attributes=analysis.get("suggested_attributes", []),
    )
