"""
Screenshot capture active module.

Runs GoWitness in a single ephemeral Kali container that processes ALL live
URLs in one pass — one container per scan, not per URL.

GoWitness writes PNG files and a SQLite database (gowitness.sqlite3) into
the shared screenshots_vol. The backend reads the SQLite file directly from
its own volume mount to build URL→filename mappings, then updates each
ScanAsset.screenshot_path.

Screenshots are served by FastAPI StaticFiles at:
  /static/screenshots/{scan_id}/{filename}
"""
import asyncio
import os
import shlex
import sqlite3
import uuid
from typing import Awaitable, Callable

from sqlalchemy import select, update

from app.config import settings
from app.database import AsyncSessionLocal
from app.docker_manager.container import run_ephemeral
from app.scans.models import ScanAsset

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "screenshot_capture"
_TIMEOUT = 300  # 5 min — GoWitness batches all URLs in one run


# ---------------------------------------------------------------------------
# GoWitness SQLite reader (blocking — called in thread executor)
# ---------------------------------------------------------------------------

def _read_gowitness_db(db_path: str) -> dict[str, str]:
    """
    Return {url: filename} mapping from a GoWitness SQLite database.
    Handles GoWitness 2.x schema ("urls" table, "filename" column).
    """
    mapping: dict[str, str] = {}
    if not os.path.exists(db_path):
        return mapping
    try:
        with sqlite3.connect(db_path) as conn:
            try:
                rows = conn.execute("SELECT url, filename FROM urls").fetchall()
            except sqlite3.OperationalError:
                # Fallback: discover the table and column names at runtime
                tables = [
                    r[0]
                    for r in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    ).fetchall()
                ]
                rows = []
                for tbl in tables:
                    try:
                        rows = conn.execute(
                            f"SELECT url, filename FROM {tbl}"  # noqa: S608
                        ).fetchall()
                        if rows:
                            break
                    except sqlite3.OperationalError:
                        continue

            for url, filename in rows:
                if url and filename:
                    mapping[url] = os.path.basename(str(filename))
    except Exception:
        pass
    return mapping


# ---------------------------------------------------------------------------
# Module entry point
# ---------------------------------------------------------------------------

async def run(scan_id: str, urls: list[str], log_fn: _LOG) -> None:
    """
    Take screenshots of all provided URLs via GoWitness.
    Updates ScanAsset.screenshot_path for each URL that was captured.
    """
    if not urls:
        return

    await log_fn("INFO", STAGE, f"Taking screenshots of {len(urls)} URL(s)")

    # Build the printf command to write URLs into a file inside the container.
    # Each URL is shell-quoted so special characters are safe.
    url_args = " ".join(shlex.quote(u) for u in urls)
    scan_dir = f"/screenshots/{scan_id}"

    command = (
        f"mkdir -p {scan_dir} && "
        f"printf '%s\\n' {url_args} > /tmp/urls.txt && "
        f"gowitness file "
        f"-f /tmp/urls.txt "
        f"--screenshot-path {scan_dir}/ "
        f"--db-path {scan_dir}/gowitness.sqlite3 "
        f"--timeout 30 --threads 4 --delay 3 2>&1"
    )

    exit_code, _, _ = await run_ephemeral(
        scan_id=scan_id,
        stage=STAGE,
        tools=["gowitness"],
        command=command,
        volumes={
            settings.screenshots_volume: {"bind": "/screenshots", "mode": "rw"},
        },
        timeout_seconds=_TIMEOUT,
    )

    if exit_code not in (0, -1):
        await log_fn("WARN", STAGE, f"GoWitness exited with code {exit_code}")

    # Read URL→filename mapping from the SQLite DB on the shared volume
    db_path = os.path.join(settings.screenshot_base_path, scan_id, "gowitness.sqlite3")
    loop = asyncio.get_event_loop()
    mapping = await loop.run_in_executor(None, _read_gowitness_db, db_path)

    if not mapping:
        await log_fn("WARN", STAGE, "No screenshots found in GoWitness database")
        return

    # Update screenshot_path on the matching ScanAsset rows
    updated = 0
    async with AsyncSessionLocal() as db:
        for url, filename in mapping.items():
            screenshot_path = f"{scan_id}/{filename}"
            result = await db.execute(
                update(ScanAsset)
                .where(ScanAsset.scan_id == uuid.UUID(scan_id))
                .where(ScanAsset.url == url)
                .values(screenshot_path=screenshot_path)
                .returning(ScanAsset.id)
            )
            if result.fetchone():
                updated += 1
        await db.commit()

    await log_fn(
        "INFO", STAGE,
        f"Screenshots complete — {updated}/{len(mapping)} URL(s) matched",
    )
