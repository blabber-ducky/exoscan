# Exoscan

Containerised external reconnaissance web application for security professionals. Give it a domain or IP, select which techniques to run, and it discovers subdomains, fingerprints technologies, captures screenshots, correlates CVEs, and surfaces actionable follow-up scan suggestions — all from a single browser interface.

> **Authorised use only.** Only scan infrastructure you own or have written permission to test.

---

## Features

- **Three scan types** — Passive (no direct target contact), Active (deep single-target inspection), and Comprehensive (discover all assets passively then fingerprint each one actively)
- **Passive modules** — DNS recon (dnsrecon), subdomain enumeration (subfinder + crt.sh), DuckDuckGo dorking, IP profiling (ipinfo.io)
- **Active modules** — Technology fingerprinting (WhatWeb), screenshot capture (GoWitness), port & service scan (nmap), CVE detection (NVD API v2)
- **Secondary scan suggestions** — after active recon, targeted follow-up scans are suggested per asset (nuclei CVE, WPScan, nikto, ffuf, nmap vuln scripts), boosted in priority when high-severity CVEs are found
- **Live log streaming** — real-time WebSocket log feed with stage progress stepper; history replayed on reconnect
- **Screenshot gallery** — headless browser screenshots embedded in each asset card
- **Scan sharing** — share completed scan results with individual users or with groups; admin panel for group management and user-to-group assignment
- **JWT auth** — register/login/refresh token flow; all scan data is per-user
- **Fully containerised** — three Docker Compose services; scanning tools spin up in ephemeral `kalilinux/kali-rolling` containers and are destroyed after each stage

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS v4 + shadcn/ui |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL 16 |
| Scanning | Ephemeral `kalilinux/kali-rolling` containers, tools installed at runtime |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Real-time | FastAPI WebSocket |

---

## Quick Start

**Prerequisites:** Docker Desktop (or Docker Engine + Compose plugin) v24+

```bash
git clone <repo-url>
cd exoscan

cp .env.example .env
# Edit .env — generate SECRET_KEY with: openssl rand -hex 32

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

Register an account on first visit. The first scan may be slow while Docker pulls the `kalilinux/kali-rolling` image (~200 MB); subsequent scans use the cache.

---

## Environment Variables

All variables are in `.env.example`. The ones you need to set:

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | **Yes** | JWT signing secret — generate with `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | **Yes** | Database password |
| `FRONTEND_URL` | **Yes** | CORS allowed origin — `http://localhost:3000` for local dev |
| `ADMIN_EMAIL` | No | Email address to auto-promote to admin on register/login |
| `DOCKERHUB_USERNAME` | For deployment | Docker Hub username (`m1v1n`) — used to pull pre-built images |
| `TAG` | No | Image tag to deploy, default `latest` |
| `NVD_API_KEY` | No | Raises NVD CVE rate limit from 5 to 50 req/30 s — register at nvd.nist.gov |

`DATABASE_URL`, `SCREENSHOT_BASE_PATH`, and volume name variables are set automatically by docker-compose.

---

## Deployment (pre-built images)

Pre-built multi-arch images (`linux/amd64` + `linux/arm64`) are published to Docker Hub on every push to `main`:

| Image | Docker Hub path |
|-------|----------------|
| Backend | `m1v1n/exoscan-be` |
| Frontend | `m1v1n/exoscan-fe` |

To deploy on a server or Raspberry Pi without building from source:

```bash
cp .env.example .env
# Set SECRET_KEY, POSTGRES_PASSWORD, FRONTEND_URL in .env

docker compose pull        # pulls m1v1n/exoscan-be and m1v1n/exoscan-fe from Docker Hub
docker compose up -d
```

