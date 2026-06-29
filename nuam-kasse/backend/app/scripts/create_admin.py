from getpass import getpass

from app.db.session import SessionLocal
from app.models.user import UserRole
from app.services.user_service import UserServiceError, create_user


def main() -> None:
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL ist nicht konfiguriert.")

    username = input("Benutzername: ")
    display_name = input("Anzeigename: ")
    password = getpass("Passwort: ")
    confirmation = getpass("Passwort wiederholen: ")

    with SessionLocal() as db:
        try:
            user = create_user(
                db,
                username=username,
                display_name=display_name,
                password=password,
                password_confirmation=confirmation,
                role=UserRole.admin,
                must_change_password=False,
            )
            created_username = user.username
        except UserServiceError as exc:
            raise SystemExit(str(exc)) from exc

    print(f"Administrator '{created_username}' wurde angelegt.")


if __name__ == "__main__":
    main()
