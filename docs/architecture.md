# Exoscan — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Docker host                            │
│                                                             │
│  ┌──────────────┐    ┌────────────────────────────────────┐ │
│  │   Frontend   │    │            Backend                 │ │
│  │  nginx:80    │◄──►│         FastAPI:8000               │ │
│  │  React SPA   │    │  SQLAlchemy + asyncpg              │ │
│  │  port 3000   │    │  Docker socket client              │ │
│  └──────────────┘    └──────────┬─────────────────────────┘ │
│         │ /api proxy             │ spawns                    │
│         │              ┌─────────┴──────────┐               │
│         │              ▼                    ▼               │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐ │
│  │  PostgreSQL  │  │  Kali containers│  │  Strix runner   │ │
│  │  port 5432   │  │  kali-rolling  │  │  python:3.12-slim│ │
│  └──────────────┘  │  apt tools     │  │  + docker.sock  │ │
│                    └────────────────┘  └──────┬───────────┘ │
│  Named volumes:                               │ spawns      │
│    exoscan_postgres_data                      ▼             │
│    exoscan_screenshots_vol            ┌────────────────┐    │
│    exoscan_nuclei_templates_vol       │ Strix sandbox  │    │
│    exoscan_pentest_results_vol        │ containers     │    │
│                                       └────────────────┘    │
│  Network: exoscan_net (bridge)                              │
└─────────────────────────────────────────────────────────────┘
```

## Docker Compose Services

| Service | Image | Exposed port | Role |
|---------|-------|-------------|------|
| `postgres` | postgres:16-alpine | internal only | Persistent storage |
| `backend` | ./backend (Python 3.12 slim) | 8000 (internal) | API + scan orchestration |
| `frontend` | ./frontend (Node build → nginx) | 3000→80 | SPA + /api proxy |

The backend mounts `/var/run/docker.sock` to spawn ephemeral Kali containers (recon) and Strix runner containers (AI pentest) on the same host. The frontend's nginx proxies `/api/` (including WebSocket upgrades) and `/static/` to the backend.

## Recon Scan Lifecycle

```
Browser          Frontend       Backend API      Orchestrator      Kali containers
  │                │                │                │                   │
  │ POST /scans    │                │                │                   │
  │───────────────►│───────────────►│                │                   │
  │                │           scan created          │                   │
  │                │           status=pending        │                   │
  │                │◄───────────────│                │                   │
  │ ← 201 {id}     │                │                │                   │
  │                │                │ create_task()  │                   │
  │                │                │───────────────►│                   │
  │                │                │           status=running           │
  │ WS /logs?token │                │                │                   │
  │───────────────►│───────────────►│                │                   │
  │                │           replay history        │                   │
  │                │◄───────────────│                │                   │
  │                │                │     Stage 1: Passive Recon        │
  │                │                │                │──────────────────►│
  │                │                │                │  dnsrecon         │
  │                │                │                │  subfinder        │
  │                │                │                │  DDG dorking      │
  │                │                │                │◄──────────────────│
  │                │                │                │  save to DB       │
  │                │                │     Stage 2: Liveness Probe       │
  │                │                │                │ httpx (in-process)│
  │                │                │                │ mark live/unreach.│
  │                │                │     Stage 3: Active Recon (×asset)│
  │                │                │                │──────────────────►│
  │                │                │                │  nmap / whatweb   │
  │                │                │                │  gowitness (batch)│
  │                │                │                │◄──────────────────│
  │                │                │                │ NVD API (in-proc) │
  │                │                │                │ generate suggests │
  │                │                │           status=completed         │
  │ ← {type:complete}               │                │                   │
  │ GET /results   │                │                │                   │
  │───────────────►│───────────────►│                │                   │
  │                │ assets+CVEs+suggestions          │                   │
  │◄───────────────│◄───────────────│                │                   │
```

## AI Pentest (Strix) Lifecycle

```
Browser       Frontend    Backend API    Orchestrator    Strix runner    Strix sandbox
  │              │             │               │               │               │
  │ POST /scans  │             │               │               │               │
  │ (type=pentest)             │               │               │               │
  │─────────────►│────────────►│               │               │               │
  │              │        scan created         │               │               │
  │              │◄────────────│               │               │               │
  │ ← 201 {id}  │             │  create_task()│               │               │
  │              │             │──────────────►│               │               │
  │              │             │          fetch user LLM key   │               │
  │              │             │          (decrypt in-process) │               │
  │ WS /logs     │             │               │               │               │
  │─────────────►│────────────►│               │               │               │
  │              │             │               │  docker run   │               │
  │              │             │               │  python:3.12  │               │
  │              │             │               │──────────────►│               │
  │              │             │               │               │ pip install   │
  │              │             │               │               │ strix-agent   │
  │              │             │               │               │ strix --non-  │
  │              │             │               │               │ interactive   │
  │              │             │               │               │──────────────►│
  │              │             │               │               │  AI pentest   │
  │ ← log lines  │             │               │               │  (minutes–hrs)│
  │              │             │               │               │◄──────────────│
  │              │             │               │  exit, parse  │               │
  │              │             │               │  vulns.json   │               │
  │              │             │               │  write findings to DB         │
  │              │             │          status=completed     │               │
  │ ← {type:complete}          │               │               │               │
  │ GET /pentest-results       │               │               │               │
  │─────────────►│────────────►│               │               │               │
  │              │    findings list            │               │               │
  │◄─────────────│◄────────────│               │               │               │
