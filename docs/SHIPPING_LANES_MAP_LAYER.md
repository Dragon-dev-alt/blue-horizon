# Blue Horizon – Wasserkarte und Gewässerdarstellung

Stand: 2026-10-12

## Warum die bisherige Darstellung ersetzt wurde
Die vorherige Schifffahrtsrouten-GeoJSON-Datei lud nicht zuverlässig und Linien markieren ohnehin keine vollständigen Wasserflächen. Eine selbst aus Landumrissen berechnete grüne Maske war ebenfalls ungeeignet: Küsten und Inseln können dadurch falsch eingefärbt werden.

## Neue Lösung
Der Kartenknopf wechselt jetzt zwischen zwei vollständigen Basiskarten:
- **Satellit:** Esri World Imagery, wie zuvor.
- **Wasserkarte:** CARTO Voyager mit OpenStreetMap-Daten. Die Basiskarte rendert Meere, Buchten, Küstengewässer, größere Flüsse und Seen als echte kartografische Gewässermerkmale; kleinere Flüsse erscheinen abhängig vom Maßstab.

Diese Lösung verwendet eine fertige, laufend gerenderte Weltkarte statt einer einzelnen großen GeoJSON-Datei. Sie vermeidet die fehlerhafte grüne Überlagerung und benötigt keine lokale Geometrie, die über Land geraten könnte.

## Umsetzung
- `js/core.js`: Die alte Schifffahrtsrouten-Overlay-Logik wurde entfernt. `toggleNavigableWater()` wechselt jetzt sauber zwischen Satelliten- und Wasser-Basiskarte.
- `index.html`: Knopf heißt **„Wasserkarte“** und aktualisiert seine Beschriftung nach dem Umschalten auf **„Satellitenansicht“**.
- Der aktive Basiskartenwechsel beeinflusst keine Hafenmarker, Schiffsmarker oder Routen-Layer.
- Quellenangaben der Kartenanbieter bleiben über Leaflet sichtbar.

## Einschränkungen
Die Wasserkarte ist eine kartografische Darstellung, **kein amtlicher Nachweis**, dass jedes Gewässer für jedes Schiff befahrbar ist. Welche Gewässer ein Schiff tatsächlich befahren darf, muss weiterhin durch das separate Routensystem und passende Schiffsklassen bestimmt werden. Die sichtbaren Flussdetails hängen vom Zoom und den Daten der Basiskarte ab.

## Nächste sinnvolle Ausbaustufe
Für ein präziseres Spiel-Routennetz sollte später ein dedizierter Gewässerdatensatz lokal eingebunden und nach Wasserstraßenklasse gefiltert werden. Dabei müssen Seewege, schiffbare Flüsse, Schleusen, Tiefgang und Hafenanschlüsse getrennt modelliert werden; die Basiskarte allein sollte nie als Routing-Datenquelle dienen.

## Persistente Routendaten (12.10.2026)

`js/sea-routing.js` speichert die geladene Natural-Earth-Landgeometrie jetzt nach dem ersten Abruf in IndexedDB (`blue-horizon-geodata-v1`, Datensatz `natural-earth-land-10m-v1`). Die Routenprüfung verwendet weiterhin diese Geometrie, um Landquerungen zu erkennen. Nach dem ersten erfolgreichen Download bleibt die Geometrie über normale Neuladungen und Spielstarts im selben Browserprofil verfügbar; das ist ein lokaler Cache, keine im GitHub-Repository eingecheckte Geodatei. Beim ersten Start oder nach dem Löschen der Browserdaten ist eine Internetverbindung erforderlich.

**Wichtig: Das ist nur die Land-/Meer-Grundlage, noch kein vollständiges weltweites Gewässernetz.** Seen und Flüsse werden durch eine reine Landmaske nicht vollständig als schiffbares Wasser modelliert. Binnenschifffahrtsrouten verwenden weiterhin das explizite `RIVER_LINKS`-Netz in `js/waterways.js`. Für die nächste Stufe soll ein versionierter, lokal im Repository gespeicherter Gewässerdatensatz mit großen Flüssen und Wasserstraßen ergänzt werden; dabei müssen reine Flusslinien von tatsächlich schiffbaren Strecken unterschieden werden.


## Routendaten ohne grafische Gewässerüberlagerung (12.10.2026)

