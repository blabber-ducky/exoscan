# Exoscan — Developer Guide

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin) — v24+
- `openssl` (for generating SECRET_KEY)
- Optional: Node 20+ for frontend development outside Docker

## First-Time Setup

```bash
git clone <repo>
cd exoscan
cp .env.example .env
# Edit .env — at minimum set SECRET_KEY:
openssl rand -hex 32
docker compose up --build
```

Services start at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing secret — 32+ random bytes |
| `DATABASE_URL` | Auto | Set by docker-compose; override for local DB |
| `FRONTEND_URL` | Yes | CORS allowed origin (e.g. `http://localhost:3000`) |
| `NVD_API_KEY` | No | Raises NVD rate limit from 5 to 50 req/30 s |
| `SCREENSHOT_BASE_PATH` | Auto | Internal backend path (`/app/static/screenshots`) |
| `NUCLEI_TEMPLATES_VOLUME` | Auto | Docker volume name for nuclei templates |
| `SCREENSHOTS_VOLUME` | Auto | Docker volume name for screenshots |

## Running Database Migrations

After modifying any ORM model in `backend/app/scans/models.py` or `backend/app/auth/models.py`:

```bash
# Auto-generate migration from model diff
docker compose exec backend alembic revision --autogenerate -m "describe the change"

# Apply pending migrations
docker compose exec backend alembic upgrade head

# Check current revision
docker compose exec backend alembic current

# Roll back one migration
docker compose exec backend alembic downgrade -1
```

Migration files live in `backend/alembic/versions/`. Always review auto-generated files before committing — Alembic can miss some changes (e.g. column type narrowing, index changes).

## Adding a New Passive Module

Passive modules gather information without directly touching the target's services.

**1. Create the module file**

```python
# backend/app/recon/passive/mymodule.py
import shlex
from typing import Awaitable, Callable

from app.docker_manager.container import run_ephemeral

_LOG = Callable[[str, str, str], Awaitable[None]]
STAGE = "my_module"

async def run(scan_id: str, target: str, log_fn: _LOG) -> list[dict]:
    quoted = shlex.quote(target)
    await log_fn("INFO", STAGE, f"Starting my module against {target}")

    exit_code, _, extracted = await run_ephemeral(
        scan_id=scan_id,
        stage=STAGE,
        tools=["mytool"],
        command=f"mytool {quoted} -o /tmp/out.json 2>&1",
        timeout_seconds=120,
        extract_path="/tmp/out.json",
    )

    if extracted is None:
        return []

    return _parse(extracted)


def _parse(raw: bytes) -> list[dict]:
    # Parse tool output and return a list of dicts
    ...
```

**Important:** Every user-supplied value passed to a tool command must be wrapped in `shlex.quote()`.

**2. Register the module key**

Add the key to `PASSIVE_MODULES` in `backend/app/scans/schemas.py`:
```python
PASSIVE_MODULES = {"dns_recon", "ip_profiling", "asset_identification", "my_module"}
```

**3. Wire into the orchestrator**

In `backend/app/recon/orchestrator.py`, inside `_run_passive_stage()`:
```python
from app.recon.passive import dns, dorking, ip_profiling, mymodule, subdomains

if "my_module" in modules:
    task_keys.append("mymodule")
    coros.append(mymodule.run(scan_id, target, log_fn))
```

Then handle the result in `_save_passive_results()`.

**4. Add to the frontend wizard**

In `frontend/src/components/scans/NewScanForm.tsx`, add to `PASSIVE_MODULES`:
```ts
{ key: 'my_module', label: 'My Module', desc: 'Description for the UI' },
```

## Adding a New Active Module

Active modules run against individual live assets discovered during passive/probe stages.

**1. Create the module file** — same pattern as passive but receives a `ScanAsset` instead of a plain target string:

```python
# backend/app/recon/active/mymodule.py
import shlex
from app.docker_manager.container import run_ephemeral
from app.scans.models import ScanAsset

async def run(scan_id: str, asset: ScanAsset, log_fn) -> list[dict]:
    if not asset.url:
        return []
    quoted = shlex.quote(asset.url)
    exit_code, _, extracted = await run_ephemeral(
        scan_id=scan_id, stage="my_active_module",
        tools=["mytool"], command=f"mytool {quoted} 2>&1",
        timeout_seconds=120, extract_path="/tmp/out.json",
    )
    ...
```

**2. Register and wire** — same as passive: add to `ACTIVE_MODULES` in schemas, add the `asyncio.gather` coroutine inside `_process()` in `_run_active_stage()` in orchestrator.py.

## Adding a New Secondary Scan Template

Secondary scan templates are follow-up scans suggested after active recon. No schema changes needed — just add an entry to the registry.

```python
# backend/app/recon/secondary/templates.py

SCAN_TEMPLATES: dict[str, list[ScanTemplate]] = {
    # ...existing entries...

    "mytechnology": [
        ScanTemplate(
            scan_type="my_scan_type",      # matches executor dispatch key
            display_name="My Scan Name",
            description="What this scan does, shown in the UI",
            risk_level="MEDIUM",           # LOW | MEDIUM | HIGH
            base_priority=55,              # 0–100; boosted +40 if CVE CVSS ≥ 7.0
        ),
    ],
}
```

Then add the corresponding command in `backend/app/recon/secondary/executor.py`:
- Add an entry to `_EXEC` with `tools`, `timeout`, and `extract_path`
- Add the command builder branch in `_build_command()`
- Add a result summary branch in `_summarise()`

## Running a Tool in Isolation

To test a single tool command without going through a full scan:

```bash
# Spawn a Kali container manually
docker run --rm -it --network exoscan_net kalilinux/kali-rolling bash

# Inside the container:
apt-get update -qq && apt-get install -y dnsrecon
dnsrecon -d example.com -t std -j /tmp/out.json
cat /tmp/out.json
```

To test `run_ephemeral()` from the Python shell:
```bash
docker compose exec backend python3 -c "
import asyncio
from app.docker_manager.container import run_ephemeral

async def test():
    code, _, data = await run_ephemeral(
        scan_id='test',
        stage='test',
        tools=['dnsrecon'],
        command='dnsrecon -d example.com -t std 2>&1',
        timeout_seconds=60,
    )
    print('exit:', code)

asyncio.run(test())
"
```

## Frontend Development (Outside Docker)

```bash
cd frontend
npm install
npm run dev    # starts Vite dev server at :5173, proxies /api to :8000
```

The `vite.config.ts` proxy forwards `/api` and `/static` to `http://localhost:8000`, so you can run the backend via Docker Compose while working on the frontend locally.

## Code Style Notes

- **No comments unless the why is non-obvious.** Function and variable names should be self-documenting.
- **No shell=True anywhere.** All tool execution goes through the Docker Python SDK (`container.run()`). `shlex.quote()` is for quoting values inside the command string passed to the container, not for shell invocation.
- **All user-derived values in tool commands must be `shlex.quote()`'d.** This is enforced by code review — the CLAUDE.md rule is the authoritative reference.
- **Alembic for all schema changes.** Never `ALTER TABLE` manually in production.
- **`asyncio.gather(return_exceptions=True)`** for parallel module execution. Individual module failures are logged at ERROR level but do not abort the scan.
