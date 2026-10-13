# Blue Horizon – Hafenverzeichnis und Schiffszulassung

Dieses Verzeichnis ist die zentrale Übersicht für die Hafen-Kategorien. Die Kategorien und Zulassungen werden in `js/data.js` als Hafen-Metadaten gepflegt.

## Legende

| Symbol | Kategorie | Farbe | Zulässige Schiffe |
|---|---|---|---|
| ✦ | Globales Drehkreuz | Gold (#ffca55) | Coastal, Mitteldistanz, Langstrecke, Ultra, Tanker, Bulk Carrier, Ro-Ro |
| ⚓ | Internationaler Seehafen | Blau (#45b8ff) | Coastal, Mitteldistanz, Langstrecke, Ultra, Tanker, Bulk Carrier, Ro-Ro |
| ◉ | Regionaler Seehafen | Türkis (#57d6b0) | Coastal, Mitteldistanz, Langstrecke, Ultra, Tanker, Bulk Carrier, Ro-Ro |
| ◆ | Binnen-Drehkreuz | Violett (#c39bff) | Nur Binnenschiffe |
| ▰ | Binnenhafen | Grün (#85c98d) | Nur Binnenschiffe |

**Regel:** Binnenhäfen sind in dieser Version ausschließlich für Binnenschiffe freigegeben. Seehäfen schließen Binnenschiffe aus. Das heißt zum Beispiel: Singapur ist ein globales Drehkreuz ohne Binnenschiffe; Nürnberg ist ein Binnenhafen und darf nur von Binnenschiffen genutzt werden.

## Hafenliste nach Kategorie

### ✦ Globales Drehkreuz

- **Hamburg** (Deutschland) — ID `ham` — alle Seeschiffklassen, keine Binnenschiffe
- **Rotterdam** (Niederlande) — ID `rot` — alle Seeschiffklassen, keine Binnenschiffe
- **London Gateway** (Vereinigtes Königreich) — ID `lon` — alle Seeschiffklassen, keine Binnenschiffe
- **Antwerpen** (Belgien) — ID `ant` — alle Seeschiffklassen, keine Binnenschiffe
- **New York** (USA) — ID `nyc` — alle Seeschiffklassen, keine Binnenschiffe
- **Santos** (Brasilien) — ID `sao` — alle Seeschiffklassen, keine Binnenschiffe
- **Dubai** (VAE) — ID `dub` — alle Seeschiffklassen, keine Binnenschiffe
- **Mumbai** (Indien) — ID `mum` — alle Seeschiffklassen, keine Binnenschiffe
- **Singapur** (Singapur) — ID `sin` — alle Seeschiffklassen, keine Binnenschiffe
- **Shanghai** (China) — ID `sha` — alle Seeschiffklassen, keine Binnenschiffe
- **Los Angeles** (USA) — ID `lax` — alle Seeschiffklassen, keine Binnenschiffe
- **Hongkong** (China) — ID `hkg` — alle Seeschiffklassen, keine Binnenschiffe

### ⚓ Internationaler Seehafen

- **Oslo** (Norwegen) — ID `osl` — alle Seeschiffklassen, keine Binnenschiffe
- **Miami** (USA) — ID `mia` — alle Seeschiffklassen, keine Binnenschiffe
- **Houston** (USA) — ID `hou` — alle Seeschiffklassen, keine Binnenschiffe
- **Vancouver** (Kanada) — ID `van` — alle Seeschiffklassen, keine Binnenschiffe
- **Durban** (Südafrika) — ID `dur` — alle Seeschiffklassen, keine Binnenschiffe
- **Tokyo** (Japan) — ID `tyo` — alle Seeschiffklassen, keine Binnenschiffe
- **Sydney** (Australien) — ID `syd` — alle Seeschiffklassen, keine Binnenschiffe
- **Istanbul** (Türkei) — ID `ist` — alle Seeschiffklassen, keine Binnenschiffe
- **Marseille** (Frankreich) — ID `mar` — alle Seeschiffklassen, keine Binnenschiffe
- **Lissabon** (Portugal) — ID `lis` — alle Seeschiffklassen, keine Binnenschiffe
- **Sevilla** (Spanien) — ID `sev` — alle Seeschiffklassen, keine Binnenschiffe
- **Port Elizabeth** (Südafrika) — ID `plz` — alle Seeschiffklassen, keine Binnenschiffe
- **Kapstadt** (Südafrika) — ID `cpt` — alle Seeschiffklassen, keine Binnenschiffe
- **Maputo** (Mosambik) — ID `mpm` — alle Seeschiffklassen, keine Binnenschiffe
- **Mombasa** (Kenia) — ID `mby` — alle Seeschiffklassen, keine Binnenschiffe
- **Karatschi** (Pakistan) — ID `kar` — alle Seeschiffklassen, keine Binnenschiffe
- **Mormugao (Goa)** (Indien) — ID `goa` — alle Seeschiffklassen, keine Binnenschiffe
- **Colombo** (Sri Lanka) — ID `col` — alle Seeschiffklassen, keine Binnenschiffe
- **Jakarta** (Indonesien) — ID `jak` — alle Seeschiffklassen, keine Binnenschiffe
- **Manila** (Philippinen) — ID `man` — alle Seeschiffklassen, keine Binnenschiffe
- **Busan** (Südkorea) — ID `bru` — alle Seeschiffklassen, keine Binnenschiffe
- **Melbourne** (Australien) — ID `mel` — alle Seeschiffklassen, keine Binnenschiffe
- **Brisbane** (Australien) — ID `bri` — alle Seeschiffklassen, keine Binnenschiffe
- **Adelaide** (Australien) — ID `adl` — alle Seeschiffklassen, keine Binnenschiffe
- **Perth** (Australien) — ID `per` — alle Seeschiffklassen, keine Binnenschiffe
- **Auckland** (Neuseeland) — ID `akl` — alle Seeschiffklassen, keine Binnenschiffe
- **Rio de Janeiro** (Brasilien) — ID `rio` — alle Seeschiffklassen, keine Binnenschiffe
- **Barcelona** (Spanien) — ID `bar` — alle Seeschiffklassen, keine Binnenschiffe
- **Genua** (Italien) — ID `gen` — alle Seeschiffklassen, keine Binnenschiffe
- **Porto** (Portugal) — ID `por` — alle Seeschiffklassen, keine Binnenschiffe
- **New Orleans** (USA) — ID `naw` — alle Seeschiffklassen, keine Binnenschiffe
- **Seattle** (USA) — ID `sea` — alle Seeschiffklassen, keine Binnenschiffe
- **San Francisco** (USA) — ID `sfo` — alle Seeschiffklassen, keine Binnenschiffe
- **Boston** (USA) — ID `bos` — alle Seeschiffklassen, keine Binnenschiffe
- **Maskat** (Oman) — ID `mus` — alle Seeschiffklassen, keine Binnenschiffe
- **Gwadar** (Pakistan) — ID `gwa` — alle Seeschiffklassen, keine Binnenschiffe
- **Chennai** (Indien) — ID `che` — alle Seeschiffklassen, keine Binnenschiffe
- **Daressalam** (Tansania) — ID `dar` — alle Seeschiffklassen, keine Binnenschiffe
- **Wellington** (Neuseeland) — ID `wel` — alle Seeschiffklassen, keine Binnenschiffe
- **Nagoya** (Japan) — ID `nag` — alle Seeschiffklassen, keine Binnenschiffe
- **Kaohsiung** (Taiwan) — ID `kao` — alle Seeschiffklassen, keine Binnenschiffe
- **Dakar** (Senegal) — ID `dkr` — alle Seeschiffklassen, keine Binnenschiffe
- **Walvis Bay** (Namibia) — ID `wvb` — alle Seeschiffklassen, keine Binnenschiffe
- **Geraldton** (Australien) — ID `ger` — alle Seeschiffklassen, keine Binnenschiffe
- **Bunbury** (Australien) — ID `bun` — alle Seeschiffklassen, keine Binnenschiffe
- **Nassau** (Bahamas) — ID `nas` — alle Seeschiffklassen, keine Binnenschiffe
- **Port Klang** (Malaysia) — ID `klg` — alle Seeschiffklassen, keine Binnenschiffe
- **Qingdao** (China) — ID `qdo` — alle Seeschiffklassen, keine Binnenschiffe
- **Izmir** (Türkei) — ID `izm` — alle Seeschiffklassen, keine Binnenschiffe
- **Surabaya** (Indonesien) — ID `sby` — alle Seeschiffklassen, keine Binnenschiffe
- **Cebu** (Philippinen) — ID `ceb` — alle Seeschiffklassen, keine Binnenschiffe
- **Nouakchott** (Mauretanien) — ID `nou` — alle Seeschiffklassen, keine Binnenschiffe
- **Lüderitz** (Namibia) — ID `lud` — alle Seeschiffklassen, keine Binnenschiffe

### ◉ Regionaler Seehafen


### ◆ Binnen-Drehkreuz

- **Duisburg** (Deutschland) — ID `dui` — Binnenschiff ausschließlich
- **Nürnberg** (Deutschland) — ID `nue` — Binnenschiff ausschließlich
- **Wien** (Österreich) — ID `vie` — Binnenschiff ausschließlich
- **Galati** (Rumänien) — ID `gal` — Binnenschiff ausschließlich
- **Memphis** (USA) — ID `mem` — Binnenschiff ausschließlich
- **St. Louis** (USA) — ID `stl` — Binnenschiff ausschließlich
- **Wuhan** (China) — ID `wuh` — Binnenschiff ausschließlich
- **Chongqing** (China) — ID `chq` — Binnenschiff ausschließlich

### ▰ Binnenhafen

- **Köln** (Deutschland) — ID `cgn` — Binnenschiff ausschließlich
- **Basel** (Schweiz) — ID `bas` — Binnenschiff ausschließlich
- **Straßburg** (Frankreich) — ID `str` — Binnenschiff ausschließlich
- **Frankfurt am Main** (Deutschland) — ID `fra` — Binnenschiff ausschließlich
- **Regensburg** (Deutschland) — ID `reg` — Binnenschiff ausschließlich
- **Bratislava** (Slowakei) — ID `bra` — Binnenschiff ausschließlich
- **Budapest** (Ungarn) — ID `bud` — Binnenschiff ausschließlich
- **Belgrad** (Serbien) — ID `bel` — Binnenschiff ausschließlich
- **Paris (Gennevilliers)** (Frankreich) — ID `par` — Binnenschiff ausschließlich
- **Rouen** (Frankreich) — ID `rou` — Binnenschiff ausschließlich
- **Tulcea** (Rumänien) — ID `tul` — Binnenschiff ausschließlich
- **Novi Sad** (Serbien) — ID `nov` — Binnenschiff ausschließlich
- **Cape Girardeau** (USA) — ID `cgr` — Binnenschiff ausschließlich
- **Paducah** (USA) — ID `pad` — Binnenschiff ausschließlich
- **Dyersburg** (USA) — ID `dyb` — Binnenschiff ausschließlich
- **Yueyang** (China) — ID `yue` — Binnenschiff ausschließlich
- **Fuling** (China) — ID `ful` — Binnenschiff ausschließlich

## Individuelle Ausnahmen für Binnenschiffe

Die Kategorie allein entscheidet **nicht** über die Zulassung. Die Daten in `PORT_SHIP_ACCESS_OVERRIDES` ergänzen die Standardzulassung pro Hafen.

| Hafen | Zulassung/Ausnahme | Begründung und Quelle |
|---|---|---|
| Hamburg | See- und Binnenschiffe | Offiziell ausgewiesener See- und Binnenhafen; Elbe und Kanäle verbinden ihn mit dem Binnenwasserstraßennetz. [Hamburg Port Authority](https://www.hamburg-port-authority.de/en/waterway/inland-waterway-shipping) |
| Rotterdam | See- und Binnenschiffe | Die Hafenbehörde führt eigene Infrastruktur, Liegeplätze und Regeln für die Binnenschifffahrt. [Port of Rotterdam](https://www.portofrotterdam.com/en/inland-shipping) |
| Antwerpen | See- und Binnenschiffe | Die Hafenbehörde weist getrennte See- und Binnenverkehrsbereiche aus; Binnenfahrzeuge machen einen großen Anteil der Schiffsbewegungen aus. [Port of Antwerp-Bruges – Zahlen](https://www.portofantwerpbruges.com/en/faq/where-can-i-find-facts-figures-and-statistics-about-port) |
| Shanghai | See- und Binnenschiffe, abhängig von Wasserweg und Schiffsklasse | Die Stadt beschreibt Verbindungen zwischen Seehafen, Fluss-See-Transport und Binnenwasserstraßen. [Shanghai Municipal Government](https://english.shanghai.gov.cn/en-Latest-WhatsNew/20260803/2b7583f524ec4cf98184d692d35584fa.html) |
| Rouen | See- und Binnenschiffe, abhängig von Wasserweg und Schiffsklasse | Der Hafen liegt an der Seine und verbindet Seeschifffahrt mit Binnenwasserwegen. [HAROPA PORT](https://www.haropaport.com/) |

**Wichtig:** Eine Hafenfreigabe bedeutet nicht, dass jede Route für jedes Schiff möglich ist. Die Route muss zusätzlich durchgehend schiffbar sein und Tiefgang, Abmessungen, Schleusen, Brücken, Reichweite und Schiffsklasse berücksichtigen. Die hier genannten Ausnahmen bilden zunächst die bestätigten Spielregeln ab; sie ersetzen keine nautische Prüfung einzelner Strecken.

### Geprüfte Gegenbeispiele und Grenzen

- **Nürnberg:** Binnenhafen am Main-Donau-Kanal; im Spiel nur Binnenschiffe. [Stadt Nürnberg – Main-Donau-Kanal](https://www.nuernberg.de/internet/hafen/main_donau_kanal.html)
- **Duisburg:** großer Binnenhafen am Rhein/Ruhr; im Spiel nur Binnenschiffe, keine Hochseeschiffe. [Stadt Duisburg – Hafen](https://www.duisburg.de/wohnenleben/wasser/hafen)
- **Bremen:** Offizielle Hafeninformationen bestätigen Seehafen und zugleich Anbindung an das europäische Binnenkanalsystem sowie eigene Binnenverkehrsangebote. Bremen ist derzeit **nicht als eigener Datensatz** in der Spiel-Hafenliste vorhanden; falls wir Bremen später hinzufügen, soll es ebenfalls eine See-/Binnen-Ausnahme bekommen. [Weserport](https://www.weserport.de/terminals/) · [bremenports](https://www.bremenports.de/en/hinterland/inland-shipping)
- **Amsterdam:** Die Hafenbehörde führt explizite Binnenhafengebühren und Binnenwasserwege. Amsterdam ist derzeit **nicht als eigener Datensatz** vorhanden; bei einer späteren Aufnahme soll eine individuelle See-/Binnenzulassung geprüft werden. [Port of Amsterdam](https://www.portofamsterdam.com/en/shipping/inland-shipping/inland-harbour-dues/direct-debit)

## Technische Hinweise

- Die Hafen-ID ist der stabile Schlüssel, auf den Aufträge, Spielstände und Routen verweisen.
- Kategorie-Metadaten: `category`, `categoryLabel`, `symbol`, `color`, `allowedShipTypes`.
- Bei neuen Häfen müssen Koordinaten, Land-/Wasserzugang und die Kategorie gemeinsam geprüft werden.
- Diese Liste ist eine Spielregel-Klassifikation, keine vollständige nautische Aussage zur realen Erreichbarkeit jedes Hafens.
