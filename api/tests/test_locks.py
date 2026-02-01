"""Lock API and enforcement tests."""
import pytest


@pytest.fixture
def project_id(client):
    r = client.post(
        "/api/projects",
        json={"name": "Lock Test Project", "countdown_red_days_default": 7},
    )
    assert r.status_code == 201
    return r.json()["id"]


@pytest.fixture
def subnet_id(client, project_id):
    r = client.post(
        "/api/subnets",
        json={"project_id": project_id, "cidr": "10.0.0.0/24", "name": "Test subnet"},
    )
    assert r.status_code == 201
    return r.json()["id"]


@pytest.fixture
def host_id(client, project_id, subnet_id):
    r = client.post(
        "/api/hosts",
        json={
            "project_id": project_id,
            "subnet_id": subnet_id,
            "ip": "10.0.0.1",
            "dns_name": "locktest.local",
            "status": "up",
        },
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_acquire_release_lock(client, project_id, host_id):
    r = client.post(
        "/api/locks",
        json={"project_id": project_id, "record_type": "host", "record_id": host_id},
    )
    assert r.status_code == 201
    lock = r.json()
    assert lock["record_type"] == "host"
    assert lock["record_id"] == host_id
    assert "locked_by_username" in lock
    lock_id = lock["id"]

    r = client.get("/api/locks", params={"project_id": project_id})
    assert r.status_code == 200
    locks = r.json()
    assert len(locks) >= 1
    assert any(l["id"] == lock_id for l in locks)

    r = client.delete(f"/api/locks/{lock_id}")
    assert r.status_code == 204

    r = client.get("/api/locks", params={"project_id": project_id})
    assert r.status_code == 200
    locks = r.json()
    assert not any(l["id"] == lock_id for l in locks)


def test_patch_host_without_lock_returns_409(client, project_id, host_id):
    """PATCH host without holding lock should return 409."""
    locks = client.get("/api/locks", params={"project_id": project_id}).json()
    assert not any(
        l["record_type"] == "host" and l["record_id"] == host_id for l in locks
    ), "Host should have no lock before this test"
    r = client.patch(f"/api/hosts/{host_id}", json={"ip": "10.0.0.99"})
    assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.json()}"
    assert "locked" in r.json().get("detail", "").lower()


def test_patch_host_with_lock_succeeds(client, project_id, host_id):
    lock = client.post(
        "/api/locks",
        json={"project_id": project_id, "record_type": "host", "record_id": host_id},
    )
    assert lock.status_code == 201

    r = client.patch(f"/api/hosts/{host_id}", json={"ip": "10.0.0.99"})
    assert r.status_code == 200
    assert r.json()["ip"] == "10.0.0.99"


def test_renew_lock(client, project_id, host_id):
    lock = client.post(
        "/api/locks",
        json={"project_id": project_id, "record_type": "host", "record_id": host_id},
    )
    assert lock.status_code == 201
    lock_id = lock.json()["id"]

    r = client.post(f"/api/locks/{lock_id}/renew")
    assert r.status_code == 200
    renewed = r.json()
    assert renewed["id"] == lock_id
    assert "expires_at" in renewed
