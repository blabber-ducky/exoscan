"""
Secondary scan suggestion generation.

After active recon completes per-asset, matches detected technologies against
SCAN_TEMPLATES. Priority is boosted +40 when any CVE with CVSS ≥ 7.0 was found
for the asset. Writes suggested_scans rows. Called from orchestrator._process().
"""
from decimal import Decimal
from typing import Awaitable, Callable

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.recon.secondary.templates import SCAN_TEMPLATES, ScanTemplate
from app.scans.models import ScanAsset, ScanCVE, SuggestedScan

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "suggestions"
_HIGH_CVSS = 7.0
_PRIORITY_BOOST = 40


async def generate_suggestions(
    asset: ScanAsset,
    techs: list[dict],
    log_fn: _LOG,
) -> None:
    """
    Generate follow-up scan suggestions for a single asset.
    Skips assets without a URL (cannot be re-targeted).
    """
    if not asset.url:
        return

    # Load CVEs to decide whether to boost priority
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(ScanCVE).where(ScanCVE.asset_id == asset.id)
        )
        cves = list(rows.scalars().all())

    has_high_cve = any(
        c.cvss_score is not None and float(c.cvss_score) >= _HIGH_CVSS
        for c in cves
    )

    tech_names = [t.get("name", "").lower() for t in techs if t.get("name")]
    tech_tags = ",".join(tech_names)

    # Collect templates, deduplicating by scan_type
    seen: set[str] = set()
    to_add: list[tuple[ScanTemplate, bool]] = []  # (template, is_default)

    for key, templates in SCAN_TEMPLATES.items():
        if key == "_default":
            continue
        if not any(key in name for name in tech_names):
            continue
        for tmpl in templates:
            if tmpl.scan_type not in seen:
                seen.add(tmpl.scan_type)
                to_add.append((tmpl, False))

    for tmpl in SCAN_TEMPLATES.get("_default", []):
        if tmpl.scan_type not in seen:
            seen.add(tmpl.scan_type)
            to_add.append((tmpl, True))

    if not to_add:
        return

    params = {
        "url": asset.url,
        "hostname": asset.hostname,
        "tech_tags": tech_tags,
    }

    async with AsyncSessionLocal() as db:
        for tmpl, _ in to_add:
            priority = min(100, tmpl.base_priority + (_PRIORITY_BOOST if has_high_cve else 0))
            db.add(SuggestedScan(
                asset_id=asset.id,
                scan_type=tmpl.scan_type,
                display_name=tmpl.display_name,
                description=tmpl.description,
                risk_level=tmpl.risk_level,
                priority=priority,
                params=params,
                status="suggested",
            ))
        await db.commit()

    specific = sum(1 for _, is_default in to_add if not is_default)
    await log_fn(
        "INFO", STAGE,
        f"Generated {len(to_add)} suggestion(s) for {asset.hostname or asset.url} "
        f"({specific} tech-specific, {len(to_add) - specific} default)",
    )
