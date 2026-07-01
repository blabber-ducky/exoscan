# Exoscan — Task Tracker

> Updated alongside git commits. Mark tasks `[x]` when done; mark phase header `[x]` when all tasks in phase are complete.
> Commit convention: `phase{N}: {short description}` — include TASKS.md update in same commit.

---

## Phase 1: Infrastructure [x]

- [x] `docker-compose.yml` — three services (postgres, backend, frontend) + named network `exoscan_net` + volumes (postgres_data, screenshots_vol, nuclei_templates_vol)
- [x] `backend/Dockerfile` — Python 3.12 slim, installs requirements, runs uvicorn
- [x] `frontend/Dockerfile` — Node build stage + nginx serve stage
- [x] `frontend/nginx.conf` — SPA fallback, `/api` proxy to backend
- [x] `postgres/init/01_extensions.sql` — uuid-ossp, pg_trgm extensions
- [x] `backend/requirements.txt`
- [x] `backend/alembic.ini` + `backend/alembic/env.py`
- [x] `backend/alembic/versions/001_initial_schema.py` — all tables (users, scans, scan_assets, scan_cves, scan_logs, cve_cache, suggested_scans)
- [x] `.env.example`
- [x] `.gitignore`

---

## Phase 2: Backend Auth [x]

- [x] `backend/app/config.py` — pydantic-settings Settings class
- [x] `backend/app/database.py` — async SQLAlchemy engine + AsyncSession factory
- [x] `backend/app/main.py` — FastAPI app factory, CORS, router registration, StaticFiles mount
- [x] `backend/app/dependencies.py` — `get_db()`, `get_current_user()`
- [x] `backend/app/auth/models.py` — User ORM model
- [x] `backend/app/auth/schemas.py` — RegisterRequest, LoginRequest, TokenResponse
- [x] `backend/app/auth/service.py` — bcrypt hashing, JWT encode/decode
- [x] `backend/app/auth/router.py` — POST /auth/register, /auth/login, /auth/refresh, GET /auth/me
- [ ] Smoke test: `curl -X POST http://localhost:8000/api/v1/auth/register` returns tokens

---

## Phase 3: Scan Lifecycle (stub) [ ]

- [ ] `backend/app/scans/models.py` — Scan, ScanAsset, ScanLog, ScanCVE, SuggestedScan ORM models
- [ ] `backend/app/scans/schemas.py` — CreateScanRequest (with modules, port_config), ScanResponse, AssetResponse
- [ ] `backend/app/scans/service.py` — DB query helpers
- [ ] `backend/app/scans/router.py` — CRUD routes + WebSocket /scans/{id}/logs
- [ ] `backend/app/recon/orchestrator.py` — stub: creates scan, immediately marks complete, pushes one log line
- [ ] WebSocket smoke test: `wscat -c ws://localhost:8000/api/v1/scans/{id}/logs?token=...` receives log replay

---

## Phase 4: Docker Manager [ ]

- [ ] `backend/app/docker_manager/client.py` — `docker.from_env()` singleton
- [ ] `backend/app/docker_manager/log_streamer.py` — async generator over container stdout
- [ ] `backend/app/docker_manager/container.py` — `run_ephemeral()` with timeout, firewall pattern detection, container ID tracking, cleanup
- [ ] Manual smoke test: backend spawns a Kali container, installs curl, curls example.com, streams logs, container removed

---

## Phase 5: Nuclei Template Updater [ ]

- [ ] `backend/app/nuclei/updater.py` — `update_templates()` + `nuclei_update_loop()` (24h asyncio task)
- [ ] Wire `nuclei_update_loop()` into `main.py` startup lifespan
- [ ] Verify: `docker volume inspect nuclei_templates_vol` shows data after backend starts

---

## Phase 6: Passive Recon [ ]

- [ ] `backend/app/recon/passive/dns.py` — dnsrecon Kali container, parse JSON output
- [ ] `backend/app/recon/passive/subdomains.py` — subfinder Kali container + httpx liveness probe of discovered hosts
- [ ] `backend/app/recon/passive/dorking.py` — DuckDuckGo HTML scrape via httpx (no container), 4 query variants, rate-limited
- [ ] Wire all three into Orchestrator Stage 1 (`asyncio.gather`)
- [ ] Verify: passive scan against `example.com` populates DNS records + subdomains + dork hits in DB

---

## Phase 7: Liveness Probe [ ]

- [ ] `backend/app/recon/probe.py` — async httpx probe with timeout/redirect handling, sets `asset.scan_status`
- [ ] Wire probe between passive and active phases in orchestrator (skip active for non-live assets)
- [ ] Verify: unreachable host gets `scan_status=unreachable` and is skipped by active modules

