# RedOpSync

**RedOpSync** is a collaborative red-team and penetration testing engagement portal. It helps operators manage scope, hosts, ports, evidence, and vulnerabilities in one place—with optional locking so multiple analysts can work without overwriting each other.

This project is licensed under the [MIT License](LICENSE).

---

## Description

RedOpSync manages engagements as missions with structured scope, scan imports, vulnerability tracking, custom reporting, and multi-user edit locking.

The stack is a **Next.js** front end and **FastAPI** backend with **PostgreSQL** and optional **Redis**. The UI is mission-centric: scope tree, filters, detail panes, and right-click actions for the things you do every day.

---

## Features

- **Missions** — Create and manage engagements with name, description, and dates.
- **Scope tree** — Subnets → hosts → ports → reports (evidence). Unresolved hosts grouped separately. Tree sorted by IP.
- **Hosts & ports** — Add/edit hosts and ports; subnets are auto-created from host IPs when missing.
- **Vulnerabilities** — Define vulnerabilities with severity (Critical/High/Medium/Low/Info), CVSS, CVE IDs; attach to hosts/subnets; track instances and status.
- **Notes** — Add notes to scope, subnets, hosts, ports, or evidence; print view supported.
- **Import**
  - **Nmap XML** — Import scan output; creates/merges hosts and ports, structured evidence (response codes, server headers, TLS, raw banners); host status from Nmap host state.
  - **GoWitness** — Import ZIP with screenshots and metadata; creates hosts and evidence.
  - **Plain text** — One host per line (IP or IP + hostname); merge rules and auto-subnets.
- **Custom reports**
  - **Report builder** — Choose data source (hosts, ports, evidence, vulns), columns, and filter using the same syntax as the tree filter; export TXT/CSV/JSON.
  - **Predefined reports** — e.g. list of IPs, hostnames, open ports, hosts by subnet, unresolved hosts, vulnerabilities (flat or by severity), evidence entries.
- **Filtering** — Attribute-based filter on the scope tree (e.g. `ip contains "10."`, `severity >= High`, `service == https`) with a help panel and filter builder.
- **Locking** — Acquire locks on hosts, ports, or subnets before edit/delete; WebSocket updates when locks change; optional TTL and renew.
- **Audit** — Import and report generation (and other actions) are logged for compliance.
- **Authentication** — Cookie-based auth; admin user management and session handling (admin panel).

---

## Installation & Run

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- (Optional) Node 20+ and Python 3.12+ for local dev

### 1. Clone the repository

```bash
git clone https://github.com/cyberheisen/RedOpSync.git
cd RedOpSync
```

### 2. Configure environment

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

Important variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://postgres:postgres@postgres:5432/redopsync` |
| `REDIS_URL` | Redis connection (for worker/optional features) | `redis://redis:6379/0` |
| `SECRET_KEY` | API signing key; **change in production** | `change-me-in-production` |
| `ADMIN_PASSWORD` | Default admin password (used by seed) | `admin` |
| `NEXT_PUBLIC_API_BASE_URL` | API URL as seen by the browser | `http://localhost:8000` |
| `CORS_ORIGINS` | Allowed origins for API | `http://localhost:3000,http://127.0.0.1:3000` |

### 3. Start with Docker Compose

```bash
docker compose up --build
```

This starts:

- **PostgreSQL** (port 5432)
- **Redis** (port 6379)
- **API** (port 8000) — runs `alembic upgrade head` then serves the FastAPI app
- **Web** (port 3000) — Next.js dev server
- **Worker** — background job runner (uses API context)
- **Agent** — optional executor agent (for future tool runs)

### 4. Open the application

- **Web UI:** [http://localhost:3000](http://localhost:3000)  
  Default login: **admin** / **admin** (unless you changed `ADMIN_PASSWORD`).
- **API health:** [http://localhost:8000/health](http://localhost:8000/health)
- **API docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Running without Docker (local dev)

### API

```bash
cd api
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
# Set DATABASE_URL and REDIS_URL for a running Postgres/Redis (e.g. local or Docker)
alembic upgrade head
uvicorn main:app --reload --port 8000
```

### Web

```bash
cd web
npm install
# Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 (or your API URL)
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Ensure `NEXT_PUBLIC_API_BASE_URL` points to the API URL the browser can reach (e.g. `http://localhost:8000`).

---

## Project structure

| Path | Description |
|------|-------------|
| `web/` | Next.js (TypeScript) front end — missions, scope tree, detail panes, import, reports |
| `api/` | FastAPI backend — REST API, Postgres, Alembic migrations, auth, locking, import, reports |
| `agent/` | Executor agent (intended for a separate tools host) |
| `plugins/importers/` | Python importer plugins (nmap, gowitness, etc.) |
| `docker-compose.yml` | Local stack: Postgres, Redis, API, web, worker, agent |

---

## License

See [LICENSE](LICENSE) in this repository (if present).
