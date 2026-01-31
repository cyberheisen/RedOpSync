import os

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
