# CraftRelay

CraftRelay is a web application for Recognition of Prior Learning (RPL). It is intended to help workers document skills gained through experience and submit supporting evidence, while giving authorized assessors a structured way to review that evidence against qualification criteria and record competency decisions. The assessor workspace now includes an optional, bounded AI-assistance interface and provider-neutral integration boundary. No production provider is configured, so the current application generates no AI suggestions.

## SIH 2026 problem statement

CraftRelay was developed in the context of Smart India Hackathon (SIH) 2026 for the following problem statement:

- **Problem Statement ID:** SIH26242
- **Title:** AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)
- **Ministry/organization attributed to the problem statement:** Ministry of Skill Development and Entrepreneurship (MSDE)
- **Category:** Software

This attribution identifies the organization associated with the problem statement; it does not imply that MSDE endorses, operates, or has selected CraftRelay. No finalist, award, or deployment status is claimed here.

## Problem context

Workers may have developed useful skills through work and other experience without having a simple way to document them against a qualification. Reviewing varied records, work samples, and other evidence consistently can also be challenging. CraftRelay addresses this product-design problem by organizing worker declarations and evidence around qualification criteria and supporting a traceable human assessment workflow. This describes the project context and does not make claims about official RPL processes or measured impact.

## How CraftRelay works

- **Workers** create a profile, declare their skills and experience, select an available versioned qualification, and submit supporting evidence against its criteria. When an approved practical task is attached to a criterion, they can submit a described attempt with private evidence and respond to assessor remediation requests. They can see review feedback and resubmit while the case is open.
- **Assessors** use a shared assessment queue to inspect submitted worker context and private evidence, review practical-task attempts against their recorded rubric, request remediation with notes, record evidence reviews and criterion-level decisions, and finalize a competency decision when required criteria and applicable tasks have current satisfactory reviews. The current implementation does not provide assessor-to-case assignment.
- **Customers** can discover worker profiles, send service requests, manage request status, and submit a service review after a completed engagement. Customer reviews are separate from formal competency decisions.
- **Administrators** can manage account roles and status, maintain versioned qualification and criterion records, and view audit history. The local bootstrap data includes an illustrative qualification and criteria, clearly marked as non-official.

## Human oversight and trust

The assessor workspace has an opt-in interface for bounded evidence summaries and criterion-mapping suggestions. At present no provider is configured and no live suggestion generation has been verified; the interface reports this and keeps manual review available. Formal competency decisions are made only through the authorized human-assessor workflow. A worker's self-declared skills are not verified competencies, and uploading evidence alone does not prove competency. Customer reviews describe service experiences and do not establish qualifications.

## Technology stack

- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Python 3.12+, FastAPI, Uvicorn, Pydantic Settings
- **Persistence and migrations:** SQLAlchemy 2 async ORM, Alembic, SQLite with `aiosqlite` for local development; PostgreSQL support dependencies and an async connection URL are configured
- **Authentication and uploads:** HttpOnly session cookies, password hashing, server-side role checks, and private local evidence storage with upload validation
- **Checks:** pytest, Ruff, ESLint, TypeScript compiler, Node's test runner for localization checks, and Vite production build

## Local setup

Prerequisites: Python 3.12 or newer, [uv](https://docs.astral.sh/uv/), Node.js with npm, and Git.

### 1. Configure and start the API

In PowerShell, from the repository root:

```powershell
Set-Location backend
uv sync --extra dev
Copy-Item .env.example .env
```

Edit `backend/.env` and set a private random `SECRET_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` (12 or more characters). `AI_ASSISTANCE_PROVIDER` defaults to `none`; no provider adapter is currently implemented. The example configuration uses a local SQLite database at `backend/craftrelay.db` and stores private evidence under `backend/data/evidence/`; these local files are excluded from Git. Then, still in `backend/`, run:

```powershell
uv run python -m alembic upgrade head
uv run python -m app.bootstrap
uv run python -m uvicorn app.main:app --reload --port 8000
```

The bootstrap command creates the configured administrator and local illustrative qualification data. Run Alembic migrations before bootstrap. The API is available at `http://localhost:8000` and its health endpoint is `http://localhost:8000/api/health`.

For a PostgreSQL database, set `DATABASE_URL` to an async SQLAlchemy URL such as `postgresql+asyncpg://user:password@host:5432/database`. Keep credentials private. PostgreSQL has not yet been verified for this project; see [Current status and limitations](#current-status-and-limitations).

### 2. Start the web client

In a second PowerShell window, from the repository root:

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

The frontend defaults to `http://localhost:8000` for its API (`VITE_API_URL`). The local Vite server prints the address to open in a browser. Keep the API running while using the web client.

## Testing and checks

Run backend checks from `backend/`:

```powershell
uv run pytest
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations
```

Run frontend checks from `frontend/`:

```powershell
npm run lint
npm run type-check
npm run test:i18n
npm run build
```

`test:i18n` checks localization resources for missing translation keys. The production build runs the TypeScript build check before bundling.

## Current status and limitations

The repository contains working local workflows for worker profiles and evidence submissions, human assessor review, customer discovery and service requests, and administrator account and qualification management. English and Hindi localization are implemented; the Chhattisgarhi draft still needs human review. The included qualification and criteria are illustrative, not official sources.

This is an active project, not a claim of production readiness. PostgreSQL operation, browser acceptance testing, and live-provider integration have not been verified. Evidence currently uses private local filesystem storage; production object storage, retention policy, deployment configuration, and operational security controls still need decisions and validation. The practical-task attempt and assessor-review workflow is implemented for approved catalogue tasks, but any illustrative task data remains explicitly non-official. The AI-assistance UI and provider boundary are implemented, but no live provider is configured; offline synchronization is not implemented. Do not use the local demonstration setup for real worker records.

## Future improvements

Realistic next steps include independently validating PostgreSQL migrations and operation, planning secure evidence storage and retention for a deployment, reviewing the Chhattisgarhi translations with fluent speakers, and evaluating a privacy-reviewed provider integration under human oversight without automating certification.

## Repository notes

Internal project documentation is maintained locally and excluded from the public Git repository. Local environment files, databases, evidence uploads, dependencies, caches, and build outputs are also excluded.
