"""
IP profiling passive module.

Resolves the target to an IPv4 address (if it's a domain) then queries
ipinfo.io for geolocation, ASN, and org metadata. Runs entirely in-process
via asyncio + httpx — no container is spawned.

Returns an ipinfo.io response dict (keys: ip, hostname, city, region,
country, org, postal, timezone) stored alongside DNS records on the main
target's ScanAsset, or an empty dict on failure.
"""
import asyncio
import re
import socket
from typing import Awaitable, Callable

import httpx

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "ip_profiling"
_IPINFO_URL = "https://ipinfo.io/{ip}/json"
_IPV4_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")


def _is_ipv4(value: str) -> bool:
    if not _IPV4_RE.match(value):
        return False
    return all(0 <= int(p) <= 255 for p in value.split("."))


async def _resolve(hostname: str) -> str | None:
    """Resolve hostname to IPv4 via blocking socket call in thread pool."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, socket.gethostbyname, hostname)
    except Exception:
        return None


async def run(scan_id: str, target: str, log_fn: _LOG) -> dict:
    """
    Profile the IP associated with target.
    Returns ipinfo.io JSON dict, {"ip": <resolved_ip>} on partial failure,
    or {} if the target cannot be resolved.
    """
    await log_fn("INFO", STAGE, f"Starting IP profiling for {target}")

    ip = target if _is_ipv4(target) else await _resolve(target)
    if not ip:
        await log_fn("WARN", STAGE, f"Could not resolve {target} to an IPv4 address")
        return {}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_IPINFO_URL.format(ip=ip))

        if resp.status_code == 200:
            data = resp.json()
            org = data.get("org", "unknown")
            country = data.get("country", "unknown")
            await log_fn("INFO", STAGE, f"{ip}: {org}, {country}")
            return data

        await log_fn("WARN", STAGE, f"ipinfo.io returned HTTP {resp.status_code}")
        return {"ip": ip}

    except Exception as exc:
        await log_fn("WARN", STAGE, f"IP profiling failed: {exc}")
        return {"ip": ip}
