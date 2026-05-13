# bolo

Autonomous external agent system. Cloudflare Worker brain + GitHub Actions executor + KeylessAI (no API key needed).

## Architecture

- **Cloudflare Worker** (`worker/index.js`) — receives HTTP requests, calls KeylessAI, triggers GitHub Actions
- **GitHub Actions** (`.github/workflows/run-task.yml`) — runs any bash task on demand via repository_dispatch
- **KeylessAI** — free AI, no API key required

## Endpoints (after deploy)

- `POST /chat` — send a message, get AI response
- `POST /run` — trigger a GitHub Actions task
- `GET /status` — worker health check
