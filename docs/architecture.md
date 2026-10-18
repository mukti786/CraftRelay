# CraftRelay — Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Mobile App (Expo)                  │
│  React Native · TypeScript · Expo Router            │
│  TanStack Query · React Hook Form · Zod             │
│  Expo SecureStore (tokens) · Expo SQLite (drafts)   │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS / REST
                     │
┌────────────────────▼────────────────────────────────┐
│              FastAPI Backend                        │
│  Python 3.12 · Pydantic v2 · Uvicorn               │
│  SQLAlchemy 2.0 (async) · Alembic migrations        │
│  JWT auth · Role-based access control               │
│  File storage abstraction (local → object store)    │
│  Optional: AI service module (Part 8)               │
└────────────────────┬────────────────────────────────┘
                     │ asyncpg
                     │
┌────────────────────▼────────────────────────────────┐
│              PostgreSQL Database                    │
│  Users · Profiles · Skills · Qualifications         │
│  Evidence · Assessments · Service Requests          │
│  Audit Logs                                         │
└─────────────────────────────────────────────────────┘
```

## Roles

| Role | Primary Responsibility |
|------|----------------------|
| **Worker** | Declare skills, submit evidence, track assessments, receive service requests |
| **Assessor** | Evaluate evidence, record criterion-level results, issue formal decisions |
| **Customer** | Discover verified workers, request services, submit reviews |
| **Admin** | Manage qualifications, approved tasks, users, and audit records |

## Core Workflow

```
Worker declares skill
       ↓
Qualification selected → Criteria retrieved
       ↓
Evidence submitted and linked to criteria
       ↓
Gap detection: GAP / PENDING_REVIEW / etc.
       ↓
Approved practical task recommended (if gap)
       ↓
Assessor reviews: criterion-level decisions recorded
       ↓
Formal competency verification (assessor only)
       ↓
Worker profile shows verified competency
       ↓
Customer discovers worker → Service request
       ↓
Worker accepts → Work done → Completion confirmed
       ↓
Customer review (service experience only)
```

## Directory Structure

```
CraftRelay/
├── mobile/          # Expo TypeScript application
│   ├── app/         # Expo Router file-based routes
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── constants/   # Design tokens
│   │   ├── lib/         # API client, utilities
│   │   └── types/       # Shared TypeScript types
│   └── package.json
├── backend/         # FastAPI application
│   ├── app/
│   │   ├── api/     # Route handlers
│   │   ├── core/    # Config, schemas, security
│   │   ├── db/      # Models, session, migrations
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
├── data/
│   └── seed/        # Fictional demo data
└── docs/            # Architecture and API documentation
```

## Key Design Decisions

1. **Deterministic assessment engine first** (Part 5) — AI assistance (Part 8) is layered on top and must not be required for correctness.
2. **Formal verification is assessor-only** — no automated path to competency.
3. **Evidence stored outside public dirs** — served through authenticated endpoints only.
4. **Qualification versioning** — historical assessment records reference the qualification version active at decision time.
5. **Service requests use server-validated state transitions** — clients cannot set arbitrary states.
