# Exoscan

Containerised external reconnaissance platform for security professionals. Give it a domain or IP, select which techniques to run, and it discovers subdomains, fingerprints technologies, captures screenshots, correlates CVEs, and surfaces actionable follow-up scan suggestions — all from a single browser interface.

> **Authorised use only.** Only scan infrastructure you own or have written permission to test.

---

## Features

- **Three scan types** — Passive (no direct target contact), Active (deep single-target inspection), Comprehensive (discover all assets passively then fingerprint each actively)
- **Passive modules** — DNS recon (dnsrecon), subdomain enumeration (subfinder + crt.sh), DuckDuckGo dorking, IP profiling (ipinfo.io)
- **Active modules** — Technology fingerprinting (WhatWeb), screenshot capture (GoWitness), port & service scan (nmap), CVE detection (NVD API v2)
- **Secondary scan suggestions** — targeted follow-up scans suggested per asset (nuclei CVE, WPScan, nikto, ffuf, nmap vuln scripts); priority boosted when high-severity CVEs are found
- **Scan sharing** — share completed results with individual users or groups; admin panel for group management and user assignment
- **Live log streaming** — real-time WebSocket log feed with stage progress stepper; history replayed on reconnect
- **Screenshot gallery** — headless browser screenshots embedded in each asset card
- **JWT auth** — register/login/refresh token flow; all scan data is per-user
- **Fully containerised** — three Docker Compose services; scanning tools run in ephemeral `kalilinux/kali-rolling` containers, destroyed after each stage

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

### Deploy with pre-built images (recommended)

No git clone or build step required. Pre-built multi-arch images (`linux/amd64` + `linux/arm64`) are published to Docker Hub on every push to `main`.

```bash
# Download the two required files
wget https://raw.githubusercontent.com/blabber-ducky/exoscan/main/docker-compose.yml
wget https://raw.githubusercontent.com/blabber-ducky/exoscan/main/.env.example -O .env

# Edit .env — minimum required values:
#   SECRET_KEY        → openssl rand -hex 32
#   POSTGRES_PASSWORD → a strong password
#   FRONTEND_URL      → http://<your-server-ip>:3000

docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. Check readiness with `docker compose ps` and `docker compose logs backend --tail 20`.

See [`docs/deployment.md`](docs/deployment.md) for updates, backup/restore, server migration, and troubleshooting.

### Development (build from source)

```bash
git clone https://github.com/blabber-ducky/exoscan.git
cd exoscan
cp .env.example .env   # generate SECRET_KEY: openssl rand -hex 32
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

---

## Environment Variables

