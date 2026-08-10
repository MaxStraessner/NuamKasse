# Deployment-Istzustand und Zielprozess

Stand der rein lesenden Bestandsaufnahme: 2026-08-09. Serveradresse, Host-Key und Secret-Werte werden bewusst nicht im oeffentlichen Repository dokumentiert.

## Festgestellter Istzustand

- GitHub-Repository: `MaxStraessner/NuamKasse`, Default-Branch `main`.
- Lokaler Ausgangscommit und `origin/main`: `e03b5553b6bb273d2c76a303d02fa181b81de666`.
- Vor dieser Aenderung gab es keine `AGENTS.md`, keine GitHub-Actions-Workflows, keine Actions-Secrets, keinen Branchschutz und kein Ruleset fuer `main`.
- Die Hostinger KVM-2 VPS laeuft mit Ubuntu 24.04 und Docker Compose 5.1.4.
- Auf der VPS laufen mehrere voneinander unabhaengige Projekte. Fuer dieses Repository gehoert ausschliesslich das Projekt `nuamkasse-ip` zum Umfang.
- Produktionsverzeichnis: `/docker/nuamkasse-ip`; das Verzeichnis selbst ist kein Git-Checkout. Der eingesetzte Quell-Snapshot liegt detached und sauber unter `source-e03b555/`.
- Laufende Services: PostgreSQL 16, FastAPI-Backend und Nginx-Frontend. Alle drei Container waren gesund.
- Laufende Backend-/Frontend-Images: Commit-Tag `e03b555`; Health meldete App-Version `0.7.0`, Status `ok` und Datenbank `connected`.
- Alembic stand auf `20260713_0009 (head)`.
- Persistente Daten liegen in `nuamkasse-ip_postgres_data` und `nuamkasse-ip_category_uploads`. Das Netzwerk ist `nuamkasse-ip_nuam_internal`.
- Zwei vorhandene Custom-Format-Datenbankbackups besitzen SHA-256-Nachweise. Eine `pg_restore --list`-Pruefung auf dem Host war nicht moeglich, weil `pg_restore` dort nicht installiert ist; der neue Ablauf prueft jedes Backup innerhalb des PostgreSQL-Containers.
- Der bisherige reale Ablauf verwendete manuell erzeugte Source-Verzeichnisse, commitgetaggte Images und Build-/Deploylogs. Die Repositorydokumentation beschrieb dagegen `/opt/nuam-kasse` plus `git pull`. Es gab daher keinen einzelnen reproduzierbaren, mit der Produktion uebereinstimmenden Weg.
- Der funktionierende lokale Root-Schluessel war temporaer im Arbeitsbaum abgelegt. Er wurde in die geschuetzte lokale SSH-Ablage uebernommen. Root-Passwortanmeldung ist auf dem Server weiterhin erlaubt; sie wird fuer den neuen Workflow nicht verwendet und nicht deaktiviert, damit kein bestehender Zugang ausgesperrt wird.
- Die Produktionsdatei `.env` war vorhanden, hatte aber Modus `0644`. Der Zielprozess verlangt `0600` und gibt keine Werte aus.
- Oeffentlicher Frontend- und API-Health-Endpunkt waren erreichbar. Eine HTTPS-Domain ist im aktuellen IP-Betrieb nicht eingerichtet; die laufende Konfiguration verwendet deshalb weiterhin Development-Cookies ueber HTTP.

## Bereits ausgefuehrte sichere Einrichtung

- Der funktionsfaehige lokale Root-Schluessel liegt ausserhalb des Repositories mit restriktiver Windows-ACL. Die temporaeren Repositorykopien wurden entfernt und passende Ignore-Regeln ergaenzt.
- Ein separates Ed25519-Schluesselpaar wurde ausschliesslich fuer GitHub Actions erzeugt. Der private Teil wurde als GitHub Secret gespeichert und nie ausgegeben.
- Auf der VPS wurde `nuamkasse-deploy` mit gesperrtem Passwort, ohne Docker-Gruppenmitgliedschaft und mit erzwungenem SSH-Befehl eingerichtet. Bestehende Root-Schluessel und Anmeldeverfahren blieben unveraendert.
- Deploymentskript und Compose-Template sind root-eigen unter `/usr/local` installiert; die `sudoers`-Datei wurde mit `visudo` validiert.
- `.env` wurde ohne Inhaltsaenderung von `0644` auf `0600` gesetzt.
- GitHub enthaelt die Secret-Namen `VPS_HOST`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_SSH_HOST_KEY`, die Variable `PRODUCTION_HEALTH_URL` und das Environment `production`.
- Der eingeschraenkte Schluessel bestand einen vollstaendigen Dry-Run. Container-IDs, Volume-Mounts, Compose-Datei sowie `.env`-Groesse und -Zeitstempel blieben unveraendert.

## Verbindlicher Zielprozess

1. Entwicklung erfolgt auf einem Feature-/Fix-Branch.
2. Vor dem PR laufen Backendtests, Frontendtests, Typecheck/Build und Compose-Pruefung.
3. Der PR zielt auf `main`; CI muss erfolgreich sein.
4. Nach Review und Merge wird `Deploy production` manuell auf `main` gestartet.
5. Ohne Eingabe wird der aktuelle `origin/main`-Commit verwendet; optional ist ein Commit-Hash erlaubt.
6. Workflow und Server pruefen unabhaengig, dass der exakte Commit in `main` enthalten ist.
7. Der Workflow nutzt einen eigenen, erzwungenen SSH-Befehl fuer `nuamkasse-deploy`; Root-Passwort und Root-Schluessel liegen nicht in GitHub.
8. `/usr/local/sbin/nuamkasse-deploy` sperrt Parallelstarts, prueft Health und Produktionsgrenzen, erstellt ein validiertes Datenbankbackup, baut aus einem exakten Release-Checkout, migriert kontrolliert und aktualisiert nur Backend/Frontend des Projekts `nuamkasse-ip`.
9. Externe Volume-/Netzwerknamen verhindern eine versehentliche Neuanlage. Es gibt keinen `down`-, `prune`- oder globalen Docker-Befehl.
10. Erfolg setzt gesunde Container, erfolgreichen API-Health-Check und zum Ziel passenden Image-Tag plus Revisionslabel voraus.

Der erste echte Lauf bleibt bis zur ausdruecklichen Freigabe ausstehend. Das `main`-Ruleset wird erst nach Merge und erfolgreicher CI aktiviert, damit das Repository nicht vor Verfuegbarkeit des Checks gesperrt wird.
