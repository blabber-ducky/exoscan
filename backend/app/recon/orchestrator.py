"""
Scan orchestrator — STUB for Phase 3.

Marks the scan running, emits a few log lines to both the DB and the
live log bus, then marks it complete. Real scanning stages (passive
recon, active recon, CVE lookup) are wired in from Phase 5 onwards.
"""
import asyncio
import json
import uuid
from datetime import datetime, timezone

from app.database import AsyncSessionLocal
from app.recon import log_bus
from app.scans.models import Scan, ScanLog


async def run_scan(scan_id: str) -> None:
    async with AsyncSessionLocal() as db:
        scan = await db.get(Scan, uuid.UUID(scan_id))
        if not scan:
            return

        scan.status = "running"
        scan.started_at = datetime.now(timezone.utc)
        await db.commit()

        try:
            await _emit(db, scan, "INFO", "system", "Scan started")
            await _emit(db, scan, "INFO", "system", f"Target: {scan.target}")
            await _emit(db, scan, "INFO", "system", f"Type: {scan.scan_type}")
            await _emit(
                db, scan, "INFO", "system",
                f"Modules: {', '.join(scan.modules) if scan.modules else 'none'}",
            )
            await asyncio.sleep(0.5)
            await _emit(db, scan, "INFO", "system", "Scan complete (stub — real modules coming soon)")

            scan.status = "completed"
            scan.completed_at = datetime.now(timezone.utc)
            await db.commit()

            await log_bus.publish(scan_id, json.dumps({"type": "complete"}))

        except Exception as exc:
            scan.status = "failed"
            scan.error_message = str(exc)
            scan.completed_at = datetime.now(timezone.utc)
            await db.commit()
            await log_bus.publish(
                scan_id,
                json.dumps({"type": "error", "message": str(exc)}),
            )


async def _emit(
    db,
    scan: Scan,
    level: str,
    stage: str,
    message: str,
) -> None:
    """Persist a log line to the DB and broadcast it to live subscribers."""
    now = datetime.now(timezone.utc)
    log = ScanLog(
        scan_id=scan.id,
        level=level,
        stage=stage,
        message=message,
        timestamp=now,
    )
    db.add(log)
    await db.commit()

    await log_bus.publish(
        str(scan.id),
        json.dumps({
            "type": "log",
            "level": level,
            "stage": stage,
            "message": message,
            "timestamp": now.isoformat(),
        }),
    )
