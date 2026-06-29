# Nuam Kasse

Nuam Kasse ist die technische Grundlage fuer eine kleine gemeinsame Kassenbuch-Web-App. Die App ist mobile-first ausgelegt und soll spaeter als Progressive Web App auf einem Hostinger VPS betrieben werden.

In diesem Schritt sind nur die technische Basis und eine erste visuelle App-Huelle umgesetzt. Fachliche Module wie Anmeldung, Kategorienverwaltung, Kassenperioden oder Buchungen sind bewusst noch nicht enthalten.

## Architektur

```text
Smartphone
    |
React Web App
    |
FastAPI Backend
    |
PostgreSQL Datenbank
```

## Technologien

- Frontend: React, TypeScript, Vite, React Router, Vitest, React Testing Library
- Backend: Python, FastAPI, SQLAlchemy 2, Pydantic Settings, Alembic, Argon2, Pytest
- Datenbank: PostgreSQL mit persistentem Docker Volume
- Betrieb: Docker Compose mit getrennten Containern fuer Frontend, Backend und Datenbank

## Projektstruktur

```text
nuam-kasse/
+-- backend/
|   +-- app/
|   |   +-- api/
|   |   +-- core/
|   |   +-- db/
|   |   +-- models/
|   |   +-- schemas/
|   |   +-- services/
|   |   +-- main.py
|   +-- alembic/
|   +-- tests/
|   +-- Dockerfile
|   +-- requirements.txt
+-- frontend/
|   +-- src/
|   |   +-- app/
|   |   +-- components/
|   |   +-- features/
|   |   +-- layouts/
|   |   +-- pages/
|   |   +-- services/
|   |   +-- styles/
|   |   +-- types/
|   +-- public/
|   +-- tests/
|   +-- Dockerfile
|   +-- package.json
+-- docker-compose.yml
+-- docker-compose.prod.yml
+-- .env.example
+-- README.md
```

## Voraussetzungen

- Docker und Docker Compose
- Docker Desktop muss gestartet sein; unter Windows muss die Docker-Desktop-WSL-Engine laufen
- Optional fuer lokale Entwicklung ohne Docker: Python 3.12 und Node.js 22

## Umgebungsvariablen

Kopiere `.env.example` nach `.env` und passe Werte fuer die Zielumgebung an. Die Beispielwerte sind lokale Platzhalter und keine Produktions-Secrets.

Wichtige Variablen:

- `APP_NAME`: Anzeigename der App
- `APP_VERSION`: technische App-Version
- `APP_ENV`: `development`, `test` oder `production`
- `DATABASE_URL`: SQLAlchemy-Verbindungsstring
- `POSTGRES_DB`: PostgreSQL-Datenbankname
- `POSTGRES_USER`: PostgreSQL-Benutzer
- `POSTGRES_PASSWORD`: PostgreSQL-Passwort
- `BACKEND_CORS_ORIGINS`: erlaubte Frontend-Urspruenge
- `VITE_API_BASE_URL`: API-Basis-URL im Frontend
- `FRONTEND_PORT`: lokaler Port fuer den Frontend-Container
- `SESSION_COOKIE_NAME`: Name des HttpOnly-Sitzungscookies
- `SESSION_TTL_HOURS`: Sitzungsdauer in Stunden
- `SESSION_COOKIE_SECURE`: in Produktion auf `true` setzen
- `SESSION_COOKIE_SAMESITE`: SameSite-Wert, lokal `lax`

## Lokaler Start mit Docker Compose

```bash
docker compose up --build
```

Lokale URLs:

- Frontend: http://localhost:8080
- Backend Health Check: http://localhost:8000/api/v1/health
- OpenAPI Docs: http://localhost:8000/api/v1/docs

Das Frontend ruft den echten Backend-Health-Check ueber `/api/v1/health` auf. Im Docker-Setup leitet Nginx diese Route an den Backend-Container weiter.

## Lokale Entwicklung ohne Docker

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite proxyt `/api` lokal an `http://localhost:8000`.

## Tests

Backend:

```bash
cd backend
pytest
```

Frontend:

