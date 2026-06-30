# Nuam Kasse

Nuam Kasse ist die technische Grundlage fuer eine kleine gemeinsame Kassenbuch-Web-App. Die App ist mobile-first ausgelegt und soll spaeter als Progressive Web App auf einem Hostinger VPS betrieben werden.

Umgesetzt sind die technische Basis, Benutzerauthentifizierung mit Rollen und serverseitigen Sitzungen, das Kategorienmodul als Stammdatenverwaltung, das Kassenmodul fuer aktive und abgeschlossene Kassenperioden, das Buchungsmodul fuer Ausgaben und Stornierungen sowie das Uebersichtsmodul fuer Auswertungen. Exporte und PWA-Funktionen sind bewusst noch nicht enthalten.

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

Alembic enthaelt Migrationen fuer Benutzer, serverseitige Sitzungen, Kategorien, Kassenperioden, Buchungen und die zusaetzlichen Uebersichtsindizes.

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

## Kassenmodul

Das Kassenmodul verwaltet den Geldbetrag, der Nuam fuer einen bestimmten Zeitraum zur Verfuegung steht. Der fachliche Begriff dafuer ist `Kassenperiode`.

Seit dem Buchungsmodul gilt:

- Ausgaben = Summe aller nicht stornierten Buchungen der Kassenperiode.
- Verbleibend = Ausgangsbetrag minus Ausgaben.
- Stornierte Buchungen bleiben gespeichert, werden aber nicht in Summen einbezogen.

Fachliche Regeln:

- Alle Benutzer greifen auf dieselben Kassenperioden zu.
- Es darf immer nur eine aktive Kassenperiode geben.
- Normale Benutzer duerfen die aktive Kassenperiode und deren Zusammenfassung lesen.
- Nur Administratoren duerfen Kassenperioden anlegen, bearbeiten, abschliessen und die Historie sehen.
- Abgeschlossene Kassenperioden bleiben dauerhaft gespeichert.
- Abgeschlossene Kassenperioden duerfen nicht mehr bearbeitet oder reaktiviert werden.
- Kassenperioden werden nicht geloescht.
- Es wird keine automatische Nachfolgeperiode erstellt.

Datenmodell `cash_periods`:

- `id`: Primaerschluessel.
- `name`: sichtbare Bezeichnung, z. B. `Juli 2026`.
- `opening_amount`: Ausgangsbetrag als `NUMERIC(14, 2)`.
- `currency`: aktuell ausschliesslich `THB`.
- `start_date`: fachliches Startdatum.
- `end_date`: optional bei aktiver Periode, gesetzt beim Abschluss.
- `status`: `active` oder `closed`.
- `created_by_user_id`: Administrator, der die Periode angelegt hat.
- `closed_by_user_id`: Administrator, der die Periode abgeschlossen hat.
- `created_at`, `updated_at`, `closed_at`: UTC-Zeitstempel.

Statusmodell:

- `active`: aktuelle Kassenperiode, auf der Startseite sichtbar und durch Administratoren bearbeitbar.
- `closed`: historische Kassenperiode, lesbar fuer Administratoren, nicht mehr bearbeitbar.

Absicherung fuer nur eine aktive Periode:

- Der Service prueft vor dem Anlegen auf eine vorhandene aktive Kassenperiode.
- Die Datenbankmigration legt zusaetzlich einen partiellen eindeutigen Index fuer `status = 'active'` an.
- Bei Konflikt antwortet die API mit HTTP `409 Conflict` und dem Code `active_cash_period_exists`.

Geldverarbeitung:

- Das Backend verarbeitet Geldbetraege ausschliesslich mit Python `Decimal`.
- Floats werden fuer Geldlogik nicht verwendet.
- Erlaubt sind maximal zwei Nachkommastellen.
- Der Hoechstbetrag ist `999999999.99`.
- Die API gibt Geldbetraege als Dezimalzeichenkette aus, z. B. `"20000.00"`.
- Das Frontend formatiert nur zur Anzeige mit `Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" })`.

API-Endpunkte:

