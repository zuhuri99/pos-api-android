from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/api/v1/auth/login/", json={
        "username": "admin", "password": "test-password", "device_id": "test-device",
    })
    assert response.status_code == 200, response.text
    return {"Authorization": f"Token {response.json()['token']}"}


def test_product_sale_and_idempotent_offline_sync():
    with TestClient(app) as client:
        headers = auth_headers(client)
        imported = client.post("/api/v1/products/import/commit", headers=headers, json={
            "location_id": 1,
            "rows": [{
                "sku": "SKU-TEST", "name": "Produk Test", "variation_name": "DUMMY",
                "variation_sku": "SKU-TEST", "selling_price": "15000",
                "initial_stock": "10", "enable_stock": True, "is_active": True,
            }],
        })
        assert imported.status_code == 200, imported.text

        exported = client.get("/api/v1/products/export", headers=headers)
        assert exported.status_code == 200
        assert "SKU-TEST" in exported.content.decode("utf-8-sig")

        catalog = client.get("/api/v1/income/pos/products?sku=SKU-TEST", headers=headers).json()["data"]
        product = catalog[0]
        variation = product["product_variations"][0]["variations"][0]

        reservation = client.post("/api/v1/income/pos/invoice-numbers/reserve", headers=headers, json={
            "device_id": "test-device", "year": 2026, "month": 10, "count": 2,
        })
        assert reservation.status_code == 200, reservation.text
        assert reservation.json()["data"]["numbers"][0] == "P1020260001"

        entity_id, operation_id = str(uuid4()), str(uuid4())
        body = {
            "device_id": "test-device",
            "operations": [{
                "operation_id": operation_id, "entity": "sale", "action": "create",
                "entity_id": entity_id, "base_revision": 0,
                "payload": {
                    "client_transaction_id": entity_id, "device_id": "test-device",
                    "location_id": 1, "contact_id": 1, "invoice_no": "P1020260001",
                    "transaction_date": "2026-10-14T10:00:00+07:00", "status": "final",
                    "products": [{
                        "product_id": product["id"], "variation_id": variation["id"],
                        "quantity": "2", "unit_price": "15000", "discount_amount": "0",
                        "discount_type": "fixed",
                    }],
                    "payments": [{"amount": "30000", "method": "cash"}],
                },
            }],
        }
        first = client.post("/api/v1/sync/push", headers=headers, json=body)
        second = client.post("/api/v1/sync/push", headers=headers, json=body)
        assert first.status_code == 200, first.text
        assert second.status_code == 200, second.text
        assert first.json() == second.json()

        stock = client.get("/api/v1/pos-data/product-stock-report?location_id=1", headers=headers)
        assert stock.status_code == 200
        assert stock.json()["data"][0]["stock"] == "8.0000"


def test_client_invoice_requires_device_reservation():
    with TestClient(app) as client:
        headers = auth_headers(client)
        response = client.post("/api/v1/income/pos/transactions", headers=headers, json={
            "location_id": 1,
            "contact_id": 1,
            "invoice_no": "P1020260099",
            "transaction_date": "2026-10-14T10:00:00+07:00",
            "status": "final",
            "products": [{
                "product_id": 1,
                "variation_id": 1,
                "quantity": "1",
                "unit_price": "1",
            }],
        })
        assert response.status_code == 422
        assert "device_id wajib" in response.json()["detail"]
