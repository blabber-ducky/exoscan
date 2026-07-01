"""
DNS recon passive module.

Runs dnsrecon in an ephemeral Kali container using standard enumeration
(-t std) and extracts the JSON output file before container removal.
Returns a normalised list of DNS record dicts stored on the main
target's ScanAsset.dns_records column.
"""
import json
import shlex
from typing import Awaitable, Callable

from app.docker_manager.container import run_ephemeral

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "dns_recon"
_TIMEOUT = 120  # standard enum on a single domain rarely exceeds 2 min


# ---------------------------------------------------------------------------
# Output parsing
# ---------------------------------------------------------------------------

def _parse(raw: bytes) -> list[dict]:
    """
    Normalise dnsrecon JSON output into a flat list of record dicts.

    dnsrecon -j emits a JSON array where the first element is metadata
    (has an "arguments" key) and the rest are DNS records.

    Normalised format: {"type": "A", "name": "...", "value": "...", ...}
    """
    try:
        entries = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return []

    records: list[dict] = []
    for entry in entries:
        rtype = entry.get("type", "")
        if not rtype or "arguments" in entry:
            continue  # skip metadata entry

        name = entry.get("name", "")
        rec: dict = {"type": rtype, "name": name}

        if rtype in ("A", "AAAA"):
            rec["value"] = entry.get("address", "")
        elif rtype in ("NS", "CNAME", "PTR"):
            rec["value"] = entry.get("target", "")
        elif rtype == "MX":
            rec["value"] = entry.get("exchange", "")
            if "preference" in entry:
                rec["priority"] = int(entry["preference"])
        elif rtype == "TXT":
            strings = entry.get("strings", "")
            rec["value"] = " ".join(strings) if isinstance(strings, list) else str(strings)
        elif rtype == "SOA":
            rec["value"] = entry.get("mname", "")
            rec["rname"] = entry.get("rname", "")
        else:
            for k, v in entry.items():
                if k not in ("type", "name"):
                    rec[k] = v

        records.append(rec)

    return records


# ---------------------------------------------------------------------------
# Module entry point
# ---------------------------------------------------------------------------

async def run(scan_id: str, target: str, log_fn: _LOG) -> list[dict]:
    """
    Run dnsrecon -t std against target.
    Returns list of normalised DNS record dicts (empty on failure).
    """
    await log_fn("INFO", STAGE, f"Starting DNS recon against {target}")

    quoted = shlex.quote(target)
    exit_code, _, extracted = await run_ephemeral(
        scan_id=scan_id,
        stage=STAGE,
        tools=["dnsrecon"],
        command=f"dnsrecon -d {quoted} -t std -j /tmp/out.json 2>&1",
        timeout_seconds=_TIMEOUT,
        extract_path="/tmp/out.json",
    )

    if extracted is None:
        await log_fn("WARN", STAGE, "dnsrecon produced no output file")
        return []

    records = _parse(extracted)
    a_count = sum(1 for r in records if r["type"] == "A")
    await log_fn(
        "INFO", STAGE,
        f"DNS recon complete — {len(records)} records ({a_count} A records)",
    )
    return records