- `GET /api/v1/cash-periods/current`: aktive Kassenperiode fuer angemeldete Benutzer.
- `GET /api/v1/cash-periods/current/summary`: Zusammenfassung der aktiven Kassenperiode.
- `GET /api/v1/cash-periods`: Historie und aktive Periode, nur fuer Administratoren.
- `GET /api/v1/cash-periods?status=active`
- `GET /api/v1/cash-periods?status=closed`
- `GET /api/v1/cash-periods/{cash_period_id}`: einzelne Periode, nur fuer Administratoren.
- `POST /api/v1/cash-periods`: neue aktive Kassenperiode anlegen, nur fuer Administratoren.
- `PATCH /api/v1/cash-periods/{cash_period_id}`: aktive Periode bearbeiten, nur fuer Administratoren.
- `POST /api/v1/cash-periods/{cash_period_id}/close`: aktive Periode abschliessen, nur fuer Administratoren.

Frontend-Ansichten:

- Startseite: zeigt aktive Kassenperiode, verbleibenden Betrag, Ausgangsbetrag und Ausgaben.
- Zustand ohne aktive Periode: ruhiger Leerzustand; Administratoren erhalten eine Aktion zum Anlegen.
- Einstellungen: Kassenverwaltung nur fuer Administratoren.
- Kassenverwaltung: mobile Karten fuer aktive und abgeschlossene Perioden, Formular zum Anlegen/Bearbeiten und Abschlussaktion.

Manuelle Pruefschritte:

1. Als Administrator anmelden.
2. Kassenverwaltung oeffnen.
3. Neue Kassenperiode mit `20000.00` THB anlegen.
4. Startseite pruefen: Ausgangsbetrag, Ausgaben `0.00`, Verbleibend `20000.00`.
5. Zweite aktive Periode anlegen: muss mit Konflikt abgelehnt werden.
6. Aktive Periode bearbeiten.
7. Als Mitglied anmelden: aktive Periode sichtbar, Kassenverwaltung nicht sichtbar.
8. Als Administrator aktive Periode abschliessen.
9. Startseite zeigt Zustand ohne aktive Periode.
10. Abgeschlossene Periode erscheint in der Historie.
11. Neue aktive Periode anlegen.

## Buchungsmodul

Das Buchungsmodul erfasst Ausgaben fuer die aktive Kassenperiode. Eine Ausgabe wird immer einer Kassenperiode, einer Kategorie, einem Benutzer und einem serverseitigen Zeitpunkt zugeordnet.

Fachliche Regeln:

- Neue Ausgaben koennen nur fuer die aktive Kassenperiode erfasst werden.
- Die Kategorie muss aktiv sein.
- Der angemeldete Benutzer wird serverseitig als Ersteller gespeichert.
- Der Client darf weder Kassenperiode noch Ersteller frei setzen.
- Der Betrag muss groesser als `0.00` sein, maximal zwei Nachkommastellen besitzen und darf den verbleibenden Betrag nicht ueberschreiten.
- Geldlogik bleibt im Backend und verwendet Python `Decimal`.
- Ausgaben werden nicht geloescht, sondern storniert.
- Normale Benutzer duerfen eigene Buchungen der aktiven Periode stornieren.
- Administratoren duerfen jede Buchung der aktiven Periode stornieren.
- Buchungen abgeschlossener Kassenperioden bleiben lesbar, aber unveraenderlich.

Datenmodell `expenses`:

- `id`: Primaerschluessel.
- `cash_period_id`: Fremdschluessel zur Kassenperiode.
- `category_id`: Fremdschluessel zur Kategorie.
- `amount`: Ausgabe als `NUMERIC(14, 2)`.
- `currency`: aktuell ausschliesslich `THB`.
- `created_by_user_id`: Benutzer aus der aktuellen Sitzung.
- `created_at`: serverseitiger UTC-Zeitstempel.
- `is_voided`: Stornierungsstatus.
- `voided_at`: serverseitiger UTC-Zeitstempel der Stornierung.
- `voided_by_user_id`: Benutzer, der storniert hat.
- `void_reason`: optionaler Grund bis 200 Zeichen.

Transaktionale Restbetragspruefung:

