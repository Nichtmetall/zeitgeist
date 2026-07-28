# Zeitwerk

Lokale Desktop-Anwendung zur Arbeitszeiterfassung auf Basis von **Electron**, **React**,
**TypeScript** und **Fluent UI v9**. Sämtliche Daten bleiben auf dem eigenen Rechner – die
Anwendung stellt zu keinem Zeitpunkt eine Netzwerkverbindung her.

Grundlage aller Vorgaben, Berechnungen und Hinweise ist das deutsche **Arbeitszeitgesetz
(ArbZG)**. Jeder Grenzwert lässt sich in den Einstellungen an abweichende Tarif- oder
Betriebsvereinbarungen anpassen.

## Funktionsumfang

### Arbeitszeit und Pausen

- Stoppuhr für Arbeitszeit und Pausen, jederzeit über Kopfzeile oder Menü (`Strg+Umschalt+S`
  bzw. `Strg+Umschalt+P`) erreichbar
- Nachträgliches Erfassen, Bearbeiten und Löschen von Einträgen samt einzelner Pausenabschnitte
- Tages-, Wochen- und Zeitraumauswertung mit Soll-, Ist- und Saldoberechnung
- Erfassungen über Mitternacht, mehrere Abschnitte pro Tag und Tätigkeitsarten
  (Büro, Homeoffice, Dienstreise, Sonstiges)

### Hinweise nach dem Arbeitszeitgesetz

| Regel | Umsetzung |
| --- | --- |
| § 3 ArbZG | Werktägliche Höchstarbeitszeit von 8 h, Verlängerung auf 10 h nur mit Ausgleich; laufende Prüfung des Durchschnitts im Ausgleichszeitraum (24 Wochen) |
| § 4 ArbZG | 30 min Ruhepause bei mehr als 6 h, 45 min bei mehr als 9 h; nur Abschnitte ab 15 min werden angerechnet; Warnung nach 6 h Arbeit ohne Pause |
| § 5 ArbZG | Prüfung der ununterbrochenen Ruhezeit von 11 h zwischen zwei Arbeitstagen |
| § 9 ArbZG | Hinweis auf Sonn- und Feiertagsruhe |

Die Hinweise erscheinen live während der Erfassung (inklusive Vorwarnung vor der nächsten
Pausenschwelle), als Systembenachrichtigung und in jedem Bericht. Nichts wird blockiert – die
Anwendung dokumentiert und weist hin.

### Bewegungserinnerung nach der 40-15-5-Methode

40 Minuten dynamisches Sitzen, 15 Minuten Stehen, 5 Minuten Bewegung. Der Zyklus läuft
automatisch mit der Arbeitszeiterfassung, pausiert wahlweise während erfasster Pausen und lässt
sich vollständig abschalten oder in allen drei Phasenlängen anpassen.

### Zeitbuchung für Projekte und Aufgaben

- Tages- und Wochenansicht als Kalenderraster
- Neue Buchung durch **Ziehen** im Raster; bestehende Buchungen lassen sich verschieben, in der
  Höhe ändern und per Klick bearbeiten
- Zeit (Von, Bis, Dauer) sowie Projekt und Beschreibung der Aufgabe
- **Vorlagen** für wiederkehrende Buchungen, wahlweise beim Ziehen direkt angewendet
- Hinweis, wenn eine Buchung außerhalb der erfassten Arbeitszeit liegt oder sich mit einer
  anderen überschneidet – ohne die Buchung zu verhindern
- Die erfasste Arbeitszeit wird als Hintergrundband im Kalender dargestellt

### Export und Import

- **CSV** – verlustfreier Export und Import, Trennzeichen und Dezimaltrennzeichen einstellbar
- **Excel (.xlsx)** – Arbeitsmappe mit Deckblatt, Arbeitszeiten, Zeitbuchungen, Tages- und
  Projektübersicht sowie ArbZG-Hinweisen
