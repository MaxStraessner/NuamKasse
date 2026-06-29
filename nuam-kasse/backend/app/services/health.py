from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool


def check_database(database_url: str) -> str:
    if not database_url:
        return "not_configured"

    connect_args: dict[str, int] = {}
    if database_url.startswith("postgresql"):
        connect_args["connect_timeout"] = 2

    engine = create_engine(
        database_url,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args=connect_args,
    )

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return "unavailable"
    finally:
        engine.dispose()

    return "connected"
