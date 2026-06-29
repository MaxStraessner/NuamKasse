# Nuam Kasse

Nuam Kasse ist die technische Grundlage fuer eine kleine gemeinsame Kassenbuch-Web-App. Die App ist mobile-first ausgelegt und soll spaeter als Progressive Web App auf einem Hostinger VPS betrieben werden.

Umgesetzt sind die technische Basis, Benutzerauthentifizierung mit Rollen und serverseitigen Sitzungen sowie das Kategorienmodul als Stammdatenverwaltung. Kassenperioden, Buchungen, Berechnungen und Statistiken sind bewusst noch nicht enthalten.

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

- Frontend: React, TypeScript, Vite, React Router, lucide-react, Vitest, React Testing Library
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

Alembic enthaelt Migrationen fuer Benutzer, serverseitige Sitzungen und Kategorien.

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

## Kategorienmodul

Das Kategorienmodul verwaltet zentrale Ausgabenkategorien, die spaeter beim Erfassen von Buchungen als grosse Symbole ausgewaehlt werden. In diesem Modul werden noch keine Buchungen, Kassenperioden, Betraege oder Statistiken erzeugt.

Fachliche Regeln:

- Kategorien sind globale Stammdaten fuer alle angemeldeten Benutzer.
- Normale Benutzer sehen nur aktive Kategorien.
- Administratoren koennen aktive und inaktive Kategorien sehen.
- Nur Administratoren koennen Kategorien anlegen, bearbeiten, aktivieren, deaktivieren und sortieren.
- Kategorien werden nicht endgueltig geloescht, damit spaetere historische Buchungen referenziert bleiben koennen.
- Die Reihenfolge wird zentral ueber `sort_order` gespeichert.

Datenmodell `categories`:

- `id`: Primaerschluessel.
- `name`: sichtbarer Name, getrimmt, 1 bis 50 Zeichen.
- `name_normalized`: normalisierter eindeutiger Name fuer case-insensitive Eindeutigkeit.
- `icon_key`: kontrollierter Symbolschluessel.
- `color_key`: kontrollierter Farbschluessel.
- `sort_order`: zentrale Anzeige-Reihenfolge.
- `is_active`: Aktivstatus.
- `created_at` und `updated_at`: UTC-Zeitstempel.

Symbolkonzept:

- In der Datenbank wird nur ein kontrollierter `icon_key` gespeichert.
- Das Frontend mappt diese Schluessel zentral auf `lucide-react` Icons.
- Es werden keine SVG-Inhalte, HTML-Inhalte, JavaScript-Fragmente, externen Bildadressen oder Uploads gespeichert.
- Unbekannte Symbolschluessel werden im Backend abgelehnt; das Frontend nutzt als Fallback ein neutrales Symbol.

Verfuegbare Symbolschluessel:

```text
utensils, shopping-cart, heart-pulse, pill, zap, landmark, wallet, gift,
plane, bike, car, car-taxi-front, hotel, house, cake, baby, shirt, school,
fuel, phone, wifi, wrench, paw-print, coffee, bus, train, circle-ellipsis
```

Farbkonzept:

- In der Datenbank wird nur ein kontrollierter `color_key` gespeichert.
- Die tatsaechlichen Farben liegen im Frontend-Designsystem als CSS-Variablen und kontrollierte `data-category-color` Attribute.
- Es werden keine freien CSS-Werte, CSS-Klassen oder Hex-Werte aus der Datenbank ausgefuehrt.
- Kategorien sind immer ueber Symbol und Name erkennbar, nicht nur ueber Farbe.

Verfuegbare Farbschluessel:

```text
orange, green, blue, red, purple, pink, teal, yellow, indigo, gray
```

API-Endpunkte:

- `GET /api/v1/categories`: aktive Kategorien fuer alle angemeldeten Benutzer.
- `GET /api/v1/categories?include_inactive=true`: aktive und inaktive Kategorien nur fuer Administratoren; fuer Mitglieder wird der Parameter ignoriert.
- `GET /api/v1/categories/catalog`: kontrollierter Symbol- und Farbkatalog, nur fuer Administratoren.
- `POST /api/v1/categories`: Kategorie anlegen, nur fuer Administratoren.
- `PATCH /api/v1/categories/{category_id}`: Name, Symbol, Farbe und Aktivstatus bearbeiten, nur fuer Administratoren.
- `PUT /api/v1/categories/reorder`: vollstaendige Kategorie-Reihenfolge speichern, nur fuer Administratoren.

Seed-Skript fuer Standardkategorien:

```bash
python -m app.scripts.seed_categories
```

Im Docker-Setup:

```bash
docker compose exec backend python -m app.scripts.seed_categories
```

Das Skript ist idempotent: Es legt fehlende Standardkategorien an, erzeugt keine Duplikate und ueberschreibt vorhandene Kategorien nicht.

Standardkategorien:

1. Essen
2. Einkauf
3. Gesundheit
4. Strom
5. Bank
6. Geschenk
7. Reise
8. Motorrad
9. Taxi
10. Unterkunft
11. Geburtstag
12. Sonstiges

Einrichtungsablauf fuer Kategorien:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.seed_categories
```

Manuelle Pruefschritte:

1. Als Administrator anmelden.
2. Kategorieverwaltung in den Einstellungen oeffnen.
3. Standardkategorien pruefen.
4. Kategorie anlegen, bearbeiten, deaktivieren, reaktivieren und sortieren.
5. Startseite pruefen: aktive Kategorien werden angezeigt, deaktivierte nicht.
6. Als Mitglied anmelden: aktive Kategorien sind sichtbar, Verwaltung ist nicht sichtbar.

## Bekannte Einschraenkungen

- Noch keine Kassenperioden, Buchungen, Ausgabenberechnung oder Statistiken.
- Noch keine PWA-Installation, kein Service Worker und kein Offline-Modus.
- Noch keine Hostinger-, Domain- oder HTTPS-Konfiguration.
- Die sichtbaren Geldbetraege sind weiterhin Platzhalter.

## Naechste geplante Module

1. Kassenmodul
2. Buchungsmodul
3. Uebersichtsmodul
4. PWA und Deployment
5. abschliessende Tests und Absicherung

## Technische Entscheidungen

- Das Backend hat eine strukturierte API unter `/api/v1`.
- Der Health Check gibt App-Status, Datenbankstatus, App-Namen und Version zurueck.
- Die Datenbankverbindung wird ueber Umgebungsvariablen konfiguriert.
- Das Frontend nutzt bewusst nur React Hooks statt komplexem State Management.
- Das CSS-Designsystem liegt zentral in `frontend/src/styles/global.css`.
- Nginx dient im Frontend-Container die statischen Dateien aus und proxyt API-Aufrufe an FastAPI.
