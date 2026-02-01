"""
CRUD tests for projects, subnets, hosts, ports.
Requires Postgres running with migrations applied (e.g. docker compose up -d postgres; alembic upgrade head).
"""
import pytest


def test_projects_crud(client, project_id):
    r = client.get("/api/projects")
    assert r.status_code == 200
    projects = r.json()
    assert len(projects) >= 1
    ids = [p["id"] for p in projects]
    assert project_id in ids

    r = client.get(f"/api/projects/{project_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "Test Project"

    r = client.patch(f"/api/projects/{project_id}", json={"name": "Updated Project"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Project"

    r = client.delete(f"/api/projects/{project_id}")
    assert r.status_code == 204

    r = client.get(f"/api/projects/{project_id}")
    assert r.status_code == 404


def test_subnets_crud(client, project_id: str, subnet_id: str):
    r = client.get("/api/subnets", params={"project_id": project_id})
    assert r.status_code == 200
    subnets = r.json()
    assert len(subnets) >= 1
    assert any(s["id"] == subnet_id for s in subnets)

    r = client.get(f"/api/subnets/{subnet_id}")
    assert r.status_code == 200
    assert r.json()["cidr"] == "10.0.0.0/24"

    lock = client.post(
        "/api/locks",
        json={"project_id": project_id, "record_type": "subnet", "record_id": subnet_id},
    )
    assert lock.status_code == 201

    r = client.patch(f"/api/subnets/{subnet_id}", json={"name": "Updated subnet"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated subnet"


def test_hosts_crud(client, project_id: str, subnet_id: str, host_id: str):
    r = client.get("/api/hosts", params={"project_id": project_id})
    assert r.status_code == 200
    hosts = r.json()
    assert len(hosts) >= 1
    assert any(h["id"] == host_id for h in hosts)

    r = client.get(f"/api/hosts/{host_id}")
    assert r.status_code == 200
    assert r.json()["ip"] == "10.0.0.1"

    lock = client.post(
        "/api/locks",
        json={"project_id": project_id, "record_type": "host", "record_id": host_id},
    )
    assert lock.status_code == 201

    r = client.patch(f"/api/hosts/{host_id}", json={"ip": "10.0.0.2"})
    assert r.status_code == 200
    assert r.json()["ip"] == "10.0.0.2"


def test_ports_crud(client, project_id: str, host_id: str):
    r = client.post(
        "/api/ports",
        json={
            "host_id": host_id,
            "protocol": "tcp",
            "number": 80,
            "state": "open",
            "service_name": "http",
        },
    )
    assert r.status_code == 201
    port = r.json()
    port_id = port["id"]

    r = client.get("/api/ports", params={"host_id": host_id})
    assert r.status_code == 200
    ports = r.json()
    assert len(ports) >= 1
    assert any(p["id"] == port_id for p in ports)

    r = client.get(f"/api/ports/{port_id}")
    assert r.status_code == 200
    assert r.json()["number"] == 80

    lock = client.post(
        "/api/locks",
        json={"project_id": project_id, "record_type": "port", "record_id": port_id},
    )
    assert lock.status_code == 201

    r = client.patch(f"/api/ports/{port_id}", json={"service_version": "1.1"})
    assert r.status_code == 200
    assert r.json()["service_version"] == "1.1"

    r = client.delete(f"/api/ports/{port_id}")
    assert r.status_code == 204


def test_project_not_found(client):
    r = client.get("/api/projects/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
