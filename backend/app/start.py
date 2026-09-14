from alembic import command
from alembic.config import Config
import os
import uvicorn


def main() -> None:
    command.upgrade(Config("alembic.ini"), "head")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
