# Verbindlicher GitHub- und VPS-Deploymentprozess

Es gibt genau einen Produktionsweg:

```text
Feature-Branch -> Pull Request -> CI -> Merge in main
  -> manueller GitHub-Workflow "Deploy production"
  -> eingeschraenkter SSH-Befehl
  -> /usr/local/sbin/nuamkasse-deploy
  -> Health- und Commit-Bestaetigung
```

Direkte Feature-Branch-Deployments, manuelle SCP-/Docker-Updates und die Hostinger-Projekt-Updatefunktion sind fuer Nuam Kasse nicht zulaessig.

## GitHub-Konfiguration

Repository-Secrets unter `Settings -> Secrets and variables -> Actions`:

- `VPS_HOST`: VPS-Hostname, exakt wie in der Known-Hosts-Zeile.
- `VPS_USER`: `nuamkasse-deploy`.
- `VPS_SSH_PRIVATE_KEY`: privater, ausschliesslich fuer GitHub Actions erzeugter Ed25519-Schluessel.
- `VPS_SSH_HOST_KEY`: vollstaendige, vorab verifizierte Known-Hosts-Zeile; der Workflow verwendet kein `StrictHostKeyChecking=no` und kein ungeprueftes `ssh-keyscan`.

Repository-Variable:

- `PRODUCTION_HEALTH_URL`: oeffentlicher Health-Endpunkt, aktuell nach dem Muster `http://VPS-IP:8080/api/v1/health`.

Empfohlene GitHub-Environment-Einstellung fuer `production`: erforderlicher Reviewer. Der Workflow besitzt `contents: read`, einen 45-Minuten-Timeout und eine exklusive Production-Concurrency-Gruppe.

## Einmalige VPS-Einrichtung

Die Einrichtung wird einmal kontrolliert ueber den bereits verifizierten Root-Schluessel ausgefuehrt. Sie veraendert keine bestehenden Root-Schluessel und deaktiviert keinen Zugang.

1. Separates Actions-Schluesselpaar lokal erzeugen; der private Teil kommt nur in `VPS_SSH_PRIVATE_KEY`.
2. Den Ordner `nuam-kasse/` aus dem geprueften Commit temporaer auf die VPS uebertragen, damit Installer, Deploymentskript und Compose-Template gemeinsam vorliegen.
3. Als Root ausfuehren:

   ```sh
   bash scripts/install-deploy-access.sh /root/setup/nuamkasse-actions.pub
   chmod 600 /docker/nuamkasse-ip/.env
   ```

4. Der Installer legt Skript und Compose-Template root-eigen unter `/usr/local/sbin` beziehungsweise `/usr/local/share/nuamkasse` ab. Er erstellt `nuamkasse-deploy` mit gesperrtem Passwort, einem erzwungenen SSH-Wrapper und genau den erforderlichen `sudo`-Kommandos. Der Benutzer erhaelt keinen allgemeinen Docker- oder Root-Zugang.
5. Secrets/Variable auf GitHub setzen und nur den Dry-Run ausfuehren.

Eine Hostinger-Browserkonsole ist nicht notwendig, solange der verifizierte Root-Schluessel funktioniert.

## Normaler Pull-Request-Ablauf

1. Branch von aktuellem `main` erstellen.
2. Aenderung implementieren, fremde Arbeit erhalten.
3. Relevante Befehle aus `/AGENTS.md` ausfuehren.
4. Nur auftragsbezogene Dateien committen und Branch pushen.
5. PR nach `main` mit Umfang, Risiken und Testnachweisen erstellen.
6. CI abwarten, pruefen und mergen. Kein Force Push auf `main`.

Kuenftige Kurzanweisung: **„Erstelle den Pull Request auf GitHub.“**

## Normaler Deploymentablauf