```

## Backend Package Layout

```
backend/app/
├── main.py              # FastAPI app factory, middleware, lifespan
├── config.py            # pydantic-settings (reads .env)
├── database.py          # async SQLAlchemy engine + AsyncSession factory
├── dependencies.py      # get_db(), get_current_user(), require_admin()
├── limiter.py           # slowapi Limiter instance (shared)
│
├── auth/                # JWT auth (register/login/refresh/me)
│   ├── models.py        # User (id, email, username, is_admin, is_active, created_at)
│   ├── schemas.py
│   ├── service.py       # bcrypt + python-jose
│   └── router.py        # rate-limited with slowapi (5/min per IP)
│
├── admin/               # Admin-only group and user management
│   └── router.py        # GET/POST/DELETE /admin/groups + /admin/groups/{id}/members
│
├── settings/            # Per-user LLM provider configuration
│   ├── models.py        # UserSettings ORM (user_settings table)
│   ├── schemas.py       # UserSettingsRequest/Response, LLM_PROVIDERS list
│   ├── service.py       # get_or_create(), upsert(), encrypt_key(), decrypt_key()
│   └── router.py        # GET/PUT /api/v1/settings; POST /settings/test-connection
│
├── scans/               # Scan CRUD + WebSocket log stream + sharing + pentest results
│   ├── models.py        # Scan, ScanAsset, ScanLog, ScanCVE, SuggestedScan,
│   │                    # ScanShare, PentestFinding
│   ├── schemas.py       # CreateScanRequest (passive/active/comprehensive/pentest),
│   │                    # StrixConfig, PentestFindingSchema, PentestResultsResponse,
│   │                    # ScanResponse (with strix_config, parent_scan_id,
│   │                    #              pentest_findings_count)
│   ├── service.py       # queries, scan_to_response(), get_pentest_results(),
│   │                    # get_accessible_scan_or_404(), list_scans()
│   └── router.py        # REST + WS /scans/{id}/logs + /pentest-results
│                        # + /shares/* + /groups/mine + /users/search
│
├── recon/
│   ├── log_bus.py       # pub/sub: per-scan asyncio.Queue for WS streaming
│   ├── orchestrator.py  # pentest branch + Stage 1→2→3, _make_log_fn()
│   ├── probe.py         # httpx liveness check, WAF detection
│   ├── passive/
│   │   ├── dns.py       # dnsrecon → dns_records
│   │   ├── subdomains.py# subfinder + crt.sh → ScanAsset rows
│   │   ├── dorking.py   # DuckDuckGo HTML → dork_hits
│   │   └── ip_profiling.py # ipinfo.io → ip/org/country
│   ├── active/
│   │   ├── portscan.py  # nmap -sV -oX → open_ports
│   │   ├── fingerprint.py # whatweb --log-json → technologies
│   │   ├── screenshots.py # gowitness batch → screenshot_path
│   │   └── cve.py       # NVD API v2 + DB cache → scan_cves
│   ├── pentest/
│   │   ├── __init__.py
│   │   └── strix.py     # run_strix() (run_in_executor, 2h timeout)
│   │                    # parse_strix_output() (reads vulnerabilities.json)
│   └── secondary/
│       ├── templates.py # SCAN_TEMPLATES registry
│       ├── suggestions.py # generate_suggestions() per-asset
│       └── executor.py  # trigger_suggested_scan() → Kali container
│
├── nuclei/
│   └── updater.py       # nuclei_update_loop() — 24h background task
│
└── docker_manager/
    ├── client.py        # lazy docker.from_env() singleton
    ├── container.py     # run_ephemeral(): apt-install, stream, timeout, cleanup
    └── log_streamer.py  # daemon thread → asyncio.Queue bridge