- Beim Erstellen einer Ausgabe wird die aktive Kassenperiode per `SELECT FOR UPDATE` gesperrt.
- Der Service berechnet die aktuelle Summe aller nicht stornierten Ausgaben.
- Der neue Betrag wird gegen den verbleibenden Betrag geprueft.
- Bei zu hohem Betrag antwortet die API mit HTTP `409 Conflict`, Code `insufficient_remaining_amount` und dem aktuellen `remaining_amount`.
- Dadurch werden parallele Ueberbuchungen kontrolliert verhindert.

API-Endpunkte:

- `POST /api/v1/expenses`: Ausgabe in der aktiven Kassenperiode erstellen.
- `GET /api/v1/expenses/current`: aktuelle Buchungen der aktiven Kassenperiode abrufen.
- `GET /api/v1/expenses/current?limit=20&offset=0`
- `GET /api/v1/expenses/current?category_id=1`
- `GET /api/v1/expenses/current?created_by_user_id=2`
- `GET /api/v1/expenses/current?include_voided=true`: stornierte Buchungen nur fuer Administratoren sichtbar.
- `GET /api/v1/expenses/{expense_id}`: einzelne Buchung abrufen.
- `POST /api/v1/expenses/{expense_id}/void`: Buchung stornieren.

Nicht vorhanden:

- Kein `PATCH /api/v1/expenses/{expense_id}`.
- Kein `DELETE /api/v1/expenses/{expense_id}`.
- Korrekturen erfolgen durch Stornierung und neue Buchung.

Frontend:

- Die Kategoriekacheln auf der Startseite sind buchbar, sobald eine aktive Kassenperiode mit Restbetrag existiert.
- Der mobile Buchungsdialog zeigt Kategorie, Betragseingabe, verbleibenden Betrag und Vorschau.
- Nach dem Speichern uebernimmt das Frontend die Backend-Zusammenfassung als Quelle der Wahrheit.
- Die Startseite zeigt die letzten fuenf gueltigen Ausgaben.
- Eigene Buchungen koennen ueber `Buchung entfernen` storniert werden; Administratoren koennen jede aktuelle Buchung stornieren.
- Beim Oeffnen, nach Buchung, nach Stornierung, bei Rueckkehr in den Vordergrund und alle 15 Sekunden bei sichtbarer Seite werden Kassenstand und Buchungsliste aktualisiert.

Manuelle Pruefschritte:

1. Als Administrator eine aktive Kassenperiode mit `20000.00` THB sicherstellen.
2. Aktive Kategorien pruefen.
3. Als Mitglied anmelden.
4. Kategorie `Essen` auswaehlen.
5. `250.00` THB speichern.
6. Startseite pruefen: Ausgaben `250.00`, Restbetrag `19750.00`, letzte Ausgabe sichtbar.
7. Weitere Ausgabe speichern und Summen pruefen.
8. Betrag ueber Restbetrag speichern: muss abgelehnt werden.
9. Eigene Buchung entfernen: Restbetrag steigt.
10. Als Administrator anmelden und Buchungen pruefen.
11. Administratorbuchung als Mitglied pruefen: darf nicht entfernt werden.
12. Nuam-Buchung als Administrator entfernen.
13. Kassenperiode abschliessen und neue Buchung versuchen: muss abgelehnt werden.
14. Anwendung neu laden: gespeicherte Buchungen bleiben vorhanden.

## Uebersichtsmodul

Das Uebersichtsmodul bereitet vorhandene Kassenperioden, Kategorien, Benutzer und Buchungen lesbar auf. Es erzeugt keine neue Buchungslogik und speichert keine redundanten Summen.

Fachliche Berechnungen:

- Gesamtausgaben = Summe aller nicht stornierten Buchungen der ausgewaehlten Kassenperiode.
- Verbleibend = Ausgangsbetrag minus Gesamtausgaben, nie kleiner als `0.00`.
- Kategorieausgaben = Summe aller nicht stornierten Buchungen einer Kategorie in der Kassenperiode.
- Benutzerausgaben = Summe aller nicht stornierten Buchungen eines Benutzers in der Kassenperiode.
- Prozentanteile werden serverseitig mit `Decimal` berechnet und mit zwei Nachkommastellen ausgegeben.
- Bei Gesamtausgaben `0.00` ist der Prozentanteil `0.00`; es gibt keine Division durch null.
- Stornierte Buchungen zaehlen nur in `expense_count` und `voided_expense_count`, nicht in `spent_amount`, Kategorie- oder Benutzersummen.

