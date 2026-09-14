import html
import hashlib
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import BackgroundTasks

from ..core.config import get_settings

logger = logging.getLogger(__name__)
RESEND_EMAILS_URL = "https://api.resend.com/emails"
RESEND_BATCH_URL = "https://api.resend.com/emails/batch"

ACTION_LABELS = {
    "create": "Transaksi baru",
    "update": "Transaksi diedit",
    "delete": "Transaksi dihapus",
}


def _money(value: object) -> str:
    try:
        return f"Rp {float(value or 0):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return "Rp 0"


def _number(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def _transaction_details_html(sale: dict) -> str:
    products = sale.get("products") or sale.get("sell_lines") or []
    item_rows = []
    for item in products:
        quantity = _number(item.get("quantity"))
        unit_price = _number(item.get("unit_price") or item.get("unit_price_inc_tax"))
        product_name = str(item.get("product_name") or item.get("product", {}).get("name") or "Produk")
        variation = str(item.get("variation_name") or item.get("variations", {}).get("name") or "").strip()
        note = str(item.get("note") or item.get("sell_line_note") or "").strip()
        description = " · ".join(value for value in (variation if variation != "DUMMY" else "", note) if value)
        description_html = (
            f'<br><small style="color:#64748b">{html.escape(description)}</small>'
            if description else ""
        )
        item_rows.append(
            '<tr style="border-bottom:1px dashed #cbd5e1">'
            f'<td style="padding:9px 6px"><strong>{html.escape(product_name)}</strong>'
            f'{description_html}</td>'
            f'<td style="padding:9px 6px;text-align:right">{quantity:g}</td>'
            f'<td style="padding:9px 6px;text-align:right">{html.escape(_money(unit_price))}</td>'
            f'<td style="padding:9px 6px;text-align:right;font-weight:700">{html.escape(_money(quantity * unit_price))}</td>'
            '</tr>'
        )
    if not item_rows:
        item_rows.append('<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b">Tidak ada detail item</td></tr>')

    subtotal = _number(sale.get("total_before_tax"))
    discount_amount = _number(sale.get("discount_amount"))
    discount_type = str(sale.get("discount_type") or "fixed")
    discount_value = subtotal * discount_amount / 100 if discount_type == "percentage" else discount_amount
    shipping = _number(sale.get("shipping_charges"))
    packing = _number(sale.get("packing_charge"))
    total = _number(sale.get("final_total"))
    change = _number(sale.get("change_return"))
    summary_rows = [
        ("Subtotal", _money(subtotal), False),
    ]
    if discount_value:
        label = f"Diskon ({discount_amount:g}%)" if discount_type == "percentage" else "Diskon"
        summary_rows.append((label, f"- {_money(discount_value)}", False))
    if shipping:
        summary_rows.append(("Biaya pengiriman", _money(shipping), False))
    if packing:
        summary_rows.append(("Biaya packing", _money(packing), False))
    summary_rows.append(("TOTAL", _money(total), True))
    if change:
        summary_rows.append(("Kembalian", _money(change), False))
    summary = "".join(
        f'<tr><td style="padding:5px 6px;{("font-weight:800;color:#0369a1" if strong else "color:#475569")}">{html.escape(label)}</td>'
        f'<td style="padding:5px 6px;text-align:right;{("font-weight:800;color:#0369a1" if strong else "font-weight:600")}">{html.escape(value)}</td></tr>'
        for label, value, strong in summary_rows
    )

    payments = sale.get("payments") or sale.get("payment_lines") or []
    payment_rows = "".join(
        '<tr>'
        f'<td style="padding:5px 6px;color:#475569">{html.escape(str(payment.get("method") or "Pembayaran").replace("_", " ").title())}</td>'
        f'<td style="padding:5px 6px;text-align:right;font-weight:700;color:#15803d">{html.escape(_money(payment.get("amount")))}</td>'
        '</tr>'
        for payment in payments
    ) or '<tr><td colspan="2" style="padding:6px;color:#64748b">Belum ada pembayaran</td></tr>'
    note = str(sale.get("sale_note") or sale.get("additional_notes") or "").strip()
    note_html = (
        f'<p style="margin-top:16px;color:#475569"><strong>Catatan:</strong> {html.escape(note)}</p>'
        if note else ""
    )

    return (
        '<h3 style="margin:22px 0 8px;color:#0f172a">Rincian pembelian</h3>'
        '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        '<thead><tr style="background:#e2e8f0;color:#334155">'
        '<th style="padding:8px 6px;text-align:left">Produk</th><th style="padding:8px 6px;text-align:right">Qty</th>'
        '<th style="padding:8px 6px;text-align:right">Harga</th><th style="padding:8px 6px;text-align:right">Total</th>'
        f'</tr></thead><tbody>{"".join(item_rows)}</tbody></table>'
        f'<table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:13px">{summary}</table>'
        '<h3 style="margin:18px 0 6px;color:#0f172a">Pembayaran</h3>'
        f'<table style="width:100%;border-collapse:collapse;font-size:13px">{payment_rows}</table>'
        f'{note_html}'
    )


def _email_payload(
    action: str,
    sale: dict,
    actor_username: str,
) -> dict:
    settings = get_settings()
    label = ACTION_LABELS.get(action, "Aktivitas transaksi")
    invoice = str(sale.get("invoice_no") or "-")
    reason = str(sale.get("void_reason") or "-")
    item_count = sum(_number(item.get("quantity")) for item in sale.get("products", []))
    rows = [
        ("Aksi", label),
        ("Invoice", invoice),
        ("Dilakukan oleh", actor_username),
        ("Waktu transaksi", str(sale.get("transaction_date") or "-")),
        ("Customer", str(sale.get("contact") or "Umum")),
        ("Jumlah barang", f"{item_count:g}"),
        ("Total", _money(sale.get("final_total"))),
    ]
    if action == "delete":
        rows.append(("Alasan hapus", reason))
    table = "".join(
        f'<tr><td style="padding:7px 12px;color:#64748b">{html.escape(key)}</td>'
        f'<td style="padding:7px 12px;font-weight:700;color:#0f172a">{html.escape(value)}</td></tr>'
        for key, value in rows
    )
    details = _transaction_details_html(sale) if action in {"create", "update"} else ""
    return {
        "from": settings.resend_from_email,
        "to": settings.transaction_notification_emails,
        "subject": f"[ASAS POS] {label} · {invoice}",
        "html": (
            '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">'
            f'<h2 style="color:#0f172a">{html.escape(label)}</h2>'
            '<p style="color:#475569">Aktivitas berikut dilakukan oleh akun user/kasir biasa.</p>'
            f'<table style="width:100%;border-collapse:collapse;background:#f8fafc">{table}</table>'
            f'{details}'
            '</div>'
        ),
        "tags": [{"name": "event", "value": f"pos_{action}"}],
    }


def _send_resend_request(url: str, payload: dict | list[dict], idempotency_key: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key or not settings.resend_from_email or not settings.transaction_notification_emails:
        logger.warning("Notifikasi transaksi dilewati karena konfigurasi Resend belum lengkap.")
        return
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ASAS-POS/0.1.0",
            "Idempotency-Key": idempotency_key[:256],
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            if response.status < 200 or response.status >= 300:
                logger.error("Resend mengembalikan status %s.", response.status)
    except HTTPError as error:
        logger.error("Notifikasi Resend gagal dengan status %s.", error.code)
    except (URLError, TimeoutError, OSError) as error:
        logger.error("Notifikasi Resend gagal dikirim: %s", error)


def send_transaction_notification(
    action: str,
    sale: dict,
    actor_username: str,
    idempotency_key: str,
) -> None:
    _send_resend_request(
        RESEND_EMAILS_URL,
        _email_payload(action, sale, actor_username),
        idempotency_key,
    )


def send_transaction_notifications(notifications: list[tuple[str, dict, str]], actor_username: str) -> None:
    if not notifications:
        return
    operation_ids = ",".join(item[2] for item in notifications)
    digest = hashlib.sha256(operation_ids.encode()).hexdigest()
    payload = [_email_payload(action, sale, actor_username) for action, sale, _ in notifications]
    _send_resend_request(RESEND_BATCH_URL, payload, f"pos-sync-batch-{digest}")


def queue_transaction_notification(
    background_tasks: BackgroundTasks,
    action: str,
    sale: dict,
    actor_username: str,
    idempotency_key: str,
) -> None:
    background_tasks.add_task(
        send_transaction_notification,
        action,
        sale,
        actor_username,
        idempotency_key,
    )


def queue_transaction_notifications(
    background_tasks: BackgroundTasks,
    notifications: list[tuple[str, dict, str]],
    actor_username: str,
) -> None:
    background_tasks.add_task(send_transaction_notifications, notifications, actor_username)
