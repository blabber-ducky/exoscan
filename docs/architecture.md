# Exoscan — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker host                           │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐  │
│  │   Frontend   │    │          Backend             │  │
│  │  nginx:80    │◄──►│       FastAPI:8000           │  │
│  │  React SPA   │    │  SQLAlchemy + asyncpg        │  │
│  │  port 3000   │    │  Docker socket client        │  │
│  └──────────────┘    └──────────┬───────────────────┘  │
│         │ /api proxy             │ spawns                │
│         │                       ▼                       │
│  ┌──────────────┐    ┌──────────────────────────────┐  │
│  │  PostgreSQL  │    │  Ephemeral Kali containers   │  │
│  │  port 5432   │    │  kalilinux/kali-rolling      │  │
│  │  postgres_   │    │  apt-install tools at runtime│  │
│  │  data vol    │    │  attached to exoscan_net     │  │
│  └──────────────┘    └──────────────────────────────┘  │
│                                                         │
│  Named volumes:                                         │
│    exoscan_postgres_data      (database files)          │
│    exoscan_screenshots_vol    (GoWitness PNGs + SQLite) │
│    exoscan_nuclei_templates_vol (cached templates)      │
│                                                         │
│  Network: exoscan_net (explicit name, bridge)           │
└─────────────────────────────────────────────────────────┘
```

## Docker Compose Services

| Service | Image | Exposed port | Role |
|---------|-------|-------------|------|
| `postgres` | postgres:16-alpine | internal only | Persistent storage |
| `backend` | ./backend (Python 3.12 slim) | 8000 (internal) | API + scan orchestration |
| `frontend` | ./frontend (Node build → nginx) | 3000→80 | SPA + /api proxy |

The backend mounts `/var/run/docker.sock` to spawn ephemeral Kali containers on the same host. The frontend's nginx proxies `/api/` (including WebSocket upgrades) and `/static/` to the backend.

## Scan Lifecycle Sequence

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
  │                │                │                │                   │
  │ WS /logs?token │                │                │                   │
  │───────────────►│───────────────►│                │                   │
  │                │           replay history        │                   │
  │                │◄───────────────│                │                   │
  │                │                │                │                   │
  │                │                │     Stage 1: Passive Recon        │
  │                │                │                │──────────────────►│
  │                │                │                │  dnsrecon         │
  │                │                │                │  subfinder        │
  │                │                │                │  DDG dorking      │
  │                │                │                │◄──────────────────│
  │                │                │                │  save to DB       │
  │                │                │                │                   │
  │                │                │     Stage 2: Liveness Probe       │
  │                │                │                │ httpx probes      │
  │                │                │                │ (in-process)      │
  │                │                │                │ mark live/unreach.│
  │                │                │                │                   │
  │                │                │     Stage 3: Active Recon (×asset)│
  │                │                │                │──────────────────►│
  │                │                │                │  nmap / whatweb   │
  │                │                │                │  gowitness (batch)│
  │                │                │                │◄──────────────────│
  │                │                │                │ NVD API (in-proc) │
  │                │                │                │ generate suggests │
  │                │                │                │                   │
  │                │                │           status=completed         │
  │ ← {type:complete}               │                │                   │
  │                │                │                │                   │
  │ GET /results   │                │                │                   │
  │───────────────►│───────────────►│                │                   │
  │                │ assets+CVEs+suggestions          │                   │
  │◄───────────────│◄───────────────│                │                   │
```

## Backend Package Layout

