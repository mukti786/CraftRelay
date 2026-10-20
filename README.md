# CraftRelay

CraftRelay is a responsive web application for recognition of prior learning (RPL), assessor-led competency verification, and trusted service discovery. The current build runs locally with a React + TypeScript web client, a FastAPI API, SQLAlchemy, and PostgreSQL-ready persistence. SQLite is the default for local development.

## Run locally

### API

From `backend/`:

```powershell
uv sync --extra dev
Copy-Item .env.example .env
# Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (12+ characters),
# and a stable random SECRET_KEY in .env before starting the API.
uv run python -m alembic upgrade head
uv run python -m app.bootstrap
uv run python -m uvicorn app.main:app --reload --port 8000
```

The bootstrap command creates one administrator and an illustrative qualification with three illustrative criteria. It is explicitly not an official qualification or rubric. Use a private, random `SECRET_KEY` outside local development. For PostgreSQL, set `DATABASE_URL` to a SQLAlchemy async URL such as `postgresql+asyncpg://...`; keep database credentials out of source control.

### Web client

From `frontend/`:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The default API URL is `http://localhost:8000`. The production bundle command is `npm run build`; `npm run lint` checks the TypeScript source.

## Current capabilities

- Worker/customer registration, password hashing, HttpOnly session cookies, and server-enforced role checks.
- Worker profiles and declared skills; versioned assessment cases; private evidence file uploads with size, media-type, hash, and signature checks.
- Assessor queue, evidence review, criterion-level decisions, assessor-only final verification, and audit events.
- Customer discovery, service requests with controlled state transitions, and service reviews separate from competency verification.
- Admin overview, account status/role management, qualification/criterion catalogue, and audit history.
- Alembic migrations own schema changes. API startup does not create or alter tables; the explicit bootstrap command retains `create_all` only as a local first-run helper.

## Current limitations

- The bootstrap qualification and criteria are clearly illustrative. No official qualification or rubric is included.
- Practical-task configuration has API/data-model support but no worker task-attempt workflow.
- Offline draft synchronization, offline evidence storage, AI/RAG assistance, human review of the partial Chhattisgarhi draft, private object-storage integration, and deployment configuration remain future work. English and Hindi interface localization is implemented.
- Local evidence files live under `backend/data/evidence/`; production storage and retention policy still require a deployment decision.
- Use HTTPS, a production secret, a PostgreSQL service, a private evidence store, and explicit operational controls before handling real worker records. If the frontend and API use different sites, set `COOKIE_SAMESITE=none`, keep `APP_ENV=production` so cookies are Secure, and add the exact frontend origin to `CORS_ORIGINS`.

Project status and internal verification notes are maintained locally and are not included in this public repository.
