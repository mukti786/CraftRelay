"""Tests for the /health endpoint — Part 1."""

import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "ok"
    assert "version" in body["data"]
    assert "environment" in body["data"]


@pytest.mark.asyncio
async def test_health_returns_api_envelope(client):
    response = await client.get("/health")
    body = response.json()
    # Standard envelope must have 'data' key
    assert "data" in body
