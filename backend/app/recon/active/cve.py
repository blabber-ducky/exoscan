"""
CVE detection active module.

For each technology with a known version (from tech_fingerprinting), queries
NVD API v2 with a keyword search and caches results in the cve_cache table
for 24 hours. Writes matching CVEs to scan_cves.

Rate limits:
  - Without API key: 5 req / 30 s  → Semaphore(1) with 6 s sleep between calls
  - With API key:   50 req / 30 s  → Semaphore(5)

On HTTP 429: waits 30 s and retries once.
Only CVEs with CVSS score ≥ 4.0 (MEDIUM and above) are persisted.
"""
import asyncio
import json
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Awaitable, Callable

import httpx
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.scans.models import ScanCVE

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "cve_detection"
_NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
_CACHE_TTL_HOURS = 24
_MIN_CVSS = 4.0       # ignore NONE / LOW
_MAX_RESULTS = 20     # per tech/version query

# Semaphore relaxed when an API key is configured
_nvd_semaphore: asyncio.Semaphore | None = None

def _get_semaphore() -> asyncio.Semaphore:
    global _nvd_semaphore
    if _nvd_semaphore is None:
        limit = 5 if settings.nvd_api_key else 1
        _nvd_semaphore = asyncio.Semaphore(limit)
    return _nvd_semaphore


# ---------------------------------------------------------------------------
# CVSS helpers
# ---------------------------------------------------------------------------

def _extract_cvss(
    cve_item: dict,
) -> tuple[float | None, str | None, str | None]:
    """Returns (score, cvss_version_str, severity) from a NVD CVE object."""
    metrics = cve_item.get("metrics", {})

    for key, ver in (("cvssMetricV31", "3.1"), ("cvssMetricV30", "3.0")):
        for entry in metrics.get(key, []):
            data = entry.get("cvssData", {})
            score = data.get("baseScore")
            severity = data.get("baseSeverity")
            if score is not None:
                return float(score), ver, severity

    for entry in metrics.get("cvssMetricV2", []):
        data = entry.get("cvssData", {})
        score = data.get("baseScore")
        if score is not None:
            sev = "HIGH" if score >= 7.0 else ("MEDIUM" if score >= 4.0 else "LOW")
            return float(score), "2.0", sev

    return None, None, None


# ---------------------------------------------------------------------------
# NVD API
# ---------------------------------------------------------------------------

async def _nvd_search(tech: str, version: str) -> list[dict]:
    """
    Query NVD API v2 for CVEs matching the given tech/version keyword.
    Returns a list of simplified CVE dicts (already filtered by CVSS).
    """
    params = {
        "keywordSearch": f"{tech} {version}",
        "resultsPerPage": _MAX_RESULTS,
    }
    headers: dict[str, str] = {}
    if settings.nvd_api_key:
        headers["apiKey"] = settings.nvd_api_key

    async with _get_semaphore():
        if not settings.nvd_api_key:
            await asyncio.sleep(6)  # ~5 req/30 s → 1 req/6 s

        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(2):
                try:
                    resp = await client.get(_NVD_URL, params=params, headers=headers)
                    if resp.status_code == 200:
                        break
                    if resp.status_code == 429 and attempt == 0:
                        await asyncio.sleep(30)
                        continue
                    return []
                except Exception:
                    return []
            else:
                return []

        data = resp.json()

    cves: list[dict] = []
    for item in data.get("vulnerabilities", []):
        cve = item.get("cve", {})
        cve_id = cve.get("id", "")

        score, cv_ver, severity = _extract_cvss(cve)
        if score is None or score < _MIN_CVSS:
            continue

        # English description
        description = ""
        for desc in cve.get("descriptions", []):
            if desc.get("lang") == "en":
                description = desc.get("value", "")
                break

        cves.append({
            "id": cve_id,
            "cvss_score": score,
            "cvss_version": cv_ver,
            "severity": severity,
            "description": description[:2000],
        })

    return cves


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

async def _cache_get(cache_key: str) -> list[dict] | None:
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            text(
                "SELECT cves FROM cve_cache "
                "WHERE cache_key = :k AND expires_at > now()"
            ),
            {"k": cache_key},
        )
        result = row.fetchone()
        if result:
            val = result[0]
            return val if isinstance(val, list) else json.loads(val)
    return None


async def _cache_set(cache_key: str, cves: list[dict]) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(
                """
                INSERT INTO cve_cache (cache_key, cves, fetched_at, expires_at)
                VALUES (:k, :v::jsonb, now(), now() + INTERVAL '24 hours')
                ON CONFLICT (cache_key) DO UPDATE
                    SET cves = EXCLUDED.cves,
                        fetched_at = EXCLUDED.fetched_at,
                        expires_at = EXCLUDED.expires_at
                """
            ),
            {"k": cache_key, "v": json.dumps(cves)},
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Module entry point
# ---------------------------------------------------------------------------

async def run(
    scan_id: str,
    asset_id: uuid.UUID,
    technologies: list[dict],
    log_fn: _LOG,
) -> None:
    """
    Look up CVEs for each technology with a known version.
    Writes results to scan_cves; uses cve_cache to avoid redundant API calls.
    """
    # Only query techs that have a specific version (broad searches produce noise)
    versioned = [
        t for t in technologies
        if t.get("version") and t.get("name")
    ]
    if not versioned:
        await log_fn("INFO", STAGE, "No versioned technologies — skipping CVE lookup")
        return

    await log_fn("INFO", STAGE, f"CVE lookup for {len(versioned)} versioned technology/ies")

    total_cves = 0

    for tech in versioned:
        name: str = tech["name"]
        version: str = str(tech["version"]).split()[0]  # strip "(Debian)" etc.
        cache_key = f"nvd:{name.lower()}:{version}"

        cached = await _cache_get(cache_key)
        if cached is not None:
            cves = cached
            await log_fn("INFO", STAGE, f"{name} {version}: {len(cves)} CVE(s) (cached)")
        else:
            cves = await _nvd_search(name, version)
            await _cache_set(cache_key, cves)
            await log_fn("INFO", STAGE, f"{name} {version}: {len(cves)} CVE(s) (NVD)")

        if not cves:
            continue

        # Persist to scan_cves (ON CONFLICT DO NOTHING handles reruns)
        async with AsyncSessionLocal() as db:
            for cve in cves:
                await db.execute(
                    text(
                        """
                        INSERT INTO scan_cves
                            (asset_id, cve_id, technology, version,
                             cvss_score, cvss_version, severity, description, nvd_url)
                        VALUES
                            (:asset_id, :cve_id, :tech, :ver,
                             :score, :cv_ver, :sev, :desc, :url)
                        ON CONFLICT (asset_id, cve_id) DO NOTHING
                        """
                    ),
                    {
                        "asset_id": str(asset_id),
                        "cve_id": cve["id"],
                        "tech": name,
                        "ver": version,
                        "score": cve["cvss_score"],
                        "cv_ver": cve["cvss_version"],
                        "sev": cve["severity"],
                        "desc": cve["description"],
                        "url": f"https://nvd.nist.gov/vuln/detail/{cve['id']}",
                    },
                )
            await db.commit()

        total_cves += len(cves)

    await log_fn("INFO", STAGE, f"CVE detection complete — {total_cves} total CVE(s) found")
