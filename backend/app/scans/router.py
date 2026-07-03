import asyncio
import json
import uuid
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Group, GroupMember, User
from app.database import AsyncSessionLocal
from app.dependencies import get_current_user, get_db
from app.recon import log_bus
from app.recon.orchestrator import run_scan
from app.scans.models import Scan, ScanAsset, ScanLog, ScanShare, SuggestedScan
from app.scans.schemas import (
    AddMemberRequest,
    CreateScanRequest,
    FollowupActiveRequest,
    FollowupActiveResponse,
    FollowupActiveScanItem,
    GroupSummarySchema,
    PagedScansResponse,
    PatchScanRequest,
    ScanResponse,
    ScanResultsResponse,
    ScanShareResponse,
    ShareWithGroupRequest,
    ShareWithUserRequest,
    TriggerSuggestedResponse,
    UserSummarySchema,
)
from app.scans import service

router = APIRouter(prefix="/scans", tags=["scans"])


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def create_scan(
    body: CreateScanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = Scan(
        user_id=current_user.id,
        target=body.target,
        scan_type=body.scan_type,
        modules=body.modules,
        port_config=body.port_config.model_dump(),
        status="pending",
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    asyncio.create_task(run_scan(str(scan.id)))

    return service.scan_to_response(scan)


@router.get("", response_model=PagedScansResponse)
async def list_scans(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await service.list_scans(db, current_user.id, page, limit)
    items = [
        service.scan_to_response(
            scan,
            is_owner=scan.user_id == current_user.id,
            owner_username=None if scan.user_id == current_user.id else owner_username,
        )
        for scan, owner_username in rows
    ]
    return PagedScansResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 0,
    )


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan, is_owner, owner_username = await service.get_accessible_scan_or_404(db, scan_id, current_user.id)
    return service.scan_to_response(
        scan,
        is_owner=is_owner,
        owner_username=None if is_owner else owner_username,
    )


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)
    if scan.status in ("running", "paused"):
        scan.status = "cancelled"
        await db.commit()
    else:
        await db.delete(scan)
        await db.commit()


@router.post("/{scan_id}/cancel", response_model=ScanResponse)
async def cancel_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)
    if scan.status not in ("pending", "running", "paused"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a scan with status '{scan.status}'",
        )
    scan.status = "cancelled"
    scan.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(scan)
    return service.scan_to_response(scan)


@router.post("/{scan_id}/pause", response_model=ScanResponse)
async def pause_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)
    if scan.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only running scans can be paused",
        )
    scan.status = "paused"
    await db.commit()
    await db.refresh(scan)
    return service.scan_to_response(scan)


@router.post("/{scan_id}/resume", response_model=ScanResponse)
async def resume_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)
    if scan.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only paused scans can be resumed",
        )
    scan.status = "running"
    await db.commit()
    asyncio.create_task(run_scan(str(scan.id)))
    await db.refresh(scan)
    return service.scan_to_response(scan)


@router.patch("/{scan_id}", response_model=ScanResponse)
async def patch_scan(
    scan_id: uuid.UUID,
    body: PatchScanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)
    if scan.status not in ("pending", "paused"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or paused scans can be modified",
        )

    from app.scans.schemas import ACTIVE_MODULES, PASSIVE_MODULES, _ALLOWED_BY_TYPE
    if body.modules is not None:
        allowed = _ALLOWED_BY_TYPE[scan.scan_type]
        invalid = set(body.modules) - allowed
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Module(s) not valid for {scan.scan_type} scans: {', '.join(sorted(invalid))}",
            )
        scan.modules = body.modules
    if body.port_config is not None:
        scan.port_config = body.port_config.model_dump()

    await db.commit()
    await db.refresh(scan)
    return service.scan_to_response(scan)


