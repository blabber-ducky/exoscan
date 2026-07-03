import uuid
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Group, GroupMember, User
from app.scans.models import PentestFinding, Scan, ScanAsset, ScanCVE, ScanShare, SuggestedScan
from app.scans.schemas import (
    AssetResponse,
    CVESchema,
    PentestFindingSchema,
    PentestResultsResponse,
    ScanResponse,
    ScanResultsResponse,
    ScanShareResponse,
    GroupSummarySchema,
    UserSummarySchema,
    SuggestedScanSchema,
)


def _has_share_access(scan_id, user_id):
    """SQLAlchemy exists() clause: true when user has a share for this scan."""
    return or_(
        exists(
            select(ScanShare.id)
            .where(ScanShare.scan_id == scan_id)
            .where(ScanShare.shared_with_user_id == user_id)
        ),
        exists(
            select(ScanShare.id)
            .join(GroupMember, GroupMember.group_id == ScanShare.shared_with_group_id)
            .where(ScanShare.scan_id == scan_id)
            .where(GroupMember.user_id == user_id)
        ),
    )


async def get_scan_or_404(
    db: AsyncSession, scan_id: uuid.UUID, user_id: uuid.UUID
) -> Scan:
    """Owner-only: used for mutation routes (delete, share management, trigger)."""
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user_id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return scan


async def get_accessible_scan_or_404(
    db: AsyncSession, scan_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Scan, bool]:
    """Owner or shared viewer: returns (scan, is_owner)."""
    owner_alias = aliased(User, name="scan_owner")
    result = await db.execute(
        select(Scan, owner_alias.username)
        .join(owner_alias, owner_alias.id == Scan.user_id)
        .where(
            Scan.id == scan_id,
            or_(Scan.user_id == user_id, _has_share_access(scan_id, user_id)),
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    scan, owner_username = row
    is_owner = scan.user_id == user_id
    return scan, is_owner, owner_username


async def list_scans(
    db: AsyncSession, user_id: uuid.UUID, page: int, limit: int
) -> tuple[list[tuple], int]:
    offset = (page - 1) * limit
    owner_alias = aliased(User, name="scan_owner")

    accessible_where = or_(
        Scan.user_id == user_id,
        _has_share_access(Scan.id, user_id),
    )

    count_result = await db.execute(
        select(func.count()).select_from(Scan).where(accessible_where)
    )
    total = count_result.scalar_one()

    scans_result = await db.execute(
        select(Scan, owner_alias.username)
        .join(owner_alias, owner_alias.id == Scan.user_id)
        .where(accessible_where)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = list(scans_result.all())
    return rows, total


async def get_scan_results(
    db: AsyncSession, scan_id: uuid.UUID, user_id: uuid.UUID
) -> ScanResultsResponse:
    scan, is_owner, owner_username = await get_accessible_scan_or_404(db, scan_id, user_id)

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

    scan_resp = scan_to_response(
        scan,
        asset_count=len(assets),
        cve_count=total_cves,
        is_owner=is_owner,
        owner_username=None if is_owner else owner_username,
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


async def list_shares(db: AsyncSession, scan_id: uuid.UUID) -> list[ScanShareResponse]:
    result = await db.execute(
        select(ScanShare).where(ScanShare.scan_id == scan_id)
    )
    shares = list(result.scalars().all())

    user_ids = [s.shared_with_user_id for s in shares if s.shared_with_user_id]
    group_ids = [s.shared_with_group_id for s in shares if s.shared_with_group_id]

    users: dict[uuid.UUID, User] = {}
    groups: dict[uuid.UUID, Group] = {}

    if user_ids:
        u_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in u_result.scalars():
            users[u.id] = u

    if group_ids:
        g_result = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        for g in g_result.scalars():
            groups[g.id] = g

    out = []
    for s in shares:
        out.append(
            ScanShareResponse(
                id=str(s.id),
                shared_with_user=(
                    UserSummarySchema(id=str(users[s.shared_with_user_id].id), username=users[s.shared_with_user_id].username)
                    if s.shared_with_user_id and s.shared_with_user_id in users
                    else None
                ),
                shared_with_group=(
                    GroupSummarySchema(id=str(groups[s.shared_with_group_id].id), name=groups[s.shared_with_group_id].name)
                    if s.shared_with_group_id and s.shared_with_group_id in groups
                    else None
                ),
                created_at=s.created_at,
            )
        )
    return out


def scan_to_response(
    scan: Scan,
    asset_count: int = 0,
    cve_count: int = 0,
    pentest_findings_count: int = 0,
    is_owner: bool = True,
    owner_username: str | None = None,
) -> ScanResponse:
    return ScanResponse(
        id=str(scan.id),
        target=scan.target,
        scan_type=scan.scan_type,
        modules=scan.modules,
        port_config=scan.port_config,
        strix_config=scan.strix_config if hasattr(scan, "strix_config") else {},
        status=scan.status,
        completed_stages=list(scan.completed_stages or []),
        parent_scan_id=str(scan.parent_scan_id) if getattr(scan, "parent_scan_id", None) else None,
        dork_hits=scan.dork_hits,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        error_message=scan.error_message,
        created_at=scan.created_at,
        asset_count=asset_count,
        cve_count=cve_count,
        pentest_findings_count=pentest_findings_count,
        is_owner=is_owner,
        owner_username=owner_username,
    )


async def get_pentest_results(
    db: AsyncSession, scan_id: uuid.UUID, user_id: uuid.UUID
) -> PentestResultsResponse:
    scan, is_owner, owner_username = await get_accessible_scan_or_404(db, scan_id, user_id)

    findings_result = await db.execute(
        select(PentestFinding)
        .where(PentestFinding.scan_id == scan_id)
        .order_by(PentestFinding.created_at)
    )
    findings = list(findings_result.scalars().all())

    scan_resp = scan_to_response(
        scan,
        pentest_findings_count=len(findings),
        is_owner=is_owner,
        owner_username=None if is_owner else owner_username,
    )

    finding_schemas = [
        PentestFindingSchema(
            id=str(f.id),
            scan_id=str(f.scan_id),
            title=f.title,
            severity=f.severity,
            cvss_score=float(f.cvss_score) if f.cvss_score is not None else None,
            cve_ids=list(f.cve_ids),
            affected_endpoint=f.affected_endpoint,
            description=f.description,
            reproduction_steps=f.reproduction_steps,
            patch_suggestion=f.patch_suggestion,
            created_at=f.created_at,
        )
        for f in findings
    ]

    return PentestResultsResponse(scan=scan_resp, findings=finding_schemas)
