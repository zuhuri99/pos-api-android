import base64
import fcntl
import hashlib
import html
import logging
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from sqlalchemy.engine import make_url

from .core.config import Settings, get_settings
from .services.notifications import RESEND_EMAILS_URL, _send_resend_request

logger = logging.getLogger(__name__)
WIB = ZoneInfo("Asia/Jakarta")
MAX_RAW_BACKUP_BYTES = 29_000_000
LOCK_PATH = "/tmp/asas-pos-database-backup.lock"


def _postgres_environment(database_url: str) -> tuple[dict[str, str], str]:
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql":
        raise ValueError("Backup hanya tersedia untuk database PostgreSQL.")
    if not url.database:
        raise ValueError("Nama database tidak ditemukan pada DATABASE_URL.")

    environment = os.environ.copy()
    values = {
        "PGHOST": url.host,
        "PGPORT": str(url.port) if url.port else None,
        "PGUSER": url.username,
        "PGPASSWORD": url.password,
        "PGDATABASE": url.database,
        "PGAPPNAME": "asas-pos-backup",
        "PGCONNECT_TIMEOUT": "15",
    }
    for key, value in values.items():
        if value is not None:
            environment[key] = value

    query_environment = {
        "sslmode": "PGSSLMODE",
        "sslrootcert": "PGSSLROOTCERT",
        "sslcert": "PGSSLCERT",
        "sslkey": "PGSSLKEY",
    }
    for query_key, environment_key in query_environment.items():
        value = url.query.get(query_key)
        if value:
            environment[environment_key] = str(value)
    return environment, url.database


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return cleaned or "database"


def _create_dump(output_path: Path, database_url: str) -> None:
    pg_dump = shutil.which("pg_dump")
    pg_restore = shutil.which("pg_restore")
    if not pg_dump or not pg_restore:
        raise RuntimeError("pg_dump dan pg_restore tidak tersedia di sistem.")

    environment, _ = _postgres_environment(database_url)
    dump_result = subprocess.run(
        [
            pg_dump,
            "--format=custom",
            "--compress=9",
            "--no-owner",
            "--no-privileges",
            "--no-password",
            "--file",
            str(output_path),
        ],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    if dump_result.returncode != 0:
        detail = dump_result.stderr.strip() or "pg_dump berhenti tanpa keterangan."
        raise RuntimeError(f"Backup PostgreSQL gagal: {detail}")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("pg_dump tidak menghasilkan file backup yang valid.")

    validation_result = subprocess.run(
        [pg_restore, "--list", str(output_path)],
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if validation_result.returncode != 0:
        detail = validation_result.stderr.strip() or "arsip tidak dapat dibaca."
        raise RuntimeError(f"Validasi backup PostgreSQL gagal: {detail}")


def _backup_email_payload(
    settings: Settings,
    filename: str,
    content: bytes,
    database_name: str,
    created_at: datetime,
) -> dict:
    digest = hashlib.sha256(content).hexdigest()
    size_mb = len(content) / (1024 * 1024)
    timestamp = created_at.astimezone(WIB).strftime("%d-%m-%Y %H:%M:%S WIB")
    restore_example = f"pg_restore --clean --if-exists --no-owner --no-privileges --dbname=DATABASE_TUJUAN {filename}"
    return {
        "from": settings.resend_from_email,
        "to": settings.transaction_notification_emails,
        "subject": f"[ASAS POS] Backup database · {created_at.astimezone(WIB):%d-%m-%Y %H:%M WIB}",
        "html": (
            '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a">'
            '<h2>Backup database ASAS POS</h2>'
            '<p>Backup PostgreSQL otomatis berhasil dibuat dan dilampirkan pada email ini.</p>'
            '<table style="width:100%;border-collapse:collapse;background:#f8fafc">'
            f'<tr><td style="padding:7px 12px;color:#64748b">Database</td><td style="padding:7px 12px;font-weight:700">{html.escape(database_name)}</td></tr>'
            f'<tr><td style="padding:7px 12px;color:#64748b">Waktu backup</td><td style="padding:7px 12px;font-weight:700">{timestamp}</td></tr>'
            f'<tr><td style="padding:7px 12px;color:#64748b">Ukuran</td><td style="padding:7px 12px;font-weight:700">{size_mb:.2f} MB</td></tr>'
            f'<tr><td style="padding:7px 12px;color:#64748b">SHA-256</td><td style="padding:7px 12px;font-family:monospace;word-break:break-all">{digest}</td></tr>'
            '</table>'
            '<p style="margin-top:18px"><strong>Contoh restore:</strong></p>'
            f'<pre style="white-space:pre-wrap;background:#e2e8f0;padding:12px;border-radius:8px">{html.escape(restore_example)}</pre>'
            '<p style="color:#b91c1c;font-weight:700">Restore akan mengganti objek pada database tujuan. Uji backup secara berkala di database terpisah.</p>'
            '</div>'
        ),
        "attachments": [{
            "filename": filename,
            "content": base64.b64encode(content).decode("ascii"),
        }],
        "tags": [{"name": "event", "value": "pos_database_backup"}],
    }


def run_backup(settings: Settings | None = None) -> tuple[str, int, str]:
    settings = settings or get_settings()
    if not settings.resend_api_key or not settings.resend_from_email or not settings.transaction_notification_emails:
        raise RuntimeError(
            "RESEND_API_KEY, RESEND_FROM_EMAIL, dan TRANSACTION_NOTIFICATION_EMAILS wajib diisi."
        )

    _, database_name = _postgres_environment(settings.database_url)
    created_at = datetime.now(WIB)
    filename = f"asas-pos-{_safe_filename_part(database_name)}-{created_at:%Y%m%d-%H%M%S-WIB}.dump"
    with TemporaryDirectory(prefix="asas-pos-backup-") as temporary_directory:
        output_path = Path(temporary_directory) / filename
        _create_dump(output_path, settings.database_url)
        content = output_path.read_bytes()
        if len(content) > MAX_RAW_BACKUP_BYTES:
            raise RuntimeError(
                f"Backup berukuran {len(content)} byte, melebihi batas aman lampiran Resend "
                f"{MAX_RAW_BACKUP_BYTES} byte. Gunakan penyimpanan backup eksternal."
            )
        digest = hashlib.sha256(content).hexdigest()
        payload = _backup_email_payload(settings, filename, content, database_name, created_at)
        idempotency_key = f"pos-db-backup-{created_at:%Y%m%d-%H%M%S}-{digest[:16]}"
        if not _send_resend_request(
            RESEND_EMAILS_URL,
            payload,
            idempotency_key,
            timeout_seconds=120,
        ):
            raise RuntimeError("Backup selesai dibuat, tetapi email backup gagal dikirim.")
        return filename, len(content), digest


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    lock_file = open(LOCK_PATH, "w", encoding="utf-8")
    try:
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            logger.error("Backup lain masih berjalan; proses baru dibatalkan.")
            return 2
        filename, size, digest = run_backup()
        logger.info("Backup %s (%s byte, SHA-256 %s) berhasil dikirim.", filename, size, digest)
        return 0
    except Exception as error:
        logger.error("Backup database gagal: %s", error)
        return 1
    finally:
        lock_file.close()


if __name__ == "__main__":
    sys.exit(main())