Rollen und Berechtigungen:

- Mitglieder sehen nur die aktive Kassenperiode, gueltige Buchungen, Kategorie- und Benutzersummen.
- Mitglieder sehen keine historischen Perioden, keine stornierten Buchungen und keine Stornierungsdetails.
- Administratoren sehen aktive und abgeschlossene Kassenperioden, historische Zusammenfassungen, stornierte Buchungen, Stornierer, Stornierungszeitpunkt und optionalen Grund.
- Alle Regeln werden im Backend geprueft; Frontend-Ausblendung ersetzt keine Berechtigung.

Backend-Struktur:

- `backend/app/services/overview_service.py`: Aggregationen, Filtervalidierung, Sortierung, Pagination und Berechtigungen.
- `backend/app/schemas/overview.py`: typisierte Pydantic-Schemas fuer Uebersicht, Kategorieauswertung, Benutzerauswertung und paginierte Buchungsliste.
- `backend/app/api/v1/endpoints/overview.py`: kleine API-Routen unter `/api/v1/overview`.
- `backend/app/services/cash_summary_service.py`: erweitert um Buchungszaehlungen.

Neue API-Endpunkte:

- `GET /api/v1/overview/current`: zentrale Uebersicht der aktiven Kassenperiode fuer angemeldete Benutzer.
- `GET /api/v1/overview/cash-periods/{cash_period_id}`: Uebersicht einer bestimmten Kassenperiode, nur fuer Administratoren.
- `GET /api/v1/overview/cash-periods/{cash_period_id}/expenses`: paginierte Buchungsliste einer Kassenperiode.

Filter der Buchungsliste:

- `category_id`: Kategorie filtern.
- `created_by_user_id`: Ersteller filtern.
- `date_from`: fachliches Startdatum, inklusive.
- `date_to`: fachliches Enddatum, inklusive.
- `include_voided`: nur fuer Administratoren wirksam.
- `limit`: Standard `20`, Maximum `100`.
- `offset`: Standard `0`.
- `sort`: `created_at_desc`, `created_at_asc`, `amount_desc` oder `amount_asc`.

Datumsfilter:

- `date_from` und `date_to` sind optional.
- `date_to` darf nicht vor `date_from` liegen.
- Die Eingabe ist eine lokale fachliche Datumsauswahl.
- Das Backend vergleicht gegen eindeutige UTC-Tagesgrenzen; Zeitstempel bleiben in UTC gespeichert.

Seitennavigation:

