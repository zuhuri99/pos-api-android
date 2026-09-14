import os
from pathlib import Path

TEST_DATABASE = Path(__file__).resolve().parent.parent / "test-pos.db"
TEST_DATABASE.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{TEST_DATABASE}"
os.environ["BOOTSTRAP_USERNAME"] = "admin"
os.environ["BOOTSTRAP_PASSWORD"] = "test-password"
