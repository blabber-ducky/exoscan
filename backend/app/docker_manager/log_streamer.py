"""
Async generator that streams stdout/stderr from a running Docker container.

The Docker SDK's log iterator is blocking, so it runs in a daemon thread.
Lines are passed to the event loop via asyncio.Queue; a None sentinel
signals end-of-stream (container exited or was killed).
"""
import asyncio
import threading
from typing import AsyncGenerator


async def stream_container_logs(container) -> AsyncGenerator[str, None]:
    loop = asyncio.get_event_loop()
    # Bounded queue — if the consumer falls behind, old lines are still buffered
    # up to 2000 entries before the producer thread blocks on put().
    queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=2000)

    def _reader() -> None:
        try:
            for chunk in container.logs(stream=True, follow=True):
                line = chunk.decode("utf-8", errors="replace").rstrip()
                # A single Docker chunk may contain multiple newline-separated lines
                for subline in line.splitlines():
                    subline = subline.strip()
                    if subline:
                        asyncio.run_coroutine_threadsafe(queue.put(subline), loop)
        except Exception:
            pass
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    threading.Thread(target=_reader, daemon=True, name=f"log-{container.short_id}").start()

    while True:
        item = await queue.get()
        if item is None:
            break
        yield item