```json
{
  "items": [],
  "total": 48,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

Sortierung und Stabilitaet:

- Standard ist `created_at` absteigend und danach `id` absteigend.
- Betragssortierungen verwenden `amount` und danach `id`.
- Dadurch bleiben Seiten stabil und zeigen keine doppelten oder ausgelassenen Buchungen.

Kategorienauswertung:

- Gruppierung erfolgt serverseitig nach Kategorie.
- Nur nicht stornierte Buchungen werden summiert.
- Deaktivierte Kategorien mit historischen Buchungen bleiben sichtbar.
- Kategorien ohne Buchungen werden nicht angezeigt.
- Sortierung: Gesamtbetrag absteigend, danach Kategoriename.

Benutzerauswertung:

- Gruppierung erfolgt serverseitig nach Benutzer.
- Nur Anzeigenamen werden ausgegeben; keine Benutzernamen, Passwortdaten oder Sitzungsdaten.
- Deaktivierte Benutzer mit historischen Buchungen bleiben ueber ihren Anzeigenamen sichtbar.
- Sortierung: Gesamtbetrag absteigend, danach Anzeigename.

Datenbankabfragen und Indizes:

- Vorhanden: `ix_expenses_cash_period_voided_created` fuer Kassenperiode, Stornierungsstatus und Zeit.
- Neu: `ix_expenses_cash_period_category_voided` fuer Kategorieaggregation und Kategoriefilter.
- Neu: `ix_expenses_cash_period_user_voided` fuer Benutzeraggregation und Benutzerfilter.
- Es gibt keine neuen Summen- oder Cachetabellen.

Frontend:

- Der vorhandene Navigationspunkt `Uebersicht` oeffnet jetzt `OverviewPage`.
- Die Seite zeigt Kassenperiodenkopf, verbleibenden Betrag, Ausgaben, Ausgangsbetrag, Kategorieauswertung, Benutzerauswertung und eine paginierte Buchungsliste.
- Administratoren koennen abgeschlossene Perioden auswaehlen und stornierte Buchungen einblenden.
- Mitglieder sehen keine Periodenauswahl und keine stornierten Buchungen.
- Kategorie- und Benutzerzeilen setzen den jeweiligen Buchungsfilter.
- Aktive Filter werden als entfernbare Chips angezeigt.
- Zeitraumfilter: gesamte Periode, heute, letzte 7 Tage und benutzerdefiniert.
- Weitere Buchungen werden ueber `Weitere Buchungen laden` nachgeladen.
- Stornierungen nutzen weiter die bestehende Buchungs-API.
- Die Seite aktualisiert aktive Perioden beim Oeffnen, bei Vordergrundwechsel und alle 15 Sekunden bei sichtbarem Browserfenster.
- Fuer Balken und Prozentanzeigen werden CSS und vorhandene Komponenten verwendet; es wurde keine Diagrammbibliothek hinzugefuegt.

Manuelle Pruefschritte:

1. Als Administrator anmelden.
2. Aktive Kassenperiode mit Buchungen oeffnen.
3. `Uebersicht` oeffnen.
4. Ausgangsbetrag, Gesamtausgaben und Restbetrag pruefen.
5. Kategorieauswertung und Benutzerauswertung pruefen.
6. Kategorie `Essen` auswaehlen; Buchungsliste muss nur diese Kategorie zeigen.
7. Kategorie-Filter entfernen.
8. Benutzer `Nuam` auswaehlen; Buchungsliste muss Nuams Buchungen zeigen.
9. Zeitraum `Heute`, `Letzte 7 Tage` und benutzerdefinierten Zeitraum pruefen.
10. Ungueltigen Zeitraum pruefen.
11. Sortierung nach Datum und Betrag pruefen.
12. Weitere Buchungen laden und stabile Reihenfolge pruefen.
13. Stornierte Buchungen als Administrator einblenden.
14. Stornierte Buchungen muessen gekennzeichnet sein und duerfen Summen nicht erhoehen.
15. Abgeschlossene Kassenperiode auswaehlen und historische Summen pruefen.
16. Als Mitglied anmelden.
17. Historische Periodenauswahl darf nicht sichtbar sein.
18. Stornierte Buchungen duerfen nicht sichtbar sein.
19. In einem zweiten Browser anmelden und Aktualisierung nach Buchung/Stornierung pruefen.

## Bekannte Einschraenkungen

- Keine Bearbeitung bestehender Buchungen; Korrekturen laufen ueber Stornierung und Neuerfassung.
- Keine endgueltige Loeschung von Buchungen.
- Keine schweren Diagramme oder Periodenvergleiche ueber die aktuelle Uebersicht hinaus.
- Noch keine Einnahmen, Ueberweisungen, Belege, Anhange oder Exporte.
- Nur Thai Baht (`THB`) wird unterstuetzt.
- Noch keine PWA-Installation, kein Service Worker und kein Offline-Modus.
- Noch keine Hostinger-, Domain- oder HTTPS-Konfiguration.

## Naechste geplante Module

1. PWA und Deployment
2. abschliessende Tests und Absicherung

## Technische Entscheidungen

- Das Backend hat eine strukturierte API unter `/api/v1`.
- Der Health Check gibt App-Status, Datenbankstatus, App-Namen und Version zurueck.
- Die Datenbankverbindung wird ueber Umgebungsvariablen konfiguriert.
- Das Frontend nutzt bewusst nur React Hooks statt komplexem State Management.
- Das CSS-Designsystem liegt zentral in `frontend/src/styles/global.css`.
- Nginx dient im Frontend-Container die statischen Dateien aus und proxyt API-Aufrufe an FastAPI.
