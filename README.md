# RedOpSync

Collaborative red-team / penetration testing engagement portal.

## What this repo contains
- `web/`: Next.js (TypeScript) UI
- `api/`: FastAPI backend (Postgres, Alembic migrations, REST CRUD)
- `agent/`: Executor agent (intended to run on a separate tools host)
- `plugins/importers/`: Python importer plugins (nmap/gowitness/dirb/gobuster)
- `fixtures/`: sample tool output fixtures
- `docker-compose.yml`: local Linux dev stack (Postgres + Redis + services)

## Quick start (dev)
1) Copy env file:
```bash
cp .env.example .env
```
2) Start:
```bash
docker compose up --build
```
The API runs `alembic upgrade head` on startup, then serves on port 8000.

3) Open:
- Web: http://localhost:3000
- API health: http://localhost:8000/health
- API docs: http://localhost:8000/docs

## Verify (step 1: DB + CRUD)
- **Health**: `curl -s http://localhost:8000/health` → `{"status":"ok",...}`
- **Projects CRUD**: Create a project, list, get, patch, delete:
  ```bash
  curl -s -X POST http://localhost:8000/api/projects -H "Content-Type: application/json" -d '{"name":"Test","countdown_red_days_default":7}'
  ```
- **API tests** (require Postgres with migrations; run from repo root):
  ```bash
  docker compose run --rm api pytest tests/test_health.py tests/test_crud.py -v
  ```
  Or locally with Postgres and env: `cd api && alembic upgrade head && pytest tests/ -v`

## Notes
See `docs/` for architecture and next steps.