- **PDF** – Arbeitszeitnachweis im Querformat mit Kennzahlen, Tabellen und Hinweisen
- CSV-Import erkennt auch Fremdformate (Spalten `Datum`, `Beginn`, `Ende`), meldet fehlerhafte
  Zeilen einzeln und überspringt auf Wunsch bereits vorhandene Einträge

### Einstellungen

Alle Parameter sind konfigurierbar: Arbeitstage, Tages- und Wochensoll, reguläre Arbeitszeiten,
sämtliche ArbZG-Grenzwerte, Vorwarnzeiten, automatischer Pausenabzug, Rundung, Inaktivitäts-
hinweis, die drei Phasen der Bewegungserinnerung samt Benachrichtigung und Signalton, Zeitraster
und Zeitfenster des Kalenders, Exportformatierung sowie Farbschema (hell, dunkel, System, hoher
Kontrast), Wochenbeginn und Startseite.

## Datenhaltung

Alle Daten liegen in einer einzigen JSON-Datei im Benutzerprofil:

| Betriebssystem | Pfad |
| --- | --- |
| Windows | `%APPDATA%\Zeitwerk\zeitwerk-data.json` |
| macOS | `~/Library/Application Support/Zeitwerk/zeitwerk-data.json` |
| Linux | `~/.config/Zeitwerk/zeitwerk-data.json` |

Geschrieben wird atomar (temporäre Datei und Umbenennen); eine beschädigte Datei wird gesichert,
statt überschrieben zu werden. Der Speicherort ist in der Anwendung unter *Export & Import*
einsehbar und lässt sich direkt im Dateimanager öffnen.

## Architektur

```
src/
  main/       Hauptprozess: Fenster, Menü, JSON-Persistenz, Datei-Dialoge, XLSX-Ausgabe
  preload/    Typisierte Bridge (Kontextisolation aktiv, kein Node-Zugriff im Renderer)
  renderer/   React-Oberfläche mit Fluent UI v9
  shared/     Domänenlogik: Typen, Zeitrechnung, ArbZG-Regelwerk, CSV, Berichtsmodell
tests/        Unit-Tests der Domänenlogik (Vitest)
scripts/      Rauchtest der gebauten Anwendung
```

Die Domänenlogik unter `src/shared` ist frei von Seiteneffekten und wird von Haupt- und
Renderer-Prozess sowie den Tests gleichermaßen verwendet. Der Renderer besitzt keinen direkten
Datei- oder Node-Zugriff; jede Dateioperation läuft über klar umrissene IPC-Kanäle.

## Entwicklung

```bash
npm install        # Abhängigkeiten installieren
npm run dev        # Anwendung im Entwicklungsmodus starten
npm test           # Unit-Tests der Domänenlogik
npm run typecheck  # TypeScript prüfen (Node- und Web-Projekt)
npm run build      # Typprüfung und Produktions-Bundles nach out/
npm run smoke      # Rauchtest der gebauten Anwendung (Linux: xvfb-run erforderlich)
npm run format     # Quelltext formatieren
```

Der Rauchtest startet die gebaute Anwendung mit einem temporären Profil, klickt sich durch alle
Seiten, legt eine Buchung per Ziehen an, erzeugt CSV-, Excel- und PDF-Dateien, liest den
CSV-Export wieder ein und legt Bildschirmfotos ab.

### Installationspakete

```bash
npm run dist:win     # NSIS-Installer
npm run dist:mac     # DMG
npm run dist:linux   # AppImage und deb
```

## Technischer Hinweis

Die Oberfläche ist vollständig mit Fluent UI v9 umgesetzt (`@fluentui/react-components` sowie die
Kompatibilitätspakete für Datums- und Zeitauswahl). Farben, Abstände, Typografie und Schatten
stammen ausschließlich aus den Fluent-Designtokens, damit helles, dunkles und kontrastreiches
Design ohne Sonderfälle funktionieren.
