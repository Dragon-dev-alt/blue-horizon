# Blue Horizon – Architektur für das gesamte weltweite Hafen-, Gewässer- und Routennetz

Stand: 12.10.2026

## Ziel und Geltungsbereich

Diese Architektur gilt ausdrücklich für **alle Häfen und alle Transportwege**, nicht nur für Binnenhäfen: internationale Seehäfen, regionale Seehäfen, Binnenhäfen, Küstenhäfen, Flussmündungen, Kanäle, offene Seestrecken und explizite Umschlag- oder Fährverbindungen. Das gesamte globale Hafennetz soll wiederholt erweitert werden können, ohne die Routensuche oder das Spiel bei jeder Erweiterung umzubauen.

Häfen, Hafenanlagen, Wasserweg-Geometrien, schiffbare Netzwerksegmente und mögliche Verbindungen werden als getrennte Datenebenen geführt. Regionale Dateien und gemeinsame IDs erlauben, das Netz schrittweise auszubauen. Die aktuelle Datei `data/inland-waterways.json` bleibt vorerst ein Kompatibilitätsbestandteil, aber nicht die langfristige Architektur für sämtliche Routen.

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

## Vorgeschlagene Repository-Struktur für das gesamte Netz

```text
data/
  network/
    manifest.json                    # globale Schema-Version, Quellen und Regionen
    ports.json                       # alle Hafenstammdaten mit stabilen IDs
    terminals.json                   # optionale Terminals/Anleger pro Hafen
    connections.json                 # explizite Verbindungen und Übergänge
    regions/
      europe-north.geojson           # Nordsee, Ostsee, Häfen und Wasserwege
      europe-west.geojson            # Atlantikküste, Rhein, Seine, Kanäle
      europe-danube.geojson          # Donau-System und zugehörige Häfen
      north-america.geojson          # Küstenrouten und Mississippi-System
      east-asia.geojson              # Küstenrouten und Jangtse-System
      south-america.geojson          # Häfen und Gewässer Südamerikas
      africa.geojson                 # Häfen und Gewässer Afrikas
      oceania.geojson                # Häfen und Gewässer Ozeaniens
    sea-lanes/                       # optional getrennte maritime Routennetze
      global.geojson
```

Die Struktur ist ein Zielbild, noch nicht die Behauptung, dass diese Dateien bereits mit echten Daten gefüllt sind. Die bestehende Datei `data/inland-waterways.json` bleibt vorerst kompatible Laufzeitquelle, bis der Loader für das modulare Format eingebaut ist.

## Datenmodell

Jeder Hafen sollte mindestens enthalten:

- `id`: dauerhafte, weltweit eindeutige ID; bestehende IDs wie `ham`, `rot` oder `nyc` bleiben stabil.
- `name`, optional `alternateNames`, `countryCode` und `regionId`.
- `coordinates`: eindeutige Hafenposition in `[longitude, latitude]`.
- `portType`: `international`, `regional`, `coastal` oder `inland` – ohne daraus automatisch die Schiffbarkeit jeder Route abzuleiten.
- `connections`: IDs der tatsächlich angeschlossenen Wasserweg-Knoten oder explizite Übergänge.
- `source`, `sourceUrl`, `license`, `attribution` und `retrievedAt`.
- optionale, belegte Angaben zu Liegeplätzen, Umschlagarten, Tiefgang und zugelassenen Schiffsklassen.

Jede Wasserweg-Geometrie sollte mindestens enthalten:

- `id`: dauerhafte, eindeutige ID – niemals aus dem Array-Index ableiten.
- `name` und optional `nameLocal`.
- `geometry`: GeoJSON `LineString` oder `MultiLineString`, Koordinaten immer als `[longitude, latitude]`.
- `kind`: z. B. `river`, `canal`, `estuary` oder `sea_link`.
- `navigability`: `confirmed`, `tagged`, `unknown` oder `not_navigable`.
- `vesselClasses`: optionale Schiffsklassen, für die der Abschnitt nutzbar ist.
- `source`, `sourceUrl`, `license`, `attribution` und `retrievedAt`.
- optionale Betriebsdaten: Mindesttiefe, maximale Breite/Länge, Durchfahrtshöhe, Schleusen, Einbahnregelung und saisonale Einschränkungen – nur wenn diese Angaben aus belastbaren Quellen stammen.

Alle Hafentypen werden über stabile IDs an das gemeinsame Routennetz angebunden. Für Seehäfen sind Küstenzugänge und maritime Routen relevant; für Binnenhäfen Fluss- und Kanalnetze; für Häfen an Flussmündungen können beide Netze über explizite Übergangsknoten verbunden sein. Eine Verbindung darf nur dann als routbar gelten, wenn die Geometrie topologisch angeschlossen ist oder eine explizite, dokumentierte Anschlusskante existiert. Ein bloß nahe gelegener Fluss oder eine nahe Seeroute ist nicht automatisch ein Hafenanschluss.

