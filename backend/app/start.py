from alembic import command
from alembic.config import Config
import os
import uvicorn

from .core.config import get_settings


def main() -> None:
    command.upgrade(Config("alembic.ini"), "head")
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        proxy_headers=True,
        forwarded_allow_ips="*",
        limit_concurrency=settings.api_max_concurrency,
        backlog=128,
        timeout_keep_alive=5,
    )


if __name__ == "__main__":
    main()
