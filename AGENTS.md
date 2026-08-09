# Verbindliche Arbeitsregeln

Diese Regeln gelten fuer das gesamte Repository. Die Anwendung liegt unter `nuam-kasse/`.

## Entwicklung und Pruefung

- Lokaler Start: `cd nuam-kasse && docker compose up --build`
- Backend-Test: `cd nuam-kasse/backend && pytest -q`
- Backend-Syntaxcheck: `cd nuam-kasse/backend && python -m compileall -q app tests`
- Frontend-Test: `cd nuam-kasse/frontend && npm ci && npm test`
- Frontend-Lint/Typecheck: `cd nuam-kasse/frontend && npm run lint`
- Frontend-Build: `cd nuam-kasse/frontend && npm run build`
- Compose-Pruefung: `cd nuam-kasse && docker compose config --quiet`

Vor einem Pull Request muessen alle fuer die Aenderung relevanten Tests, Lint-/Typechecks und Builds erfolgreich sein. Die GitHub-CI ist verbindlich.

## Branches, Commits und Pull Requests

- Neue Arbeit erfolgt auf einem Feature-, Fix- oder Dokumentationsbranch, nie direkt auf `main`.
- Empfohlene Namen: `feature/<kurzer-slug>`, `fix/<kurzer-slug>`, `docs/<kurzer-slug>`; neue Slugs sind ASCII und kleingeschrieben.
- Commits sind klein, thematisch geschlossen und beschreiben die Wirkung im Imperativ. Keine fremden Aenderungen mitstagen.
- Pull Requests zielen grundsaetzlich auf `main`, beschreiben Umfang, Risiken und Pruefnachweise und werden erst nach erfolgreicher CI gemergt.
- Kein Force Push auf `main`. Kein direktes Deployment eines Feature Branches.
- Codex darf fremde, unversionierte oder nicht zum Auftrag gehoerende Aenderungen niemals ueberschreiben, zuruecksetzen oder ungefragt committen.
- Passwoerter, Tokens, `.env`-Dateien und private Schluessel duerfen niemals committed oder in Logs ausgegeben werden.

## Produktion

- Produktionsdeployments erfolgen ausschliesslich ueber `.github/workflows/deploy-production.yml` und das fest installierte Skript `/usr/local/sbin/nuamkasse-deploy` aus `nuam-kasse/scripts/deploy.sh`.
- Kein spontaner alternativer SSH-, SCP-, Hostinger-Projekt- oder Docker-Deploymentweg.
- Der Workflow wird nur manuell gestartet und darf nur einen Commit deployen, der bereits in `main` enthalten ist.
- Vor und nach jedem Deployment sind die dokumentierten Health Checks Pflicht. Ein Deployment gilt nur mit bestaetigtem laufendem Commit als erfolgreich.
- Keine destruktiven Eigenreparaturen bei Fehlern. Zustand und Logs sichern, eindeutig abbrechen und die dokumentierte Wiederherstellung verwenden.
- Datenbank- und Upload-Volumes duerfen niemals geloescht, neu angelegt oder umbenannt werden. Insbesondere niemals `docker compose down -v`, `docker volume prune` oder globale Docker-Cleanup-Befehle ausfuehren.
- Nur das Compose-Projekt `nuamkasse-ip` und das Produktionsverzeichnis `/docker/nuamkasse-ip` sind im Umfang. Fremde Container, Netzwerke, Volumes und Projekte bleiben unangetastet.
- Das erste echte Deployment oder ein Rollback benoetigt eine ausdrueckliche Freigabe des Benutzers.
