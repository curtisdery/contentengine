"""Content generation and platform output API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.brand_voice import BrandVoiceProfile
from app.models.content import ContentUpload, GeneratedOutput
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.platforms.profiles import get_all_platforms
from app.schemas.generation import (
    BulkApproveRequest,
    GenerateRequest,
    GeneratedOutputListResponse,
    GeneratedOutputResponse,
    OutputUpdateRequest,
    PlatformProfileResponse,
)
from app.services.moderation import ModerationService
from app.services.transformation import TransformationEngine
from app.utils.exceptions import NotFoundError, ValidationError

router = APIRouter()
transformation_engine = TransformationEngine()
moderation_service = ModerationService()


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
    "/{content_id}/generate",
    response_model=list[GeneratedOutputResponse],
    status_code=status.HTTP_201_CREATED,
)
async def generate_content(
    content_id: UUID,
    request_body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GeneratedOutputResponse]:
    """Trigger content generation for a content upload.

    The content upload must be in 'analyzed' status. This endpoint:
    1. Loads the content upload and verifies it is analyzed.
    2. Sets the status to 'generating'.
    3. Optionally loads the brand voice profile.
    4. Calls the Transformation Engine to generate all outputs.
    5. Runs moderation on each output.
    6. Returns the list of generated outputs.
    """
    workspace = await get_user_workspace(current_user, db)

    # Load content upload
    result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == content_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    content_upload = result.scalar_one_or_none()
    if not content_upload:
        raise NotFoundError(
            message="Content not found",
            detail=f"No content upload found with id {content_id}",
        )

    # Verify status
    if content_upload.status not in ("analyzed", "completed"):
        raise ValidationError(
            message="Content not ready for generation",
            detail=(
                f"Content status is '{content_upload.status}'. "
                "It must be 'analyzed' before generation can begin."
            ),
        )

    # Set status to generating
    content_upload.status = "generating"
    await db.flush()

    # Optionally load voice profile
    voice_profile = None
    if request_body.voice_profile_id:
        vp_result = await db.execute(
            select(BrandVoiceProfile).where(
                BrandVoiceProfile.id == request_body.voice_profile_id,
                BrandVoiceProfile.workspace_id == workspace.id,
            )
        )
        voice_profile = vp_result.scalar_one_or_none()
        if not voice_profile:
            raise NotFoundError(
                message="Voice profile not found",
                detail=f"No voice profile found with id {request_body.voice_profile_id}",
            )

    # If emphasis notes provided in the request, store them in the DNA
    if request_body.emphasis_notes:
        dna = content_upload.content_dna or {}
        user_adjustments = dna.get("user_adjustments", {})
        user_adjustments["emphasis_notes"] = request_body.emphasis_notes
        dna["user_adjustments"] = user_adjustments
        content_upload.content_dna = dna
        await db.flush()

    # Generate outputs
    outputs = await transformation_engine.generate_all_outputs(
        db=db,
        content_upload=content_upload,
        voice_profile=voice_profile,
        selected_platforms=request_body.selected_platforms,
    )

    # Run moderation on each output and store results in metadata
    for output in outputs:
        if output.status != "failed" and output.content:
            safety_result = await moderation_service.screen_content(
                content=output.content,
                platform_id=output.platform_id,
            )
            compliance_result = await moderation_service.check_platform_compliance(
                content=output.content,
                platform_id=output.platform_id,
            )

            metadata = output.output_metadata or {}
            metadata["moderation_result"] = {
                "safety": safety_result,
                "compliance": compliance_result,
            }
            output.output_metadata = metadata

    await db.flush()

    # Refresh to get updated metadata
    for output in outputs:
        await db.refresh(output)

    # Build response with moderation_result extracted from metadata
    response_items = []
    for output in outputs:
        resp = GeneratedOutputResponse.model_validate(output)
        meta = output.output_metadata or {}
        resp.moderation_result = meta.get("moderation_result")
        response_items.append(resp)

    return response_items


@router.get(
    "/{content_id}/outputs",
    response_model=GeneratedOutputListResponse,
)
async def list_outputs(
    content_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedOutputListResponse:
    """List all generated outputs for a content piece."""
    workspace = await get_user_workspace(current_user, db)

    # Verify content exists and belongs to workspace
    result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == content_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    content_upload = result.scalar_one_or_none()
    if not content_upload:
        raise NotFoundError(
            message="Content not found",
            detail=f"No content upload found with id {content_id}",
        )

    # Fetch outputs
    result = await db.execute(
        select(GeneratedOutput)
        .where(GeneratedOutput.content_upload_id == content_id)
        .order_by(GeneratedOutput.created_at.desc())
    )
    outputs = list(result.scalars().all())

    items = []
    for output in outputs:
        resp = GeneratedOutputResponse.model_validate(output)
        meta = output.output_metadata or {}
        resp.moderation_result = meta.get("moderation_result")
        items.append(resp)

    return GeneratedOutputListResponse(
        items=items,
        total=len(items),
        content_title=content_upload.title,
        content_id=content_upload.id,
    )


@router.get(
    "/outputs/{output_id}",
    response_model=GeneratedOutputResponse,
)
async def get_output(
    output_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedOutputResponse:
    """Get a single generated output."""
    workspace = await get_user_workspace(current_user, db)

    # Load output and verify workspace ownership through content upload
    result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == output_id)
    )
    output = result.scalar_one_or_none()
    if not output:
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    # Verify the output belongs to a content upload in this workspace
    cu_result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == output.content_upload_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not cu_result.scalar_one_or_none():
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    resp = GeneratedOutputResponse.model_validate(output)
    meta = output.output_metadata or {}
    resp.moderation_result = meta.get("moderation_result")
    return resp


@router.patch(
    "/outputs/{output_id}",
    response_model=GeneratedOutputResponse,
)
async def update_output(
    output_id: UUID,
    request_body: OutputUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedOutputResponse:
    """Edit output content or change its status."""
    workspace = await get_user_workspace(current_user, db)

    # Load output
    result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == output_id)
    )
    output = result.scalar_one_or_none()
    if not output:
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    # Verify workspace ownership
    cu_result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == output.content_upload_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not cu_result.scalar_one_or_none():
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    # Apply updates
    if request_body.content is not None:
        output.content = request_body.content
        # Re-run moderation on edited content
        safety_result = await moderation_service.screen_content(
            content=request_body.content,
            platform_id=output.platform_id,
        )
        compliance_result = await moderation_service.check_platform_compliance(
            content=request_body.content,
            platform_id=output.platform_id,
        )
        metadata = output.output_metadata or {}
        metadata["moderation_result"] = {
            "safety": safety_result,
            "compliance": compliance_result,
        }
        metadata["manually_edited"] = True
        output.output_metadata = metadata

    if request_body.status is not None:
        output.status = request_body.status

    await db.flush()
    await db.refresh(output)

    resp = GeneratedOutputResponse.model_validate(output)
    meta = output.output_metadata or {}
    resp.moderation_result = meta.get("moderation_result")
    return resp


@router.post(
    "/outputs/bulk-approve",
    response_model=list[GeneratedOutputResponse],
)
async def bulk_approve_outputs(
    request_body: BulkApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GeneratedOutputResponse]:
    """Bulk approve multiple outputs at once."""
    workspace = await get_user_workspace(current_user, db)

    approved: list[GeneratedOutputResponse] = []

    for output_id in request_body.output_ids:
        # Load output
        result = await db.execute(
            select(GeneratedOutput).where(GeneratedOutput.id == output_id)
        )
        output = result.scalar_one_or_none()
        if not output:
            continue  # Skip missing outputs silently in bulk operations

        # Verify workspace ownership
        cu_result = await db.execute(
            select(ContentUpload).where(
                ContentUpload.id == output.content_upload_id,
                ContentUpload.workspace_id == workspace.id,
            )
        )
        if not cu_result.scalar_one_or_none():
            continue  # Skip outputs not in this workspace

        output.status = "approved"
        await db.flush()
        await db.refresh(output)

        resp = GeneratedOutputResponse.model_validate(output)
        meta = output.output_metadata or {}
        resp.moderation_result = meta.get("moderation_result")
        approved.append(resp)

    return approved


@router.delete(
    "/outputs/{output_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_output(
    output_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a generated output."""
    workspace = await get_user_workspace(current_user, db)

    # Load output
    result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == output_id)
    )
    output = result.scalar_one_or_none()
    if not output:
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    # Verify workspace ownership
    cu_result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == output.content_upload_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not cu_result.scalar_one_or_none():
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    await db.delete(output)
    await db.flush()


@router.get(
    "/platforms",
    response_model=list[PlatformProfileResponse],
)
async def list_platforms() -> list[PlatformProfileResponse]:
    """List all available platform profiles (public info, no auth required)."""
    platforms = get_all_platforms()
    return [
        PlatformProfileResponse(
            platform_id=p.platform_id,
            name=p.name,
            tier=p.tier,
            native_tone=p.native_tone,
            media_format=p.media_format,
            posting_cadence=p.posting_cadence,
            length_range={
                "min": p.length_range.min,
                "ideal": p.length_range.ideal,
                "max": p.length_range.max,
            },
        )
        for p in platforms
    ]
