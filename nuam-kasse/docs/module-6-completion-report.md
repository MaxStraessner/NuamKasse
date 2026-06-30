# Modul 6 Abschlussbericht: PWA und Deployment

## Analysierte Ausgangsstruktur

- Frontend: React, TypeScript, Vite, React Router, Nginx-Container, Vitest.
- Backend: FastAPI, SQLAlchemy, Alembic, serverseitige Sitzungen, Health Check, Pytest.
- Datenbank: PostgreSQL 16 ueber Docker Compose.
- Bisherige Produktion: vorhandene Dockerfiles und eine sehr knappe `docker-compose.prod.yml`.
- Keine vorhandenen Manifest-, Service-Worker- oder App-Icon-Dateien.
- Kein Serverzugriff auf Hostinger wurde in diesem Arbeitsschritt verwendet.

## Neu erstellte Dateien

- `.env.production.example`
- `docs/pwa.md`
- `docs/deployment.md`
- `docs/backup-and-restore.md`
- `docs/module-6-completion-report.md`
- `scripts/backup_database.sh`
- `scripts/restore_database.sh`
- `scripts/deploy.sh`
- `frontend/scripts/generate-icons.py`
- `frontend/public/favicon.svg`
- `frontend/public/favicon.png`
- `frontend/public/icon-192.png`
- `frontend/public/icon-512.png`
- `frontend/public/icon-maskable-192.png`
- `frontend/public/icon-maskable-512.png`
- `frontend/public/apple-touch-icon.png`
- `frontend/src/app/NetworkStatusContext.tsx`
- `frontend/src/app/appVersion.ts`
- `frontend/src/components/OfflineNotice.tsx`
- `frontend/src/components/PwaInstallPrompt.tsx`
- `frontend/src/components/PwaUpdatePrompt.tsx`
- `frontend/tests/pwa.test.tsx`

## Geaenderte Dateien

- `.env.example`
- `.gitignore`
- `README.md`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `backend/Dockerfile`
- `backend/app/core/config.py`
- `backend/app/main.py`
- `backend/tests/conftest.py`
- `backend/tests/test_health.py`
- `frontend/Dockerfile`
- `frontend/index.html`
- `frontend/nginx.conf`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.ts`
- `frontend/src/App.tsx`
- `frontend/src/env.d.ts`
- `frontend/src/layouts/AppLayout.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/styles/global.css`
- `frontend/tests/App.test.tsx`
- `frontend/tests/setupTests.ts`

## PWA Architektur

- `vite-plugin-pwa` erzeugt Manifest und Service Worker im Produktionsbuild.
- Die App wird als `standalone` mit Start-URL `/` und Scope `/` ausgeliefert.
- App Shell und versionierte statische Dateien werden vorgeladen.
- Alle `/api/`-Routen sind im Service Worker `NetworkOnly`.
- Alte Caches werden ueber Workbox `cleanupOutdatedCaches` entfernt.

## Manifest Konfiguration

- Name: `Nuam Kasse`
- Short name: `Nuam Kasse`
- Beschreibung: `Gemeinsame mobile Kassenuebersicht`
- Display: `standalone`
- Orientierung: `portrait-primary`
- Sprache: `de`
- Kategorien: `finance`, `utilities`
- Icons: 192, 512, maskierbar 192, maskierbar 512

## App Icons

Die Icons werden lokal mit `frontend/scripts/generate-icons.py` erzeugt. Es werden keine externen Bilddienste, fremden Marken oder externen Icons verwendet.

## Service Worker Strategie

- App Shell: precache
- JS/CSS/Icons/Manifest: precache beziehungsweise statische Auslieferung
- API: `NetworkOnly`
- Kein Background Sync
- Keine Offline-Warteschlange
- Keine Speicherung vertraulicher API-Antworten im Service Worker Cache

## Offline Verhalten

- `NetworkStatusProvider` beobachtet Browser-Online-Status und prueft den Backend-Health-Check.
- `OfflineNotice` zeigt einen klaren Hinweis bei fehlender Serververbindung.
- Buchungen und Stornierungen sind ohne Serververbindung deaktiviert.
- Die App stellt keine Buchung ohne Serverantwort als erfolgreich dar.

## Installationslogik

- Android/Chromium: `beforeinstallprompt` wird abgefangen und dezent angeboten.
- Ablehnung wird fuer einen Zeitraum in `localStorage` gemerkt.
- Nach Installation verschwindet der Hinweis.
- iOS: dezente manuell oeffenbare Safari-Anleitung.
- Standalone-Modus wird ueber `display-mode: standalone` und `navigator.standalone` erkannt.

## Aktualisierungslogik

- Service Worker Registrierung nutzt `registerType: "prompt"`.
- Neue Versionen zeigen einen Hinweis.
- Aktionen: `Jetzt aktualisieren` und `Spaeter`.
- Kein automatisches Neuladen waehrend moeglicher Eingaben.

## Safe Area Anpassungen

- Viewport nutzt `viewport-fit=cover`.
- App Shell, obere Leiste, Seitencontainer, Dialoge und untere Bereiche verwenden `env(safe-area-inset-*)`.

## Produktions Dockerfiles

- Backend nutzt `python:3.12-slim`, nicht-root Benutzer und Uvicorn mit Proxy Headern.
- Frontend nutzt Multi-Stage Build mit `node:22-alpine` und `nginx:1.27-alpine`.
- Frontend-Laufzeitcontainer enthaelt keine Node-Entwicklungsumgebung.
- FastAPI-Dokumentation wird ueber `ENABLE_API_DOCS` konfiguriert; die Produktionsbeispieldatei setzt diesen Wert auf `false`.

## Produktions Docker Compose

- Services: `db`, `migrate`, `backend`, `frontend`.
- PostgreSQL Image: `postgres:16-alpine`.
- Lokale Image-Tags: `nuam-kasse-backend:0.6.0`, `nuam-kasse-frontend:0.6.0`.
- Kein oeffentlicher Datenbankport.
- Internes Netzwerk: `nuam_kasse_internal`.
- Optionales externes Proxy-Netzwerk: `NUAM_KASSE_PROXY_NETWORK`.
- Volumes: `nuam_kasse_postgres_data`, `nuam_kasse_backups`.

## Migrationsservice

`migrate` verwendet dasselbe Backend-Image und fuehrt `alembic upgrade head` aus. Der Service beendet sich nach erfolgreicher Migration.

## Reverse Proxy und HTTPS

Die App ist fuer eine gemeinsame Herkunft vorbereitet:

- Frontend: `https://kasse.example.com/`
- API: `https://kasse.example.com/api/v1/`