```
backend/app/
├── main.py              # FastAPI app factory, middleware, lifespan
├── config.py            # pydantic-settings (reads .env), admin_email setting
├── database.py          # async SQLAlchemy engine + AsyncSession factory
├── dependencies.py      # get_db(), get_current_user(), require_admin()
├── limiter.py           # slowapi Limiter instance (shared)
│
├── auth/                # JWT auth (register/login/refresh/me)
│   ├── models.py        # User (id, email, username, is_admin, is_active, created_at)
│   ├── schemas.py
│   ├── service.py       # bcrypt + python-jose
│   └── router.py        # rate-limited with slowapi (5/min per IP)
│                        # auto-promotes ADMIN_EMAIL account to is_admin on register/login
│
├── admin/               # Admin-only group and user management
│   └── router.py        # GET/POST/DELETE /admin/groups + /admin/groups/{id}/members
│                        # GET /admin/users — all gated by require_admin
│
├── scans/               # Scan CRUD + WebSocket log stream + sharing
│   ├── models.py        # Scan, ScanAsset, ScanLog, ScanCVE, SuggestedScan, ScanShare
│   ├── schemas.py       # validated CreateScanRequest, response schemas, share schemas
│   ├── service.py       # queries, scan_to_response(), _has_share_access(),
│   │                    # get_accessible_scan_or_404(), list_scans(), list_shares()
│   └── router.py        # REST + WS /scans/{id}/logs + /shares/* + /groups/mine
│                        # + /users/search
│
├── recon/
│   ├── log_bus.py       # pub/sub: per-scan asyncio.Queue for WS streaming
│   ├── orchestrator.py  # Stage 1→2→3, _make_log_fn(), _safe()
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

## Key Design Decisions

### No Celery / Redis
Scans run as `asyncio.create_task()` background coroutines started immediately after `POST /scans` returns. State is fully in PostgreSQL. This keeps the operational footprint minimal — only three services (postgres, backend, frontend) and no broker.

### Ephemeral Kali Containers
Each tool invocation gets a fresh `kalilinux/kali-rolling` container. Tools are apt-installed at runtime (the Docker image layer cache makes repeat installs fast). Containers attach to `exoscan_net` so they can reach the same network segments as the backend. Container IDs are tracked in `scans.container_ids` for cancellation.

### Pub/Sub Log Bus
`recon/log_bus.py` maintains a `dict[scan_id, list[asyncio.Queue]]`. Raw container stdout is forwarded to the bus (not persisted). Structured orchestrator messages (stage start/end, counts) are persisted to `scan_logs` AND published to the bus so WebSocket reconnections can replay history from the database.

### Nuclei Template Volume
`exoscan_nuclei_templates_vol` is mounted read-write into a startup task that runs `nuclei -update-templates`. All per-scan nuclei containers mount the same volume read-only, so templates are never re-downloaded per scan. A `.exoscan_last_updated` marker file prevents unnecessary re-runs within 24 hours.

### Screenshot Pipeline
GoWitness writes PNGs and a SQLite database to the shared `screenshots_vol`. The backend reads `gowitness.sqlite3` directly (both share the same volume mount) to build URL→filename mappings, then updates `ScanAsset.screenshot_path`. Screenshots are served by FastAPI `StaticFiles` at `/static/screenshots/{scan_id}/{filename}`.

### Secondary Scan Suggestions
After active recon completes per-asset, `generate_suggestions()` matches detected technologies against `SCAN_TEMPLATES` (substring match on tech name). Priority is boosted +40 when any CVE for that asset has CVSS ≥ 7.0. Suggestions are stored as `suggested_scans` rows and can be triggered via `POST /scans/{id}/suggested/{sid}/trigger`, which spawns another ephemeral Kali container.

### Sharing & Access Control

Scan sharing is row-level: a `scan_shares` row grants a specific user or group read-only access to a scan. Every read path (GET scan, GET results, WS logs) accepts either ownership or share access; all mutation paths (DELETE, trigger suggested scan, manage shares) remain owner-only.

**Access check** — `_has_share_access(scan_id, user_id)` builds a SQLAlchemy `or_` clause with two `exists()` subqueries:
1. Direct user share: `scan_shares WHERE scan_id=? AND shared_with_user_id=?`
2. Group share: `scan_shares JOIN group_members ON group_id=shared_with_group_id WHERE scan_id=? AND user_id=?`

This single clause is reused in both the HTTP service and the WebSocket auth check.

**Group constraint** — Users can only share a scan with a group they are a member of. This is enforced server-side in `POST /scans/{id}/shares/groups` via a `GroupMember` existence check before creating the `scan_shares` row.

**Admin promotion** — Setting `ADMIN_EMAIL` in `.env` auto-promotes the matching account to `is_admin=True` on every register or login. No separate bootstrap step needed. The email comparison is case-insensitive.

**Database constraints on `scan_shares`:**
- `CHECK ((shared_with_user_id IS NULL) != (shared_with_group_id IS NULL))` — exactly one target per row
- `UNIQUE (scan_id, shared_with_user_id)` — no duplicate user shares per scan
- `UNIQUE (scan_id, shared_with_group_id)` — no duplicate group shares per scan
