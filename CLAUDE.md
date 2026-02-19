# ContentEngine — CLAUDE.md

## Project Overview
Content Multiplier Engine (CME) — a platform that lets solo content creators upload one piece of content and receive 15-18+ platform-ready formats back with intelligent scheduling, native analytics, and brand voice consistency.

## Architecture
Monorepo with two apps:
- `apps/api/` — Python FastAPI backend (port 8000)
- `apps/web/` — Next.js 14 frontend (port 3000)

Infrastructure: PostgreSQL 16, Redis 7

## Quick Start
```bash
make setup    # First-time setup
make dev      # Start Postgres + Redis, then manually run API and Web
make up       # Start everything via Docker Compose
```

## Key Commands
- `make test` — Run all tests
- `make db-migrate msg="description"` — Create new migration
- `make db-upgrade` — Apply migrations
- `make lint` — Run linters
- `make logs` — Tail all service logs

## API Development
```bash
cd apps/api
uvicorn app.main:app --reload --port 8000
```
API docs at: http://localhost:8000/docs

## Web Development
```bash
cd apps/web
npm run dev
```
Dashboard at: http://localhost:3000

## Environment
Copy `.env.example` to `.env` before running. Never commit `.env`.

## API Design
- All endpoints under `/api/v1/`
- JWT auth with Bearer tokens
- Pydantic v2 for validation
- SQLAlchemy 2.0 async models

## Database
- PostgreSQL with async (asyncpg)
- Alembic for migrations
- All IDs are UUIDs

## Code Standards
- Python: type hints everywhere, async by default
- TypeScript: strict mode, no `any` types
- Test new endpoints with pytest
- API-first: every feature is an API endpoint first