Die konkrete DNS-, Zertifikats- und Reverse-Proxy-Konfiguration muss auf dem Hostinger VPS erfolgen.

## Produktionsvariablen

`.env.production.example` dokumentiert die erforderlichen Variablen. Echte Secrets werden nicht im Repository gespeichert.

## Health Checks

- Datenbank: `pg_isready`
- Backend: `/api/v1/health` mit Datenbankstatus
- Frontend: Nginx-HTTP-Check

## Sicherheitsheader

Nginx setzt:

- `X-Content-Type-Options`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`

## Backup und Wiederherstellung

- `scripts/backup_database.sh` erstellt einen Custom-Format-Dump.
- `scripts/restore_database.sh` stellt bewusst aus einem Dump wieder her.
- Dumps werden technisch mit `pg_restore --list` geprueft.
- Backups liegen ausserhalb des Frontend-Webroots und sind in `.gitignore` ausgeschlossen.
- Die Skripte lesen nur die benoetigten PostgreSQL-Werte aus der Env-Datei und sourcen die Datei nicht als Shell-Skript.

## Deploymentskript

`scripts/deploy.sh` prueft Variablen, validiert Compose, baut Images, startet die Datenbank, erstellt ein Backup, fuehrt Migrationen aus und startet Backend/Frontend. Es enthaelt keine globalen Docker-Cleanup-Befehle.

## Testergebnisse

- Backend lokal: `57 passed`
- Frontend lokal: `30 passed`
- Frontend Produktionsbuild: erfolgreich
- Produktions-Compose-Config: erfolgreich
- Produktions-Docker-Build: erfolgreich
- Shell-Syntaxcheck der drei Skripte im Container: erfolgreich

## Docker Ergebnisse

- Lokaler Nuam-Kasse-Stack wurde mit `docker compose up -d --build` aktualisiert.
- `db`, `backend`, `frontend` liefen danach healthy.
- `alembic upgrade head` im Backend-Container war erfolgreich.
- Technischer Datenbankdump im DB-Container wurde erstellt und mit `pg_restore --list` validiert.

## Lokal gepruefte URLs

- `http://localhost:8000/api/v1/health` -> `status=ok`, `database=connected`, `version=0.6.0`
- `http://localhost:8080/api/v1/health` -> gleicher Health Check ueber Frontend-Proxy
- `http://localhost:8080/manifest.webmanifest` -> `Nuam Kasse`, `standalone`, 4 Icons, maskierbare Icons
- `http://localhost:8080/sw.js` -> HTTP 200
- `http://localhost:8080/overview` -> HTTP 200 React-Router-Fallback

## Tatsaechlich ausgefuehrte Serveraktionen

Keine Aktionen auf dem Hostinger VPS.

## Nicht ausgefuehrte Serveraktionen

- Kein DNS geaendert.
- Kein Reverse Proxy auf dem VPS geaendert.
- Kein HTTPS-Zertifikat erstellt oder erneuert.
- Kein Produktions-Stack auf Hostinger gestartet.
- Kein Cronjob auf Hostinger installiert.

## Offene Produktionsschritte

1. Serververzeichnis `/opt/nuam-kasse` oder passenden Projektpfad anlegen.
2. `.env.production` mit echten Secrets erstellen.
3. Externes Reverse-Proxy-Netzwerk pruefen.
4. Produktions-Compose auf dem VPS validieren.
5. Datenbank starten.
6. Migration ausfuehren.
7. Backend und Frontend starten.
8. Reverse Proxy fuer die Domain konfigurieren.
9. DNS und HTTPS pruefen.
10. Ersten Administrator bewusst per CLI anlegen.
11. Anmeldung, Buchung, Stornierung und Uebersicht pruefen.
12. Backup und Restore auf dem VPS testen.
13. PWA Installation auf Android und iPhone manuell pruefen.

## Bekannte Einschraenkungen

- Keine Offline-Buchungen.
- Keine Push-Benachrichtigungen.
- Keine WebSockets.
- Keine native App und keine Store-Veröffentlichung.
- Keine automatische Administratoranlage.
- Hostinger-spezifische Pfade, DNS und Zertifikate sind bewusst nur vorbereitet, nicht ausgefuehrt.

## Vorbereitung fuer das abschliessende Modul

Das naechste Modul sollte abschliessende Tests und Absicherung abdecken: reale PWA-Geraetepruefung, VPS-Deployment-Pruefung, Sicherheitsreview, Restore-Test in einer isolierten Umgebung und finaler PR-Review.
