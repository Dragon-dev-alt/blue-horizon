# Zielhafen-Index nach Hafen und Schiffstyp

Datei: `data/port-destinations.json`

## Zweck

Der Index enthält für alle 90 Häfen je Start-Hafen und Schiffsklasse eine sortierte Liste möglicher Zielhäfen. Er ist als stabile, gut zugreifbare Datenquelle für spätere Auftragsgenerierung gedacht; er ersetzt nicht die Prüfung der tatsächlich befahrbaren Wasserroute.

## Aufbau

- `ports`: Hafenstammdaten (ID, Name, Binnen-/Seehafen und Kategorie-Level).
- `types`: Reichweitenband je Schiffsklasse in Kilometern.
- `origins[HAFEN_ID][SCHIFFSTYP]`: Ziele für den jeweiligen Start-Hafen und Schiffstyp.
- Ein Ziel ist kompakt als Array gespeichert: `[zielHafenId, direkteDistanzKm, ungefähreRoutenKm, art]`.
- `art`: `s` = Seekorridor, `r` = Binnenwasserstraße.

## Beispiel

Hamburg (`ham`) → Langstrecke (`long`) enthält New York (`nyc`) mit ca. 7.050 km geschätzter Route. Hamburg → Coastal → New York ist nicht enthalten, weil die Verbindung außerhalb der Coastal-Reichweite liegt.

Nürnberg (`nue`) → Langstrecke enthält keine Ziele; Nürnberg → Binnenschiff (`river`) enthält nur Ziele aus dem passenden Binnenwasserstraßennetz. Damit werden nicht allein aufgrund geografischer Nähe unzulässige Seehafen-Ziele eingetragen.

## Zulässigkeit

- Ein Ziel muss im bestehenden Verbindungskatalog für den Schiffstyp freigegeben sein.
- Start- und Zielhafen müssen die betreffende Schiffsklasse zulassen.
- Die geschätzte Route darf die maximale Reichweite der Schiffsklasse nicht überschreiten. Einzelne Schiffe haben eine konkrete Reichweite innerhalb des jeweiligen Bands; diese muss beim Erzeugen eines Auftrags zusätzlich geprüft werden.
- Gemischte Hafen-Ausnahmen erlauben nicht automatisch eine neue Route. Es wird keine Verbindung erfunden, wenn der bestehende Katalog sie nicht enthält.

## Distanzangabe

`approxRouteKm` ist bewusst eine **ungefähre Planungsdistanz**: Direktdistanz × 1,15 für Seewege bzw. × 1,25 für Binnenwasserstraßen, auf 10 km gerundet. Das ist noch keine aus der tatsächlichen Wassergeometrie berechnete Route. Vor dem Anzeigen oder Annehmen eines Auftrags muss die echte Wasserroute weiterhin berechnet und auf Landfreiheit geprüft werden.

## Beispielzugriff in JavaScript

```js
const index = await fetch('./data/port-destinations.json').then(r => r.json());
const hamburgLongstrecke = index.origins.ham.long;
const newYork = hamburgLongstrecke.find(([to]) => to === 'nyc');
// newYork[2] enthält die ungefähre Routendistanz in km.
```


## Streckenprofile nach Schiffstyp

Zusätzlich zur technischen Reichweite jedes Schiffstyps enthält `routeBandsKm` das passende Streckenprofil. So werden beispielsweise kurze Verbindungen nicht als Langstreckenauftrag angeboten. Die aktuellen ungefähren Routendistanzen werden nach diesen Bereichen gefiltert:

| Schiffstyp | Routendistanz |
|---|---:|
| Coastal | 0–2.200 km |
| Mitteldistanz | 700–6.000 km |
| Langstrecke | 5.000–15.000 km |
| Ultra-Langstrecke | 10.000–30.000 km |
| Tanker | 2.000–30.000 km |
| Massengutfrachter | 1.500–20.000 km |
| Ro-Ro | 500–8.000 km |
| Binnenschiff | 0–800 km |

Die Profile dürfen sich überschneiden: Ein Zielhafen kann für mehrere Schiffstypen geeignet sein. Ein Langstrecken-Schiff bekommt aber keine sehr kurze Verbindung nur deshalb angeboten, weil seine technische Reichweite groß genug wäre. Die Profile sind Balancing-Regeln und können später angepasst werden.
