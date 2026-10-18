"""
CraftRelay — FastAPI application factory.

Part 1: health-check endpoint only.
Authentication, database, and business routes are added in Parts 3–7.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.schemas import ApiResponse, HealthResponse

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="AI-Assisted Skill Assessment & Service Discovery Platform",
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
    )

    # ── CORS ─────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # ── Health check ─────────────────────────────────────
    @app.get(
        "/health",
        response_model=ApiResponse[HealthResponse],
        tags=["system"],
        summary="Health check",
    )
    async def health() -> ApiResponse[HealthResponse]:
        """Returns service status, version, and runtime environment."""
        return ApiResponse(
            data=HealthResponse(
                status="ok",
                version=settings.app_version,
                environment=settings.environment,
            )
        )

    return app


app = create_app()