@router.get("/{scan_id}/results", response_model=ScanResultsResponse)
async def get_scan_results(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_scan_results(db, scan_id, current_user.id)


@router.post(
    "/{scan_id}/followup-active",
    response_model=FollowupActiveResponse,
    status_code=status.HTTP_201_CREATED,
)
async def followup_active_scan(
    scan_id: uuid.UUID,
    body: FollowupActiveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    source = await service.get_scan_or_404(db, scan_id, current_user.id)

    if source.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source scan must be completed before initiating a follow-up",
        )
    if source.scan_type not in ("passive", "comprehensive"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Follow-up active scan can only be initiated from a passive or comprehensive scan",
        )

    stmt = select(ScanAsset).where(ScanAsset.scan_id == scan_id)
    if body.asset_ids is not None:
        try:
            asset_uuids = [uuid.UUID(aid) for aid in body.asset_ids]
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid asset_id format")
        stmt = stmt.where(ScanAsset.id.in_(asset_uuids))
    assets_result = await db.execute(stmt)
    assets = list(assets_result.scalars().all())

    created: list[Scan] = []
    skipped = 0
    for asset in assets:
        if asset.url:
            target = asset.url
        elif asset.hostname:
            target = f"https://{asset.hostname}"
        elif asset.ip_address:
            target = str(asset.ip_address)
        else:
            skipped += 1
            continue

        new_scan = Scan(
            user_id=current_user.id,
            target=target,
            scan_type="active",
            modules=body.modules,
            port_config=body.port_config.model_dump(),
            status="pending",
        )
        db.add(new_scan)
        await db.flush()
        created.append(new_scan)

    await db.commit()

    for new_scan in created:
        asyncio.create_task(run_scan(str(new_scan.id)))

    return FollowupActiveResponse(
        created_scans=[
            FollowupActiveScanItem(id=str(s.id), target=s.target) for s in created
        ],
        skipped=skipped,
    )


# ---------------------------------------------------------------------------
# Sharing
# ---------------------------------------------------------------------------

@router.get("/{scan_id}/shares", response_model=list[ScanShareResponse])
async def list_scan_shares(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.get_scan_or_404(db, scan_id, current_user.id)
    return await service.list_shares(db, scan_id)


@router.post("/{scan_id}/shares/users", response_model=ScanShareResponse, status_code=status.HTTP_201_CREATED)
async def share_with_user(
    scan_id: uuid.UUID,
    body: ShareWithUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.get_scan_or_404(db, scan_id, current_user.id)

    try:
        target_id = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share a scan with yourself")

    target = await db.execute(select(User).where(User.id == target_id, User.is_active == True))
    if not target.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(ScanShare).where(
            ScanShare.scan_id == scan_id, ScanShare.shared_with_user_id == target_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already shared with this user")

    share = ScanShare(
        scan_id=scan_id,
        shared_by=current_user.id,
        shared_with_user_id=target_id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    target_user = (await db.execute(select(User).where(User.id == target_id))).scalar_one()
    return ScanShareResponse(
        id=str(share.id),
        shared_with_user=UserSummarySchema(id=str(target_user.id), username=target_user.username),
        created_at=share.created_at,
    )


@router.post("/{scan_id}/shares/groups", response_model=ScanShareResponse, status_code=status.HTTP_201_CREATED)
async def share_with_group(
    scan_id: uuid.UUID,
    body: ShareWithGroupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.get_scan_or_404(db, scan_id, current_user.id)

    try:
        group_id = uuid.UUID(body.group_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid group_id")

    # User must be a member of the group to share with it
    membership = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id, GroupMember.user_id == current_user.id
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    existing = await db.execute(
        select(ScanShare).where(
            ScanShare.scan_id == scan_id, ScanShare.shared_with_group_id == group_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already shared with this group")

    share = ScanShare(
        scan_id=scan_id,
        shared_by=current_user.id,
        shared_with_group_id=group_id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return ScanShareResponse(
        id=str(share.id),
        shared_with_group=GroupSummarySchema(id=str(group.id), name=group.name),
        created_at=share.created_at,
    )


@router.delete("/{scan_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(
    scan_id: uuid.UUID,
    share_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.get_scan_or_404(db, scan_id, current_user.id)

    result = await db.execute(
        select(ScanShare).where(ScanShare.id == share_id, ScanShare.scan_id == scan_id)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    await db.delete(share)
    await db.commit()


# ---------------------------------------------------------------------------
# Groups the current user belongs to (for sharing UI)
# ---------------------------------------------------------------------------

@router.get("/groups/mine", response_model=list[GroupSummarySchema], tags=["groups"])
async def my_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
        .order_by(Group.name)
    )
    groups = result.scalars().all()
    return [GroupSummarySchema(id=str(g.id), name=g.name, description=g.description) for g in groups]


# ---------------------------------------------------------------------------
# User search (for direct share targeting)
# ---------------------------------------------------------------------------

@router.get("/users/search", response_model=list[UserSummarySchema], tags=["users"])
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(
            User.username.ilike(f"%{q}%"),
            User.is_active == True,
            User.id != current_user.id,
        )
        .order_by(User.username)
        .limit(20)
    )
    users = result.scalars().all()
    return [UserSummarySchema(id=str(u.id), username=u.username) for u in users]


# ---------------------------------------------------------------------------
# Suggested scan trigger (owner-only)
# ---------------------------------------------------------------------------

@router.post(
    "/{scan_id}/suggested/{suggested_id}/trigger",
    response_model=TriggerSuggestedResponse,
)
async def trigger_suggested_scan(
    scan_id: uuid.UUID,
    suggested_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.get_scan_or_404(db, scan_id, current_user.id)

    result = await db.execute(
        select(SuggestedScan).where(SuggestedScan.id == suggested_id)
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggested scan not found")

    if suggestion.status not in ("suggested", "failed"):
        raise HTTPException(
            status_code=409,
            detail=f"Suggested scan is already {suggestion.status}",
        )

    suggestion.status = "running"
    suggestion.triggered_by = current_user.id
    suggestion.triggered_at = datetime.now(timezone.utc)
    await db.commit()

    from app.recon.secondary import executor as secondary_executor
    asyncio.create_task(secondary_executor.trigger_suggested_scan(str(suggested_id)))

    return TriggerSuggestedResponse(
        suggested_scan_id=str(suggested_id),
        status="running",
        message="Scan triggered — results will appear in result_summary when complete",
    )


# ---------------------------------------------------------------------------
# WebSocket log stream
# ---------------------------------------------------------------------------

@router.websocket("/{scan_id}/logs")
async def scan_logs_ws(
    websocket: WebSocket,
    scan_id: str,
    token: str = Query(...),
):
    from app.auth.service import ACCESS_TOKEN_TYPE, decode_token
    from app.scans.service import _has_share_access

    user_id = decode_token(token, ACCESS_TOKEN_TYPE)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    try:
        scan_uuid = uuid.UUID(scan_id)
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        await websocket.close(code=4004, reason="Invalid ID")
        return

    await websocket.accept()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Scan).where(
                Scan.id == scan_uuid,
                or_(Scan.user_id == user_uuid, _has_share_access(scan_uuid, user_uuid)),
            )
        )
        scan = result.scalar_one_or_none()
        if not scan:
            await websocket.close(code=4004, reason="Scan not found")
            return

        logs_result = await db.execute(
            select(ScanLog)
            .where(ScanLog.scan_id == scan_uuid)
            .order_by(ScanLog.timestamp.asc())
        )
        for log in logs_result.scalars().all():
            await websocket.send_text(
                json.dumps({
                    "type": "log",
                    "level": log.level,
                    "stage": log.stage,
                    "message": log.message,
                    "timestamp": log.timestamp.isoformat(),
                })
            )

        if scan.status in ("completed", "failed", "cancelled"):
            await websocket.send_text(
                json.dumps({"type": "complete", "status": scan.status})
            )
            return

    q = log_bus.subscribe(scan_id)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=20.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue

            await websocket.send_text(msg)

            data = json.loads(msg)
            if data.get("type") in ("complete", "error"):
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        log_bus.unsubscribe(scan_id, q)