**GitHub Actions secrets required** (set under repo → Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | `m1v1n` |
| `DOCKERHUB_TOKEN` | A Docker Hub access token (Hub → Account Settings → Personal Access Tokens) |

---

## How It Works

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
│  └──────────────┘    │  apt-install tools at runtime│  │
│                      │  attached to exoscan_net     │  │
│                      └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

1. `POST /api/v1/scans` creates the scan record and returns immediately with the scan ID
2. An `asyncio.create_task()` runs the scan in the background — no Celery or Redis required
3. Each tool stage spawns a fresh `kalilinux/kali-rolling` container, installs the required tool via `apt-get`, streams stdout to the WebSocket log bus, then destroys the container
4. The browser connects to `WS /api/v1/scans/{id}/logs` and receives structured log events in real time
5. After active recon, secondary scan suggestions are generated and stored; the user can trigger them individually from the results page

### Scan stages

| Stage | What runs |
|-------|----------|
| **1 — Passive** | dnsrecon, subfinder + crt.sh, DuckDuckGo dorking, ipinfo.io |
| **2 — Liveness Probe** | httpx probes each asset (https→http fallback); unreachable/timeout assets are flagged and skipped by active modules |
| **3 — Active** | nmap, WhatWeb, GoWitness (batch), NVD CVE lookup |
| **Post** | Suggestion generation per asset |

---

## Scan Modules

### Passive

| Module | Tool | Notes |
|--------|------|-------|
| DNS Recon | dnsrecon (Kali) | A, AAAA, MX, NS, TXT, CNAME, SOA |
| IP Profiling | ipinfo.io API | ASN, org, country, city, rDNS |
| Asset Identification | subfinder (Kali) + crt.sh + DuckDuckGo | Subdomains + dork hits |

### Active

| Module | Tool | Notes |
|--------|------|-------|
| Technology Fingerprinting | WhatWeb (Kali) | Software, CMS, headers, version strings |
| Screenshot Capture | GoWitness (Kali) | Batch headless screenshots |
| CVE Detection | NVD API v2 | Requires Technology Fingerprinting; 24 h DB cache |
| Port & Service Scan | nmap (Kali) | Configurable port range; -sV service detection |

### Port Scan Presets

| Preset | Ports |
|--------|-------|
| Top 100 | nmap's 100 most common |
| Top 1000 (default) | nmap's 1000 most common |
| HTTP/S Only | 80, 443, 8080, 8443 |
| Custom | comma-separated ports/ranges, e.g. `22,80,443,8080-8090` |

---

## Secondary Scan Suggestions

After active recon, Exoscan matches detected technologies against a template registry and generates targeted follow-up scans. Priority is scored 0–100 and boosted +40 when the asset has a CVE with CVSS ≥ 7.0.

| Technology | Follow-up scans |
|-----------|----------------|
| WordPress | WPScan, nuclei CVE |
| Apache | nuclei CVE, nikto, ffuf content discovery |
| Nginx | nuclei CVE, ffuf content discovery |
| Tomcat | nuclei CVE, nmap vuln scripts |
| Jenkins | nuclei CVE, nmap vuln scripts |
| PHP | nuclei CVE |
| _(any)_ | nikto, ffuf content discovery |

Nuclei templates are updated automatically on backend startup and every 24 hours. All scan containers mount the shared `nuclei_templates_vol` read-only so templates are never re-downloaded per scan.

---

## Project Structure

```
exoscan/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/              # migrations
│   └── app/
│       ├── main.py           # FastAPI app + middleware
│       ├── auth/             # JWT register/login/refresh; ADMIN_EMAIL auto-promotion
│       ├── admin/            # group CRUD + user membership management (admin-only)
│       ├── scans/            # scan CRUD + WebSocket logs + sharing endpoints
│       ├── recon/
│       │   ├── orchestrator.py
│       │   ├── probe.py
│       │   ├── passive/      # dns, subdomains, dorking, ip_profiling
│       │   ├── active/       # portscan, fingerprint, screenshots, cve
│       │   └── secondary/    # templates, suggestions, executor
│       ├── nuclei/           # 24 h template update loop
│       └── docker_manager/   # run_ephemeral(), log streamer
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── api/              # Axios client, WS factory, admin + shares API
│       ├── store/            # Zustand auth + scan stores
│       ├── hooks/            # TanStack Query hooks (scans, admin, shares)
│       ├── components/       # UI primitives + domain components (ShareDialog, GroupManager)
│       └── pages/            # Login, Register, Dashboard, Scan, Results, Admin
├── postgres/
│   └── init/01_extensions.sql
└── docs/
    ├── architecture.md       # system diagrams + design decisions
    ├── developer.md          # adding modules, migrations, isolation testing
    └── user.md               # scan types, results guide, responsible use
```

---

## Database Migrations

```bash
# After changing a model
docker compose exec backend alembic revision --autogenerate -m "describe the change"
docker compose exec backend alembic upgrade head
```

---

## Extending Exoscan

- **New passive module** — see [`docs/developer.md`](docs/developer.md#adding-a-new-passive-module)
- **New active module** — see [`docs/developer.md`](docs/developer.md#adding-a-new-active-module)
- **New secondary scan template** — add one entry to `SCAN_TEMPLATES` in `backend/app/recon/secondary/templates.py` (no schema changes needed)

---

## Security

- All user-supplied values passed to tool commands are wrapped in `shlex.quote()`; no `shell=True` anywhere in the codebase
- Port ranges are validated against `^[\d,\-]+$` and checked for 1–65535 bounds before reaching nmap
- Domain/URL/IP inputs are validated with pydantic validators before any container is spawned
- CORS is locked to `FRONTEND_URL` only
- Auth endpoints are rate-limited to 5 requests/minute per IP via slowapi
- Admin routes are gated by a `require_admin` FastAPI dependency; `is_admin` cannot be set through the public API
- Users can only share scans with groups they are a member of — enforced server-side
- The Docker socket mount gives the backend root-equivalent host access — do not expose port 8000 publicly

---

## Documentation

| File | Contents |
|------|----------|
| [`docs/architecture.md`](docs/architecture.md) | System diagram, scan lifecycle sequence, package layout, design decisions |
| [`docs/developer.md`](docs/developer.md) | Setup, migrations, module extension guides, isolation testing |
| [`docs/user.md`](docs/user.md) | Scan types, module reference, results interpretation, responsible use |
| [`TASKS.md`](TASKS.md) | Phase-by-phase build tracker |
