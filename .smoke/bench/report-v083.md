# Quick Area accuracy benchmark — engine: v083

Run 2026-10-25 04:54 · 45 files · 307 printed room areas · 773 s

| | count | share |
|---|---|---|
| Room found (fill) | 276 | 90% |
| Within 10% of printed area | 28 | 9% |
| Within 25% | 74 | 24% |
| Median error (filled) | -13.2% | |
| Median time per click | 941 ms | |

Skipped labels: 167 in schedules/tables, 25 totals (GFA/GIA/gross/unit), 96 with no readable scale. "No room" means Quick Area found no closed shape (or rejected a whole-sheet leak) — the correct answer when a label isn't inside a room.

## By file

| file | labels | filled | ≤10% | ≤25% | median error | scale |
|---|---|---|---|---|---|---|
| nebraska-sidney-rest-area.pdf | 40 | 34 | 6 | 10 | -14% | snapped from 1:48, page |
| nsw-gregory-hills-ps.pdf | 40 | 39 | 7 | 26 | -13% | page |
| suny-oneonta-alumni-plans.pdf | 40 | 30 | 2 | 6 | -37% | page |
| nl-michaelschool-bg.pdf | 39 | 38 | 8 | 15 | -13% | page |
| pleanala-boherboy-type-h.pdf | 34 | 34 | 0 | 0 | -80% | page |
| nsw-meadowbank-amended.pdf | 32 | 32 | 0 | 0 | 64954% | page |
| east-providence-cc-drawings.pdf | 28 | 15 | 0 | 2 | -90% | inferred, page |
| pleanala-house-type-9b.pdf | 16 | 16 | 1 | 5 | -10% | snapped from 1:100 |
| haringey-marlborough-rd.pdf | 9 | 9 | 1 | 3 | -12% | page |
| rochester-ha-lake-tower-hall.pdf | 9 | 9 | 1 | 1 | 31% | inferred, page, snapped from 1:96 |
| uk-brockworth-house.pdf | 8 | 8 | 2 | 4 | -17% | snapped from 1:50 |
| nz-mt-cook-school.pdf | 7 | 7 | 0 | 2 | 16% | snapped from 1:120, snapped from 1:100 |
| kirkwood-east-hall-add2.pdf | 3 | 3 | 0 | 0 | 39% | inferred |
| clute-city-hall.pdf | 1 | 1 | 0 | 0 | 661% | page |
| pleanala-strutec-apt-type-a.pdf | 1 | 1 | 0 | 0 | 14612% | page |

## Worst 25 (crops in sample-plans/corpus/debug/)

| # | file · page | label | printed m² | measured m² | error |
|---|---|---|---|---|---|
| 1 | nsw-meadowbank-amended.pdf · p33 | 48 m² | 48.0 | 489208.5 | 1019084% |
| 2 | nsw-meadowbank-amended.pdf · p33 | HIGHSCHOOL49 m² | 49.0 | 489208.5 | 998285% |
| 3 | nsw-meadowbank-amended.pdf · p33 | 65 m² | 65.0 | 489208.5 | 752528% |
| 4 | nsw-meadowbank-amended.pdf · p33 | 117 m² | 117.0 | 489208.5 | 418027% |
| 5 | nsw-meadowbank-amended.pdf · p33 | 208 m² | 208.0 | 489208.5 | 235096% |
| 6 | nsw-meadowbank-amended.pdf · p33 | 251 m² | 251.0 | 489208.5 | 194804% |
| 7 | nsw-meadowbank-amended.pdf · p33 | 365 m² | 365.0 | 489208.5 | 133930% |
| 8 | nsw-meadowbank-amended.pdf · p33 | 492 m² | 492.0 | 489208.5 | 99333% |
| 9 | nsw-meadowbank-amended.pdf · p33 | HIGHSCHOOL506 m² | 506.0 | 489208.5 | 96582% |
| 10 | nsw-meadowbank-amended.pdf · p33 | HIGHSCHOOL507 m² | 507.0 | 489208.5 | 96391% |
| 11 | nsw-meadowbank-amended.pdf · p33 | 592 m² | 592.0 | 489208.5 | 82537% |
| 12 | nsw-meadowbank-amended.pdf · p33 | HIGHSCHOOL675 m² | 675.0 | 489208.5 | 72375% |
| 13 | nsw-meadowbank-amended.pdf · p33 | 704 m² | 704.0 | 489208.5 | 69390% |
| 14 | nsw-meadowbank-amended.pdf · p33 | 719 m² | 719.0 | 489208.5 | 67940% |
| 15 | nsw-meadowbank-amended.pdf · p33 | 720 m² | 720.0 | 489208.5 | 67846% |
| 16 | nsw-meadowbank-amended.pdf · p33 | 752 m² | 752.0 | 489208.5 | 64954% |
| 17 | nsw-meadowbank-amended.pdf · p33 | 752 m² | 752.0 | 489208.5 | 64954% |
| 18 | nsw-meadowbank-amended.pdf · p33 | 772 m² | 772.0 | 489208.5 | 63269% |
| 19 | nsw-meadowbank-amended.pdf · p33 | 783 m² | 783.0 | 489208.5 | 62379% |
| 20 | nsw-meadowbank-amended.pdf · p33 | 804 m² | 804.0 | 489208.5 | 60747% |
| 21 | nsw-meadowbank-amended.pdf · p33 | 804 m² | 804.0 | 489208.5 | 60747% |
| 22 | nsw-meadowbank-amended.pdf · p33 | HIGHSCHOOL874 m² | 874.0 | 489208.5 | 55874% |
| 23 | rochester-ha-lake-tower-hall.pdf · p77 | 17 SF | 1.6 | 818.1 | 51700% |
| 24 | nsw-meadowbank-amended.pdf · p33 | 972 m² | 972.0 | 489208.5 | 50230% |
| 25 | nsw-meadowbank-amended.pdf · p33 | 1092 m² | 1092.0 | 489208.5 | 44699% |
