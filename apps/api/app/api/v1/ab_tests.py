"""A/B testing API routes for split-testing generated content variants."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.schemas.autopilot import ABTestCreateRequest, ABTestResponse
from app.services.ab_testing import ABTestingService
from app.utils.exceptions import NotFoundError

router = APIRouter()
ab_testing_service = ABTestingService()


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
    "",
    response_model=ABTestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ab_test(
    request_body: ABTestCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ABTestResponse:
    """Create an A/B test between two output variants."""
    workspace = await get_user_workspace(current_user, db)
    test = await ab_testing_service.create_test(
        db=db,
        workspace_id=workspace.id,
        content_upload_id=request_body.content_upload_id,
        platform_id=request_body.platform_id,
        variant_a_id=request_body.variant_a_output_id,
        variant_b_id=request_body.variant_b_output_id,
    )
    return ABTestResponse.model_validate(test)


@router.get("", response_model=list[ABTestResponse])
async def list_ab_tests(
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ABTestResponse]:
    """List A/B tests, optionally filtered by status."""
    workspace = await get_user_workspace(current_user, db)
    tests = await ab_testing_service.get_tests(db, workspace.id, status=status_filter)
    return [ABTestResponse.model_validate(t) for t in tests]


@router.get("/{test_id}", response_model=ABTestResponse)
async def get_ab_test(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ABTestResponse:
    """Get a single A/B test."""
    workspace = await get_user_workspace(current_user, db)
    test = await ab_testing_service.get_test(db, test_id, workspace.id)
    return ABTestResponse.model_validate(test)


@router.post("/{test_id}/start", response_model=ABTestResponse)
async def start_ab_test(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ABTestResponse:
    """Start an A/B test (schedule both variants for publishing)."""
    workspace = await get_user_workspace(current_user, db)
    test = await ab_testing_service.start_test(db, test_id, workspace.id)
    return ABTestResponse.model_validate(test)


@router.post("/{test_id}/evaluate", response_model=ABTestResponse)
async def evaluate_ab_test(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ABTestResponse:
    """Evaluate A/B test results and declare a winner."""
    workspace = await get_user_workspace(current_user, db)
    test = await ab_testing_service.evaluate_test(db, test_id, workspace.id)
    return ABTestResponse.model_validate(test)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_ab_test(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Cancel an A/B test."""
    workspace = await get_user_workspace(current_user, db)
    await ab_testing_service.cancel_test(db, test_id, workspace.id)
