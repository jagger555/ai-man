from fastapi.testclient import TestClient

from app.main import app


def test_walking_route_uses_amap_web_service(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-amap-key")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "1",
                "route": {
                    "paths": [
                        {
                            "distance": "1067",
                            "duration": "854",
                            "steps": [
                                {
                                    "instruction": "向西步行11米左转",
                                    "distance": "11",
                                    "duration": "9",
                                    "polyline": "120.102491,31.427799;120.102374,31.427786",
                                }
                            ],
                        }
                    ]
                },
            }

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["timeout"] == 15

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            assert url.endswith("/v3/direction/walking")
            assert params == {
                "key": "test-amap-key",
                "origin": "120.10242,31.428218",
                "destination": "120.096477,31.430194",
            }
            return FakeResponse()

    monkeypatch.setattr(
        "app.services.navigation_service.httpx.AsyncClient",
        FakeClient,
    )

    response = TestClient(app).post(
        "/api/navigation/walking",
        json={
            "origin": {"lng": 120.10242, "lat": 31.428218},
            "destination": {"lng": 120.096477, "lat": 31.430194},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["distance"] == 1067
    assert body["duration"] == 854
    assert body["steps"][0]["instruction"] == "向西步行11米左转"
    assert body["polyline"] == [
        [120.102491, 31.427799],
        [120.102374, 31.427786],
    ]


def test_walking_route_requires_service_key(monkeypatch):
    monkeypatch.delenv("AMAP_WEB_SERVICE_KEY", raising=False)

    response = TestClient(app).post(
        "/api/navigation/walking",
        json={
            "origin": {"lng": 120.10242, "lat": 31.428218},
            "destination": {"lng": 120.096477, "lat": 31.430194},
        },
    )

    assert response.status_code == 503
