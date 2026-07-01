"""
Secondary scan executor.

Receives a triggered SuggestedScan ID, builds the appropriate command for the
scan_type, runs it in an ephemeral Kali container, and writes a plain-text
result summary back to suggested_scans.result_summary.

Called from the trigger endpoint via asyncio.create_task().
"""
import json
import shlex
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.config import settings
from app.database import AsyncSessionLocal
from app.docker_manager.container import run_ephemeral
from app.scans.models import ScanAsset, SuggestedScan

_STAGE = "secondary_scan"


# ---------------------------------------------------------------------------
# Per-type config
# ---------------------------------------------------------------------------

_EXEC: dict[str, dict] = {
    "nuclei_cve": {
        "tools": ["nuclei"],
        "timeout": 600,
        "nuclei_vol": True,
        "extract_path": "/tmp/out.json",
    },
    "wpscan": {
        "tools": ["wpscan"],
        "timeout": 300,
        "extract_path": "/tmp/out.json",
    },
    "ffuf_content": {
        "tools": ["ffuf", "dirb"],
        "timeout": 300,
        "extract_path": "/tmp/out.json",
    },
    "nikto": {
        "tools": ["nikto"],
        "timeout": 300,
        "extract_path": "/tmp/out.json",
    },
    "nmap_vuln": {
        "tools": ["nmap"],
        "timeout": 300,
        "extract_path": "/tmp/out.xml",
    },
}


# ---------------------------------------------------------------------------
# Command builder
# ---------------------------------------------------------------------------

def _build_command(scan_type: str, params: dict) -> str:
    """Build a shell command string. All user-derived values are shlex.quote'd."""
    url: str = params.get("url") or ""
    hostname: str = params.get("hostname") or ""
    tech_tags: str = params.get("tech_tags") or ""

    quoted_url = shlex.quote(url)
    quoted_hostname = shlex.quote(hostname)

    if scan_type == "nuclei_cve":
        tags = f"cve,{tech_tags}" if tech_tags else "cve"
        quoted_tags = shlex.quote(tags)
        return (
            f"nuclei -u {quoted_url} "
            f"-t /nuclei-templates "
            f"-tags {quoted_tags} "
            f"-severity medium,high,critical "
            f"-json-export /tmp/out.json "
            f"-no-interactsh 2>&1"
        )

    elif scan_type == "wpscan":
        return (
            f"wpscan --url {quoted_url} "
            f"--enumerate vp,u,t "
            f"--format json "
            f"--output /tmp/out.json "
            f"--no-update 2>&1"
        )

    elif scan_type == "ffuf_content":
        # Derive base URL (scheme + host only) so we fuzz from /, not a subpath
        if url:
            parsed = urlparse(url)
            fuzz_url = f"{parsed.scheme}://{parsed.netloc}/FUZZ"
        else:
            fuzz_url = f"{url}/FUZZ"
        quoted_fuzz = shlex.quote(fuzz_url)
        return (
            f"ffuf "
            f"-u {quoted_fuzz} "
            f"-w /usr/share/dirb/wordlists/common.txt "
            f"-mc 200,301,302,403 "
            f"-o /tmp/out.json -of json 2>&1"
        )

    elif scan_type == "nikto":
        return (
            f"nikto -h {quoted_url} "
            f"-o /tmp/out.json -Format json 2>&1"
        )

    elif scan_type == "nmap_vuln":
        target = quoted_hostname if hostname else quoted_url
        return (
            f"nmap -sV --script vuln {target} "
            f"-oX /tmp/out.xml 2>&1"
        )

    raise ValueError(f"Unknown scan_type: {scan_type!r}")


# ---------------------------------------------------------------------------
# Result summariser
# ---------------------------------------------------------------------------

