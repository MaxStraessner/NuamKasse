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
- Backend: Python, FastAPI, SQLAlchemy 2, Pydantic Settings, Alembic, Pytest
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

Alembic ist vorbereitet. Es gibt noch keine fachlichen Tabellen oder Migrationen.

Beispiel fuer spaetere Migrationen:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Bekannte Einschraenkungen

- Noch keine Benutzeranmeldung oder Rollen.
- Noch keine Kategorien, Kassenperioden, Buchungen oder Berechnungen.
- Noch keine PWA-Installation, kein Service Worker und kein Offline-Modus.
- Noch keine Hostinger-, Domain- oder HTTPS-Konfiguration.
- Die sichtbaren Geldbetraege und Kategoriesymbole sind nur als Platzhalter markiert.

## Naechste geplante Module

1. Benutzermodul
2. Kategorienmodul
3. Kassenmodul
4. Buchungsmodul
5. Uebersichtsmodul
6. PWA und Deployment
7. abschliessende Tests und Absicherung

## Technische Entscheidungen

- Das Backend hat eine strukturierte API unter `/api/v1`.
- Der Health Check gibt App-Status, Datenbankstatus, App-Namen und Version zurueck.
- Die Datenbankverbindung wird ueber Umgebungsvariablen konfiguriert.
- Das Frontend nutzt bewusst nur React Hooks statt komplexem State Management.
- Das CSS-Designsystem liegt zentral in `frontend/src/styles/global.css`.
- Nginx dient im Frontend-Container die statischen Dateien aus und proxyt API-Aufrufe an FastAPI.
