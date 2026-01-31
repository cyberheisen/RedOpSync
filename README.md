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
- Web: http://localhost:3000 (redirects to login; default **admin** / **admin**)
- API health: http://localhost:8000/health
- API docs: http://localhost:8000/docs

## Verify (DB + CRUD + Auth)
- **Health** (no auth): `curl -s http://localhost:8000/health` → `{"status":"ok",...}`
- **Login**: `curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' -c cookies.txt` then use `-b cookies.txt` for protected endpoints.
- **Projects CRUD** (requires auth cookie): create project, list, get, patch, delete.
- **API tests** (require Postgres with migrations; run from repo root):
  ```bash
  docker-compose run --rm api pytest tests/test_health.py tests/test_auth.py tests/test_crud.py -v
  ```
  Or locally: `cd api && alembic upgrade head && pytest tests/ -v`

## Notes
See `docs/` for architecture and next steps.
