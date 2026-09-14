from app.services.notifications import _email_payload


def test_mark_notification_contains_reason_and_transaction_items():
    payload = _email_payload("mark", {
        "invoice_no": "P0920260001",
        "transaction_date": "2026-09-15T10:00:00+07:00",
        "contact": "Pelanggan",
        "final_total": "25000",
        "mark_type": "other",
        "mark_reason": "Harga perlu diperiksa",
        "marked_at": "2026-09-15T11:00:00+07:00",
        "products": [{
            "product_name": "Produk A", "variation_name": "Merah",
            "quantity": "2", "unit_price": "12500",
        }],
        "payments": [{"method": "cash", "amount": "25000"}],
    }, "kasir")

    assert payload["subject"] == "[ASAS POS] Transaksi ditandai · P0920260001"
    assert "Harga perlu diperiksa" in payload["html"]
    assert "Produk A" in payload["html"]
    assert "Merah" in payload["html"]
    assert "kasir" in payload["html"]
    assert payload["tags"] == [{"name": "event", "value": "pos_mark"}]
