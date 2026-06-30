# Nuam Kasse PWA

Nuam Kasse ist ab Version 0.6.0 als installierbare Progressive Web App vorbereitet.

## Manifest und Icons

Das Manifest wird im Vite-Produktionsbuild durch `vite-plugin-pwa` erzeugt und ist unter `/manifest.webmanifest` erreichbar.

Lokale Icon-Quellen:

- `frontend/public/favicon.svg`
- `frontend/public/favicon.png`
- `frontend/public/icon-192.png`
- `frontend/public/icon-512.png`
- `frontend/public/icon-maskable-192.png`
- `frontend/public/icon-maskable-512.png`
- `frontend/public/apple-touch-icon.png`

Icons werden reproduzierbar erzeugt:

```sh
cd frontend
npm run icons
```

## Cachingstrategie

Der Service Worker cached nur die App Shell und statische Build-Dateien. Alle `/api/`-Anfragen verwenden `NetworkOnly`.

Nicht gecacht werden:

- Benutzer- und Sitzungsdaten
- Kassenperioden
- Kategorien
- Buchungen
- Auswertungen
- Health-Check-Antworten
- Passwort- oder Login-Antworten

Es gibt keine Offline-Warteschlange und kein Background Sync fuer Buchungen.

## Offline Verhalten

Die App Shell kann bei schlechter Verbindung sichtbar bleiben. Sobald Browser oder Server nicht erreichbar sind, zeigt die App einen Hinweis:

`Keine Verbindung zum Server`

Neue Buchungen und Stornierungen sind dann deaktiviert. Bereits angezeigte Daten koennen sichtbar bleiben, gelten aber als moeglicherweise nicht aktuell.

## Installation Android

1. App in Chrome oeffnen.
2. Menue oeffnen.
3. `App installieren` oder `Zum Startbildschirm hinzufuegen` waehlen.
4. Installation bestaetigen.
5. App ueber das Symbol auf dem Startbildschirm oeffnen.

## Installation iPhone

1. App in Safari oeffnen.
2. Teilen-Symbol waehlen.
3. `Zum Home-Bildschirm` waehlen.
4. Namen pruefen.
5. `Hinzufuegen` waehlen.

Auf iOS gibt es keine allgemeine automatische Installationsaufforderung. Die App zeigt daher nur eine dezente Anleitung.

## Updates

Der Service Worker nutzt eine kontrollierte Update-Strategie. Wenn eine neue Version verfuegbar ist, erscheint ein Hinweis mit:

- `Jetzt aktualisieren`
- `Spaeter`

Die App laedt nicht automatisch neu, waehrend Eingaben oder Buchungen laufen koennen.