def _summarise(scan_type: str, extracted: bytes | None) -> str:
    if not extracted:
        return "No output captured"

    try:
        if scan_type == "nuclei_cve":
            findings = []
            for line in extracted.decode("utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    findings.append({
                        "severity": obj.get("info", {}).get("severity", "unknown"),
                        "name": obj.get("info", {}).get("name", ""),
                    })
                except json.JSONDecodeError:
                    pass
            if not findings:
                return "No findings"
            by_sev: dict[str, int] = {}
            for f in findings:
                sev = (f["severity"] or "unknown").upper()
                by_sev[sev] = by_sev.get(sev, 0) + 1
            sev_str = ", ".join(f"{count} {sev}" for sev, count in sorted(by_sev.items()))
            top_names = "; ".join(f["name"] for f in findings[:3] if f["name"])
            return f"{len(findings)} finding(s): {sev_str}. Top: {top_names}"

        elif scan_type == "wpscan":
            data = json.loads(extracted.decode("utf-8", errors="replace"))
            core_vulns = len(data.get("vulnerabilities", []))
            plugin_vulns = sum(
                len(p.get("vulnerabilities", []))
                for p in data.get("plugins", {}).values()
            )
            total = core_vulns + plugin_vulns
            return (
                f"{total} vulnerability/ies found "
                f"({core_vulns} core, {plugin_vulns} in plugins)"
            )

        elif scan_type == "ffuf_content":
            data = json.loads(extracted.decode("utf-8", errors="replace"))
            results = data.get("results", [])
            if not results:
                return "No paths discovered"
            sample = [
                r.get("url") or r.get("input", {}).get("FUZZ", "")
                for r in results[:5]
            ]
            return f"{len(results)} path(s) found. Sample: {', '.join(str(p) for p in sample)}"

        elif scan_type == "nikto":
            data = json.loads(extracted.decode("utf-8", errors="replace"))
            items = (
                data.get("vulnerabilities")
                or data.get("issues")
                or data.get("results")
                or []
            )
            return f"{len(items)} issue(s) found"

        elif scan_type == "nmap_vuln":
            text = extracted.decode("utf-8", errors="replace")
            vuln_count = text.count("VULNERABLE")
            return f"{vuln_count} VULNERABLE indicator(s) in nmap vuln script output"

    except Exception:
        pass

    return f"Output captured ({len(extracted)} bytes)"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def trigger_suggested_scan(suggestion_id: str) -> None:
    """
    Execute a triggered suggested scan. Called via asyncio.create_task() from
    the trigger endpoint. Writes status + result_summary to suggested_scans.
    """
    async with AsyncSessionLocal() as db:
        suggestion = await db.get(SuggestedScan, uuid.UUID(suggestion_id))
        if not suggestion:
            return
        scan_type = suggestion.scan_type
        params = dict(suggestion.params or {})
        asset = await db.get(ScanAsset, suggestion.asset_id)
        # Use parent scan_id so logs flow to the original scan's WebSocket
        scan_id = str(asset.scan_id) if asset else suggestion_id

    config = _EXEC.get(scan_type)
    if not config:
        await _mark_done(suggestion_id, "failed", f"Unknown scan_type: {scan_type!r}")
        return

    try:
        command = _build_command(scan_type, params)
    except ValueError as exc:
        await _mark_done(suggestion_id, "failed", str(exc))
        return

    volumes: dict = {}
    if config.get("nuclei_vol"):
        volumes[settings.nuclei_templates_volume] = {
            "bind": "/nuclei-templates",
            "mode": "ro",
        }

    try:
        _, _, extracted = await run_ephemeral(
            scan_id=scan_id,
            stage=_STAGE,
            tools=config["tools"],
            command=command,
            volumes=volumes or None,
            timeout_seconds=config["timeout"],
            extract_path=config.get("extract_path"),
        )
        summary = _summarise(scan_type, extracted)
        await _mark_done(suggestion_id, "completed", summary)

    except Exception as exc:
        await _mark_done(suggestion_id, "failed", f"Error: {exc}")


async def _mark_done(suggestion_id: str, status: str, result_summary: str) -> None:
    async with AsyncSessionLocal() as db:
        suggestion = await db.get(SuggestedScan, uuid.UUID(suggestion_id))
        if suggestion:
            suggestion.status = status
            suggestion.completed_at = datetime.now(timezone.utc)
            suggestion.result_summary = result_summary
            await db.commit()
