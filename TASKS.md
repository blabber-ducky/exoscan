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

## Phase 10: Frontend [x]

- [x] `frontend/package.json` — React 18, Vite 5, Tailwind v4 + @tailwindcss/vite, Radix UI primitives, TanStack Query v5, Zustand v5, React Router v6, Axios, React Hook Form + Zod, Sonner, Lucide React, clsx + tailwind-merge + cva
- [x] `vite.config.ts` — @tailwindcss/vite plugin, @/→src alias, /api+/static dev proxy to :8000
- [x] `tsconfig.json` — ESNext/bundler moduleResolution, jsx=react-jsx, @/* path alias
- [x] `index.html` — class="dark" on <html> for dark-first theme
- [x] `src/index.css` — Tailwind v4 @import, @theme inline mapping CSS vars to Tailwind color names, :root + .dark OKLCH color variables (emerald primary, near-black background)
- [x] `src/lib/utils.ts` — cn() helper (clsx + tailwind-merge)
- [x] `src/types/index.ts` — Scan, ScanAsset, Technology, CVE, SuggestedScan, OpenPort, DnsRecord, DorkHit, WsLogLine, TokenPair, User, PagedScans, CreateScanPayload
- [x] `src/api/client.ts` — Axios + Bearer token interceptor + 401 refresh-and-retry (single in-flight _refreshing promise prevents concurrent refresh races)
- [x] `src/api/auth.ts`, `src/api/scans.ts` — typed API wrappers
- [x] `src/api/ws.ts` — createScanLogSocket(): derives wss:/ws: from window.location.protocol, delegates to onMessage/onClose callbacks; skips ping frames
- [x] `src/store/authStore.ts` — Zustand + zustand/middleware persist (localStorage key "auth")
- [x] `src/store/scanStore.ts` — Zustand for log lines, WS status, terminal status; reset() for navigation
- [x] `src/hooks/useAuth.ts` — useLogin, useRegister (TanStack Query mutations → setTokens + authApi.me), useLogout
- [x] `src/hooks/useScans.ts` — useScanList (5s poll), useScan (3s poll while running/pending), useCreateScan (→/scans/:id), useDeleteScan, useTriggerSuggested
- [x] `src/hooks/useScanResults.ts` — useQuery with 30s staleTime
- [x] `src/hooks/useScanLogs.ts` — opens WS on mount, writes to scanStore, handles complete/error events, closes WS on unmount
- [x] shadcn/ui components: Button (cva variants), Card/CardHeader/CardContent/CardFooter, Badge (cva), Input, Label (Radix), Checkbox (Radix), RadioGroup (Radix), Separator (Radix), Tabs (Radix), Dialog (Radix + portal), Tooltip (Radix + portal), Sonner (Toaster wrapper)
- [x] `Navbar.tsx` — sticky, ScanSearch logo, username display, logout button
- [x] `Layout.tsx` — Navbar + <Outlet /> with max-w-7xl padding
- [x] `LoginForm.tsx`, `RegisterForm.tsx` — RHF + Zod, sonner error toasts
- [x] `LoginPage.tsx`, `RegisterPage.tsx` — redirect to /dashboard if already authed
- [x] `NewScanForm.tsx` — 4-step wizard: 1) scan type radio cards; 2) target text input with per-type regex validation; 3) module checkboxes (passive/active sections, cve_detection auto-disabled when tech_fingerprinting unchecked); 4) port config presets + custom input (only shown when port_scan selected); step counter + back/next/submit nav
- [x] `ScanCard.tsx` — icon per scan_type, ScanStatusBadge, asset/CVE counts, delete + view buttons
- [x] `ScanStatusBadge.tsx` — variant Badge per status (pending/running with pulse/completed green/failed red)
- [x] `LogViewer.tsx` — fixed-height terminal div, auto-scroll to bottom on new lines, level-colored output (WARN=yellow, ERROR=red)
- [x] `ScanProgress.tsx` — stage stepper derived from scan_type + latest log stage; done/active/pending states
- [x] `PassiveReconPanel.tsx` — Tabs: DNS records table (type/name/value), subdomain list with status dots, dork hits with URL+title+snippet
- [x] `TechBadge.tsx` — Badge with name + dimmed version, Tooltip shows confidence
- [x] `CVEList.tsx` — per-CVE severity badge + cve_id link to NVD + CVSS score + description excerpt
- [x] `SuggestedScans.tsx` — sorted by priority; trigger button fires useTriggerSuggested; running=spinner, completed=check, failed=X; result_summary shown when complete
- [x] `AssetCard.tsx` — screenshot preview, hostname/url/status_code/WAF header, tech badges, port/CVE/suggestion counts; expand toggle → Tabs (Ports/CVEs/Suggested); live assets full opacity, non-live at 70%
- [x] `AssetGrid.tsx` — 3-col responsive grid, live assets first sorted by CVE count
- [x] `DashboardPage.tsx` — scan list + "New Scan" Dialog; empty state CTA; polls via useScanList
- [x] `ScanPage.tsx` — scan metadata, ScanProgress, LogViewer, WS status indicator; auto-redirects to /results 1.5s after WS complete event
- [x] `ResultsPage.tsx` — stats row (assets/live/CVEs), PassiveReconPanel for passive/comprehensive, AssetGrid for all types
- [x] `router.tsx` — RequireAuth guard, /login + /register (redirect if authed), / → /dashboard
- [x] `App.tsx` — QueryClientProvider + RouterProvider + Toaster
- [x] `frontend/Dockerfile` — changed npm ci → npm install (no lock file to commit)
- [ ] End-to-end UI test: full comprehensive scan visible in browser

---

## Phase 11: Security Hardening [x]

- [x] Target input validation — _DOMAIN_RE / _URL_RE / _is_ipv4 validators already in CreateScanRequest; model_validator enforces per scan_type (active→URL or IPv4, passive/comprehensive→domain or IPv4)
- [x] Port config validation — _PORT_RANGE_RE format check + new _valid_port_ranges() sanity check (all tokens must parse as ints 1–65535; ranges must have start ≤ end)
- [x] `shlex.quote()` audit — confirmed: dns.py, subdomains.py, portscan.py, fingerprint.py, screenshots.py, executor.py all quote user-derived shell arguments; container.py quotes tool names; no unquoted user value interpolated into any command string
- [x] CORS locked — `allow_origins=[settings.frontend_url]` already in place; only the `FRONTEND_URL` env var origin is allowed
- [x] `slowapi` rate limiting — `app/limiter.py` (Limiter with get_remote_address key); SlowAPIMiddleware + RateLimitExceeded handler wired into main.py; `@limiter.limit("5/minute")` on /auth/register, /auth/login, /auth/refresh; request: Request added as first param per slowapi requirement
- [x] No `shell=True` — grep confirmed: zero uses of shell=True across entire backend codebase; all Docker containers use the Docker SDK (not subprocess); shlex usage is for quoting args passed to container command strings, not shell invocation

---

## Phase 12: Documentation [x]

- [x] `docs/architecture.md` — ASCII system diagram (Docker host layout, 3 services, 3 volumes, exoscan_net); scan lifecycle sequence diagram (5 columns: Browser→Frontend→Backend API→Orchestrator→Kali containers); backend package layout tree; key design decisions (no Celery, ephemeral containers, pub/sub log bus, nuclei volume, screenshot pipeline, suggestion generation)
- [x] `docs/developer.md` — prerequisites + first-time setup; env var reference table; alembic migration workflow; step-by-step guide to adding a passive module, active module, and secondary scan template; run-a-tool-in-isolation section (manual Kali container + run_ephemeral from Python shell); frontend-outside-Docker dev workflow; code style notes (no comments, no shell=True, shlex.quote rule, asyncio.gather usage)
- [x] `docs/user.md` — plain-English scan type descriptions (passive/active/comprehensive); per-module table with tool and what it does; CVE Detection dependency explanation; port config preset table + custom syntax; results page guide (scan progress, stage stepper, WS log stream, passive panel tabs, asset card anatomy, suggested scans priority system); asset scan status table (live/unreachable/timeout/filtered); limitations section (rate limiting, CVE coverage, screenshot reliability, container cold start, nuclei update lag); responsible use statement
- [x] `CLAUDE.md` — no changes needed; all patterns documented in CLAUDE.md already reflect the final implementation

---

## Phase 13: CI/CD — Multi-arch Image Builds [x]

- [x] `.github/workflows/build.yml` — triggers on push to `main`; `changes` job uses `dorny/paths-filter@v3` to detect `backend/**` and `frontend/**` changes so only affected images rebuild; root-only changes (docs, README) skip both builds
- [x] `build-backend` job — sets up QEMU + Buildx; logs into Docker Hub with `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets; uses `docker/metadata-action@v5` to tag `latest` + short SHA; builds `exoscan-be` for `linux/amd64,linux/arm64` with GHA layer cache (`scope=exoscan-be`)
- [x] `build-frontend` job — identical pattern for `exoscan-fe`; both jobs run in parallel when both paths change
- [x] `docker-compose.yml` — `image: ${DOCKERHUB_USERNAME:-your-dockerhub-username}/exoscan-be:${TAG:-latest}` added to backend service; same for frontend with `exoscan-fe`; `build:` directive retained so `docker compose up --build` still works for local development
- [x] `.env.example` — added `DOCKERHUB_USERNAME` and `TAG=latest`; deployment vs local-dev workflow documented in comments

**GitHub repo secrets required** (Settings → Secrets → Actions):
- `DOCKERHUB_USERNAME` — your Docker Hub username
- `DOCKERHUB_TOKEN` — Docker Hub access token (Hub → Account Settings → Personal Access Tokens)

**Deployment workflow (pre-built images):**
```bash
# set DOCKERHUB_USERNAME in .env first
docker compose pull
docker compose up -d
```

**Local development workflow (build from source):**
```bash
docker compose up --build
```

---

## Phase 14: Scan Lifecycle Controls + Per-asset Active Scans [x]

- [x] `backend/alembic/versions/004_scan_completed_stages.py` — adds `completed_stages JSONB DEFAULT '[]'` to `scans` table for pause/resume checkpoint tracking
- [x] `backend/alembic/versions/005_scan_status_paused.py` — expands `chk_scan_status` CHECK constraint to include `'paused'`
- [x] `backend/app/scans/models.py` — `completed_stages: Mapped[list]` column added to `Scan` ORM model
- [x] `backend/app/scans/schemas.py` — `PatchScanRequest` (modules + port_config), `completed_stages` in `ScanResponse`, `asset_ids` in `FollowupActiveRequest`, `ScanStatus` literal type
- [x] `backend/app/scans/service.py` — `scan_to_response` includes `completed_stages`
- [x] `backend/app/scans/router.py` — `POST /{id}/cancel` (keeps record), `POST /{id}/pause`, `POST /{id}/resume`, `PATCH /{id}` (modules/port_config, pending/paused only); followup endpoint filters by `asset_ids` when provided
- [x] `backend/app/recon/orchestrator.py` — `run_scan()` rewritten with pause/resume: checks DB status after each stage (`_is_stopped`), skips already-`completed_stages`, resumes from correct point; `_mark_stage()` helper
- [x] `frontend/src/types/index.ts` — `ScanStatus` type, `completed_stages` in `Scan`, `asset_ids` in `FollowupActivePayload`
- [x] `frontend/src/api/scans.ts` — `cancel`, `pause`, `resume`, `patch` API functions
- [x] `frontend/src/hooks/useScans.ts` — `useCancelScan`, `usePauseScan`, `useResumeScan`, `usePatchScan` mutations
- [x] `frontend/src/components/scans/ScanStatusBadge.tsx` — `paused` status variant (yellow)
- [x] `frontend/src/pages/ScanPage.tsx` — Cancel / Pause / Resume / Edit buttons in header (conditional on ownership + status); `EditScanDialog` integration
- [x] `frontend/src/components/scans/EditScanDialog.tsx` — dialog for modifying modules and port config on pending/paused scans; warns about completed stages
- [x] `frontend/src/components/scans/ActiveFollowupDialog.tsx` — rewritten: asset multi-select with individual checkboxes, filter input, group quick-select by status (Live/Unreachable/etc.), all/none toggle, >20-asset warning; sends `asset_ids` in payload
- [x] `frontend/src/components/results/AssetCard.tsx` — Zap button per asset opens `AssetScanDialog`
- [x] `frontend/src/components/scans/AssetScanDialog.tsx` — per-asset active scan dialog (module selection + port config); target derived from asset.url → https://{hostname} → ip_address
- [x] `frontend/src/pages/ResultsPage.tsx` — passes `assets` array to `ActiveFollowupDialog`
- [x] `exoscan-testing/test_runner.py` — `Session.patch()` added; `run_scan_lifecycle()` tests cancel/pause/resume/patch endpoints (85/0/6 pass/fail/skip in full suite)

---

## Phase 15: Rename scan → recon (UI terminology) [x]

- [x] `frontend/src/types/index.ts` — exported `ScanType` type + `SCAN_TYPE_LABELS` map (`passive`→`Passive Recon`, `active`→`Active Recon`, `comprehensive`→`Comprehensive Recon`); DB enum values unchanged
- [x] `frontend/src/components/scans/NewScanForm.tsx` — step label "Recon Type", radio cards "Passive/Active/Comprehensive Recon", validation messages use "recon", submit button "Launch Recon"
- [x] `frontend/src/components/scans/ScanCard.tsx` — uses `SCAN_TYPE_LABELS[scan.scan_type]` instead of `capitalize(scan.scan_type)`
- [x] `frontend/src/pages/ScanPage.tsx` — `SCAN_TYPE_LABELS` for type display; toast messages updated to "recon"
- [x] `frontend/src/pages/ResultsPage.tsx` — `SCAN_TYPE_LABELS` for type display; "Active Recon Assets" button
- [x] `frontend/src/pages/DashboardPage.tsx` — "Recon History" heading, "New Recon" button, "No recons yet" empty state
- [x] `frontend/src/components/scans/EditScanDialog.tsx` — title "Edit Recon", toasts updated to "recon"
- [x] `frontend/src/components/scans/AssetScanDialog.tsx` — title "Active Recon", toast updated
- [x] `frontend/src/components/scans/ActiveFollowupDialog.tsx` — title "Run Active Recon on Discovered Assets", toasts + button text updated
- [x] `backend/app/recon/orchestrator.py` — log messages: "Recon started/resumed/completed/failed/paused/cancelled"
- [x] `backend/app/scans/router.py` — all HTTP error `detail` strings updated to "recon" terminology

---

## Phase 16: LLM Provider Settings [ ]

User-scoped LLM configuration stored in the DB, encrypted at rest. Required before AI Pentest can run.

**Data model (migration 006):**
- [ ] `backend/alembic/versions/006_user_settings.py` — new `user_settings` table:
  - `id UUID PK`, `user_id UUID FK UNIQUE`, `llm_provider VARCHAR(50) DEFAULT 'openai'`, `llm_model VARCHAR(100) DEFAULT 'gpt-4o'`, `llm_api_key_encrypted TEXT nullable`, `perplexity_api_key_encrypted TEXT nullable`, `strix_telemetry BOOL DEFAULT false`, `strix_default_scan_mode VARCHAR(20) DEFAULT 'standard' CHECK(quick/standard/deep)`, `strix_default_max_budget_usd NUMERIC(6,2) DEFAULT 10.00`, `created_at`, `updated_at`

**Backend:**
- [ ] `backend/app/settings/models.py` — `UserSettings` ORM model mapped to `user_settings` table
- [ ] `backend/app/settings/schemas.py` — `UserSettingsRequest` (all optional fields), `UserSettingsResponse` (llm_api_key and perplexity_api_key returned as masked string `sk-...****` if set, else null); `LLM_PROVIDERS` enum literal
- [ ] `backend/app/settings/service.py` — `get_or_create_settings(db, user_id)`, `update_settings(db, user_id, req)`, `encrypt_key(value) → bytes`, `decrypt_key(blob) → str` — Fernet encryption using `SECRET_KEY` as master (SHA-256 derived to 32-byte Fernet key)
- [ ] `backend/app/settings/router.py` — `GET /api/v1/settings` (returns current user's settings, API keys masked), `PUT /api/v1/settings` (upsert; validates provider/model not empty if api_key provided); `POST /api/v1/settings/test-connection` (spawns a trivial LLM call to verify key works — uses `litellm` installed in backend requirements)
- [ ] `backend/app/main.py` — mount settings router at `/api/v1/settings`
- [ ] `backend/requirements.txt` — add `cryptography` (Fernet), `litellm` (connection test)

**Frontend:**
- [ ] `frontend/src/types/index.ts` — `UserSettings` interface, `LLM_PROVIDERS` constant (openai/anthropic/google/aws_bedrock/azure/openrouter/ollama)
- [ ] `frontend/src/api/settings.ts` — `getSettings()`, `updateSettings(req)`, `testConnection()`
- [ ] `frontend/src/hooks/useSettings.ts` — `useSettings` (query), `useUpdateSettings` (mutation → invalidates), `useTestConnection` (mutation → toast)
- [ ] `frontend/src/pages/SettingsPage.tsx` — provider dropdown (labelled list: OpenAI / Anthropic / Google Vertex AI / AWS Bedrock / Azure OpenAI / OpenRouter / Ollama); model text input with per-provider placeholder; API key password input (shows masked value if set, clears to re-enter); Perplexity API key (optional, for OSINT in strix); Telemetry toggle; Default scan mode radio (Quick/Standard/Deep); Default budget cap number input; "Save Settings" button; "Test Connection" button (shows spinner then success/error toast)
- [ ] `frontend/src/components/layout/Navbar.tsx` — Settings link (gear icon) next to logout; visible to all authenticated users
- [ ] `frontend/src/router.tsx` — `/settings` route inside Layout

---

## Phase 17: Strix AI Pentest Integration [ ]

Integrates [Strix](https://github.com/usestrix/strix) as a new recon type. Strix is an AI-powered multi-agent pentesting platform that uses LiteLLM (OpenAI / Anthropic / Google / etc.) to autonomously discover and validate vulnerabilities. Users trigger it from a completed passive or comprehensive recon result.

**Architecture notes:**
- Strix is installed via `pip install strix-agent` and invoked as a subprocess (or in a dedicated runner container)
- The runner container is a slim Python image (`python:3.12-slim`) with Docker socket mounted — strix spawns its own sandbox containers (`ghcr.io/usestrix/strix-sandbox:1.0.0`) on the host via the socket
- Strix output: `strix_runs/<run-name>/` directory containing `vulnerabilities.json` with findings (CVSS, reproduction steps, patches)
- Strix is always called with `--non-interactive` for unattended operation
- LLM config comes from the calling user's `user_settings` row (decrypted per-request)
- `--max-budget-usd` cap enforced to prevent runaway costs
- A `parent_scan_id` FK links each pentest scan back to the source passive/comprehensive recon

**Data model (migrations 007, 008):**
- [ ] `backend/alembic/versions/007_scan_type_pentest.py` — two changes:
  1. Drop and recreate `chk_scan_type` constraint to add `'pentest'`
  2. Add `parent_scan_id UUID nullable FK → scans(id) ON DELETE SET NULL` column to `scans`
- [ ] `backend/alembic/versions/008_pentest_findings.py` — new `pentest_findings` table:
  - `id UUID PK`, `scan_id UUID FK NOT NULL`, `title VARCHAR(500)`, `severity CHECK(INFORMATIONAL/LOW/MEDIUM/HIGH/CRITICAL)`, `cvss_score NUMERIC(4,1) nullable`, `cve_ids JSONB DEFAULT '[]'`, `affected_endpoint VARCHAR(1000) nullable`, `description TEXT`, `reproduction_steps TEXT nullable`, `patch_suggestion TEXT nullable`, `raw_output JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ`
  - Index: `(scan_id, severity)`

**Backend:**
- [ ] `backend/app/scans/models.py` — `parent_scan_id: Mapped[UUID | None]` + `PentestFinding` ORM model
- [ ] `backend/app/scans/schemas.py` — extend `CreateScanRequest` to accept `scan_type="pentest"`; add `pentest_config: PentestConfig | None` (scan_mode, instructions, max_budget_usd, asset_ids from parent scan); `PentestFindingResponse`; `PentestResultsResponse`; `parent_scan_id` in `ScanResponse`
- [ ] `backend/app/scans/service.py` — `get_pentest_results(db, scan_id, user_id)` — returns `PentestResultsResponse` with findings sorted by severity
- [ ] `backend/app/scans/router.py` — `GET /api/v1/scans/{id}/pentest-results` endpoint (auth: owner or shared viewer)
- [ ] `backend/app/recon/pentest/__init__.py` + `strix.py`:
  - `run_strix(scan_id, targets, strix_cfg, llm_settings, log_fn)` — pulls `python:3.12-slim`; runs `pip install strix-agent -q && strix -t {t1} -t {t2} ... --non-interactive --scan-mode {mode} [--instruction {inst}] [--max-budget-usd {budget}]`; mounts `/var/run/docker.sock` + `pentest_results_vol:/strix_runs`; streams stdout to log bus; `timeout_seconds=7200` (2h for deep scans)
  - `parse_strix_output(scan_id, run_dir, db)` — reads `vulnerabilities.json` from mounted volume path; maps Strix severity → our CHECK values; writes `pentest_findings` rows
  - **All target values passed through `shlex.quote()`**; instructions sanitised (alphanumeric + punctuation only, 500 char max)
- [ ] `backend/app/recon/orchestrator.py` — new branch for `scan_type == "pentest"`: fetch user settings (decrypt LLM key), validate LLM settings present, run `_run_pentest_stage()` (calls `run_strix()`), parse results, set `completed` or `failed`
- [ ] `docker-compose.yml` — new named volume `pentest_results_vol`; mount in backend at `/app/pentest_results`
- [ ] `backend/requirements.txt` — no new deps (strix installed at runtime in runner container)
- [ ] `.env.example` — document `PENTEST_RESULTS_PATH=/app/pentest_results`

**Frontend:**
- [ ] `frontend/src/types/index.ts` — extend `ScanType` to include `'pentest'`; add `'AI Pentest'` to `SCAN_TYPE_LABELS`; `PentestFinding`, `PentestResultsResponse` interfaces; extend `Scan` with `parent_scan_id?: string`
- [ ] `frontend/src/api/scans.ts` — `getPentestResults(scanId)` function
- [ ] `frontend/src/hooks/useScans.ts` — `usePentestResults(scanId)` query
- [ ] `frontend/src/components/scans/NewScanForm.tsx` — "AI Pentest" radio card in step 1 (shows warning icon if LLM not configured; links to Settings); step 3 for pentest shows: scan mode radio (Quick ~5min / Standard ~30-60min / Deep ~1-4hr), instructions textarea (optional, max 500 chars), budget cap number input; step 4 (port config) hidden for pentest type
- [ ] `frontend/src/components/scans/ScanProgress.tsx` — pentest stages: `preparing` → `ai_pentest` → `parsing`
- [ ] `frontend/src/pages/ResultsPage.tsx` — "Run AI Pentest" button (passive/comprehensive + completed + is_owner); `PentestDialog` integration
- [ ] `frontend/src/components/scans/PentestDialog.tsx` — triggered from ResultsPage; asset multi-select (same pattern as ActiveFollowupDialog but filtered to live assets only by default); scan mode / instructions / budget fields; shows warning if LLM not configured (link to /settings); cost estimate note per scan mode; creates a `pentest` type scan via `POST /api/v1/scans` with `parent_scan_id`
- [ ] `frontend/src/pages/PentestResultsPage.tsx` — route `/results/:id/pentest`; fetches `GET /api/v1/scans/{id}/pentest-results`; severity filter chips (Critical/High/Medium/Low/Info); findings list with expandable cards: title, severity badge, CVSS, affected endpoint, description, reproduction steps accordion, patch suggestion, raw output toggle; "N vulnerabilities found" summary header
- [ ] `frontend/src/components/results/PentestFindingCard.tsx` — single finding card component
- [ ] `frontend/src/router.tsx` — `/results/:id/pentest` route
- [ ] `frontend/src/components/scans/ScanCard.tsx` — pentest type card: shows parent recon target, links to `/results/:id/pentest` instead of `/results/:id`; finding count (from `pentest_findings_count` in ScanResponse)
- [ ] `frontend/src/components/scans/ScanStatusBadge.tsx` — no change needed (pentest uses same status values)

**Security:**
- [ ] Strix `--instruction` content sanitised: strip control chars, max 500 chars, passed via `shlex.quote()`
- [ ] LLM API key decrypted in-memory only, never logged, never returned in API responses
- [ ] Pentest runner container inherits Docker socket risk (same as existing backend) — documented
- [ ] `--non-interactive` mandatory (prevents strix from blocking on stdin)
- [ ] `--max-budget-usd` always set (defaults to user setting, max 100 enforced server-side)

**Test additions (`exoscan-testing/test_runner.py`):**
- [ ] `run_settings_tests()` — GET settings returns defaults; PUT updates llm_provider/model; PUT with api_key stores (returned masked); test-connection with no key → 400
- [ ] `run_pentest_tests()` — POST pentest scan without LLM config → 400; POST pentest scan with mocked settings → 201 (skip actual strix execution in tests)

---

## Phase 14: Sharing & Groups [x]

**Data model (migration 003):**
- [x] `is_admin BOOL` added to `users`
- [x] `groups` table — id, name (unique), description, created_by, created_at
- [x] `group_members` table — (group_id, user_id) composite PK, added_at; CASCADE on both FKs
- [x] `scan_shares` table — id, scan_id (CASCADE), shared_by, shared_with_user_id (nullable), shared_with_group_id (nullable); CHECK: exactly one target non-null; UNIQUE per (scan, user) and (scan, group); indexes on scan_id + both target columns

**Backend models:**
- [x] `auth/models.py` — `User.is_admin` + new `Group` + `GroupMember` ORM classes
- [x] `scans/models.py` — `ScanShare` ORM class with table constraints

**Access control:**
- [x] `dependencies.py` — `require_admin` dependency (403 if not is_admin)
- [x] `scans/service.py` — `_has_share_access()` SQLAlchemy or_ clause (direct user share OR group membership share); `get_accessible_scan_or_404()` (owner or shared viewer, returns (scan, is_owner, owner_username)); `list_scans()` returns (Scan, owner_username) rows with shared scans included; `list_shares()` helper; `scan_to_response()` accepts is_owner + owner_username
- [x] `scans/router.py` — read routes (GET scan, GET results, WS) use get_accessible_scan_or_404; mutation routes (DELETE, trigger, share management) remain owner-only via get_scan_or_404
- [x] WS handler updated to check owner OR share access before accepting connection

**Sharing routes** (`POST /api/v1/scans/{id}/shares/users`, `/groups`; `DELETE /api/v1/scans/{id}/shares/{share_id}`; `GET /api/v1/scans/{id}/shares`):
- [x] Share-with-user: validates target exists, not self, not already shared
- [x] Share-with-group: enforces user is a member of the group before allowing share (users can only share with groups they belong to)
- [x] Revoke: owner-only delete of a specific ScanShare row

**Utility routes:**
- [x] `GET /api/v1/scans/groups/mine` — groups the current user belongs to (for ShareDialog)
- [x] `GET /api/v1/scans/users/search?q=` — username search for direct sharing (ilike, excludes self, max 20 results)

**Admin routes** (`/api/v1/admin/*`, all gated by require_admin):
- [x] `GET /admin/users[?search=]` — all users with email, is_admin, is_active, group memberships
- [x] `GET /admin/groups` — all groups with members list
- [x] `POST /admin/groups` — create group (409 on duplicate name)
- [x] `DELETE /admin/groups/{id}` — delete group (CASCADE removes memberships + scan_shares targeting it)
- [x] `POST /admin/groups/{id}/members` — add user to group (409 if already member)
- [x] `DELETE /admin/groups/{id}/members/{user_id}` — remove user from group

**Admin auto-promotion:**
- [x] `config.py` — `admin_email: str = ""` setting; `.env.example` documents ADMIN_EMAIL
- [x] `auth/router.py` register: sets is_admin=True if email matches ADMIN_EMAIL at creation time
- [x] `auth/router.py` login: promotes existing user to admin if email matches ADMIN_EMAIL (handles post-registration config changes)

**ScanResponse additions:**
- [x] `is_owner: bool` — True if current user owns the scan
- [x] `owner_username: str | None` — username of scan owner (only populated for shared scans in list/get)

**Frontend:**
- [x] `types/index.ts` — User.is_admin; Scan.is_owner + owner_username; UserSummary, GroupSummary, GroupMember, Group, AdminUser, ScanShare interfaces
- [x] `api/admin.ts` — listUsers, listGroups, createGroup, deleteGroup, addMember, removeMember
- [x] `api/shares.ts` — listShares, shareWithUser, shareWithGroup, revokeShare, myGroups, searchUsers
- [x] `hooks/useAdmin.ts` — useAdminUsers, useAdminGroups, useCreateGroup, useDeleteGroup, useAddMember, useRemoveMember (all invalidate admin query keys on success)
- [x] `hooks/useShares.ts` — useScanShares, useMyGroups, useUserSearch, useShareWithUser, useShareWithGroup, useRevokeShare
- [x] `components/scans/ShareDialog.tsx` — Dialog with Groups tab (user's groups, Share/Shared toggle) and Users tab (username search, Share/Shared toggle); current shares listed at top with revoke; owner-only
- [x] `components/scans/ScanCard.tsx` — Share button (owner + completed only); owner_username shown for shared scans; delete button hidden for non-owners
- [x] `components/admin/GroupManager.tsx` — expandable group rows with member list + remove; user search to add members; create group form
- [x] `pages/AdminPage.tsx` — Groups tab (GroupManager) + Users tab (user list with group badges)
- [x] `components/layout/Navbar.tsx` — Admin link with Shield icon shown when user.is_admin
- [x] `router.tsx` — `/admin` route inside Layout, guarded by RequireAdmin (redirects non-admin to /dashboard)

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
- **Phase 10: Frontend** — Vite 5 + Tailwind v4 + shadcn/ui (12 Radix components); 4-step NewScanForm wizard; JWT Axios client with refresh-retry; Zustand auth + scan stores; TanStack Query for API data; WebSocket log streaming via useScanLogs; LogViewer terminal; ScanProgress stepper; PassiveReconPanel (DNS/Subdomains/Dorks tabs); AssetGrid/AssetCard with screenshots, tech badges, CVE list, SuggestedScans trigger buttons; dark emerald theme
- **Phase 11: Security Hardening** — slowapi Limiter (5/min per IP on register/login/refresh); port range sanity check (_valid_port_ranges: 1–65535 bounds, range start≤end); audit confirmed shlex.quote on all user-derived shell args, CORS locked to FRONTEND_URL, no shell=True anywhere
- **Phase 12: Documentation** — docs/architecture.md (system diagram + sequence diagram + package layout + design decisions), docs/developer.md (setup + migrations + module extension guides + isolation testing), docs/user.md (scan types + modules + results interpretation + limitations + responsible use)
- **Phase 13: CI/CD** — `.github/workflows/build.yml`: path-filtered multi-arch builds (amd64 + arm64) for `exoscan-be` and `exoscan-fe` on push to main; Docker Hub push with `latest` + SHA tags via `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets; GHA layer cache per image; docker-compose.yml updated with `image:` fields (`${DOCKERHUB_USERNAME}/exoscan-be/fe:${TAG:-latest}`); `build:` retained for local dev; `.env.example` documents `DOCKERHUB_USERNAME` + `TAG`
- **Phase 14: Sharing & Groups** — migration 003 (is_admin + groups + group_members + scan_shares); Group/GroupMember models; ScanShare model with exactly-one-target constraint; require_admin dependency; scan access widened to owner-or-shared-viewer on all read paths (WS included); share-with-group enforces membership (users can only share with groups they belong to); admin router (group CRUD + user membership management); ADMIN_EMAIL auto-promotion on register/login; ShareDialog (groups tab + user search tab + revoke); ScanCard share button + owner attribution; AdminPage (groups + users panels); Navbar admin link; /admin route with RequireAdmin guard
