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

## Phase 3: Scan Lifecycle (stub) [x]

- [x] `backend/app/scans/models.py` — Scan, ScanAsset, ScanLog, ScanCVE, SuggestedScan ORM models
- [x] `backend/app/scans/schemas.py` — CreateScanRequest (with target/module/port_config validation), ScanResponse, AssetResponse, PagedScansResponse
- [x] `backend/app/scans/service.py` — get_scan_or_404, list_scans, get_scan_results (bulk CVE+suggestion queries), scan_to_response
- [x] `backend/app/scans/router.py` — POST/GET/DELETE /scans, GET /results, POST /trigger (501 stub), WS /logs
- [x] `backend/app/recon/log_bus.py` — pub/sub: subscribe/unsubscribe/publish per scan_id
- [x] `backend/app/recon/orchestrator.py` — stub: marks running, emits 5 log lines to DB + bus, marks complete
- [ ] Smoke test: `docker compose up` → register → POST /scans → wscat receives log stream

---

## Phase 4: Docker Manager [x]

- [x] `backend/app/docker_manager/client.py` — lazy `docker.from_env()` singleton with ping health-check on first use
- [x] `backend/app/docker_manager/log_streamer.py` — daemon thread reads blocking Docker log iterator; lines forwarded to asyncio.Queue (maxsize=2000); multi-line chunks split; None sentinel signals EOF
- [x] `backend/app/docker_manager/container.py` — `run_ephemeral()`: builds apt-install + command, starts detached container, tracks ID in scans.container_ids, streams logs to log bus with firewall pattern detection (WARN level), enforces timeout via asyncio.wait_for (kills on expiry), extracts result file via docker cp before removal, guaranteed cleanup in all paths; `copy_file_from_container()` tar extraction helper
- [ ] Manual smoke test: `docker compose up` → verify backend can spawn a Kali container

---

## Phase 5: Nuclei Template Updater [x]

- [x] `backend/app/nuclei/updater.py` — `_is_stale()` checks `.exoscan_last_updated` marker; `update_templates()` runs nuclei in fresh Kali container with `nuclei_templates_vol` mounted rw; `nuclei_update_loop()` runs on startup then sleeps 24h; failed updates logged but non-fatal
- [x] Wire `nuclei_update_loop()` into `main.py` lifespan via `asyncio.create_task()`
- [x] `docker-compose.yml` — added explicit `name:` to all three volumes so ephemeral Kali containers reference them without compose project-name prefix
- [x] `config.py` — added `nuclei_templates_volume` + `screenshots_volume` settings (passed via docker-compose env vars)
- [ ] Manual verify: `docker compose up` → backend logs show "Nuclei: starting template update"; `docker volume inspect exoscan_nuclei_templates_vol` shows files

---

## Phase 6: Passive Recon [x]

- [x] `backend/app/recon/passive/dns.py` — dnsrecon Kali container; -t std -j /tmp/out.json; extracts JSON via docker cp; normalises A/AAAA/MX/NS/TXT/SOA/CNAME records into flat dicts
- [x] `backend/app/recon/passive/subdomains.py` — subfinder Kali container + crt.sh in-process httpx in parallel; deduplicated by hostname; source tagged (subfinder/crtsh/subfinder+crtsh)
- [x] `backend/app/recon/passive/dorking.py` — DDG HTML endpoint; 4 query templates (site:, filetype:, inurl:admin, credentials leak); 3s rate-limit between queries; 429 detected and loop stopped early
- [x] `backend/app/recon/passive/ip_profiling.py` — ipinfo.io via httpx (no container); resolves domain→IP via socket.gethostbyname in thread executor
- [x] Orchestrator rewritten: _make_log_fn() persists to DB+bus; Stage 1 runs enabled passive modules via asyncio.gather(return_exceptions=True); _save_passive_results() creates main ScanAsset + subdomain ScanAssets + sets dork_hits on Scan; Stages 2/3/post stubbed with comments
- [ ] Verify: passive scan against `example.com` populates DNS records + subdomains + dork hits in DB

---

## Phase 7: Liveness Probe [x]

- [x] `backend/alembic/versions/002_scan_assets_url_nullable.py` — make scan_assets.url nullable (passive assets only have hostname until probe runs); fix dns_records server_default from '{}' to '[]'
- [x] `backend/app/scans/models.py` — url: Mapped[str|None] nullable=True; dns_records: Mapped[list] with correct default
- [x] `backend/app/recon/probe.py` — probe_all_assets(): loads all ScanAssets, runs _probe_one() concurrently (Semaphore(20)); per asset tries https→http fallback; any HTTP response=live (SSL verify=False); captures final URL/status_code/title/headers/waf_detected; WARN logged per non-live asset; bulk UPDATE in single commit
- [x] `_detect_waf()` — checks response headers (cf-ray, x-sucuri-id, x-datadome-cid, x-ddos-guard) and Server header for Cloudflare/Sucuri/DDoS-Guard/Imperva/Akamai
- [x] Orchestrator Stage 2 wired: `_run_probe_stage()` — for active scans creates initial ScanAsset via `_create_active_target_asset()` (url=target, hostname from urlparse); then calls probe_all_assets(); comprehensive scans probe all passive-stage assets
- [ ] Verify: unreachable host gets `scan_status=unreachable` and is skipped by active modules

