"""
Scan orchestrator.

Entry point: run_scan(scan_id) — called via asyncio.create_task() immediately
after POST /api/v1/scans returns. Runs for the entire lifetime of a scan.

Phases (not all are implemented yet):
  Stage 1 — Passive recon   (passive, comprehensive)  ← Phase 6
  Stage 2 — Liveness probe  (active, comprehensive)   ← Phase 7
  Stage 3 — Active recon    (active, comprehensive)   ← Phase 8
  Post    — Suggestions     (active, comprehensive)   ← Phase 9

Raw container stdout is published to the log bus only (not persisted in
scan_logs). Structured orchestrator messages (stage start/complete, counts,
errors) are persisted to scan_logs AND published to the bus so that
WebSocket reconnections can replay them.
"""
import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable
from urllib.parse import urlparse

from app.database import AsyncSessionLocal
from app.recon import log_bus
from app.scans.models import Scan, ScanAsset, ScanLog

_IPV4_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")

_LogFn = Callable[[str, str, str], Awaitable[None]]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_scan(scan_id: str) -> None:
    """Orchestrate a full scan lifecycle for the given scan ID."""

    async with AsyncSessionLocal() as db:
        scan = await db.get(Scan, uuid.UUID(scan_id))
        if not scan:
            return
        scan.status = "running"
        scan.started_at = datetime.now(timezone.utc)
        await db.commit()

        target = scan.target
        scan_type = scan.scan_type
        modules: set[str] = set(scan.modules or [])

    log_fn = _make_log_fn(scan_id)

    try:
        await log_fn(
            "INFO", "orchestrator",
            f"Scan started — type={scan_type}, target={target}, "
            f"modules=[{', '.join(sorted(modules))}]",
        )

        # Stage 1: Passive recon
        if scan_type in ("passive", "comprehensive"):
            await _run_passive_stage(scan_id, target, modules, log_fn)

        # Stage 2: Liveness probe
        if scan_type in ("active", "comprehensive"):
            await _run_probe_stage(scan_id, scan_type, target, log_fn)

        # Stage 3: Active recon per asset (Phase 8)
        # if scan_type == "active":
        #     await _run_active_stage(scan_id, target, modules, log_fn)
        # elif scan_type == "comprehensive":
        #     await _run_comprehensive_active_stage(scan_id, modules, log_fn)

        # Post: Generate suggestions (Phase 9)
        # await _generate_suggestions(scan_id, log_fn)

        await log_fn("INFO", "orchestrator", "Scan completed successfully")
        await log_bus.publish(scan_id, json.dumps({"type": "complete"}))

        async with AsyncSessionLocal() as db:
            scan = await db.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = "completed"
                scan.completed_at = datetime.now(timezone.utc)
                await db.commit()

    except Exception as exc:
        await log_fn("ERROR", "orchestrator", f"Scan failed: {exc}")
        await log_bus.publish(scan_id, json.dumps({"type": "error", "message": str(exc)}))
        async with AsyncSessionLocal() as db:
            scan = await db.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = "failed"
                scan.error_message = str(exc)
                scan.completed_at = datetime.now(timezone.utc)
                await db.commit()


# ---------------------------------------------------------------------------
# Stage 2: Liveness probe
# ---------------------------------------------------------------------------

async def _run_probe_stage(
    scan_id: str,
    scan_type: str,
    target: str,
    log_fn: _LogFn,
) -> None:
    from app.recon import probe

    await log_fn("INFO", "orchestrator", "Stage 2: liveness probe")

    if scan_type == "active":
        # No passive stage ran — create the initial asset for the target URL
        await _create_active_target_asset(scan_id, target)

    await probe.probe_all_assets(scan_id, log_fn)


async def _create_active_target_asset(scan_id: str, target: str) -> None:
    """Create the initial ScanAsset for an active scan (no passive stage)."""
    parsed = urlparse(target)
    hostname = parsed.hostname or target

    async with AsyncSessionLocal() as db:
        db.add(ScanAsset(
            scan_id=uuid.UUID(scan_id),
            url=target,
            hostname=hostname,
            scan_status="live",  # probe will update this
        ))
        await db.commit()


# ---------------------------------------------------------------------------
# Stage 1: Passive recon
# ---------------------------------------------------------------------------