1. In GitHub Actions `Deploy production` auf Branch `main` waehlen.
2. `commit` leer lassen, um den aktuellen `main`-Stand zu deployen; fuer einen kontrollierten Rollback einen in `main` enthaltenen Commit angeben.
3. Workflow ausfuehren und gegebenenfalls das `production`-Environment freigeben.
4. Der Workflow wiederholt CI, prueft den Commit, den Host-Key und den oeffentlichen Pre-Health-Check.
5. Das VPS-Skript prueft nochmals `main`, vorhandene Volumes/Netzwerk, `.env`-Rechte und den internen Health-Check.
6. Vor jeder Migration entsteht ein Custom-Format-Backup mit SHA-256 und erfolgreichem `pg_restore --list`.
7. Der exakte Commit wird in ein eigenes Release-Verzeichnis ausgecheckt; Images tragen den vollen Commit-Tag.
8. Alembic laeuft einmalig als Migrationsservice. Danach werden nur Backend und Frontend aktualisiert.
9. Container-Health, API-Health, Image-Tags und Revisionslabels muessen den Zielcommit bestaetigen.

Kuenftige Kurzanweisung nach geprueftem Merge: **„Deploye den aktuellen Stand von main auf die VPS.“**

## Health Checks

- GitHub Runner: `PRODUCTION_HEALTH_URL` vor und nach dem Deployment.
- VPS intern: `http://127.0.0.1:8080/api/v1/health`.
- Compose: Datenbank, Backend und Frontend muessen `healthy` sein.
- Erwartete API-Felder: `status=ok`, `database=connected`.
- Laufender Commit: Backend-/Frontend-Image-Tag und Label `org.opencontainers.image.revision` entsprechen dem Zielcommit.

## Dry-Run

Der eingeschraenkte Actions-Schluessel erlaubt fuer die Ersteinrichtung:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes nuamkasse-deploy@VPS-HOST \
  "dry-run VOLLSTAENDIGER_40_STELLIGER_COMMIT"
```

Der Dry-Run liest Produktion, Health, Volumes und Netzwerk, laedt `main` nur in ein temporaeres `/tmp`-Verzeichnis und validiert das gerenderte Compose-Template. Er erstellt keine Releases, Backups, Images, Container oder Volumes.

## Fehlerdiagnose und Wiederherstellung

Das Skript meldet den fehlgeschlagenen Schritt und einen eindeutigen Exitcode. Bei Fehlern:

1. Keine destruktive Eigenreparatur und kein `docker compose down -v` ausfuehren.
2. GitHub-Jobausgabe sowie `/docker/nuamkasse-ip/deployment-state/history.log` pruefen.
3. Container nur innerhalb von `nuamkasse-ip` mit `docker compose ... ps` und `logs` untersuchen.
4. Das vor der Migration erstellte Backup und dessen SHA-256 identifizieren.
5. Wenn nur die Anwendung fehlschlug, nach Ursachenpruefung den vorherigen, weiterhin in `main` enthaltenen Commit ueber denselben Workflow deployen.
6. Datenbankmigrationen werden nie automatisch abwaerts ausgefuehrt. Eine Datenbankwiederherstellung ueberschreibt Produktionsdaten und erfordert eine separate ausdrueckliche Freigabe sowie die Anleitung in `docs/backup-and-restore.md`.

Alte Release-Verzeichnisse und Backups werden vom Deploymentskript nicht automatisch geloescht. Fremde Docker-Projekte werden nie adressiert.

## Aktueller Einrichtungsstatus

Am 2026-08-09 wurden der dedizierte VPS-Benutzer, der erzwungene SSH-Befehl, die root-eigenen Skripte, das Compose-Template, die vier GitHub-Secrets, die Health-Variable und das `production`-Environment eingerichtet. Ein Remote-Dry-Run gegen `e03b5553b6bb273d2c76a303d02fa181b81de666` war erfolgreich; Container, Volumes und Produktionsdateien blieben im Vorher-/Nachher-Vergleich unveraendert.

Noch offen sind die Uebernahme dieses Workflows nach `main`, die anschliessende Aktivierung eines `main`-Rulesets mit verpflichtendem Pull Request und erfolgreichen CI-Checks sowie das erste echte Produktionsdeployment. Das erste echte Deployment bleibt bis zur ausdruecklichen Zustimmung ausstehend.
