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
                    "INSERT INTO users "
                    "(id, username, username_normalized, display_name, password_hash, role, is_active, "
                    "must_change_password, created_at, updated_at) VALUES "
                    "(3, 'rich-admin', 'rich-admin', 'Rich Admin', 'hash', 'admin', 1, 0, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO users "
                    "(id, username, username_normalized, display_name, password_hash, role, is_active, "
                    "must_change_password, created_at, updated_at) VALUES "
                    "(2, 'member', 'member', 'Member', 'hash', 'member', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
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
                    "INSERT INTO categories "
                    "(id, user_id, name, name_normalized, icon_key, color_key, image_path, parent_category_id, "
                    "sort_order, is_active, created_at, updated_at) VALUES "
                    "(3, 3, 'Lebensmittel', 'lebensmittel', 'utensils', 'orange', 'rich-1.webp', NULL, 1, 1, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), "
                    "(4, 3, 'Einnahmen', 'einnahmen', 'wallet', 'green', 'rich-2.webp', NULL, 2, 1, "
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
                    "INSERT INTO categories "
                    "(id, user_id, name, name_normalized, icon_key, color_key, image_path, parent_category_id, "
                    "sort_order, is_active, created_at, updated_at) VALUES "
                    "(2, 2, 'Essen', 'essen', 'utensils', 'orange', NULL, NULL, 1, 1, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO expenses "
                    "(id, cash_period_id, category_id, amount, currency, created_by_user_id, created_at, is_voided) "
                    "VALUES (1, 1, 1, 25, 'THB', 1, CURRENT_TIMESTAMP, 0)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO expenses "
                    "(id, cash_period_id, category_id, amount, currency, created_by_user_id, created_at, is_voided) "
                    "VALUES (2, 1, 2, 40, 'THB', 2, CURRENT_TIMESTAMP, 0)"
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
            cashbook = connection.execute(
                text(
                    "SELECT id, name, currency, created_by_user_id, category_owner_user_id "
                    "FROM cashbooks"
                )
            ).one()
            memberships = connection.execute(
                text("SELECT user_id, cashbook_id, role FROM cashbook_memberships ORDER BY user_id")
            ).all()
            category_rows = connection.execute(
                text("SELECT id, user_id, cashbook_id FROM categories ORDER BY id")
            ).all()
            expense_rows = connection.execute(
                text(
                    "SELECT id, cash_period_id, category_id, created_by_user_id "
                    "FROM expenses ORDER BY id"
                )
            ).all()
            period = connection.execute(
                text("SELECT id, cashbook_id, opening_amount, status FROM cash_periods WHERE id = 1")
            ).one()
            assert category == ("Gehalt", "original.webp", "expense")
            assert str(expense.amount) in {"25", "25.00"}
            assert expense.category_id == 1
            assert expense.transaction_type == "expense"
            assert cashbook.name == "Nuam Kasse"
            assert cashbook.currency == "THB"
            assert cashbook.created_by_user_id == 1
            assert cashbook.category_owner_user_id == 3
            assert memberships == [
                (1, cashbook.id, "admin"),
                (2, cashbook.id, "member"),
                (3, cashbook.id, "member"),
            ]
            assert category_rows == [
                (1, 1, cashbook.id),
                (2, 2, cashbook.id),
                (3, 3, cashbook.id),
                (4, 3, cashbook.id),
            ]
            assert expense_rows == [(1, 1, 1, 1), (2, 1, 2, 2)]
            assert period.id == 1
            assert period.cashbook_id == cashbook.id
            assert str(period.opening_amount) in {"100", "100.00"}
            assert period.status == "active"
            assert {column["name"] for column in inspect(connection).get_columns("categories")} >= {"category_type"}
            assert {column["name"] for column in inspect(connection).get_columns("expenses")} >= {"transaction_type"}
            assert {column["name"] for column in inspect(connection).get_columns("cash_periods")} >= {
                "closed_opening_amount",
                "closed_income_amount",
                "closed_expense_amount",
                "closed_balance_amount",
                "closed_booking_count",
            }
            membership_unique_columns = {
                tuple(item["column_names"])
                for item in inspect(connection).get_unique_constraints("cashbook_memberships")
            }
            assert ("cashbook_id", "user_id") in membership_unique_columns
            assert ("user_id",) not in membership_unique_columns
        engine.dispose()
    finally:
        get_settings.cache_clear()
