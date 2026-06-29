from getpass import getpass

from app.db.session import SessionLocal
from app.services.user_service import (
    UserServiceError,
    get_user_by_normalized_username,
    reset_user_password,
)


def main() -> None:
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL ist nicht konfiguriert.")

    username = input("Benutzername: ")
    password = getpass("Neues Passwort: ")
    confirmation = getpass("Neues Passwort wiederholen: ")

    with SessionLocal() as db:
        user = get_user_by_normalized_username(db, username)
        if user is None:
            raise SystemExit("Benutzer wurde nicht gefunden.")

        try:
            reset_user_password(
                db,
                user,
                new_password=password,
                new_password_confirmation=confirmation,
            )
            reset_username = user.username
        except UserServiceError as exc:
            raise SystemExit(str(exc)) from exc

    print(f"Passwort fuer '{reset_username}' wurde zurueckgesetzt.")


if __name__ == "__main__":
    main()
