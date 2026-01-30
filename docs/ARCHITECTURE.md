# RedOpSync Architecture (starter)

Target architecture:
- Web UI (Next.js) talks to API (FastAPI).
- API uses Postgres for primary data and Redis for queues.
- Worker executes background jobs: imports, exports, thumbnails, dispatch to agent.
- Agent runs on a separate tools host, connects outbound to API, executes scans, uploads artifacts.
- Importers are Python plugins under `/plugins/importers` loaded by the worker.

This starter scaffold includes placeholder endpoints and stubs only.