---

## Phase 8: Active Recon [ ]

- [ ] `backend/app/recon/active/portscan.py` — nmap Kali container, `port_config` → nmap flags, parse open_ports JSON
- [ ] `backend/app/recon/active/fingerprint.py` — WhatWeb Kali container, parse plugin JSON → technologies
- [ ] `backend/app/recon/active/screenshots.py` — GoWitness Kali container, SQLite URL→filename mapping
- [ ] `backend/app/recon/active/cve.py` — NVD API v2 client + cve_cache table, retry on 429
- [ ] Wire all into Orchestrator Stage 2 (active phase, per-asset, semaphore-limited)
- [ ] Verify: active scan against a live web server produces tech badges + screenshot + CVEs

---

## Phase 9: Secondary Scan Suggestions [ ]

- [ ] `backend/app/recon/secondary/templates.py` — SCAN_TEMPLATES dict with tech keys + ScanTemplate dataclass
- [ ] `backend/app/recon/secondary/suggestions.py` — `generate_suggestions(asset, cves)` with priority boost logic
- [ ] `backend/app/recon/secondary/executor.py` — `trigger_suggested_scan()` container runner, nuclei_templates_vol mount, per-type timeouts
- [ ] `POST /api/v1/scans/{id}/suggested/{sid}/trigger` route
- [ ] Verify: after active scan, suggested_scans rows created; trigger endpoint spawns Kali container

---

## Phase 10: Frontend [ ]

- [ ] `frontend/package.json` — React 18, Vite 5, Tailwind v4, shadcn/ui, TanStack Query v5, Zustand, React Router v6, Axios, React Hook Form, Zod, Sonner, Lucide React
- [ ] Vite + Tailwind + TypeScript config files
- [ ] shadcn/ui init + base components (Button, Card, Badge, Dialog, Tabs, Checkbox, Input, Label, RadioGroup, Separator, Tooltip, Sonner)
- [ ] `src/api/client.ts` — Axios instance + JWT interceptor + 401 refresh
- [ ] `src/api/auth.ts`, `src/api/scans.ts`, `src/api/ws.ts`
- [ ] `src/store/authStore.ts`, `src/store/scanStore.ts`
- [ ] `src/types/index.ts`
- [ ] `src/hooks/useAuth.ts`, `useScans.ts`, `useScanResults.ts`, `useScanLogs.ts`
- [ ] `src/components/layout/Navbar.tsx`, `Layout.tsx`
- [ ] `src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`
- [ ] `src/pages/LoginPage.tsx`, `RegisterPage.tsx`
- [ ] `src/components/scans/NewScanForm.tsx` — 4-step wizard (type → target → modules → port config)
- [ ] `src/components/scans/ScanCard.tsx`, `ScanProgress.tsx`, `LogViewer.tsx`, `ScanStatusBadge.tsx`
- [ ] `src/pages/DashboardPage.tsx`
- [ ] `src/pages/ScanPage.tsx` — live progress + LogViewer, auto-redirect on complete
- [ ] `src/components/results/PassiveReconPanel.tsx` — DNS / Subdomains / Dork Hits tabs
- [ ] `src/components/results/AssetCard.tsx`, `AssetGrid.tsx`, `TechBadge.tsx`, `CVEList.tsx`, `SuggestedScans.tsx`
- [ ] `src/pages/ResultsPage.tsx`
- [ ] End-to-end UI test: full comprehensive scan visible in browser

---

## Phase 11: Security Hardening [ ]

- [ ] Target input validation — domain/IP/URL regex validators in `scans/schemas.py`
- [ ] Port config validation — regex `^[\d,\-]+$` + range sanity check
- [ ] `shlex.quote()` audit — verify all tool command strings use it for any user-derived value
- [ ] CORS locked to `FRONTEND_URL` env var only
- [ ] `slowapi` rate limiting on auth endpoints (5 req/min per IP)
- [ ] Review: no `shell=True` with user input anywhere in codebase

---

## Phase 12: Documentation [ ]

- [ ] `docs/architecture.md` — Mermaid system diagram + scan lifecycle sequence diagram
- [ ] `docs/developer.md` — dev guide (module extension, migrations, testing containers)
- [ ] `docs/user.md` — end-user guide (scan types, modules, results interpretation, responsible use)
- [ ] Update `CLAUDE.md` if any patterns changed during implementation

---

## Completed Phases

- **Phase 1: Infrastructure** — docker-compose, Dockerfiles, nginx, postgres init, alembic migration 001 (all 7 tables), requirements.txt, .env.example, .gitignore
- **Phase 2: Backend Auth** — config, database, User model, JWT service (bcrypt + python-jose), register/login/refresh/me routes, get_current_user dependency
