# CraftRelay

**AI-Assisted Skill Assessment & Service Discovery Platform**  
Smart India Hackathon (SIH) demonstration project.

> CraftRelay connects workers with verified trade skills to customers who need them,
> using a rigorous assessment workflow rather than self-declared ratings alone.

---

## Roles

| Role | What they do |
|------|-------------|
| **Worker** | Declare skills, submit evidence, receive service requests |
| **Assessor** | Review evidence, record criterion-level results, issue formal decisions |
| **Customer** | Discover verified workers, request services, submit reviews |
| **Admin** | Manage qualifications, users, audit records |

---

## Repository Structure

```
CraftRelay/
├── mobile/      Expo TypeScript application (React Native, Expo Router)
├── backend/     FastAPI Python application
├── data/seed/   Fictional demo data (YAML)
└── docs/        Architecture and API documentation
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20.x | https://nodejs.org |
| npm | ≥ 10.x | bundled with Node |
| Python | 3.12+ | https://python.org |
| PostgreSQL | 15+ | https://postgresql.org |
| Git | any | https://git-scm.com |

**Android development (optional for Part 1):**
- Android Studio with an emulator, **or**
- Physical Android device with USB debugging enabled and Expo Go installed

---

## Quick Start — Windows

### 1. Clone and enter the repository

```powershell
git clone <repo-url> CraftRelay
cd CraftRelay
```

### 2. Start the backend

```powershell
cd backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Copy environment example and edit values
copy .env.example .env
# Open .env and set DATABASE_URL and SECRET_KEY

# Run the development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at **http://localhost:8000**  
Interactive docs at **http://localhost:8000/docs**

### 3. Verify the health endpoint

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Expected response:
```json
{ "data": { "status": "ok", "version": "0.1.0", "environment": "development" } }
```

### 4. Start the mobile app

```powershell
cd ..\mobile

# Copy environment example
copy .env.example .env

# Install dependencies
npm install

# Start Expo development server
npm start
```

Press `a` to open on a connected Android device or emulator.  
Scan the QR code with Expo Go on a physical device.

---

## Running Backend Tests

```powershell
cd backend
.venv\Scripts\Activate.ps1
pytest -v
```

---

## Running Mobile Type Checks

```powershell
cd mobile
npm run type-check
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes (Part 3+) | Async PostgreSQL connection string |
| `DATABASE_SYNC_URL` | Yes (Part 3+) | Sync connection string for Alembic |
| `SECRET_KEY` | Yes | 256-bit random secret for JWT signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: 60 |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `UPLOAD_DIR` | No | File upload directory (default: `./uploads`) |
| `ENVIRONMENT` | No | `development` or `production` |

### Mobile (`mobile/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | No | Backend base URL (default: `http://localhost:8000`) |

---

## Development Conventions

See [`docs/api-conventions.md`](docs/api-conventions.md) for:
- API response envelope
- HTTP status codes
- Naming conventions
- Role and status enumerations

See [`docs/architecture.md`](docs/architecture.md) for:
- System architecture diagram
- Core workflow
- Key design decisions

---

## Part Status

| Part | Description | Status |
|------|-------------|--------|
| 1 | Foundation & Architecture | ✅ Complete |
| 2 | Mobile UI & Design System | ⬜ Next |
| 3 | Database & Authentication | ⬜ Planned |
| 4 | Worker Profiles & Evidence | ⬜ Planned |
| 5 | Evidence-Gap Engine | ⬜ Planned |
| 6 | Assessor Workspace | ⬜ Planned |
| 7 | Customer Discovery & Service Requests | ⬜ Planned |
| 8 | AI-Assisted Mapping | ⬜ Planned |
| 9 | Integration, Security & Testing | ⬜ Planned |
| 10 | Final Polish & APK | ⬜ Planned |

---

## Known Limitations (Part 1)

- No database connection yet — Part 3.
- No authentication yet — Part 3.
- Mobile shows a placeholder screen only — Part 2.
- No file uploads yet — Part 4.
- AI integration is not started — Part 8.

---

## Disclaimer

All qualification data in `data/seed/demo_data.yaml` is **entirely fictional** and created for demonstration purposes only. It is not derived from, and should not be confused with, any official NCVT, NSDC, PMKVY, or other government qualification database.
