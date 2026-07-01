"""
Ephemeral Kali container management.

run_ephemeral() is the single entry point for all scan tools.
It handles:
  - Image selection (default: kalilinux/kali-rolling)
  - apt-get install of tools at runtime
  - Log streaming to the pub/sub bus
  - Firewall/timeout pattern detection
  - Container ID registration for cancel support
  - Per-stage timeouts (kills container on expiry)
  - Optional extraction of a result file before removal
  - Guaranteed container cleanup in all error paths
"""
import asyncio
import io
import json
import shlex
import tarfile
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.docker_manager.client import get_client
from app.docker_manager.log_streamer import stream_container_logs
from app.recon import log_bus
from app.scans.models import Scan

# Patterns in container stdout that indicate firewall/network blocking.
# Matched case-insensitively. Matching lines are re-published at WARN level
# and collected in the returned firewall_warnings list.
DEFAULT_FIREWALL_PATTERNS: list[str] = [
    "filtered",
    "host unreachable",
    "no route to host",
    "connection refused",
    "connection timed out",
    "network unreachable",
    "request timeout",
    "destination host prohibited",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_shell_command(tools: list[str] | None, command: str) -> list[str]:
    """
    Returns ["bash", "-c", "apt-get install … && <command>"].
    tool names are shell-quoted; the command string is passed as-is
    (callers must shlex.quote any user-supplied values inside it).
    """
    if tools:
        quoted = " ".join(shlex.quote(t) for t in tools)
        full = (
            f"apt-get update -qq 2>&1 && "
            f"apt-get install -y --no-install-recommends {quoted} 2>&1 && "
            f"{command}"
        )
    else:
        full = command
    return ["bash", "-c", full]


async def _track_container(scan_id: str, container_id: str, *, add: bool) -> None:
    """Atomically add or remove a container short-ID from scans.container_ids."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Scan).where(Scan.id == uuid.UUID(scan_id))
            )
            scan = result.scalar_one_or_none()
            if not scan:
                return
            ids: list[str] = list(scan.container_ids or [])
            if add:
                if container_id not in ids:
                    ids.append(container_id)
            else:
                ids = [c for c in ids if c != container_id]
            scan.container_ids = ids
            await db.commit()
    except Exception:
        pass  # tracking failure must never abort a scan


async def _publish(scan_id: str, stage: str, level: str, message: str) -> None:
    await log_bus.publish(
        scan_id,
        json.dumps({
            "type": "log",
            "level": level,
            "stage": stage,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }),
    )


async def _stream_and_detect(
    container,
    scan_id: str,
    stage: str,
    patterns: list[str],
    firewall_warnings: list[str],
) -> None:
    async for line in stream_container_logs(container):
        lower = line.lower()
        level = "INFO"
        for p in patterns:
            if p in lower:
                firewall_warnings.append(line)
                level = "WARN"
                break
        await _publish(scan_id, stage, level, line)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_ephemeral(
    scan_id: str,
    stage: str,
    *,
    tools: list[str] | None = None,
    command: str,
    image: str = "kalilinux/kali-rolling",
    volumes: dict[str, Any] | None = None,
    environment: dict[str, str] | None = None,
    network: str | None = None,
    timeout_seconds: int = 300,
    firewall_patterns: list[str] | None = None,
    extract_path: str | None = None,
) -> tuple[int, list[str], bytes | None]:
    """
    Spin up an ephemeral container, run a command, stream stdout to the log bus.

    Args:
        scan_id:           UUID string of the parent scan (for log bus + tracking).
        stage:             Short stage label shown in the LogViewer (e.g. "dns").
        tools:             apt packages to install before running the command.
        command:           Shell command to execute after tool installation.
        image:             Docker image (default: kalilinux/kali-rolling).
        volumes:           Docker volumes dict {name_or_path: {"bind":..., "mode":...}}.
        environment:       Extra environment variables (DEBIAN_FRONTEND is always set).
        network:           Docker network name (default: settings.docker_network).
        timeout_seconds:   Hard timeout; container is killed on expiry.
        firewall_patterns: Extra patterns to detect in stdout (merged with defaults).
        extract_path:      If set, extract this file from the container before removal
                           and return its raw bytes as the third return value.

    Returns:
        (exit_code, firewall_warnings, extracted_bytes)
        exit_code=-1 on timeout or Docker-level error.
    """
    loop = asyncio.get_event_loop()
    client = get_client()

    full_cmd = _build_shell_command(tools, command)
    container_name = (
        f"exoscan-{scan_id.replace('-', '')[:8]}-{stage}-{uuid.uuid4().hex[:6]}"
    )

    env: dict[str, str] = {"DEBIAN_FRONTEND": "noninteractive"}
    if environment:
        env.update(environment)

    patterns = [p.lower() for p in (firewall_patterns or DEFAULT_FIREWALL_PATTERNS)]
    firewall_warnings: list[str] = []
    extracted: bytes | None = None
    exit_code = -1
    container = None

    try:
        container = await loop.run_in_executor(
            None,
            lambda: client.containers.run(
                image,
                command=full_cmd,
                name=container_name,
                detach=True,
                remove=False,
                network=network or settings.docker_network,
                volumes=volumes or {},
                environment=env,
            ),
        )

        await _track_container(scan_id, container.id, add=True)
        await _publish(scan_id, stage, "INFO", f"[{stage}] container {container.name} started")

        # Stream logs, enforcing the hard timeout
        try:
            await asyncio.wait_for(
                _stream_and_detect(container, scan_id, stage, patterns, firewall_warnings),
                timeout=float(timeout_seconds),
            )
        except asyncio.TimeoutError:
            msg = f"[{stage}] timed out after {timeout_seconds}s — container killed"
            await _publish(scan_id, stage, "WARN", msg)
            await loop.run_in_executor(None, lambda: container.kill())

        # Wait for the container to fully stop before we read its exit code / files
        try:
            wait_result = await loop.run_in_executor(None, container.wait)
            exit_code = wait_result.get("StatusCode", -1)
        except Exception:
            pass

        if exit_code not in (0, -1):
            await _publish(
                scan_id, stage, "WARN",
                f"[{stage}] container exited with code {exit_code}",
            )

        # Extract result file before the container is removed
        if extract_path and container is not None:
            extracted = await copy_file_from_container(container, extract_path)

    except Exception as exc:
        await _publish(scan_id, stage, "ERROR", f"[{stage}] container error: {exc}")

    finally:
        if container is not None:
            try:
                await loop.run_in_executor(None, lambda: container.remove(force=True))
            except Exception:
                pass
            await _track_container(scan_id, container.id, add=False)

    return exit_code, firewall_warnings, extracted


async def copy_file_from_container(container, container_path: str) -> bytes | None:
    """
    Extract a single file from a container (running or stopped) via docker cp.
    Returns the raw file bytes, or None if extraction fails.
    """
    loop = asyncio.get_event_loop()

    def _extract() -> bytes | None:
        try:
            bits, _ = container.get_archive(container_path)
            buf = io.BytesIO(b"".join(bits))
            with tarfile.open(fileobj=buf) as tar:
                members = tar.getmembers()
                if not members:
                    return None
                f = tar.extractfile(members[0])
                return f.read() if f else None
        except Exception:
            return None

    return await loop.run_in_executor(None, _extract)
