# Blue Horizon – Ausbauplan für das weltweite Hafen- und Wasserstraßennetz

Stand: 12.10.2026

## Ziel

Das Netz soll wiederholt und regional erweitert werden können, ohne die Routensuche oder das Spiel bei jeder Erweiterung umzubauen. Häfen, Wasserwege und die Verbindungen dazwischen werden als getrennte Datenebenen geführt. Neue Regionen sollen als zusätzliche Datendateien hinzukommen können.

## Wichtig: Geometrie ist nicht gleich Schiffbarkeit

Die aktuell in `data/inland-waterways.json` enthaltenen fünf Korridore sind vereinfachte Gameplay-Geometrien. Sie sind ausdrücklich **noch keine quellengestützten, präzisen Flussverläufe**. Sie dürfen nicht als amtliche Navigationsdaten dargestellt werden.

Für die echte Geometrie sind zwei Datentypen sinnvoll:

- **Hydrographische Flusslinien** (z. B. HydroRIVERS/HydroSHEDS): gute Grundlage für reale Flussverläufe und Gewässernetze, aber kein Nachweis, dass ein Abschnitt für Frachtschiffe schiffbar ist.
- **Kartierte Wasserstraßen mit Schiffbarkeits-Tags** (z. B. OpenStreetMap-Wasserwege): können Kanäle und Informationen wie `boat=yes` enthalten. Abdeckung und Tags unterscheiden sich regional; OSM-Daten stehen unter ODbL und brauchen korrekte Attribution.

Quellen zur späteren Datenerfassung:
- FAO Global Rivers / HydroRIVERS (CC BY 4.0): https://data.fao.org/catalog/dataset/e22667af-3977-4e9f-b58b-67fb91b0fa87
- HydroRIVERS Dokumentation und Downloads: https://www.hydrosheds.org/products/hydrorivers
- WaterwayMap, OSM-Wasserwege und Hinweise zur Verarbeitung: https://github.com/amandasaurus/waterwaymap.org
- OpenStreetMap Copyright/ODbL: https://www.openstreetmap.org/copyright

## Vorgeschlagene Repository-Struktur

```text
data/
  ports.json                         # Hafenstammdaten und stabile Hafen-IDs
  waterways/
    manifest.json                    # Datenschema-Version, Quellen, Regionen
    regions/
      europe-west.geojson            # Rhein, Seine, Kanäle usw.
      europe-danube.geojson          # Donau und Nebenwasserwege
      north-america.geojson          # Mississippi-System
      east-asia.geojson              # Jangtse-System
    connections.json                 # Fähr-/Mündungs-/Umschlag-Verbindungen
```

Die Struktur ist ein Zielbild, noch nicht die Behauptung, dass diese Dateien bereits mit echten Daten gefüllt sind. Die bestehende Datei `data/inland-waterways.json` bleibt vorerst kompatible Laufzeitquelle, bis der Loader für das modulare Format eingebaut ist.

## Datenmodell

Jede Wasserweg-Geometrie sollte mindestens enthalten:

- `id`: dauerhafte, eindeutige ID – niemals aus dem Array-Index ableiten.
- `name` und optional `nameLocal`.
- `geometry`: GeoJSON `LineString` oder `MultiLineString`, Koordinaten immer als `[longitude, latitude]`.
- `kind`: z. B. `river`, `canal`, `estuary` oder `sea_link`.
- `navigability`: `confirmed`, `tagged`, `unknown` oder `not_navigable`.
- `vesselClasses`: optionale Schiffsklassen, für die der Abschnitt nutzbar ist.
- `source`, `sourceUrl`, `license`, `attribution` und `retrievedAt`.
- optionale Betriebsdaten: Mindesttiefe, maximale Breite/Länge, Durchfahrtshöhe, Schleusen, Einbahnregelung und saisonale Einschränkungen – nur wenn diese Angaben aus belastbaren Quellen stammen.

Häfen werden mit einer stabilen ID an den nächstgelegenen geeigneten Wasserweg angebunden. Eine Verbindung darf nur dann als routbar gelten, wenn die Geometrie topologisch angeschlossen ist oder eine explizite, dokumentierte Anschlusskante existiert. Ein bloß nahe gelegener Fluss ist nicht automatisch ein Hafenanschluss.

## Ausbau in Stufen

1. **Netzwerk-Kern:** IDs, Schema-Versionierung, Quellenangaben und regionale Dateien einführen. Bestehende Hafen-IDs bleiben unverändert, damit gespeicherte Spielstände nicht brechen.
2. **Reale Geometrien:** pro Region Fluss- und Kanal-Linien aus geeigneten Quellen importieren, vereinfachen und in kleine Dateien teilen. Große globale Datensätze nicht ungefiltert in `main` legen.
3. **Topologie:** Linienenden und Kreuzungen verbinden, Lücken markieren und Verbindungen über Schleusen/Kanäle explizit abbilden. Geometrisch nahe, aber getrennte Wasserwege nicht automatisch verbinden.
4. **Schiffbarkeit:** Flussgeometrie und erlaubte Schiffsklasse getrennt halten. HydroRIVERS allein reicht nicht als Schiffbarkeitsnachweis.
5. **Tests:** pro Region definierte Hafenpaare, erwartete Routen, keine unverbundenen Sprünge und keine Routen über Land prüfen. Jede Erweiterung bekommt einen kleinen automatisierten Datentest.
6. **Performance:** Daten nach Region laden, vereinfachte Linien für Übersichtskarten nutzen und detaillierte Linien erst bei Bedarf laden. Rohdaten getrennt von spieloptimierten Dateien halten.

## Regeln für spätere Erweiterungen

- Keine bestehenden Hafen-IDs umbenennen oder wiederverwenden.
- Neue Häfen immer mit Koordinaten, Typ, Region, Quelle und eindeutiger ID ergänzen.
- Neue Wasserwege mit Herkunft, Lizenz und Datenstand dokumentieren.
- Keine künstlichen Luftlinien als Ersatz für fehlende Flussabschnitte tarnen. Falls ein Abschnitt noch nicht erfasst ist, ihn als unvollständig kennzeichnen oder die Route ablehnen.
- Nach jedem Import prüfen: JSON/GeoJSON parsebar, Koordinaten gültig, keine doppelten IDs, Hafenanschlüsse vorhanden, Dateigröße und Ladezeit vertretbar.
- Das Routing darf nicht allein deshalb eine Route freigeben, weil Punkte irgendwo in der Nähe eines beliebigen Flusses liegen. Alle Abschnitte einer Route müssen einem zusammenhängenden Netzwerkpfad folgen.

## Aktueller Status

- Vorhanden: `data/inland-waterways.json` mit Links und fünf groben Korridoren.
- Vorhanden: `js/waterways.js` lädt diese Datei und nutzt sie für einige Binnenrouten.
- Noch nicht vorhanden: globaler, quellengestützter und topologisch geprüfter Binnenwasserstraßen-Datensatz.
- Noch nicht vorhanden: vollständige Prüfung von Schleusen, Tiefgang, Brückenhöhen und Schiffsklassen.
