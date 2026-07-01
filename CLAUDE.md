# Exoscan — Claude Code Instructions

## Project Overview

Exoscan is a containerised external reconnaissance web application for security professionals. Given a domain or IP, it runs passive and/or active enumeration — DNS, subdomains, DuckDuckGo dorking, WhatWeb fingerprinting, GoWitness screenshots, NVD CVE lookup — and presents results with actionable follow-up scan suggestions.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS v4 + shadcn/ui |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL 16 |
| Scanning | Ephemeral `kalilinux/kali-rolling` Docker containers, tools installed at runtime |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Real-time | FastAPI WebSocket |

## Running Locally

```bash
cp .env.example .env          # fill in secrets
docker compose up --build     # starts frontend :3000, backend :8000, postgres
```

Backend API: http://localhost:8000  
Frontend: http://localhost:3000  
API docs: http://localhost:8000/docs

## Environment Variables

See `.env.example` for all required variables. Key ones:

- `SECRET_KEY` — JWT signing secret (generate with `openssl rand -hex 32`)
- `DATABASE_URL` — set automatically by docker-compose
- `NVD_API_KEY` — optional, raises NVD rate limit from 5 to 50 req/30s
- `SCREENSHOT_BASE_PATH` — internal path inside backend container (`/app/static/screenshots`)

## Key Architectural Patterns

### Scan Orchestration
Scans run as `asyncio.create_task()` background coroutines started immediately after `POST /api/v1/scans` returns. No Celery/Redis. State is fully in PostgreSQL. `ScanOrchestrator.run(scan_id)` in `backend/app/recon/orchestrator.py` is the entry point.

### Ephemeral Kali Containers
All tool execution goes through `backend/app/docker_manager/container.py:run_ephemeral()`. It:
- Pulls `kalilinux/kali-rolling` (cached by Docker daemon after first pull)
- Runs `apt-get install -y {tools} && {command}` inside the container
- Streams stdout to the scan's `asyncio.Queue` (picked up by WebSocket)
- Enforces a per-stage timeout; kills container and logs WARNING on expiry
- Parses stdout for firewall/timeout patterns and records them on the asset
- Attaches containers to the `exoscan_net` Docker network
- Tracks container IDs in `scans.container_ids` JSONB for cancel support

**Critical:** Never interpolate user input directly into shell commands. Always use `shlex.quote()` for any user-supplied value passed to a tool command string.

### Nuclei Templates Volume
`nuclei_templates_vol` is mounted at `/nuclei-templates` in the backend and all nuclei containers. `backend/app/nuclei/updater.py` runs `nuclei -update-templates` on startup and every 24 hours via an asyncio background task. Nuclei scan containers mount this volume read-only so templates are never re-downloaded per scan.

### WebSocket Log Streaming
`WS /api/v1/scans/{id}/logs?token={jwt}` — on connect, replays historical logs from `scan_logs` table, then tails the in-memory `asyncio.Queue[str]` that the orchestrator writes to. Messages are JSON: `{"type":"log","level":"INFO","stage":"dns","message":"...","timestamp":"..."}`.

### Liveness Probe
`backend/app/recon/probe.py` runs async httpx probes against all candidate targets before any active-phase tool. Unreachable/timeout targets are marked `scan_status=unreachable/timeout` and skipped by active modules. They still appear in results with a status banner.

### Screenshots
GoWitness writes PNGs + a SQLite DB to `screenshots_vol` (at `/screenshots/{scan_id}/`). The backend reads `gowitness.sqlite3` directly via Python's `sqlite3` module to map URL→filename, then updates `asset.screenshot_path`. Screenshots are served at `/static/screenshots/{scan_id}/{filename}`.

## Migrations

```bash
# Create a new migration after changing models
docker compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker compose exec backend alembic upgrade head
```

## Adding a New Passive Module

1. Create `backend/app/recon/passive/{module}.py` implementing `async def run(scan_id, target, log_fn) -> list[dict]`
2. Add the module key to the `PassiveModule` enum in `backend/app/scans/schemas.py`
3. Wire it into `orchestrator.py` Stage 1 `asyncio.gather` call
4. Add the checkbox to `frontend/src/components/scans/NewScanForm.tsx` Step 3

## Adding a New Secondary Scan Template

Add one entry to the `SCAN_TEMPLATES` dict in `backend/app/recon/secondary/templates.py`:
```python
"technology_name": [
    ScanTemplate(scan_type="nuclei_cve", display_name="...", risk_level="HIGH", base_params={...})
]
```
No schema changes needed.

## Security Notes

- All tool arguments from user input must pass through `shlex.quote()`
- Port config input is validated against regex `^[\d,\-]+$` before use
- Domain/URL inputs are validated with pydantic validators before any container spawn
- CORS is locked to the frontend origin only (`FRONTEND_URL` env var)
- Auth endpoints are rate-limited via `slowapi`
- The Docker socket mount gives the backend root-equivalent access to the host — never expose the backend port publicly without auth

## Documentation

- `docs/architecture.md` — system diagrams (generated once project is usable)
- `docs/developer.md` — developer guide
- `docs/user.md` — end-user guide
- `TASKS.md` — phase and task tracker (updated with each git commit)
