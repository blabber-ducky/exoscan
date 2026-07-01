"""
Port and service scan active module.

Runs nmap -sV inside an ephemeral Kali container and parses the XML output
into a list of open port dicts stored on scan_assets.open_ports.

Port selection is driven by scan.port_config:
  top100     → -F                          (100 most common ports)
  top1000    → --top-ports 1000            (default)
  http_only  → -p 80,443,8000,8080,8443,8888,3000,5000
  custom     → -p {ports}                  (caller already validated)
"""
import shlex
import xml.etree.ElementTree as ET
from typing import Awaitable, Callable
from urllib.parse import urlparse

from app.docker_manager.container import run_ephemeral
from app.scans.models import ScanAsset

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "port_scan"
_TIMEOUT = 180  # nmap with -sV can be slow on large port ranges

_HTTP_ONLY_PORTS = "80,443,8000,8080,8443,8888,3000,5000"


def _port_flags(port_config: dict) -> str:
    preset = port_config.get("preset", "top1000")
    if preset == "top100":
        return "-F"
    if preset == "http_only":
        return f"-p {_HTTP_ONLY_PORTS}"
    if preset == "custom":
        ports = port_config.get("ports", "80,443")
        return f"-p {ports}"  # already regex-validated by CreateScanRequest
    return "--top-ports 1000"


def _nmap_target(asset: ScanAsset) -> str:
    """Return the nmap-compatible target (hostname or IP, no port/scheme)."""
    if asset.url:
        parsed = urlparse(asset.url)
        return parsed.hostname or parsed.netloc
    if asset.hostname:
        return asset.hostname
    if asset.ip_address:
        return str(asset.ip_address)
    return ""


def _parse_xml(raw: bytes) -> list[dict]:
    """Parse nmap -oX output into a list of open port dicts."""
    try:
        root = ET.fromstring(raw.decode("utf-8", errors="replace"))
    except Exception:
        return []

    ports: list[dict] = []
    for host in root.findall("host"):
        status = host.find("status")
        if status is not None and status.get("state") == "down":
            continue

        for port_el in host.findall(".//port"):
            state_el = port_el.find("state")
            if state_el is None or state_el.get("state") != "open":
                continue

            service_name = ""
            version_str = ""
            svc = port_el.find("service")
            if svc is not None:
                service_name = svc.get("name", "")
                product = svc.get("product", "")
                version = svc.get("version", "")
                version_str = " ".join(filter(None, [product, version])).strip()

            ports.append({
                "port": int(port_el.get("portid", 0)),
                "protocol": port_el.get("protocol", "tcp"),
                "state": "open",
                "service": service_name,
                "version": version_str or None,
            })

    return ports


async def run(
    scan_id: str,
    asset: ScanAsset,
    port_config: dict,
    log_fn: _LOG,
) -> list[dict]:
    """
    Run nmap -sV against the asset target. Returns list of open port dicts.
    """
    target = _nmap_target(asset)
    if not target:
        await log_fn("WARN", STAGE, "Could not determine nmap target from asset")
        return []

    flags = _port_flags(port_config)
    quoted = shlex.quote(target)
    await log_fn("INFO", STAGE, f"Port scan: {target} ({flags})")

    exit_code, warnings, extracted = await run_ephemeral(
        scan_id=scan_id,
        stage=STAGE,
        tools=["nmap"],
        command=f"nmap -sV --open -T4 {flags} {quoted} -oX /tmp/out.xml 2>&1",
        timeout_seconds=_TIMEOUT,
        extract_path="/tmp/out.xml",
    )

    if extracted is None:
        await log_fn("WARN", STAGE, f"nmap produced no XML output for {target}")
        return []

    open_ports = _parse_xml(extracted)
    await log_fn(
        "INFO", STAGE,
        f"Port scan complete — {len(open_ports)} open port(s) on {target}",
    )
    return open_ports
