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