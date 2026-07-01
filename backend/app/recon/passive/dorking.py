"""
DuckDuckGo passive dorking module.

Queries DuckDuckGo's HTML endpoint (https://html.duckduckgo.com/html/) with
four query variants. Runs entirely in-process via httpx — no container.
Rate-limited at 3 s between requests to avoid 429s.

Results are stored in scans.dork_hits JSONB as:
  [{"query": "...", "title": "...", "url": "...", "snippet": "..."}, ...]
"""
import asyncio
import html as _html
import re
from typing import Awaitable, Callable

import httpx

_LOG = Callable[[str, str, str], Awaitable[None]]

STAGE = "dorking"
_DDG_URL = "https://html.duckduckgo.com/html/"
_RATE_LIMIT = 3  # seconds between requests
_TIMEOUT = 15    # per-request httpx timeout

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Four query templates — {domain} is substituted per query
_QUERIES = [
    "site:{domain}",
    'site:{domain} filetype:pdf OR filetype:doc OR filetype:xls OR filetype:txt',
    "site:{domain} inurl:login OR inurl:admin OR inurl:portal OR inurl:dashboard",
    '"{domain}" password OR credentials OR api_key OR secret',
]

_LINK_RE = re.compile(
    r'<a[^>]+class=["\']result__a["\'][^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)
_SNIPPET_RE = re.compile(
    r'class=["\']result__snippet[^"\']*["\'][^>]*>(.*?)</(?:a|div)',
    re.DOTALL | re.IGNORECASE,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _strip(text: str) -> str:
    return _html.unescape(_TAG_RE.sub("", text)).strip()


def _parse_page(html: str, query: str) -> list[dict]:
    link_matches = list(_LINK_RE.finditer(html))
    snippet_texts = [m.group(1) for m in _SNIPPET_RE.finditer(html)]

    hits: list[dict] = []
    for i, match in enumerate(link_matches):
        url = match.group(1).strip()
        # Skip DDG-internal navigation links
        if not url.startswith("http"):
            continue
        title = _strip(match.group(2))
        snippet = _strip(snippet_texts[i]) if i < len(snippet_texts) else ""
        hits.append({"query": query, "title": title, "url": url, "snippet": snippet})

    return hits


async def run(scan_id: str, target: str, log_fn: _LOG) -> list[dict]:
    """
    Run DuckDuckGo dork queries against target.
    Returns deduplicated list of {"query", "title", "url", "snippet"} dicts.
    """
    await log_fn("INFO", STAGE, f"Starting DuckDuckGo dorking for {target}")

    all_hits: list[dict] = []
    seen_urls: set[str] = set()

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=_TIMEOUT,
        follow_redirects=True,
    ) as client:
        for i, template in enumerate(_QUERIES):
            if i > 0:
                await asyncio.sleep(_RATE_LIMIT)

            query = template.format(domain=target)
            await log_fn("INFO", STAGE, f"Dork query: {query}")

            try:
                resp = await client.get(_DDG_URL, params={"q": query})

                if resp.status_code == 429:
                    await log_fn("WARN", STAGE, "DuckDuckGo rate-limited — stopping early")
                    break

                if resp.status_code != 200:
                    await log_fn(
                        "WARN", STAGE,
                        f"DDG returned HTTP {resp.status_code} for: {query}",
                    )
                    continue

                for hit in _parse_page(resp.text, query):
                    if hit["url"] not in seen_urls:
                        seen_urls.add(hit["url"])
                        all_hits.append(hit)

            except Exception as exc:
                await log_fn("WARN", STAGE, f"Dork query failed ({query!r}): {exc}")

    await log_fn("INFO", STAGE, f"Dorking complete — {len(all_hits)} unique results")
    return all_hits
