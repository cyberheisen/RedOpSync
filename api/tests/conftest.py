import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/redopsync")

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    from app.db.session import SessionLocal
    from app.db.seed import seed_admin
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()
    tc = TestClient(app)
    r = tc.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200, r.text
    return tc


@pytest.fixture
def project_id(client):
    r = client.post(
        "/api/projects",
        json={
            "name": "Test Project",
            "description": "For CRUD tests",
            "countdown_red_days_default": 7,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.fixture
def subnet_id(client, project_id):
    r = client.post(
        "/api/subnets",
        json={
            "project_id": project_id,
            "cidr": "10.0.0.0/24",
            "name": "Test subnet",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.fixture
def host_id(client, project_id, subnet_id):
    r = client.post(
        "/api/hosts",
        json={
            "project_id": project_id,
            "subnet_id": subnet_id,
            "ip": "10.0.0.1",
            "dns_name": "testhost.local",
            "status": "up",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]
