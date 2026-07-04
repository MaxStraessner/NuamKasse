import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import User, UserRole


@pytest.fixture
def db_session(tmp_path) -> Session:
    database_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite+pysqlite:///{database_path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        app_name="Nuam Kasse",
        app_version="0.6.0",
        app_env="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'health.db'}",
        backend_cors_origins="http://testserver",
        session_cookie_name="nuam_kasse_test_session",
        session_ttl_hours=168,
        session_cookie_secure=False,
        session_cookie_samesite="lax",
        category_image_storage_path=str(tmp_path / "uploads" / "category-images"),
        category_image_max_bytes=5 * 1024 * 1024,
    )


@pytest.fixture
def client(db_session: Session, settings: Settings) -> TestClient:
    def override_get_db():
        yield db_session

    app.dependency_overrides.clear()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def create_test_user(
    db: Session,
    *,
    username: str,
    password: str = "password-123",
    role: UserRole = UserRole.member,
    is_active: bool = True,
    must_change_password: bool = False,
) -> User:
    user = User(
        username=username,
        username_normalized=username.strip().casefold(),
        display_name=username.title(),
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
