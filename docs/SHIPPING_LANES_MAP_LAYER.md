# Blue Horizon – Schifffahrtsrouten-Kartenlayer

Stand: 2026-10-12

## Entscheidung
Die bisherige grüne Wasserflächenmaske aus Landpolygonen war visuell fehleranfällig und wurde entfernt. Sie hat nicht zuverlässig nur Wasser markiert und konnte über Land erscheinen.

## Neue Grundlage
Für die Kartenansicht wird als erster Schritt ein globaler Open-Data-Datensatz von Schifffahrtsrouten verwendet:
- Repository: https://github.com/newzealandpaul/Shipping-Lanes
- GeoJSON-Datei: https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/master/data/Shipping_Lanes_v1.geojson
- Der Datensatz beschreibt globale Schifffahrtsrouten und klassifiziert Linien als Major, Middle oder Minor.
- Lizenz-/Quellenhinweis laut Repository: CC BY 4.0 mit dort genannter Ausnahme für Statista; Datensatz nennt P. Benden (2022), DOI https://doi.org/10.5281/zenodo.6361763.
- MarineTraffic und OpenSeaMap wurden als mögliche Referenzen recherchiert. MarineTraffic bietet geografische See-/Schifffahrtsgebiete, aber keinen hier direkt integrierten freien Layer festgestellt. OpenSeaMap eignet sich eher als Seekarten-/Navigationsreferenz.

## Implementierungsstatus
- In `js/core.js` wurde die fehlerhafte Canvas-Maske durch einen Leaflet-GeoJSON-Layer ersetzt.
- Button in `index.html` heißt jetzt „Schifffahrtsrouten“.
- Darstellung: Hauptlinien türkis und kräftiger; mittlere Linien blau; kleinere Linien hellblau.
- Layer wird beim ersten Aktivieren geladen und danach wiederverwendet.
- Die Karte zeigt Schifffahrtsrouten, nicht die rechtliche oder technische Befahrbarkeit jedes Gewässers. Das vorhandene Routen-/Landprüfsystem bleibt separat und entscheidet nicht allein anhand der dargestellten Linien.

## Nächste Schritte
1. Im Browser mit Strg+F5 testen, ob die GeoJSON-Datei geladen wird und Linien erscheinen.
2. Bei CORS-/404-/Netzwerkfehlern Datensatz als lokale Datei ins Repository übernehmen, inklusive Lizenzhinweis.
3. Für spielrelevante Routen nach und nach regionale Gebiete priorisieren: Nordsee/Ärmelkanal, Ostsee, Mittelmeer, Nordatlantik, Suez/Rotmeer, Persischer Golf, Ostasien, US-Küsten und große Flusskorridore.
4. Später entscheiden, ob eine zusätzliche dezente „Wasserfläche“-Darstellung benötigt wird. Keine globale grüne Maske aus Landumrissen verwenden.
