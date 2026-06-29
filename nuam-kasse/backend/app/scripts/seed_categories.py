from app.db.session import SessionLocal
from app.services.category_service import seed_default_categories


def main() -> None:
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL ist nicht konfiguriert.")

    with SessionLocal() as db:
        created, existing = seed_default_categories(db)

    print(f"Standardkategorien angelegt: {created}")
    print(f"Bereits vorhanden: {existing}")


if __name__ == "__main__":
    main()