Die temporäre Wasserkarte-Schaltfläche und der Basiskartenwechsel wurden wieder aus der Oberfläche entfernt. Die Karte bleibt eine Satellitenkarte; Routendaten sind unsichtbare Logik und werden nicht als farbige Wasserflächen gerendert.

`js/sea-routing.js` speichert nun beide großen Eingabedatensätze im IndexedDB-Speicher `blue-horizon-geodata-v1`:
- `natural-earth-land-10m-v1`: Landgeometrie zur Prüfung, ob Routenabschnitte Land schneiden.
- `searoute-marnet-20km-v1`: maritimes 20-km-Routennetz für die Routenberechnung.

Nach einem ersten erfolgreichen Laden können beide Datensätze bei weiteren Starts desselben Browserprofils wiederverwendet werden. Beim ersten Start oder nach dem Löschen der Browserdaten müssen die Quelldaten noch aus dem Internet geladen werden. Diese Speicherung ist browserlokal und keine eingecheckte Datendatei im GitHub-Repository.

**Noch offen:** Das weltweite Binnenwasserstraßennetz ist weiterhin nur durch die bestehenden Verbindungen in `js/waterways.js` repräsentiert. Das ist keine vollständige Datenbank aller großen Flüsse und keine Aussage zur tatsächlichen Schiffbarkeit jedes Flussabschnitts. Eine belastbare nächste Ausbaustufe braucht einen versionierten Gewässerdatensatz mit expliziten Flussgeometrien und Schiffbarkeitsklassen. Die Landmaske darf nicht als Wasserstraßen-Netz missverstanden werden.


## Binnenrouten und geglättete Linien (12.10.2026)

`data/inland-waterways.json` ist jetzt die Laufzeitquelle für das modellierte Binnenwasserstraßennetz. `js/waterways.js` lädt die Datei aus dem Repository und nutzt bei einem Ladefehler weiterhin die eingebauten Verbindungen als Fallback. Flussrouten werden mit der vorhandenen Glättungsfunktion verarbeitet; eine geglättete Variante wird nur verwendet, wenn sie die Landprüfung besteht. Seerouten nutzen weiterhin das maritime Routingnetz, die Landprüfung und die vorhandene Glättung.

Das ist noch kein vollständiger, offizieller globaler Gewässeratlas: Die Binnenkanten sind Spielverbindungen zwischen Häfen, keine hochauflösenden Flussmittellinien. Die Landprüfung kann eine Route verwerfen, wenn eine Verbindung zwischen zwei Binnenhäfen als direkte Linie Land schneidet. Für echte Flussverläufe sollten später Geometrien entlang des tatsächlichen Flussbetts und Schiffbarkeitsattribute ergänzt werden.


## Geometrische Binnenrouten (12.10.2026)

`data/inland-waterways.json` enthält nun zusätzlich versionierte Linienzüge für fünf modellierte Flusskorridore: Rhein, Donau, Seine, Mississippi und Jangtse. `js/waterways.js` ermittelt für zwei Häfen im selben Korridor die passenden Linienpunkte und erzeugt daraus eine Route entlang des Korridors, statt die Häfen ausschließlich mit einer Luftlinie zu verbinden. `js/sea-routing.js` prüft solche Binnenrouten gegen die hinterlegten Korridorgeometrien, weil Flüsse in der Landmaske naturgemäß innerhalb von Landpolygonen liegen. Die Glättung wird nur akzeptiert, wenn die Punkte nahe am Korridor bleiben.

**Datenqualität:** Die hier hinterlegten Korridorlinien sind vereinfachte, manuell kuratierte Spielgeometrien, keine amtlichen Navigationskarten und kein vollständiger globaler Flussdatensatz. Sie dienen der Routenführung für die im Spiel abgedeckten Flussabschnitte. Nicht jeder Hafen liegt auf einem Korridor; dort kann noch die bisherige Fallback-Verbindung greifen. Schifffahrtskanäle, Schleusen, Tiefgang, Brückenhöhen, Strömungen und aktuelle Sperrungen werden noch nicht modelliert. Vor einer realistischen Simulation sollten die Linien durch lizenzkonforme, quellengestützte Gewässergeometrien ersetzt und je Schiffsklasse geprüft werden.
