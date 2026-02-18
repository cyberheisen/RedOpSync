def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["app"] == "redopsync"


def test_api_version(client):
    r = client.get("/api/version")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "RedOpSync"
    assert data["version"] == "1.1.0"