## Gemeinsames Routingmodell

Das Routing soll nicht aus separaten, voneinander isolierten Listen für Binnen- und Seehäfen bestehen. Es nutzt einen gemeinsamen Graphen aus:

- **Hafenknoten** für sämtliche vorhandenen und später hinzukommenden Häfen.
- **Wasserwegsegmenten** mit echter Geometrie und Typ (`sea`, `river`, `canal`, `estuary`).
- **Anschlusskanten** zwischen Hafen und Wasserweg.
- **Übergangskanten** für Mündungen, Schleusen, Kanäle, Hafenbecken oder andere belegte Verbindungen.
- **Schiffsklassen-Regeln**, die bestimmen, welche Segmente ein konkretes Schiff nutzen darf.

So kann eine Route etwa von einem Binnenhafen über Fluss und Kanal zu einem Seehafen und anschließend über maritime Strecken zu einem internationalen Hafen führen – sofern alle Übergänge tatsächlich im Datensatz verbunden und für das Schiff zulässig sind. Das Vorhandensein einer Route darf nicht allein von der Kategorie des Start- oder Zielhafens abhängen.

## Ausbau in Stufen

1. **Globaler Kern:** einheitliche IDs, Hafenregister, Schema-Versionierung, Quellen und regionale Indizes anlegen; bestehende Hafen-IDs bleiben unverändert.
2. **Bestehende Häfen anbinden:** alle aktuellen See- und Binnenhäfen ins gemeinsame Modell übernehmen, nicht nur neue Häfen.
3. **Maritime Geometrien:** Küstenzugänge und Seerouten regionsweise importieren und topologisch anbinden.
4. **Binnengeometrien:** reale Fluss- und Kanal-Linien ergänzen; HydroRIVERS nur als hydrographische Grundlage, nicht als automatischen Schiffbarkeitsnachweis nutzen.
5. **Übergänge verbinden:** Flussmündungen, Kanäle, Schleusen und Hafenanschlüsse explizit modellieren.
6. **Schiffbarkeit:** erlaubte Schiffsklassen und belegte Beschränkungen getrennt von der Geometrie halten.
7. **Tests:** Hafenpaare über verschiedene Regionen und Verkehrstypen prüfen; keine unverbundenen Sprünge und keine Routen über Land zulassen.
8. **Performance:** regionale Daten bei Bedarf laden, Linien für Übersichtskarten vereinfachen und Detailgeometrien nur für Routing laden. Rohdaten getrennt von optimierten Spieldaten halten.

## Regeln für spätere Erweiterungen

- Keine bestehenden Hafen-IDs umbenennen oder wiederverwenden.
- Neue See-, Küsten- und Binnenhäfen immer mit Koordinaten, Typ, Region, Quelle und eindeutiger ID ergänzen.
- Neue Häfen müssen an das gemeinsame Routennetz angeschlossen werden; bloß das Hinzufügen eines Markers reicht nicht.
- Erweiterungen dürfen maritime Routen und Binnenrouten nicht versehentlich voneinander trennen, wenn ein realer Übergang existiert.
- Neue Wasserwege mit Herkunft, Lizenz und Datenstand dokumentieren.
- Keine künstlichen Luftlinien als Ersatz für fehlende Flussabschnitte tarnen. Falls ein Abschnitt noch nicht erfasst ist, ihn als unvollständig kennzeichnen oder die Route ablehnen.
- Nach jedem Import prüfen: JSON/GeoJSON parsebar, Koordinaten gültig, keine doppelten IDs, Hafenanschlüsse vorhanden, Dateigröße und Ladezeit vertretbar.
- Das Routing darf nicht allein deshalb eine Route freigeben, weil Punkte irgendwo in der Nähe eines beliebigen Flusses liegen. Alle Abschnitte einer Route müssen einem zusammenhängenden Netzwerkpfad folgen.

## Aktueller Status

- Vorhanden: das Spiel besitzt bereits eine bestehende Liste verschiedener See- und Binnenhäfen sowie ein maritimes Routing-System.
- Vorhanden: `data/inland-waterways.json` mit Links und fünf groben Binnenkorridoren.
- Vorhanden: `js/waterways.js` lädt diese Datei für einige Binnenrouten.
- Noch nicht vorhanden: ein einheitliches, globales Register aller Häfen und ein gemeinsamer, topologisch geprüfter Graph, der alle Hafenklassen und Übergänge umfasst.
- Noch nicht vorhanden: vollständig quellengestützte Geometrien und einheitliche Prüfung von Schiffsklassen, Schleusen, Tiefgang und Brückenhöhen.
- Die Dokumentation beschreibt die Zielarchitektur; sie behauptet nicht, dass die vollständige Migration des laufenden Routings bereits umgesetzt wurde.
