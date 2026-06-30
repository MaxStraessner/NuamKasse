# Backup und Wiederherstellung

Backups duerfen nicht im Frontend-Webroot liegen und werden nicht ins Repository eingecheckt.

## Manuelles Backup

```sh
sh scripts/backup_database.sh
```

Das Skript:

- liest `.env.production`
- schreibt nach `backups/`
- verwendet `pg_dump --format=custom`
- prueft den Dump mit `pg_restore --list`

## Automatisiertes Backup

Beispiel fuer Cron auf dem Server:

```cron
15 2 * * * cd /opt/nuam-kasse && /bin/sh scripts/backup_database.sh >> /var/log/nuam-kasse-backup.log 2>&1
```

Nur eintragen, wenn der Pfad auf dem Server stimmt.

## Aufbewahrung

Empfehlung:

- taeglich fuer 14 Tage
- woechentlich fuer 8 Wochen
- alte Dateien kontrolliert loeschen, niemals mit globalen Docker-Cleanup-Befehlen

## Wiederherstellung

```sh
sh scripts/restore_database.sh backups/nuam_kasse_YYYYMMDDTHHMMSSZ.dump
```

Die Wiederherstellung ueberschreibt Datenbankinhalte. Vorher:

1. aktuellen Dump sichern
2. betroffene Benutzer informieren
3. Ziel-Datenbank bestaetigen
4. Restore bewusst ausfuehren
5. Health Check und Anmeldung pruefen

## Sicherheit

- Keine Passwoerter im Dateinamen.
- Backups nicht oeffentlich ausliefern.
- Dateirechte restriktiv setzen.
- Backups nicht in Git speichern.
