from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/api/v1/auth/login/", json={
        "username": "admin", "password": "test-password", "device_id": "test-device",
    })
    assert response.status_code == 200, response.text
    return {"Authorization": f"Token {response.json()['token']}"}


def user_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/api/v1/auth/login/", json={
        "username": "kasir", "password": "cashier-password", "device_id": "cashier-device",
    })
    assert response.status_code == 200, response.text
    assert response.json()["user"]["is_superuser"] is False
    return {"Authorization": f"Token {response.json()['token']}"}


def test_cashier_delete_requires_valid_pin():
    with TestClient(app) as client:
        headers = user_headers(client)
        missing = client.request(
            "DELETE", "/api/v1/income/pos/transactions/999999",
            headers=headers, json={"reason": "Salah input barang"},
        )
        assert missing.status_code == 403
        assert "PIN" in missing.json()["detail"]

        invalid = client.request(
            "DELETE", "/api/v1/income/pos/transactions/999999",
            headers=headers, json={"reason": "Salah input barang", "pin": "000000"},
        )
        assert invalid.status_code == 403
        assert "tidak valid" in invalid.json()["detail"]

        authorized = client.request(
            "DELETE", "/api/v1/income/pos/transactions/999999",
            headers=headers, json={"reason": "Salah input barang", "pin": "654321"},
        )
        assert authorized.status_code == 404


def test_cashier_logout_requires_pin_and_revokes_token():
    with TestClient(app) as client:
        headers = user_headers(client)
        denied = client.post("/api/v1/auth/logout/", headers=headers, json={"pin": "000000"})
        assert denied.status_code == 403
        assert client.get("/api/v1/auth/token/verify/", headers=headers).status_code == 200

        logged_out = client.post("/api/v1/auth/logout/", headers=headers, json={"pin": "654321"})
        assert logged_out.status_code == 200
        assert client.get("/api/v1/auth/token/verify/", headers=headers).status_code == 401


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

        imported_inactive = client.post("/api/v1/products/import/commit", headers=headers, json={
            "location_id": 1,
            "rows": [{
                "sku": "SKU-INACTIVE", "name": "Produk Nonaktif", "variation_name": "DUMMY",
                "variation_sku": "SKU-INACTIVE", "selling_price": "12000",
                "initial_stock": "5", "enable_stock": True, "is_active": False,
            }],
        })
        assert imported_inactive.status_code == 200, imported_inactive.text
        hidden_product = client.get("/api/v1/income/pos/products?sku=SKU-INACTIVE", headers=headers)
        assert hidden_product.status_code == 200
        assert hidden_product.json()["data"] == []

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

        sale_id = first.json()["data"]["results"][0]["server_id"]
        transaction_list = client.get(
            "/api/v1/income/pos/transactions?year=2026&search=P1020260001",
            headers=headers,
        )
        assert transaction_list.status_code == 200, transaction_list.text
        assert [row["id"] for row in transaction_list.json()["data"]] == [sale_id]
        assert transaction_list.json()["data"][0]["_source_user"] == "admin"

        invoice = client.get(f"/api/v1/income/pos/transactions/{sale_id}/invoice", headers=headers)
        assert invoice.status_code == 200
        assert invoice.json()["data"]["_source_user"] == "admin"

        update_payload = {
            **body["operations"][0]["payload"],
            "products": [{
                **body["operations"][0]["payload"]["products"][0],
                "quantity": "1",
            }],
            "payments": [{"amount": "15000", "method": "cash"}],
        }
        updated = client.put(
            f"/api/v1/income/pos/transactions/{sale_id}",
            headers=headers,
            json=update_payload,
        )
        assert updated.status_code == 200, updated.text
        assert float(updated.json()["data"]["products"][0]["quantity"]) == 1
        assert updated.json()["data"]["revision"] == 2
        corrected_stock = client.get("/api/v1/pos-data/product-stock-report?location_id=1", headers=headers)
        assert corrected_stock.json()["data"][0]["stock"] == "9.0000"

        invalid_mark = client.patch(
            f"/api/v1/income/pos/transactions/{sale_id}/mark",
            headers=headers,
            json={"mark_type": "other", "reason": ""},
        )
        assert invalid_mark.status_code == 422

        marked = client.patch(
            f"/api/v1/income/pos/transactions/{sale_id}/mark",
            headers=headers,
            json={"mark_type": "other", "reason": "Perlu verifikasi pelanggan"},
        )
        assert marked.status_code == 200, marked.text
        assert marked.json()["data"]["mark_type"] == "other"
        assert marked.json()["data"]["mark_reason"] == "Perlu verifikasi pelanggan"
        assert marked.json()["data"]["marked_by"] == 1
        assert marked.json()["data"]["revision"] == 3

        delete_operation_id = str(uuid4())
        delete_body = {
            "device_id": "test-device",
            "operations": [{
                "operation_id": delete_operation_id,
                "entity": "sale",
                "action": "delete",
                "entity_id": entity_id,
                "base_revision": 1,
                "payload": {"reason": "Salah input barang"},
            }],
        }
        synced_delete = client.post("/api/v1/sync/push", headers=headers, json=delete_body)
        synced_delete_retry = client.post("/api/v1/sync/push", headers=headers, json=delete_body)
        assert synced_delete.status_code == 200, synced_delete.text
        assert synced_delete.json() == synced_delete_retry.json()
        assert synced_delete.json()["data"]["results"][0]["action"] == "delete"

        # Endpoint langsung tetap idempotent setelah void dari sinkronisasi.
        deleted = client.request(
            "DELETE",
            f"/api/v1/income/pos/transactions/{sale_id}",
            headers=headers,
            json={"reason": "Salah input barang"},
        )
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()["data"]["status"] == "void"
        assert deleted.json()["data"]["void_reason"] == "Salah input barang"

        # Retry delete bersifat idempotent dan tidak menggandakan pengembalian stok.
        retried = client.request(
            "DELETE",
            f"/api/v1/income/pos/transactions/{sale_id}",
            headers=headers,
            json={"reason": "Salah input barang"},
        )
        assert retried.status_code == 200
        restored = client.get("/api/v1/pos-data/product-stock-report?location_id=1", headers=headers)
        assert restored.json()["data"][0]["stock"] == "10.0000"
        active_sales = client.get("/api/v1/income/lite", headers=headers).json()["data"]["admin"]
        assert active_sales == []


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