All variables are in `.env.example`.

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | **Yes** | JWT signing secret — `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | **Yes** | Database password |
| `FRONTEND_URL` | **Yes** | CORS allowed origin, no trailing slash |
| `ADMIN_EMAIL` | No | Email auto-promoted to admin on register/login |
| `NVD_API_KEY` | No | Raises NVD CVE rate limit from 5 → 50 req/30 s |

`DATABASE_URL`, `SCREENSHOT_BASE_PATH`, and volume names are set automatically by docker-compose. `DOCKERHUB_USERNAME` and `TAG` are only needed for CI/CD.

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

1. `POST /api/v1/scans` creates the scan record and returns immediately
2. An `asyncio.create_task()` runs the scan in the background — no Celery or Redis required
3. Each tool stage spawns a fresh Kali container, installs the tool via `apt-get`, streams stdout to the WebSocket log bus, then destroys the container
4. The browser receives structured log events in real time via WebSocket
5. After active recon, secondary scan suggestions are generated per asset and can be triggered from the results page

### Scan stages

| Stage | What runs |
|-------|----------|
| **1 — Passive** | dnsrecon, subfinder + crt.sh, DuckDuckGo dorking, ipinfo.io |
| **2 — Liveness Probe** | httpx probes each asset; unreachable/timeout assets flagged and skipped |
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
| Port & Service Scan | nmap (Kali) | Configurable port range; `-sV` service detection |

**Port scan presets:** Top 100 · Top 1000 (default) · HTTP/S Only (80, 443, 8080, 8443) · Custom (comma-separated ports/ranges)

---

## Secondary Scan Suggestions

After active recon, detected technologies are matched against a template registry and targeted follow-up scans are generated. Priority is scored 0–100 and boosted +40 when the asset has a CVE with CVSS ≥ 7.0.

| Technology | Follow-up scans |
|-----------|----------------|
| WordPress | WPScan, nuclei CVE |
| Apache | nuclei CVE, nikto, ffuf content discovery |
| Nginx | nuclei CVE, ffuf content discovery |
| Tomcat | nuclei CVE, nmap vuln scripts |
| Jenkins | nuclei CVE, nmap vuln scripts |
| PHP | nuclei CVE |
| _(any)_ | nikto, ffuf content discovery |

Nuclei templates are updated automatically on backend startup and every 24 hours via a background task.

---

## Sharing & Admin

Completed scans can be shared with individual users or with groups. A **Share** button appears on completed scan cards (owners only). The share dialog lets you share via groups you belong to or by searching usernames directly.

Admin users have access to the **Admin panel** (`/admin`) where they can create groups and manage user memberships. To designate an admin, set `ADMIN_EMAIL` in `.env` — that account is automatically promoted on login.

See [`docs/user.md`](docs/user.md) for full usage details.

---

## Security

- All user-supplied values passed to tool commands are wrapped in `shlex.quote()`; no `shell=True` anywhere
- Port ranges validated against `^[\d,\-]+$` and checked for 1–65535 bounds before reaching nmap
- Domain/URL/IP inputs validated with pydantic validators before any container is spawned
- CORS locked to `FRONTEND_URL` only
- Auth endpoints rate-limited to 5 req/min per IP via slowapi
- Admin routes gated by `require_admin` dependency; `is_admin` cannot be set through the public API
- Users can only share with groups they are a member of — enforced server-side
- The Docker socket mount gives the backend root-equivalent host access — do not expose port 8000 publicly

---

## Project Structure

```
exoscan/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/                  # migrations (001 schema, 002 liveness, 003 groups/shares)
│   └── app/
│       ├── main.py               # FastAPI app + middleware
│       ├── auth/                 # JWT register/login/refresh; ADMIN_EMAIL auto-promotion
│       ├── admin/                # group CRUD + user membership management (admin-only)
│       ├── scans/                # scan CRUD + WebSocket logs + sharing endpoints
│       ├── recon/
│       │   ├── orchestrator.py
│       │   ├── probe.py
│       │   ├── passive/          # dns, subdomains, dorking, ip_profiling
│       │   ├── active/           # portscan, fingerprint, screenshots, cve
│       │   └── secondary/        # templates, suggestions, executor
│       ├── nuclei/               # 24 h template update loop
│       └── docker_manager/       # run_ephemeral(), log streamer
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── api/                  # Axios client, WS factory, admin + shares API
│       ├── store/                # Zustand auth store
│       ├── hooks/                # TanStack Query hooks (scans, admin, shares)
│       ├── components/           # shadcn/ui primitives + ShareDialog, GroupManager
│       └── pages/                # Login, Register, Dashboard, Scan, Results, Admin
└── docs/
    ├── deployment.md             # deploy, update, backup/restore, server migration
    ├── architecture.md           # system diagrams + design decisions
    ├── developer.md              # setup, migrations, module extension guides
    └── user.md                   # scan types, sharing, admin panel, responsible use
```

---

## Documentation

| File | Contents |
|------|----------|
| [`docs/deployment.md`](docs/deployment.md) | Initial deploy, updates, backup/restore, server migration, troubleshooting |
| [`docs/architecture.md`](docs/architecture.md) | System diagram, scan lifecycle, package layout, design decisions |
| [`docs/developer.md`](docs/developer.md) | Dev setup, migrations, module extension guides, access control patterns |
| [`docs/user.md`](docs/user.md) | Scan types, modules, sharing, admin panel, responsible use |
| [`TASKS.md`](TASKS.md) | Phase-by-phase build tracker |
