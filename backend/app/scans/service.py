import uuid
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.scans.models import Scan, ScanAsset, ScanCVE, SuggestedScan
from app.scans.schemas import (
    AssetResponse,
    CVESchema,
    ScanResponse,
    ScanResultsResponse,
    SuggestedScanSchema,
)


async def get_scan_or_404(
    db: AsyncSession, scan_id: uuid.UUID, user_id: uuid.UUID
) -> Scan:
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user_id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return scan


async def list_scans(
    db: AsyncSession, user_id: uuid.UUID, page: int, limit: int
) -> tuple[list[Scan], int]:
    offset = (page - 1) * limit

    count_result = await db.execute(
        select(func.count()).select_from(Scan).where(Scan.user_id == user_id)
    )
    total = count_result.scalar_one()

    scans_result = await db.execute(
        select(Scan)
        .where(Scan.user_id == user_id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    scans = list(scans_result.scalars().all())
    return scans, total


async def get_scan_results(
    db: AsyncSession, scan_id: uuid.UUID, user_id: uuid.UUID
) -> ScanResultsResponse:
    scan = await get_scan_or_404(db, scan_id, user_id)

    # Fetch all assets
    assets_result = await db.execute(
        select(ScanAsset)
        .where(ScanAsset.scan_id == scan_id)
        .order_by(ScanAsset.created_at)
    )
    assets = list(assets_result.scalars().all())
    asset_ids = [a.id for a in assets]

    cves_by_asset: dict[uuid.UUID, list[ScanCVE]] = defaultdict(list)
    suggestions_by_asset: dict[uuid.UUID, list[SuggestedScan]] = defaultdict(list)

    if asset_ids:
        cves_result = await db.execute(
            select(ScanCVE).where(ScanCVE.asset_id.in_(asset_ids))
        )
        for cve in cves_result.scalars().all():
            cves_by_asset[cve.asset_id].append(cve)

        sugg_result = await db.execute(
            select(SuggestedScan)
            .where(SuggestedScan.asset_id.in_(asset_ids))
            .order_by(SuggestedScan.priority.desc())
        )
        for s in sugg_result.scalars().all():
            suggestions_by_asset[s.asset_id].append(s)

    total_cves = sum(len(v) for v in cves_by_asset.values())

    scan_resp = ScanResponse(
        id=str(scan.id),
        target=scan.target,
        scan_type=scan.scan_type,
        modules=scan.modules,
        port_config=scan.port_config,
        status=scan.status,
        dork_hits=scan.dork_hits,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        error_message=scan.error_message,
        created_at=scan.created_at,
        asset_count=len(assets),
        cve_count=total_cves,
    )

    asset_responses = [
        AssetResponse(
            id=str(a.id),
            url=a.url,
            ip_address=str(a.ip_address) if a.ip_address else None,
            hostname=a.hostname,
            status_code=a.status_code,
            title=a.title,
            screenshot_path=a.screenshot_path,
            technologies=a.technologies,
            headers=a.headers,
            dns_records=a.dns_records,
            waf_detected=a.waf_detected,
            scan_status=a.scan_status,
            scan_notes=a.scan_notes,
            open_ports=a.open_ports,
            created_at=a.created_at,
            cves=[
                CVESchema(
                    id=str(c.id),
                    cve_id=c.cve_id,
                    technology=c.technology,
                    version=c.version,
                    cvss_score=float(c.cvss_score) if c.cvss_score is not None else None,
                    cvss_version=c.cvss_version,
                    severity=c.severity,
                    description=c.description,
                    nvd_url=c.nvd_url,
                )
                for c in cves_by_asset[a.id]
            ],
            suggestions=[
                SuggestedScanSchema(
                    id=str(s.id),
                    scan_type=s.scan_type,
                    display_name=s.display_name,
                    description=s.description,
                    risk_level=s.risk_level,
                    priority=s.priority,
                    status=s.status,
                    result_summary=s.result_summary,
                )
                for s in suggestions_by_asset[a.id]
            ],
        )
        for a in assets
    ]

    return ScanResultsResponse(scan=scan_resp, assets=asset_responses)


def scan_to_response(scan: Scan, asset_count: int = 0, cve_count: int = 0) -> ScanResponse:
    return ScanResponse(
        id=str(scan.id),
        target=scan.target,
        scan_type=scan.scan_type,
        modules=scan.modules,
        port_config=scan.port_config,
        status=scan.status,
        dork_hits=scan.dork_hits,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        error_message=scan.error_message,
        created_at=scan.created_at,
        asset_count=asset_count,
        cve_count=cve_count,
    )
