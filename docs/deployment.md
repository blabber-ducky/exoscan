# Exoscan — Deployment & Maintenance

## Initial Deployment

### Prerequisites

- A Linux host (amd64 or arm64) with Docker Engine v24+ and the Compose plugin
- Ports 3000 (frontend) and optionally 8000 (API) reachable from your clients
- Internet access from the host (required to pull images and Kali tool packages at scan time; also required by Strix sandbox containers during AI Pentest runs)

### Deploy with pre-built images (recommended)

No git clone or build step required.

```bash
# 1. Download the two required files
wget https://raw.githubusercontent.com/blabber-ducky/exoscan/main/docker-compose.yml
wget https://raw.githubusercontent.com/blabber-ducky/exoscan/main/.env.example -O .env

# 2. Edit .env — minimum required values:
#   SECRET_KEY        → openssl rand -hex 32
#   POSTGRES_PASSWORD → a strong unique password
#   FRONTEND_URL      → http://<your-server-ip-or-domain>:3000
#   ADMIN_EMAIL       → your email address (optional, promotes account to admin)

# 3. Pull images and start
docker compose pull
docker compose up -d
```

Database migrations run automatically on backend startup via Alembic. The stack is ready when:

```bash
docker compose ps   # all three services: running
docker compose logs backend --tail 20   # look for "Application startup complete"
```

### Environment variable reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing secret and Fernet master key — `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_USER` | No | Default: `exoscan` |
| `POSTGRES_DB` | No | Default: `exoscan` |
| `FRONTEND_URL` | Yes | CORS allowed origin, no trailing slash |
| `ADMIN_EMAIL` | No | Email auto-promoted to admin on register/login |
| `NVD_API_KEY` | No | Raises NVD CVE rate limit from 5 → 50 req/30 s |
| `PENTEST_RESULTS_PATH` | No | Path inside the backend container where Strix writes output. Default: `/app/pentest_results` (set automatically by docker-compose) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default: 7 |

`DATABASE_URL`, `SCREENSHOT_BASE_PATH`, `NUCLEI_TEMPLATES_VOLUME`, `SCREENSHOTS_VOLUME`, and `DOCKER_NETWORK` are set automatically by docker-compose and do not need to be configured manually.

---

## Updating Exoscan

When a new version is pushed to `main`, the CI workflow builds and pushes updated images to Docker Hub automatically.

```bash
# Pull the latest images
docker compose pull

# Restart services with the new images
docker compose up -d
```

If the new version includes a database migration, the backend applies it automatically on startup. Check the logs to confirm:

```bash
docker compose logs backend --tail 30
# Look for: "Running upgrade <old> -> <new>"
# Then:     "Application startup complete"
```

