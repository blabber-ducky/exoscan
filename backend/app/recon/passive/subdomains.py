"""
Subdomain discovery passive module.

Two parallel sources:
  1. subfinder (Kali container) — passive DNS aggregation across ~40 sources
  2. crt.sh (in-process httpx)  — Certificate Transparency log query

Results are deduplicated by hostname before return.
Returns list of {"host": ..., "source": ...} dicts.
"""
import asyncio
import shlex
from typing import Awaitable, Callable

import httpx

from app.docker_manager.container import run_ephemeral

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "subdomains"
_TIMEOUT = 180  # subfinder can be slow for large apex domains


# ---------------------------------------------------------------------------
# crt.sh Certificate Transparency source
# ---------------------------------------------------------------------------

async def _crtsh(domain: str, log_fn: _LOG) -> set[str]:
    """Query crt.sh for subdomains recorded in CT logs."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(
                "https://crt.sh/",
                params={"q": f"%.{domain}", "output": "json"},
            )
        if resp.status_code != 200:
            return set()

        suffix = f".{domain}"
        hosts: set[str] = set()
        for entry in resp.json():
            for name in entry.get("name_value", "").split("\n"):
                name = name.strip().lstrip("*.").lower()
                # Accept only proper subdomains (not the apex itself)
                if name and name.endswith(suffix):
                    hosts.add(name)
        return hosts

    except Exception as exc:
        await log_fn("WARN", STAGE, f"crt.sh query failed: {exc}")
        return set()


# ---------------------------------------------------------------------------
# subfinder source
# ---------------------------------------------------------------------------

async def _subfinder(scan_id: str, domain: str, log_fn: _LOG) -> set[str]:
    """Run subfinder in a Kali container, return set of discovered hosts."""
    quoted = shlex.quote(domain)
    exit_code, _, extracted = await run_ephemeral(
        scan_id=scan_id,
        stage=STAGE,
        tools=["subfinder"],
        command=f"subfinder -d {quoted} -silent -o /tmp/out.txt 2>&1",
        timeout_seconds=_TIMEOUT,
        extract_path="/tmp/out.txt",
    )

    if not extracted:
        return set()

    hosts: set[str] = set()
    for line in extracted.decode("utf-8", errors="replace").splitlines():
        host = line.strip().lower()
        if host and "." in host:
            hosts.add(host)
    return hosts


# ---------------------------------------------------------------------------
# Module entry point
# ---------------------------------------------------------------------------

async def run(scan_id: str, target: str, log_fn: _LOG) -> list[dict]:
    """
    Discover subdomains of target using subfinder + crt.sh in parallel.
    Returns deduplicated list of {"host": ..., "source": ...} dicts.
    """
    await log_fn("INFO", STAGE, f"Starting subdomain discovery for {target}")

    subfinder_hosts, crtsh_hosts = await asyncio.gather(
        _subfinder(scan_id, target, log_fn),
        _crtsh(target, log_fn),
        return_exceptions=False,
    )

    results: list[dict] = []
    seen: set[str] = set()

    for host in subfinder_hosts:
        if host not in seen:
            seen.add(host)
            src = "subfinder+crtsh" if host in crtsh_hosts else "subfinder"
            results.append({"host": host, "source": src})

    for host in crtsh_hosts - subfinder_hosts:
        if host not in seen:
            seen.add(host)
            results.append({"host": host, "source": "crtsh"})

    await log_fn(
        "INFO", STAGE,
        f"Subdomain discovery complete — {len(results)} unique hosts "
        f"({len(subfinder_hosts)} subfinder, {len(crtsh_hosts)} crt.sh)",
    )
    return results
