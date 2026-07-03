# Exoscan — Claude Code Instructions

## Project Overview

Exoscan is a containerised external reconnaissance and AI-powered pentesting web application for security professionals. It supports three recon types — Passive Recon (DNS, subdomains, dorking), Active Recon (fingerprinting, screenshots, CVE detection, port scan), and Comprehensive Recon (passive then active on every discovered asset) — plus an AI Pentest mode powered by [Strix](https://github.com/usestrix/strix). Results are displayed per-asset with screenshots, tech stack, CVEs, suggested scans, and pentest findings. The internal DB enum values remain `passive`, `active`, `comprehensive`, `pentest`; user-facing labels are "Passive Recon", "Active Recon", "Comprehensive Recon", "AI Pentest" (defined in `frontend/src/types/index.ts:SCAN_TYPE_LABELS`).

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS v4 + shadcn/ui |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL 16 |
| Scanning | Ephemeral `kalilinux/kali-rolling` Docker containers, tools installed at runtime |
| AI Pentest | Strix (`pip install strix-agent`) in `python:3.12-slim` runner container with Docker socket |
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

- `SECRET_KEY` — JWT signing secret (generate with `openssl rand -hex 32`); also used as master key for Fernet-encrypting user LLM API keys in the DB
- `DATABASE_URL` — set automatically by docker-compose
- `NVD_API_KEY` — optional, raises NVD rate limit from 5 to 50 req/30s
- `SCREENSHOT_BASE_PATH` — internal path inside backend container (`/app/static/screenshots`)
- `PENTEST_RESULTS_PATH` — where strix run output is read from inside backend container (`/app/pentest_results`)

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

### Strix AI Pentest Runner
`backend/app/recon/pentest/strix.py:run_strix()` runs Strix as a subprocess inside a `python:3.12-slim` container. The runner container has `/var/run/docker.sock` mounted so Strix can spawn its own sandbox containers (`ghcr.io/usestrix/strix-sandbox:1.0.0`) on the host. LLM credentials are decrypted from the user's `user_settings` row (Fernet + SECRET_KEY) and passed as container env vars (`STRIX_LLM`, `LLM_API_KEY`). Strix writes findings to `pentest_results_vol`; the backend parses `vulnerabilities.json` after the container exits and writes rows to `pentest_findings`.

**Critical:** Strix `--instruction` content must be sanitised (strip control chars, max 500 chars) and passed through `shlex.quote()`. LLM API keys must never appear in logs. `--non-interactive` is mandatory. `--max-budget-usd` is always set (server-side cap: 100 USD max).

### User Settings & LLM Key Encryption
LLM provider configuration is stored per-user in the `user_settings` table. API keys are encrypted at rest using Fernet symmetric encryption: a 32-byte key is derived from `SECRET_KEY` via SHA-256, then used as the Fernet key. Decryption happens in-process only when launching a strix run. The API always returns masked keys (`sk-...****`), never plaintext.

`backend/app/settings/service.py` owns `encrypt_key()` / `decrypt_key()`. The `GET /api/v1/settings` and `PUT /api/v1/settings` endpoints handle upsert. `POST /api/v1/settings/test-connection` makes a minimal LiteLLM call to validate the key before a user launches a pentest.

## Security Notes

- All tool arguments from user input must pass through `shlex.quote()`
- Port config input is validated against regex `^[\d,\-]+$` before use
- Domain/URL inputs are validated with pydantic validators before any container spawn
- CORS is locked to the frontend origin only (`FRONTEND_URL` env var)
- Auth endpoints are rate-limited via `slowapi`
- The Docker socket mount gives the backend root-equivalent access to the host — never expose the backend port publicly without auth

## Documentation

- `docs/deployment.md` — initial deploy, updates, backup/restore, server migration, troubleshooting; **keep updated whenever deployment behaviour changes** (new env vars, new volumes, migrations workflow changes, wget instructions)
- `docs/architecture.md` — system diagrams, package layout, design decisions
- `docs/developer.md` — developer guide, env vars, module extension guides
- `docs/user.md` — end-user guide (scan types, sharing, admin panel)
- `TASKS.md` — phase and task tracker (updated with each git commit)

All docs must be updated in the same commit as any feature that changes deployment, env vars, API routes, or user-facing behaviour.
