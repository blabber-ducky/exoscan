import asyncio
import json
import uuid
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import AsyncSessionLocal
from app.dependencies import get_current_user, get_db
from app.recon import log_bus
from app.recon.orchestrator import run_scan
from app.scans.models import Scan, ScanLog, SuggestedScan
from app.scans.schemas import (
    CreateScanRequest,
    PagedScansResponse,
    ScanResponse,
    ScanResultsResponse,
    TriggerSuggestedResponse,
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
    scans, total = await service.list_scans(db, current_user.id, page, limit)
    return PagedScansResponse(
        items=[service.scan_to_response(s) for s in scans],
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
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)
    return service.scan_to_response(scan)


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scan = await service.get_scan_or_404(db, scan_id, current_user.id)

    if scan.status == "running":
        # Kill any tracked containers (implemented in Phase 4)
        scan.status = "cancelled"
        await db.commit()
    else:
        await db.delete(scan)
        await db.commit()


@router.get("/{scan_id}/results", response_model=ScanResultsResponse)
async def get_scan_results(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_scan_results(db, scan_id, current_user.id)


# ---------------------------------------------------------------------------
# Suggested scan trigger
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
    # Verify scan ownership
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

    # Authenticate via query-param token (browser WS API doesn't support headers)
    user_id = decode_token(token, ACCESS_TOKEN_TYPE)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    try:
        scan_uuid = uuid.UUID(scan_id)
    except ValueError:
        await websocket.close(code=4004, reason="Invalid scan ID")
        return

    await websocket.accept()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Scan).where(Scan.id == scan_uuid, Scan.user_id == uuid.UUID(user_id))
        )
        scan = result.scalar_one_or_none()
        if not scan:
            await websocket.close(code=4004, reason="Scan not found")
            return

        # Replay persisted history first
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

        # If scan already finished, send terminal event and close
        if scan.status in ("completed", "failed", "cancelled"):
            await websocket.send_text(
                json.dumps({"type": "complete", "status": scan.status})
            )
            return

    # Tail the live pub/sub queue
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