```

## Database Schema (migrations 001–008)

| Table | Purpose |
|-------|---------|
| `users` | Accounts — email, username, bcrypt hash, is_admin |
| `groups` | Named groups for scan sharing |
| `group_members` | (group_id, user_id) membership |
| `scans` | Scan record — type, target, status, modules, strix_config, parent_scan_id |
| `scan_assets` | Discovered hosts/URLs — DNS, techs, ports, screenshot |
| `scan_cves` | CVEs correlated per asset |
| `scan_logs` | Structured log lines (replayed on WS reconnect) |
| `suggested_scans` | Follow-up scan templates per asset |
| `scan_shares` | Row-level share grants (user or group) |
| `cve_cache` | 24 h NVD response cache |
| `user_settings` | Per-user LLM provider config (API keys Fernet-encrypted) |
| `pentest_findings` | Strix vulnerability findings per pentest scan |

## Key Design Decisions

### No Celery / Redis
Scans run as `asyncio.create_task()` background coroutines started immediately after `POST /scans` returns. State is fully in PostgreSQL. This keeps the operational footprint minimal — only three services (postgres, backend, frontend) and no broker.

### Ephemeral Kali Containers (Recon)
Each tool invocation gets a fresh `kalilinux/kali-rolling` container. Tools are apt-installed at runtime (the Docker image layer cache makes repeat installs fast). Containers attach to `exoscan_net` so they can reach the same network segments as the backend. Container IDs are tracked in `scans.container_ids` for cancellation.

### Strix Runner Container (AI Pentest)
Strix runs inside a `python:3.12-slim` container spawned by the backend via the Docker socket. This container mounts `/var/run/docker.sock` so Strix can launch its own `ghcr.io/usestrix/strix-sandbox` containers on the host. The runner does not attach to `exoscan_net` — Strix manages its own sandbox networking. The backend streams runner stdout via `run_in_executor` (blocking Docker SDK call off the asyncio event loop). A 2-hour hard cap kills the container if it exceeds the deadline.

### LLM Key Encryption
LLM API keys are encrypted before storage using Fernet symmetric encryption. A 32-byte key is derived from `SECRET_KEY` via `hashlib.sha256`, base64-encoded to meet Fernet's format requirement. Decryption happens in-process only at pentest launch time. Keys are never logged, never returned in API responses (masked as `sk-...****`), and never passed to containers as command-line arguments (only as environment variables).

### Pub/Sub Log Bus
`recon/log_bus.py` maintains a `dict[scan_id, list[asyncio.Queue]]`. Raw container stdout is forwarded to the bus (not persisted). Structured orchestrator messages (stage start/end, counts) are persisted to `scan_logs` AND published to the bus so WebSocket reconnections can replay history from the database.

### Nuclei Template Volume
`exoscan_nuclei_templates_vol` is mounted read-write into a startup task that runs `nuclei -update-templates`. All per-scan nuclei containers mount the same volume read-only, so templates are never re-downloaded per scan.

### Screenshot Pipeline
GoWitness writes PNGs and a SQLite database to the shared `screenshots_vol`. The backend reads `gowitness.sqlite3` directly (both share the same volume mount) to build URL→filename mappings, then updates `ScanAsset.screenshot_path`. Screenshots are served by FastAPI `StaticFiles` at `/static/screenshots/{scan_id}/{filename}`.

### Two-Track Scan Types
The `scan_type` column accepts `passive`, `active`, `comprehensive` (legacy), and `pentest`. The orchestrator branches on scan type before entering Stage 1 — pentest scans skip all recon stages and go directly to `_run_pentest_stage()`. The UI no longer creates new `comprehensive` scans but existing ones render correctly. `parent_scan_id` (nullable FK → scans) links a pentest back to a prior recon for context, but Strix always starts fresh regardless.

### Sharing & Access Control

Scan sharing is row-level: a `scan_shares` row grants a specific user or group read-only access to a scan. Every read path (GET scan, GET results, WS logs) accepts either ownership or share access; all mutation paths (DELETE, trigger suggested scan, manage shares) remain owner-only.

**Access check** — `_has_share_access(scan_id, user_id)` builds a SQLAlchemy `or_` clause with two `exists()` subqueries:
1. Direct user share: `scan_shares WHERE scan_id=? AND shared_with_user_id=?`
2. Group share: `scan_shares JOIN group_members ON group_id=shared_with_group_id WHERE scan_id=? AND user_id=?`

**Group constraint** — Users can only share a scan with a group they are a member of. Enforced server-side in `POST /scans/{id}/shares/groups` via a `GroupMember` existence check.

**Database constraints on `scan_shares`:**
- `CHECK ((shared_with_user_id IS NULL) != (shared_with_group_id IS NULL))` — exactly one target per row
- `UNIQUE (scan_id, shared_with_user_id)` — no duplicate user shares per scan
- `UNIQUE (scan_id, shared_with_group_id)` — no duplicate group shares per scan
