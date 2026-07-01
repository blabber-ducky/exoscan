"""
Liveness probe module.

probe_all_assets(scan_id, log_fn) probes every ScanAsset belonging to a scan
via async httpx and updates the following columns in the DB:
  scan_status  — live | unreachable | timeout | filtered
  url          — final URL after redirects (only when live)
  status_code  — HTTP status of the final response
  title        — <title> text parsed from HTML response body
  headers      — response headers dict (JSONB)
  waf_detected — WAF/CDN name if a known signature is found in headers

Probing strategy for each asset (first success wins):
  1. asset.url if already set (active-scan target)
  2. https://{hostname}  →  http://{hostname}

Up to 20 probes run concurrently (asyncio.Semaphore).
SSL verification is intentionally disabled: an expired or self-signed
certificate still means the host is live and should proceed to active recon.
"""
import asyncio
import html as _html
import re
import uuid
from typing import Awaitable, Callable

import httpx
from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.scans.models import ScanAsset

_LOG = Callable[[str, str, str], Awaitable[None]]

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
_SEMAPHORE_SIZE = 20
_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=None)

# WAF / CDN detection via response headers and Server value
_WAF_HEADER_MAP: dict[str, str] = {
    "cf-ray": "Cloudflare",
    "x-sucuri-id": "Sucuri",
    "x-datadome-cid": "DataDome",
    "x-ddos-guard": "DDoS-Guard",
}
_WAF_SERVER_MAP: dict[str, str] = {
    "cloudflare": "Cloudflare",
    "sucuri": "Sucuri",
    "ddos-guard": "DDoS-Guard",
    "imperva": "Imperva",
    "akamai": "Akamai",
    "incapsula": "Imperva Incapsula",
}

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _candidate_urls(asset: ScanAsset) -> list[str]:
    if asset.url:
        return [asset.url]
    if asset.hostname:
        h = asset.hostname
        return [f"https://{h}", f"http://{h}"]
    if asset.ip_address:
        ip = str(asset.ip_address)
        return [f"http://{ip}", f"https://{ip}"]
    return []


def _extract_title(html: str) -> str | None:
    m = _TITLE_RE.search(html[:8192])
    if not m:
        return None
    raw = _TAG_RE.sub("", m.group(1))
    title = _html.unescape(raw).strip()
    return title[:255] or None


def _detect_waf(headers: httpx.Headers) -> str | None:
    lower = {k.lower(): v for k, v in headers.items()}
    for header, name in _WAF_HEADER_MAP.items():
        if header in lower:
            return name
    server = lower.get("server", "").lower()
    for key, name in _WAF_SERVER_MAP.items():
        if key in server:
            return name
    return None


# ---------------------------------------------------------------------------
# Per-asset probe (called under the shared semaphore)
# ---------------------------------------------------------------------------

_ProbeResult = tuple[str, int | None, str | None, str | None, dict | None, str | None]
# (scan_status, status_code, url, title, headers, waf_detected)


async def _probe_one(
    asset: ScanAsset,
    semaphore: asyncio.Semaphore,
    client: httpx.AsyncClient,
) -> _ProbeResult:
    candidates = _candidate_urls(asset)
    if not candidates:
        return ("unreachable", None, None, None, None, None)

    timeout_seen = False

    async with semaphore:
        for url in candidates:
            try:
                resp = await client.get(url, headers={"User-Agent": _UA})

                final_url = str(resp.url)
                title: str | None = None
                if "text/html" in resp.headers.get("content-type", ""):
                    title = _extract_title(resp.text)
                headers_dict = dict(resp.headers)
                waf = _detect_waf(resp.headers)

                return ("live", resp.status_code, final_url, title, headers_dict, waf)

            except httpx.TimeoutException:
                timeout_seen = True
            except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.InvalidURL):
                pass  # try next candidate
            except Exception:
                pass

    return ("timeout" if timeout_seen else "unreachable", None, None, None, None, None)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def probe_all_assets(scan_id: str, log_fn: _LOG) -> None:
    """
    Probe all ScanAssets for the given scan ID in parallel (semaphore=20).
    Updates scan_status and enriches live assets with url/title/headers/waf.
    Non-live assets are logged at WARN level.
    """
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(ScanAsset).where(ScanAsset.scan_id == uuid.UUID(scan_id))
        )
        assets = list(rows.scalars().all())

    if not assets:
        await log_fn("WARN", "probe", "No assets to probe")
        return

    await log_fn("INFO", "probe", f"Probing {len(assets)} asset(s)")

    semaphore = asyncio.Semaphore(_SEMAPHORE_SIZE)
    async with httpx.AsyncClient(
        timeout=_TIMEOUT,
        follow_redirects=True,
        max_redirects=3,
        verify=False,
    ) as client:
        results: list[_ProbeResult | BaseException] = await asyncio.gather(
            *[_probe_one(a, semaphore, client) for a in assets],
            return_exceptions=True,
        )

    live_count = 0
    async with AsyncSessionLocal() as db:
        for asset, result in zip(assets, results):
            if isinstance(result, BaseException):
                status, code, url, title, hdrs, waf = "unreachable", None, None, None, None, None
            else:
                status, code, url, title, hdrs, waf = result

            if status == "live":
                live_count += 1
            else:
                host_label = asset.hostname or asset.url or str(asset.ip_address)
                await log_fn("WARN", "probe", f"{status}: {host_label}")

            values: dict = {"scan_status": status}
            if url:
                values["url"] = url
            if code is not None:
                values["status_code"] = code
            if title:
                values["title"] = title
            if hdrs:
                values["headers"] = hdrs
            if waf:
                values["waf_detected"] = waf

            await db.execute(
                update(ScanAsset).where(ScanAsset.id == asset.id).values(**values)
            )
        await db.commit()

    await log_fn(
        "INFO", "probe",
        f"Probe complete — {live_count}/{len(assets)} assets live",
    )
