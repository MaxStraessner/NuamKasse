import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

password_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)


def normalize_username(username: str) -> str:
    return username.strip().casefold()


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Das Passwort muss mindestens 8 Zeichen enthalten.")
    if len(password) > 128:
        raise ValueError("Das Passwort darf höchstens 128 Zeichen enthalten.")
    if not password.strip():
        raise ValueError("Das Passwort muss mindestens ein sichtbares Zeichen enthalten.")


def hash_password(password: str) -> str:
    validate_password(password)
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


def create_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
