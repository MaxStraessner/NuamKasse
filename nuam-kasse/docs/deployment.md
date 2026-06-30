# Nuam Kasse Deployment

Dieses Deployment ist fuer einen eigenstaendigen Docker Stack auf einem Hostinger VPS vorbereitet. Es veraendert keine fremden Docker Stacks, Volumes oder Netzwerke.

## Zielarchitektur

```text
Smartphone
  -> HTTPS Domain oder Subdomain
  -> Reverse Proxy
  -> nuam-kasse-frontend
  -> nuam-kasse-backend
  -> nuam-kasse-db
```

Bevorzugte oeffentliche Herkunft:

- Frontend: `https://kasse.example.com/`
- API: `https://kasse.example.com/api/v1/`

`VITE_API_BASE_URL` bleibt in Produktion relativ: `/api/v1`.

## Serververzeichnis

Empfohlen:

```sh
/opt/nuam-kasse
```

Enthalten sein sollten:

- `docker-compose.prod.yml`
- `.env.production`
- `scripts/`
- `backups/`
- Quellcode oder ein kontrolliertes Release-Artefakt

## Produktionsvariablen

Kopiere `.env.production.example` nach `.env.production` und ersetze alle Secrets:

```sh
cp .env.production.example .env.production
```

Wichtig:

- `POSTGRES_PASSWORD` muss ein langes zufaelliges Passwort sein.
- `SESSION_COOKIE_SECURE=true` ist fuer HTTPS gesetzt.
- `ENABLE_API_DOCS=false` deaktiviert FastAPI-Dokumentation in Produktion.
- `BACKEND_CORS_ORIGINS` bleibt bei gleicher Domain leer.
- `NUAM_KASSE_PROXY_NETWORK` muss dem vorhandenen externen Reverse-Proxy-Netzwerk entsprechen.

## Reverse Proxy

Der Frontend-Container ist fuer ein externes Proxy-Netzwerk vorbereitet und veroeffentlicht selbst keinen Host-Port.

Beispiel fuer einen zentralen Nginx-Proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name kasse.example.com;

    location / {
        proxy_pass http://nuam-kasse-frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

HTTPS-Zertifikate und HTTP-zu-HTTPS-Weiterleitung werden im vorhandenen Reverse Proxy verwaltet.

## Erster Start

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d db
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend frontend
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Ersten Administrator bewusst per CLI anlegen:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python -m app.scripts.create_admin
```

Es wird kein Administrator automatisch aus Umgebungsvariablen erzeugt.

## Update

```sh
git checkout main
git pull
sh scripts/deploy.sh
```

Das Skript prueft Variablen, baut Images, startet die Datenbank, erstellt ein Backup, fuehrt Migrationen aus und aktualisiert Backend und Frontend.

## Health Checks

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python -c "import json, urllib.request; print(json.load(urllib.request.urlopen('http://localhost:8000/api/v1/health')))"
```

Oeffentlich pruefen:

```sh
curl -fsS https://kasse.example.com/api/v1/health
```

## Rollback

Anwendung:

1. Vorherigen Git-Commit oder vorheriges Image identifizieren.
2. Vorherige Version starten.
3. Health Checks pruefen.

Datenbank:

- Migrationen werden nicht automatisch rueckwaerts ausgefuehrt.
- Ein Datenbankrollback ist eine bewusste administrative Entscheidung.
- Vor Wiederherstellung Backup pruefen.

## Offene Produktionspruefung

Ohne Serverzugriff wurden keine Hostinger-Aktionen ausgefuehrt. Nach Deployment manuell pruefen:

- DNS zeigt auf den VPS.
- HTTP leitet auf HTTPS um.
- Zertifikat ist gueltig.
- Anmeldung funktioniert.
- Buchung, Stornierung und Uebersicht funktionieren.
- PWA Installation auf Android und iPhone funktioniert.
- Backup und Restore sind getestet.
