"""Content upload and DNA card API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.content import ContentUpload
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.schemas.content import (
    ContentListResponse,
    ContentUpdateRequest,
    ContentUploadRequest,
    ContentUploadResponse,
    UploadURLRequest,
    UploadURLResponse,
)
from app.services.ingestion import IngestionService
from app.utils.exceptions import NotFoundError, ValidationError
from app.utils.storage import generate_upload_url

router = APIRouter()
ingestion_service = IngestionService()


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
    "/upload-url",
    response_model=UploadURLResponse,
    status_code=status.HTTP_200_OK,
)
async def get_upload_url(
    request_body: UploadURLRequest,
    current_user: User = Depends(get_current_user),
) -> UploadURLResponse:
    """Generate a signed upload URL for Firebase Storage."""
    upload_url, storage_path = generate_upload_url(
        file_name=request_body.file_name,
        content_type=request_body.content_type,
    )
    return UploadURLResponse(upload_url=upload_url, storage_path=storage_path)


@router.post(
    "/upload",
    response_model=ContentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_content(
    request_body: ContentUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentUploadResponse:
    """Upload content for analysis and DNA card generation.

    Accepts either `raw_content` (text) or `storage_path` (file reference).
    """
    if not request_body.raw_content and not request_body.storage_path:
        raise ValidationError(
            message="Content required",
            detail="Either raw_content or storage_path must be provided",
        )

    workspace = await get_user_workspace(current_user, db)

    # Create the ContentUpload record
    content_upload = ContentUpload(
        workspace_id=workspace.id,
        user_id=current_user.id,
        title=request_body.title,
        content_type=request_body.content_type,
        raw_content=request_body.raw_content,
        storage_path=request_body.storage_path,
        source_url=request_body.source_url,
        status="uploaded",
    )
    db.add(content_upload)
    await db.flush()
    await db.refresh(content_upload)

    # Run analysis synchronously for now (only if raw_content provided)
    if request_body.raw_content:
        content_upload = await ingestion_service.process_upload(
            db=db,
            content_upload_id=content_upload.id,
            workspace_id=workspace.id,
        )

    return ContentUploadResponse.model_validate(content_upload)


@router.get("", response_model=ContentListResponse)
async def list_content(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentListResponse:
    """List the user's content uploads with pagination."""
    workspace = await get_user_workspace(current_user, db)

    # Count total
    count_result = await db.execute(
        select(func.count(ContentUpload.id)).where(
            ContentUpload.workspace_id == workspace.id,
        )
    )
    total = count_result.scalar_one()

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(ContentUpload)
        .where(ContentUpload.workspace_id == workspace.id)
        .order_by(ContentUpload.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = list(result.scalars().all())

    return ContentListResponse(
        items=[ContentUploadResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get("/{content_id}", response_model=ContentUploadResponse)
async def get_content(
    content_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentUploadResponse:
    """Get a single content upload with its DNA card."""
    workspace = await get_user_workspace(current_user, db)

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

    return ContentUploadResponse.model_validate(content_upload)


@router.post("/{content_id}/analyze", response_model=ContentUploadResponse)
async def analyze_content(
    content_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentUploadResponse:
    """Trigger or re-trigger AI analysis on existing content."""
    workspace = await get_user_workspace(current_user, db)

    # Verify the content exists and belongs to the user's workspace
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

    # Run analysis
    content_upload = await ingestion_service.process_upload(
        db=db,
        content_upload_id=content_id,
        workspace_id=workspace.id,
    )

    return ContentUploadResponse.model_validate(content_upload)


@router.patch("/{content_id}", response_model=ContentUploadResponse)
async def update_content(
    content_id: UUID,
    request_body: ContentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentUploadResponse:
    """Update emphasis notes or focus settings on a content upload."""
    workspace = await get_user_workspace(current_user, db)

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

    # Update the DNA card with emphasis/focus metadata
    dna = content_upload.content_dna or {}
    update_data = request_body.model_dump(exclude_none=True)
    if update_data:
        dna["user_adjustments"] = update_data
        content_upload.content_dna = dna
        await db.flush()
        await db.refresh(content_upload)

    return ContentUploadResponse.model_validate(content_upload)


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(
    content_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a content upload."""
    workspace = await get_user_workspace(current_user, db)

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

    await db.delete(content_upload)
    await db.flush()