If migration fails, the backend will exit. See [Troubleshooting](#troubleshooting).

### Pinning to a specific version

Images are tagged with both `latest` and the short Git SHA (e.g. `abc1234`). To pin to a specific release:

```bash
# In .env
TAG=abc1234

docker compose pull
docker compose up -d
```

---

## Backup

### What to back up

| Data | Location | Priority |
|------|----------|----------|
| PostgreSQL database | `exoscan_postgres_data` Docker volume | Critical |
| Screenshots | `exoscan_screenshots_vol` Docker volume | Optional |
| Pentest results (Strix output) | `exoscan_pentest_results_vol` Docker volume | Optional |
| `.env` file | Host filesystem | Critical |

Nuclei templates (`exoscan_nuclei_templates_vol`) do not need to be backed up — they are re-downloaded automatically on startup.

### Database backup

```bash
# Dump to a compressed file
docker compose exec postgres pg_dump -U exoscan exoscan | gzip > exoscan_db_$(date +%Y%m%d).sql.gz
```

### Screenshots backup

```bash
docker run --rm \
  -v exoscan_screenshots_vol:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/screenshots_$(date +%Y%m%d).tar.gz -C /data .
```

### Pentest results backup

```bash
docker run --rm \
  -v exoscan_pentest_results_vol:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pentest_results_$(date +%Y%m%d).tar.gz -C /data .
```

### Restore database

```bash
# Stop backend to prevent writes during restore
docker compose stop backend

# Restore from dump
gunzip -c exoscan_db_20260101.sql.gz | docker compose exec -T postgres psql -U exoscan exoscan

# Restart
docker compose start backend
```

### Restore screenshots

```bash
docker run --rm \
  -v exoscan_screenshots_vol:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/screenshots_20260101.tar.gz -C /data
```

---

## Migrating to a New Server

### Step 1 — Back up data on the old server

```bash
# On the old server
docker compose exec postgres pg_dump -U exoscan exoscan | gzip > exoscan_db.sql.gz

docker run --rm \
  -v exoscan_screenshots_vol:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/screenshots.tar.gz -C /data .

docker run --rm \
  -v exoscan_pentest_results_vol:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pentest_results.tar.gz -C /data .

# Copy backups and .env to the new server
scp exoscan_db.sql.gz screenshots.tar.gz pentest_results.tar.gz .env user@new-server:~/exoscan/
```

### Step 2 — Set up the new server

```bash
# On the new server
cd ~/exoscan

wget https://raw.githubusercontent.com/blabber-ducky/exoscan/main/docker-compose.yml

# .env was copied from the old server — update FRONTEND_URL if the IP/domain changed

# Start only postgres first so we can restore into it
docker compose up -d postgres
sleep 5   # wait for postgres to be healthy
```

### Step 3 — Restore data

```bash
# Restore database (skip migrations — data already contains the schema)
gunzip -c exoscan_db.sql.gz | docker compose exec -T postgres psql -U exoscan exoscan

# Restore screenshots
docker run --rm \
  -v exoscan_screenshots_vol:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/screenshots.tar.gz -C /data

# Restore pentest results (if you have them)
docker run --rm \
  -v exoscan_pentest_results_vol:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/pentest_results.tar.gz -C /data
```

### Step 4 — Start remaining services

```bash
docker compose pull
docker compose up -d
```

### Step 5 — Verify

```bash
docker compose ps           # all three running
docker compose logs backend --tail 20
curl http://localhost:8000/health   # should return {"status":"ok"}
```

Open the frontend in a browser, log in with your existing account, and confirm scans and results are present.

### Step 6 — Decommission the old server

Once verified, stop the old stack:

```bash
# On the old server
docker compose down
```

Do not remove volumes on the old server until you have confirmed the new server is fully operational.

---

## Manual Database Migrations

Migrations run automatically on backend startup. If you ever need to run them manually (e.g. after a restore into an older schema):

```bash
# Apply all pending migrations
docker compose exec backend alembic upgrade head

# Check current revision
docker compose exec backend alembic current

# Roll back one migration (use with caution in production)
docker compose exec backend alembic downgrade -1
```

---

## Troubleshooting

### Backend fails to start

```bash
docker compose logs backend
```

Common causes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `could not connect to server` | Postgres not yet healthy | Wait and retry; check `docker compose logs postgres` |
| `alembic.util.exc.CommandError` | Migration conflict | Check `alembic current`; resolve manually |
| `SECRET_KEY` errors | Missing env var | Verify `.env` has `SECRET_KEY` set |

### Scans stuck in `running`

The backend process restarted mid-scan. Scans do not auto-resume after a restart. Manually mark them failed:

```bash
docker compose exec postgres psql -U exoscan exoscan \
  -c "UPDATE scans SET status='failed', error_message='Interrupted by server restart' WHERE status='running';"
```

### AI Pentest scan fails immediately

Check the scan logs on the Scan Progress page for the specific error. Common causes:

| Error message | Fix |
|--------------|-----|
| `LLM API key not configured` | Visit `/settings` and save a valid API key for your provider |
| `Docker error running Strix` | Check `docker compose logs backend` and ensure the Docker socket is mounted correctly |
| `Strix exited with code 1` | Check the streaming logs — usually an authentication error with the LLM provider |
| `Strix timed out after 2 hours` | Deep scans on large targets may exceed the 2-hour limit; try Standard or Quick mode |

### Strix sandbox containers not cleaning up

Strix spawns its own `ghcr.io/usestrix/strix-sandbox` containers on the host. If a pentest run is interrupted, these may linger. Remove them:

```bash
docker ps -a --filter ancestor=ghcr.io/usestrix/strix-sandbox:1.0.0 --format '{{.ID}}' | xargs -r docker rm -f
```

### Containers not cleaned up after scan

Orphaned Kali containers are named with an `exoscan_` prefix. List and remove them:

```bash
docker ps -a --filter name=exoscan_ --format '{{.ID}}' | xargs -r docker rm -f
```

### Out of disk space

Screenshots, the Kali image cache, and Strix run output are the main consumers.

```bash
# Check volume sizes
docker system df -v

# Remove dangling images (safe — does not remove the running stack images)
docker image prune -f

# Remove screenshots for old scans (replace the scan IDs as needed)
docker run --rm -v exoscan_screenshots_vol:/data alpine rm -rf /data/<scan-id>

# Remove old Strix run directories
docker run --rm -v exoscan_pentest_results_vol:/data alpine sh -c 'ls /data'
docker run --rm -v exoscan_pentest_results_vol:/data alpine rm -rf /data/exoscan-<scan-id-prefix>
```

### Nuclei templates not updating

Templates update automatically every 24 hours. To force an immediate update, restart the backend:

```bash
docker compose restart backend
```

The update runs during the startup lifespan hook.
