"""
Technology fingerprinting active module.

Runs WhatWeb in an ephemeral Kali container using JSON log output, then
normalises the plugin map into a flat list stored on scan_assets.technologies.

Each technology entry:  {"name": "Apache", "version": "2.4.49", "confidence": 100}
version is None when WhatWeb did not detect a specific version string.
"""
import json
import shlex
from typing import Awaitable, Callable

from app.docker_manager.container import run_ephemeral
from app.scans.models import ScanAsset

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "tech_fingerprinting"
_TIMEOUT = 120


def _parse_whatweb(raw: bytes) -> list[dict]:
    """
    Parse WhatWeb --log-json output.

    Output format: JSON array, one object per target.
    Each object has a "plugins" dict mapping name → {version: [...], confidence: int}.
    """
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return []

    if not isinstance(data, list) or not data:
        return []

    plugins: dict = data[0].get("plugins", {})
    techs: list[dict] = []

    for name, info in plugins.items():
        versions = info.get("version", [])
        # Clean version strings — strip "(Debian)" style suffixes
        version: str | None = None
        if versions:
            version = str(versions[0]).split()[0] if versions[0] else None

        techs.append({
            "name": name,
            "version": version,
            "confidence": int(info.get("confidence", 100)),
        })

    return techs


async def run(scan_id: str, asset: ScanAsset, log_fn: _LOG) -> list[dict]:
    """
    Run WhatWeb against asset.url. Returns normalised technology list.
    """
    if not asset.url:
        await log_fn("WARN", STAGE, f"No URL available for asset {asset.hostname}")
        return []

    quoted = shlex.quote(asset.url)
    await log_fn("INFO", STAGE, f"Fingerprinting: {asset.url}")

    exit_code, _, extracted = await run_ephemeral(
        scan_id=scan_id,
        stage=STAGE,
        tools=["whatweb"],
        command=(
            f"whatweb -q --log-json /tmp/out.json --timeout 30 {quoted} 2>&1"
        ),
        timeout_seconds=_TIMEOUT,
        extract_path="/tmp/out.json",
    )

    if extracted is None:
        await log_fn("WARN", STAGE, f"WhatWeb produced no output for {asset.url}")
        return []

    techs = _parse_whatweb(extracted)
    named = [t["name"] for t in techs if t.get("version")]
    await log_fn(
        "INFO", STAGE,
        f"Fingerprinting complete — {len(techs)} plugin(s)"
        + (f" ({', '.join(named[:5])})" if named else ""),
    )
    return techs
