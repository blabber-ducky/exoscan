# Exoscan — Developer Guide

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin) — v24+
- `openssl` (for generating SECRET_KEY)
- Optional: Node 20+ for frontend development outside Docker

## First-Time Setup

```bash
git clone https://github.com/blabber-ducky/exoscan.git
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
| `SECRET_KEY` | Yes | JWT signing secret and Fernet master key — 32+ random bytes; changing it invalidates all tokens and encrypted API keys |
| `DATABASE_URL` | Auto | Set by docker-compose; override for local DB |
| `FRONTEND_URL` | Yes | CORS allowed origin (e.g. `http://localhost:3000`) |
| `ADMIN_EMAIL` | No | Email of the account to auto-promote to admin |
| `NVD_API_KEY` | No | Raises NVD rate limit from 5 to 50 req/30 s |
| `SCREENSHOT_BASE_PATH` | Auto | Internal backend path (`/app/static/screenshots`) |
| `PENTEST_RESULTS_PATH` | Auto | Internal backend path for Strix output (`/app/pentest_results`) |
| `NUCLEI_TEMPLATES_VOLUME` | Auto | Docker volume name for nuclei templates |
| `SCREENSHOTS_VOLUME` | Auto | Docker volume name for screenshots |

## Bootstrapping the Admin Account

Set `ADMIN_EMAIL` in `.env` before starting the stack. The first time that email address registers (or logs in, if already registered), the account is automatically promoted to `is_admin=True`. You can set the variable at any time — the promotion is applied on the next login even if the account already exists.

There is no other way to create an admin. The `is_admin` flag cannot be set through the API from a non-admin account.

## Running Database Migrations

After modifying any ORM model:

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

Migration files live in `backend/alembic/versions/`. Always review auto-generated files before committing — Alembic can miss some changes (e.g. column type narrowing, index changes, CHECK constraint updates). Always write and run migrations manually for constraint changes.

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

**1. Create the module file** — same pattern as passive but receives a `ScanAsset`:

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

Secondary scan templates are follow-up scans suggested after active recon. No schema changes needed.

```python
# backend/app/recon/secondary/templates.py

SCAN_TEMPLATES: dict[str, list[ScanTemplate]] = {
    "mytechnology": [
        ScanTemplate(
            scan_type="my_scan_type",
            display_name="My Scan Name",
            description="What this scan does, shown in the UI",
            risk_level="MEDIUM",           # LOW | MEDIUM | HIGH
            base_priority=55,              # 0–100; boosted +40 if CVE CVSS ≥ 7.0
        ),
    ],
}
```

Then add the corresponding command in `backend/app/recon/secondary/executor.py`.

## LLM Key Encryption Pattern

User LLM API keys are stored in `user_settings.llm_api_key_encrypted` using Fernet symmetric encryption.

```python
# backend/app/settings/service.py
import base64, hashlib
from cryptography.fernet import Fernet
from app.config import settings as app_settings

def _fernet() -> Fernet:
    raw = app_settings.secret_key.encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)

def encrypt_key(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()

def decrypt_key(blob: str) -> str:
    return _fernet().decrypt(blob.encode()).decode()
```

Rules:
- Decryption happens in-process only, at pentest launch time (in `orchestrator._run_pentest_stage()`)
- Plaintext keys must never appear in logs, error messages, or API responses
- The API always returns masked keys (`sk-...****`) via `to_response()` in `service.py`
- Changing `SECRET_KEY` invalidates all existing encrypted keys — users must re-enter them

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

## Adding a New Admin Route

All admin routes live in `backend/app/admin/router.py` and are registered at `/api/v1/admin/*`. Every handler must declare `current_user: User = Depends(require_admin)` — the dependency raises 403 for non-admin callers.

```python
from app.dependencies import require_admin

@router.get("/admin/my-new-endpoint")
async def my_admin_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    ...
```

## Scan Access Control Patterns

There are two service helpers for fetching a scan by ID:

| Helper | Use for |
|--------|---------|
| `get_scan_or_404(db, scan_id, user_id)` | Mutations — returns 404 if not owner |
| `get_accessible_scan_or_404(db, scan_id, user_id)` | Reads — owner OR shared viewer |

Any new read-only endpoint (results, pentest results, exports) should use `get_accessible_scan_or_404`. Any new mutation endpoint (cancel, re-run, delete) should use `get_scan_or_404`.

The WS handler checks the same `_has_share_access()` clause before accepting a connection. If you add a new streaming endpoint, apply the same check.

## Code Style Notes

- **No comments unless the why is non-obvious.** Function and variable names should be self-documenting.
- **No shell=True anywhere.** All tool execution goes through the Docker Python SDK. `shlex.quote()` is for quoting values inside the command string, not for shell invocation.
- **All user-derived values in tool commands must be `shlex.quote()`'d.** Applies to recon tool commands and Strix `--instruction`/`--target` arguments.
- **Strix instructions**: strip control characters, max 500 chars, then `shlex.quote()`.
- **Alembic for all schema changes.** Never `ALTER TABLE` manually in production.
- **`asyncio.gather(return_exceptions=True)`** for parallel module execution. Individual module failures are logged at ERROR level but do not abort the scan.
- **Blocking Docker SDK calls** (container log streaming, `container.wait()`) must run in `asyncio.get_event_loop().run_in_executor(None, ...)` — never directly await them from a coroutine.
