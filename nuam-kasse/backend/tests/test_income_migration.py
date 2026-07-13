from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings


def test_income_migration_preserves_categories_expenses_and_defaults(tmp_path, monkeypatch):
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite+pysqlite:///{database_path}"
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    try:
        command.upgrade(config, "20260712_0008")
        engine = create_engine(database_url)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users "
                    "(id, username, username_normalized, display_name, password_hash, role, is_active, "
                    "must_change_password, created_at, updated_at) VALUES "
                    "(1, 'admin', 'admin', 'Admin', 'hash', 'admin', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO categories "
                    "(id, user_id, name, name_normalized, icon_key, color_key, image_path, parent_category_id, "
                    "sort_order, is_active, created_at, updated_at) VALUES "
                    "(1, 1, 'Gehalt', 'gehalt', 'wallet', 'green', 'original.webp', NULL, 1, 1, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO cash_periods "
                    "(id, name, opening_amount, currency, start_date, status, created_by_user_id, created_at, updated_at) "
                    "VALUES (1, 'Juli', 100, 'THB', '2026-07-01', 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO expenses "
                    "(id, cash_period_id, category_id, amount, currency, created_by_user_id, created_at, is_voided) "
                    "VALUES (1, 1, 1, 25, 'THB', 1, CURRENT_TIMESTAMP, 0)"
                )
            )

        command.upgrade(config, "head")

        with engine.connect() as connection:
            category = connection.execute(
                text("SELECT name, image_path, category_type FROM categories WHERE id = 1")
            ).one()
            expense = connection.execute(
                text("SELECT amount, category_id, transaction_type FROM expenses WHERE id = 1")
            ).one()
            assert category == ("Gehalt", "original.webp", "expense")
            assert str(expense.amount) in {"25", "25.00"}
            assert expense.category_id == 1
            assert expense.transaction_type == "expense"
            assert {column["name"] for column in inspect(connection).get_columns("categories")} >= {"category_type"}
            assert {column["name"] for column in inspect(connection).get_columns("expenses")} >= {"transaction_type"}
        engine.dispose()
    finally:
        get_settings.cache_clear()
