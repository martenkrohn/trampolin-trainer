# Trampolin Trainer

Eine mobile Web-App, um Trampolintraining zu planen und persönliche Fortschritte festzuhalten: Sprünge nachschlagen, Sprungfolgen zusammenstellen, Lernstände bewerten und Sprungzeiten verfolgen.

**[Trampolin Trainer öffnen](https://trampolintrainer.pages.dev/)**

Projekt von [Marten Krohn](https://github.com/martenkrohn).

## Funktionen

- **Sprungkatalog:** 64 Sprünge in sechs Gruppen mit fehlertoleranter Suche und technischen Angaben.
- **Trainingsziele:** Sprünge, eigene Ziele und Sprungfolgen mit Lernstatus und persönlichen Notizen verwalten.
- **Sprungfolgen:** Acht Vorlagen verwenden oder eigene Folgen anlegen, bearbeiten, kopieren und als Favorit markieren.
- **Üben:** Den Lernstand einer gesamten Folge und ihrer einzelnen Sprünge unabhängig festhalten.
- **Eigene Elemente:** Sprünge mit optionalen Technikdetails und manuellem D-Wert ergänzen.
- **Sprungzeit:** Messungen für zehn Strecksprünge erfassen, bearbeiten und im zeitlichen Verlauf vergleichen.
- **Datensicherung:** Persönliche Daten als JSON exportieren und mit Validierung wieder importieren.
- **Offline-Nutzung:** Nach dem ersten erfolgreichen Laden stehen die vorbereiteten App-Dateien über einen Service Worker offline bereit.

## Kurz ausprobieren

1. Im **Katalog** einen Sprung suchen und als Trainingsziel übernehmen.
2. Unter **Sprungfolgen** eine Vorlage auswählen und nach Bedarf bearbeiten.
3. Mit **Üben** den Gesamtstatus und die Bewertungen einzelner Sprünge festhalten.
4. Unter **Sprungzeit** einen Messwert eintragen.
5. Unter **Einstellungen** eine Sicherung exportieren.

## Technischer Aufbau

Die Anwendung verwendet HTML, CSS und JavaScript-Module ohne Frontend-Framework und ohne Build-Schritt. Cloudflare Pages liefert die statischen Dateien aus. Ein Backend, Benutzerkonten und API-Schlüssel werden für den Betrieb nicht benötigt.

| Datei | Aufgabe |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Seitenstruktur und responsive Gestaltung |
| `dist/app.mjs` | Navigation, Oberfläche und Interaktionen |
| `dist/core.mjs` | Fachlogik, Sprungfolgen, D-Planung und Backup-Validierung |
| `dist/catalogue-view.mjs` | Aufbereitung des Katalogs für die Anzeige |
| `dist/storage.mjs` | IndexedDB, Ersatzspeicher und Schutz vor konkurrierenden Speicheränderungen |
| `dist/jump-time.mjs` | Eingabevalidierung und Auswertung der Sprungzeitmessungen |
| `dist/data/catalogue.json` | Integrierter Sprungkatalog und Vorlagen der laufenden App |
| `dist/icon-*.png`, `dist/favicon-32.png`, `dist/apple-touch-icon.png` | Einheitliches Logo und für kleine Anzeigen aufbereitete Icons |
| `dist/sw.js`, `dist/manifest.webmanifest` | Offline-Cache und Installationsmetadaten |

`dist/` enthält die direkt gepflegten und auslieferbaren Quelldateien. Es gibt kein separates Quellverzeichnis, aus dem sie erst erzeugt werden müssen.

## Lokal starten

Voraussetzung: Python 3 und ein aktueller Browser. Im Projektordner:

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Anschließend [127.0.0.1:8000](http://127.0.0.1:8000) öffnen. Je nach Installation heißt der Python-Befehl `python3` oder unter Windows `py`. Die App benötigt keine Paketinstallation.

## Speicherung und Grenzen

Trainingsziele, Notizen und Messwerte bleiben im jeweiligen Browser. Es gibt keine Cloud-Speicherung und keine automatische Synchronisierung zwischen Geräten. Eine andere Webadresse oder ein anderer Browser besitzt einen eigenen Datenbestand; für die Übernahme dienen Export und Import.

D-Werte dienen der freien Trainingsplanung. Die App ersetzt keine fachliche Anleitung oder verbindliche Wettkampfprüfung.

## Hosting

Die öffentliche Anwendung läuft unter **https://trampolintrainer.pages.dev/**. Für statisches Hosting wird ausschließlich `dist/` als Veröffentlichungsverzeichnis verwendet. Der ursprüngliche App-Stand wurde am 18. Oktober 2026 bytegenau mit der Cloudflare-Website abgeglichen. Das aktuelle Branding verwendet ein einheitliches, vereinfachtes Trampolinlogo für Banner, Navigation, Browser-Tab und App-Installation.
