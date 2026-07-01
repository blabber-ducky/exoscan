"""
Pub/sub bus for live scan log streaming.

The orchestrator publishes log lines; WebSocket handlers subscribe
and forward them to browser clients. Each subscriber gets its own
asyncio.Queue so multiple clients can connect to the same scan.
"""
import asyncio
from typing import Optional

# scan_id (str) → list of subscriber queues
_subscribers: dict[str, list[asyncio.Queue]] = {}


def subscribe(scan_id: str) -> asyncio.Queue:
    """Register a new subscriber for this scan. Returns a dedicated queue."""
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(scan_id, []).append(q)
    return q


def unsubscribe(scan_id: str, q: asyncio.Queue) -> None:
    """Remove a subscriber queue; cleans up the scan entry when empty."""
    subs = _subscribers.get(scan_id)
    if subs and q in subs:
        subs.remove(q)
    if not _subscribers.get(scan_id):
        _subscribers.pop(scan_id, None)


async def publish(scan_id: str, message: str) -> None:
    """Broadcast a JSON message string to all active subscribers for this scan."""
    for q in list(_subscribers.get(scan_id, [])):
        await q.put(message)


def has_subscribers(scan_id: str) -> bool:
    return bool(_subscribers.get(scan_id))
