# RedOpSync

Collaborative red-team / penetration testing engagement portal.

## What this repo contains (starter skeleton)
- `web/`: Next.js (TypeScript) UI placeholder
- `api/`: FastAPI backend placeholder
- `agent/`: Executor agent placeholder (intended to run on a separate tools host)
- `plugins/importers/`: Python importer plugin stubs (nmap/gowitness/dirb/gobuster)
- `fixtures/`: sample tool output fixtures (small)
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
3) Open:
- Web: http://localhost:3000
- API health: http://localhost:8000/health

## Notes
This is a starter repo scaffold intended for an AI coding agent to flesh out.
See `docs/` for intended architecture and next steps.
