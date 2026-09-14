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


def _email_payload(
    action: str,
    sale: dict,
    actor_username: str,
) -> dict:
    settings = get_settings()
    label = ACTION_LABELS.get(action, "Aktivitas transaksi")
    invoice = str(sale.get("invoice_no") or "-")
    reason = str(sale.get("void_reason") or "-")
    item_count = sum(float(item.get("quantity") or 0) for item in sale.get("products", []))
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
    return {
        "from": settings.resend_from_email,
        "to": settings.transaction_notification_emails,
        "subject": f"[ASAS POS] {label} · {invoice}",
        "html": (
            '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto">'
            f'<h2 style="color:#0f172a">{html.escape(label)}</h2>'
            '<p style="color:#475569">Aktivitas berikut dilakukan oleh akun user/kasir biasa.</p>'
            f'<table style="width:100%;border-collapse:collapse;background:#f8fafc">{table}</table>'
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
