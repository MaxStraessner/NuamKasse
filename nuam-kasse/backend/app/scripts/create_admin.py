import argparse
import os
import secrets
from getpass import getpass

from app.db.session import SessionLocal
from app.models.user import UserRole
from app.services.user_service import (
    UserServiceError,
    create_user,
    get_user_by_normalized_username,
    reset_user_password,
    update_user,
)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Administrator sicher erstellen beziehungsweise hochstufen."
    )
    parser.add_argument("--username", help="Benutzername; alternativ NUAM_ADMIN_USERNAME")
    parser.add_argument("--display-name", help="Anzeigename für einen neuen Benutzer")
    parser.add_argument(
        "--promote-existing",
        action="store_true",
        help="Vorhandenen Benutzer aktivieren und zum Administrator hochstufen",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Beim Hochstufen zugleich ein neues Passwort setzen",
    )
    parser.add_argument(
        "--generate-password",
        action="store_true",
        help="Ein starkes Passwort generieren und genau einmal ausgeben",
    )
    return parser.parse_args()


def _password(args: argparse.Namespace) -> str:
    if args.generate_password:
        return secrets.token_urlsafe(24)
    environment_password = os.getenv("NUAM_ADMIN_PASSWORD")
    if environment_password:
        return environment_password
    password = getpass("Passwort: ")
    confirmation = getpass("Passwort wiederholen: ")
    if password != confirmation:
        raise SystemExit("Die Passwortbestätigung stimmt nicht überein.")
    return password


def main() -> None:
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL ist nicht konfiguriert.")

    args = _arguments()
    username = (args.username or os.getenv("NUAM_ADMIN_USERNAME") or input("Benutzername: ")).strip()
    if not username:
        raise SystemExit("Der Benutzername darf nicht leer sein.")

    emitted_password: str | None = None
    with SessionLocal() as db:
        existing = get_user_by_normalized_username(db, username)
        try:
            if existing is not None:
                if not args.promote_existing:
                    raise SystemExit(
                        "Benutzer existiert bereits. --promote-existing ist für eine gezielte Hochstufung erforderlich."
                    )
                update_user(
                    db,
                    existing,
                    role=UserRole.admin,
                    is_active=True,
                    actor=None,
                )
                if args.reset_password:
                    emitted_password = _password(args)
                    reset_user_password(
                        db,
                        existing,
                        new_password=emitted_password,
                        new_password_confirmation=emitted_password,
                        actor=None,
                        must_change_password=False,
                    )
                admin = existing
                result = "hochgestuft"
            else:
                display_name = (
                    args.display_name
                    or os.getenv("NUAM_ADMIN_DISPLAY_NAME")
                    or input("Anzeigename: ")
                )
                emitted_password = _password(args)
                admin = create_user(
                    db,
                    username=username,
                    display_name=display_name,
                    password=emitted_password,
                    password_confirmation=emitted_password,
                    role=UserRole.admin,
                    is_active=True,
                    must_change_password=False,
                    actor=None,
                )
                result = "angelegt"
        except UserServiceError as exc:
            raise SystemExit(str(exc)) from exc
        admin_username = admin.username

    print(f"Administrator '{admin_username}' wurde {result}.")
    if emitted_password is not None and args.generate_password:
        print(f"Generiertes Passwort (nur diese Ausgabe): {emitted_password}")


if __name__ == "__main__":
    main()
