# CraftRelay — API Conventions

## Response Envelope

All endpoints return a consistent JSON envelope:

```json
{
  "data": { ... },
  "message": "Optional human-readable message"
}
```

Errors follow FastAPI's default `HTTPException` format:
```json
{
  "detail": "Human-readable error message"
}
```

## Naming Conventions

| Layer | Convention |
|---|---|
| Python modules | `snake_case` |
| Python classes | `PascalCase` |
| Database tables | `snake_case` plural (e.g. `worker_profiles`) |
| API routes | `kebab-case` path segments (e.g. `/workers/{id}/evidence`) |
| TypeScript files | `PascalCase` for components, `camelCase` for utilities |
| TypeScript types/interfaces | `PascalCase` |

## HTTP Status Codes

| Status | Meaning |
|---|---|
| 200 | Success (GET, PATCH) |
| 201 | Created (POST) |
| 204 | No content (DELETE) |
| 400 | Validation error / bad request |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 422 | Unprocessable entity (Pydantic validation) |
| 500 | Internal server error |

## Authentication

JWT Bearer tokens are used. Tokens are issued at `/auth/login` and must be sent as:
```
Authorization: Bearer <token>
```

## Role Labels

| Value | Description |
|---|---|
| `worker` | Declares skills and submits evidence |
| `assessor` | Reviews evidence and records decisions |
| `customer` | Discovers workers and requests services |
| `admin` | Manages qualifications, users, and audit data |

## Criterion Status States (Part 5)

| State | Meaning |
|---|---|
| `GAP` | No evidence submitted |
| `PENDING_REVIEW` | Evidence submitted, awaiting assessor |
| `ADDITIONAL_EVIDENCE_REQUIRED` | Evidence rejected or insufficient |
| `PRACTICAL_VERIFICATION_REQUIRED` | Practical task not completed |
| `READY_FOR_ASSESSOR_DECISION` | All evidence satisfactory; awaiting formal decision |
| `VERIFIED` | Formal assessor approval recorded |

## Service Request States (Part 7)

`REQUESTED → ACCEPTED / DECLINED`
`ACCEPTED → IN_PROGRESS → COMPLETION_PENDING → COMPLETED`
`Any non-terminal → CANCELLED`
