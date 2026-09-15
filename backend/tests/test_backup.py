import base64
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app import backup
from app.core.config import Settings


def _settings() -> Settings:
    return Settings(
        database_url="postgresql+psycopg://backup_user:p%40ss@database.internal:5433/pos_db?sslmode=require",
        admin_username="admin",
        admin_password="test-password",
        user_username="kasir",
        user_password="cashier-password",
        user_authorization_pin="654321",
        resend_api_key="re_test",
        resend_from_email="ASAS POS <backup@example.com>",
        transaction_notification_emails=["owner@example.com", "audit@example.com"],
    )


def test_postgres_environment_uses_password_outside_command_line():
    environment, database_name = backup._postgres_environment(_settings().database_url)

    assert database_name == "pos_db"
    assert environment["PGHOST"] == "database.internal"
    assert environment["PGPORT"] == "5433"
    assert environment["PGUSER"] == "backup_user"
    assert environment["PGPASSWORD"] == "p@ss"
    assert environment["PGDATABASE"] == "pos_db"
    assert environment["PGSSLMODE"] == "require"


def test_backup_email_contains_pg_restore_attachment_and_recipients():
    content = b"PGDMP-test-content"
    payload = backup._backup_email_payload(
        _settings(),
        "asas-pos-pos_db.dump",
        content,
        "pos_db",
        datetime(2026, 9, 15, 2, 0, tzinfo=ZoneInfo("Asia/Jakarta")),
    )

    assert payload["to"] == ["owner@example.com", "audit@example.com"]
    assert "15-09-2026 02:00 WIB" in payload["subject"]
    assert "pg_restore" in payload["html"]
    assert payload["attachments"][0]["filename"] == "asas-pos-pos_db.dump"
    assert base64.b64decode(payload["attachments"][0]["content"]) == content
    assert payload["tags"] == [{"name": "event", "value": "pos_database_backup"}]


def test_create_dump_uses_custom_format_and_validates_archive(monkeypatch, tmp_path: Path):
    calls = []

    monkeypatch.setattr(backup.shutil, "which", lambda command: f"/usr/bin/{command}")

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        if command[0].endswith("pg_dump"):
            output_path = Path(command[command.index("--file") + 1])
            output_path.write_bytes(b"PGDMP-valid")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(backup.subprocess, "run", fake_run)
    output_path = tmp_path / "backup.dump"
    backup._create_dump(output_path, _settings().database_url)

    dump_command, dump_options = calls[0]
    assert "--format=custom" in dump_command
    assert "--no-owner" in dump_command
    assert "--no-privileges" in dump_command
    assert _settings().database_url not in dump_command
    assert dump_options["env"]["PGPASSWORD"] == "p@ss"
    assert calls[1][0] == ["/usr/bin/pg_restore", "--list", str(output_path)]