---

## Phase 8: Active Recon [x]

- [x] `backend/app/recon/active/portscan.py` — nmap -sV --open -T4 -oX; port_config→flags (top100/-F, top1000/--top-ports 1000, http_only/-p 80..., custom/-p); XML parsed with ElementTree; extracts hostname from URL via urlparse
- [x] `backend/app/recon/active/fingerprint.py` — whatweb -q --log-json -oX; parses plugins dict → [{name, version, confidence}]; strips "(Debian)"-style suffixes from version strings
- [x] `backend/app/recon/active/screenshots.py` — single GoWitness container for ALL live URLs; printf '%s\n' builds URL file in-container; reads gowitness.sqlite3 from shared volume via thread executor; updates screenshot_path per asset; defensive fallback for v2/v3 SQLite schema differences
- [x] `backend/app/recon/active/cve.py` — NVD API v2 keyword search per versioned tech; Semaphore(1 no-key / 5 with-key) + 6s inter-call sleep; 30s retry on 429; 24h DB cache (cve_cache) with ON CONFLICT UPDATE; writes scan_cves ON CONFLICT DO NOTHING; CVSS score filter ≥ 4.0
- [x] Orchestrator Stage 3 wired: _run_active_stage() — loads live ScanAssets; GoWitness runs as asyncio.create_task in background; Semaphore(5) for concurrent per-asset processing; portscan+fingerprint parallel per asset; CVE detection follows tech fingerprinting; per-asset errors logged and continue
- [ ] Verify: active scan against a live web server produces tech badges + screenshot + CVEs

---

## Phase 9: Secondary Scan Suggestions [x]

- [x] `backend/app/recon/secondary/templates.py` — SCAN_TEMPLATES dict (wordpress/apache/nginx/tomcat/jenkins/php/_default) + frozen ScanTemplate dataclass (scan_type, display_name, description, risk_level, base_priority)
- [x] `backend/app/recon/secondary/suggestions.py` — `generate_suggestions(asset, techs, log_fn)`: loads CVEs per asset, boosts priority +40 if any CVSS ≥ 7.0; substring match on tech names; deduplicates by scan_type; always appends _default templates; writes suggested_scans rows
- [x] `backend/app/recon/secondary/executor.py` — `trigger_suggested_scan(suggestion_id)`: dispatches on scan_type; builds shell command with shlex.quote'd user values; nuclei_cve mounts nuclei_templates_vol ro; per-type timeouts (nuclei=600s, others=300s); `_summarise()` parses tool output to plain-text result_summary; marks status=completed/failed
- [x] Orchestrator: generate_suggestions() called inside _process() after CVE detection (per-asset, not post-stage); removed stale post-stage comment
- [x] `POST /api/v1/scans/{id}/suggested/{sid}/trigger` — implemented: marks status=running, sets triggered_by+triggered_at, fires asyncio.create_task; allows re-trigger of failed suggestions; returns TriggerSuggestedResponse
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
- **Phase 3: Scan Lifecycle** — Scan/ScanAsset/ScanLog/ScanCVE/SuggestedScan models; validated CreateScanRequest (target format, module set, CVE→fingerprint dependency); CRUD + results + WS routes; pub/sub log bus; stub orchestrator
- **Phase 4: Docker Manager** — lazy Docker client singleton; thread-based async log streamer; run_ephemeral() with apt-install, timeout, firewall detection, container ID tracking, file extraction, guaranteed cleanup
- **Phase 5: Nuclei Updater** — staleness-checked background loop (24h); apt-installs nuclei in Kali container; rw-mounts nuclei_templates_vol; marks fresh on success; wired into lifespan; explicit volume names added to docker-compose.yml
- **Phase 6: Passive Recon** — dns.py (dnsrecon, normalised records), subdomains.py (subfinder+crtsh parallel), dorking.py (DDG HTML, 4 queries, rate-limited), ip_profiling.py (ipinfo.io); orchestrator rewritten with _make_log_fn, asyncio.gather gather stage, _save_passive_results DB writer
- **Phase 7: Liveness Probe** — migration 002 (url nullable, dns_records default fix); probe.py (Semaphore(20), https→http fallback, verify=False, WAF detection, bulk DB update); orchestrator Stage 2 wired for active+comprehensive; active scans get initial ScanAsset created before probe runs
- **Phase 8: Active Recon** — portscan.py (nmap XML, port_config presets), fingerprint.py (WhatWeb JSON), screenshots.py (GoWitness batch + SQLite mapping), cve.py (NVD v2 + DB cache + CVSS filter); orchestrator Stage 3 wired with Semaphore(5) per-asset + GoWitness background task
- **Phase 9: Secondary Scan Suggestions** — templates.py (6 tech keys + _default; frozen ScanTemplate dataclass), suggestions.py (CVE-boosted priority, substring tech match, per-asset dedup), executor.py (5 scan_type dispatch, shlex.quote, nuclei vol mount, _summarise per type); orchestrator wired in _process(); trigger endpoint implemented (running→completed/failed lifecycle)
