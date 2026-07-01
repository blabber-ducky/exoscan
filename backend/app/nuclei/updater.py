"""
Nuclei template manager.

update_templates() runs nuclei inside a fresh Kali container and writes
the results into nuclei_templates_vol (mounted at /nuclei-templates).
nuclei_update_loop() is started as an asyncio background task from main.py
lifespan; it checks whether templates are stale on startup and then sleeps
24 hours between subsequent refreshes.

All subsequent nuclei scan containers mount the same volume read-only
at /nuclei-templates, so they never need to re-download templates.
"""
import asyncio
import logging
import time
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Sent as scan_id to run_ephemeral() for system tasks.
# It is not a valid UUID so container-ID tracking silently no-ops,
# and no WebSocket clients will ever be subscribed to this "scan".
_SYSTEM_SCAN_ID = "__system__"

_UPDATE_INTERVAL = 24 * 60 * 60  # 24 hours in seconds
_MARKER = ".exoscan_last_updated"  # written inside the templates volume


# ---------------------------------------------------------------------------
# Staleness helpers
# ---------------------------------------------------------------------------

def _marker_path() -> Path:
    return Path(settings.nuclei_templates_path) / _MARKER


def _is_stale() -> bool:
    """True when templates have never been fetched or are older than 24 h."""
    marker = _marker_path()
    if not marker.exists():
        return True
    try:
        last = float(marker.read_text().strip())
        return (time.time() - last) > _UPDATE_INTERVAL
    except Exception:
        return True


def _mark_fresh() -> None:
    """Write the current timestamp so the next startup can skip re-fetching."""
    try:
        marker = _marker_path()
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(str(time.time()))
    except Exception as exc:
        logger.warning("Nuclei: could not write update marker: %s", exc)


# ---------------------------------------------------------------------------
# Core update
# ---------------------------------------------------------------------------

async def update_templates() -> None:
    """
    Pull/refresh nuclei templates into nuclei_templates_vol.

    Installs nuclei via apt at runtime in a fresh kali-rolling container,
    then runs:
        nuclei -update-templates -update-template-dir /nuclei-templates

    The volume persists across container lifecycles so subsequent runs only
    download incremental changes from the ProjectDiscovery GitHub releases.
    """
    from app.docker_manager.container import run_ephemeral

    logger.info("Nuclei: starting template update")

    exit_code, _, _ = await run_ephemeral(
        scan_id=_SYSTEM_SCAN_ID,
        stage="nuclei_update",
        tools=["nuclei"],
        command=(
            "nuclei "
            "-update-templates "
            f"-update-template-dir /nuclei-templates"
        ),
        volumes={
            settings.nuclei_templates_volume: {
                "bind": "/nuclei-templates",
                "mode": "rw",
            }
        },
        timeout_seconds=600,  # 10 min — generous for the initial full download
    )

    if exit_code == 0:
        _mark_fresh()
        logger.info("Nuclei: templates updated successfully")
    else:
        # Non-zero but non-fatal: the loop will retry on the next cycle.
        # Any existing templates remain usable.
        raise RuntimeError(
            f"nuclei -update-templates exited with code {exit_code}"
        )


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------

async def nuclei_update_loop() -> None:
    """
    Runs for the lifetime of the application (started from main.py lifespan).

    On each iteration:
      1. If templates are stale (or missing), call update_templates().
      2. Sleep 24 hours.
      3. Repeat.

    A failed update is logged but does not crash the loop — existing templates
    continue to work and the next cycle will retry.
    """
    while True:
        try:
            if _is_stale():
                await update_templates()
            else:
                logger.info(
                    "Nuclei: templates are fresh (updated within 24 h), skipping"
                )
        except Exception as exc:
            logger.error("Nuclei: template update failed: %s", exc)

        await asyncio.sleep(_UPDATE_INTERVAL)
