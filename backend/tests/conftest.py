import os
from pathlib import Path

TEST_DATABASE = Path(__file__).resolve().parent.parent / "test-pos.db"
TEST_DATABASE.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{TEST_DATABASE}"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "test-password"
os.environ["ADMIN_TOKEN_TTL_DAYS"] = "3650"
os.environ["USER_USERNAME"] = "kasir"
os.environ["USER_PASSWORD"] = "cashier-password"
os.environ["USER_TOKEN_TTL_DAYS"] = "3650"
os.environ["USER_DELETE_PIN"] = "654321"
