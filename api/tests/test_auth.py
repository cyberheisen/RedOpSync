"""Auth tests: login, me, logout, protected routes return 401 when not authenticated."""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_login_invalid():
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_login_success():
    from app.db.session import SessionLocal
    from app.db.seed import seed_admin
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"
    assert "redopsync_session" in r.cookies


def test_me_requires_auth():
    tc = TestClient(app)
    r = tc.get("/api/auth/me")
    assert r.status_code == 401


def test_me_after_login():
    from app.db.session import SessionLocal
    from app.db.seed import seed_admin
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()
    tc = TestClient(app)
    tc.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    r = tc.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_projects_require_auth():
    tc = TestClient(app)
    r = tc.get("/api/projects")
    assert r.status_code == 401