```bash
cd frontend
npm test
```

## Build

Frontend Production Build:

```bash
cd frontend
npm run build
```

Docker-Konfiguration pruefen:

```bash
docker compose config
```

## Datenbankmigrationen

Alembic enthaelt die Migration fuer Benutzer und serverseitige Sitzungen.

Beispiel fuer spaetere Migrationen:

```bash
cd backend
alembic upgrade head
```

Im Docker-Setup:

```bash
docker compose exec backend alembic upgrade head
```

## Benutzermodul

Das Benutzermodul schuetzt die App vor nicht angemeldeten Benutzern. Es gibt keine oeffentliche Registrierung. Benutzer werden durch Administratoren angelegt.

Rollen:

- `admin`: Benutzer auflisten, anlegen, bearbeiten, aktivieren, deaktivieren, Rollen aendern und Passwoerter zuruecksetzen.
- `member`: anmelden, abmelden, eigene Kontodaten sehen, eigenes Passwort aendern und spaeter normale Kassenfunktionen verwenden.

Datenmodell:

- `users`: Benutzername, normalisierter eindeutiger Benutzername, Anzeigename, Argon2-Passwort-Hash, Rolle, Aktivstatus, Pflicht-Passwortwechsel und Zeitstempel.
- `user_sessions`: serverseitige Sitzung mit Benutzerbezug, Hash des Sitzungsschluessels, Ablaufzeit und letzter Verwendung.

Sicherheitsentscheidungen:

- Passwoerter werden ausschliesslich mit Argon2 gehasht.
- Sitzungsschluessel werden nur als HttpOnly-Cookie im Browser gespeichert.
- In der Datenbank liegt nur ein SHA-256-Hash des zufaelligen Sitzungsschluessels.
- Cookies verwenden `SameSite=Lax`; in Produktion muss `SESSION_COOKIE_SECURE=true` gesetzt werden.
- Rollen- und Passwortwechsel-Pruefungen werden verbindlich im Backend durchgesetzt.
- Der letzte aktive Administrator kann nicht deaktiviert oder zum Mitglied herabgestuft werden.

API-Endpunkte:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/{user_id}`
- `POST /api/v1/users/{user_id}/reset-password`

CLI-Befehle:

```bash
python -m app.scripts.create_admin
python -m app.scripts.reset_password
```

Im Docker-Setup:

```bash
docker compose exec backend python -m app.scripts.create_admin
docker compose exec backend python -m app.scripts.reset_password
```

Einrichtungsablauf:

1. Container starten.
2. Datenbankmigration ausfuehren.
3. Ersten Administrator ueber CLI anlegen.
4. Als Administrator anmelden.
5. Nuam ueber die Benutzerverwaltung anlegen.
6. Als Administrator abmelden.
7. Als Nuam mit dem vorlaeufigen Passwort anmelden.
8. Eigenes Passwort vergeben.
9. Normale App-Oberflaeche oeffnen.

## Bekannte Einschraenkungen

- Noch keine Kategorien, Kassenperioden, Buchungen oder Berechnungen.
- Noch keine PWA-Installation, kein Service Worker und kein Offline-Modus.
- Noch keine Hostinger-, Domain- oder HTTPS-Konfiguration.
- Die sichtbaren Geldbetraege und Kategoriesymbole sind nur als Platzhalter markiert.

## Naechste geplante Module

1. Kategorienmodul
2. Kassenmodul
3. Buchungsmodul
4. Uebersichtsmodul
5. PWA und Deployment
6. abschliessende Tests und Absicherung

## Technische Entscheidungen

- Das Backend hat eine strukturierte API unter `/api/v1`.
- Der Health Check gibt App-Status, Datenbankstatus, App-Namen und Version zurueck.
- Die Datenbankverbindung wird ueber Umgebungsvariablen konfiguriert.
- Das Frontend nutzt bewusst nur React Hooks statt komplexem State Management.
- Das CSS-Designsystem liegt zentral in `frontend/src/styles/global.css`.
- Nginx dient im Frontend-Container die statischen Dateien aus und proxyt API-Aufrufe an FastAPI.