async def _run_passive_stage(
    scan_id: str,
    target: str,
    modules: set[str],
    log_fn: _LogFn,
) -> None:
    from app.recon.passive import dns, dorking, ip_profiling, subdomains

    await log_fn("INFO", "orchestrator", "Stage 1: passive recon")

    task_keys: list[str] = []
    coros = []

    if "dns_recon" in modules:
        task_keys.append("dns")
        coros.append(dns.run(scan_id, target, log_fn))
    if "ip_profiling" in modules:
        task_keys.append("ip")
        coros.append(ip_profiling.run(scan_id, target, log_fn))
    if "asset_identification" in modules:
        task_keys.append("subdomains")
        coros.append(subdomains.run(scan_id, target, log_fn))
        task_keys.append("dorking")
        coros.append(dorking.run(scan_id, target, log_fn))

    if not coros:
        await log_fn("WARN", "orchestrator", "No passive modules enabled — nothing to run")
        return

    raw_results = await asyncio.gather(*coros, return_exceptions=True)
    results: dict = dict(zip(task_keys, raw_results))

    # Log any module-level exceptions (don't abort scan)
    for key, val in results.items():
        if isinstance(val, Exception):
            await log_fn("ERROR", "orchestrator", f"Module '{key}' raised: {val}")

    await _save_passive_results(scan_id, target, results, log_fn)


async def _save_passive_results(
    scan_id: str,
    target: str,
    results: dict,
    log_fn: _LogFn,
) -> None:
    """Persist all passive module outputs to scan_assets and scans tables."""
    dns_records: list[dict] = _safe(results, "dns", [])
    ip_info: dict = _safe(results, "ip", {})
    subdomain_list: list[dict] = _safe(results, "subdomains", [])
    dork_hits: list[dict] = _safe(results, "dorking", [])

    # Derive target IP: prefer A record from dnsrecon, fall back to ipinfo
    target_ip: str | None = None
    for rec in dns_records:
        if rec.get("type") == "A":
            val = rec.get("value", "")
            if _IPV4_RE.match(val):
                target_ip = val
                break
    if not target_ip and ip_info:
        candidate = ip_info.get("ip", "")
        if _IPV4_RE.match(candidate):
            target_ip = candidate

    # Merge dns records + ip_info into a single JSONB field
    all_records = list(dns_records)
    if ip_info:
        all_records.append({"type": "ip_info", **ip_info})

    async with AsyncSessionLocal() as db:
        # Main target ScanAsset — always created for passive/comprehensive
        main_asset = ScanAsset(
            scan_id=uuid.UUID(scan_id),
            hostname=target,
            ip_address=target_ip,
            dns_records=all_records if all_records else None,
            scan_status="live",
        )
        db.add(main_asset)

        # One ScanAsset per discovered subdomain
        for sub in subdomain_list:
            host = sub.get("host", "").strip()
            if not host:
                continue
            db.add(ScanAsset(
                scan_id=uuid.UUID(scan_id),
                hostname=host,
                scan_status="live",  # probe will update this in Phase 7
            ))

        # Update dork hits on the Scan row
        scan = await db.get(Scan, uuid.UUID(scan_id))
        if scan and dork_hits:
            scan.dork_hits = dork_hits

        await db.commit()

    await log_fn(
        "INFO", "orchestrator",
        f"Passive results saved: {len(all_records)} DNS/IP records, "
        f"{len(subdomain_list)} subdomains, {len(dork_hits)} dork hits",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_log_fn(scan_id: str) -> _LogFn:
    """Return an async function that persists a log line to DB + bus."""

    async def _log(level: str, stage: str, message: str) -> None:
        ts = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            db.add(ScanLog(
                scan_id=uuid.UUID(scan_id),
                level=level,
                stage=stage,
                message=message,
                timestamp=ts,
            ))
            await db.commit()
        await log_bus.publish(
            scan_id,
            json.dumps({
                "type": "log",
                "level": level,
                "stage": stage,
                "message": message,
                "timestamp": ts.isoformat(),
            }),
        )

    return _log


def _safe(results: dict, key: str, default):
    """Return results[key] unless it's an Exception, in which case return default."""
    val = results.get(key, default)
    return default if isinstance(val, Exception) else val
