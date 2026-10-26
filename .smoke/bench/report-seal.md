# Quick Area accuracy benchmark — engine: seal

Run 2026-10-25 22:11 · 45 files · 307 printed room areas · 761 s

| | count | share |
|---|---|---|
| Room found (fill) | 217 | 71% |
| Within 10% of printed area | 28 | 9% |
| Within 25% | 64 | 21% |
| Median error (filled) | -29.0% | |
| Median time per click | 970 ms | |

Skipped labels: 167 in schedules/tables, 25 totals (GFA/GIA/gross/unit), 96 with no readable scale. "No room" means Quick Area found no closed shape (or rejected a whole-sheet leak) — the correct answer when a label isn't inside a room.

## By file

| file | labels | filled | ≤10% | ≤25% | median error | scale |
|---|---|---|---|---|---|---|
| nebraska-sidney-rest-area.pdf | 40 | 26 | 5 | 8 | -29% | page, snapped from 1:48 |
| nsw-gregory-hills-ps.pdf | 40 | 40 | 9 | 29 | -12% | page |
| suny-oneonta-alumni-plans.pdf | 40 | 37 | 1 | 2 | -59% | page |
| nl-michaelschool-bg.pdf | 39 | 38 | 8 | 15 | -13% | page |
| pleanala-boherboy-type-h.pdf | 34 | 15 | 0 | 0 | -84% | page |
| nsw-meadowbank-amended.pdf | 32 | 1 | 0 | 0 | -78% | page |
| east-providence-cc-drawings.pdf | 28 | 17 | 0 | 1 | -97% | inferred, page |
| pleanala-house-type-9b.pdf | 16 | 15 | 1 | 1 | -65% | page |
| haringey-marlborough-rd.pdf | 9 | 9 | 0 | 1 | 51% | snapped from 1:50 |
| rochester-ha-lake-tower-hall.pdf | 9 | 7 | 0 | 0 | 28% | inferred, snapped from 1:96 |
| uk-brockworth-house.pdf | 8 | 8 | 4 | 6 | -7% | page |
| nz-mt-cook-school.pdf | 7 | 3 | 0 | 1 | -19% | page |
| kirkwood-east-hall-add2.pdf | 3 | 0 | 0 | 0 | — | inferred |
| clute-city-hall.pdf | 1 | 1 | 0 | 0 | 657% | page |
| pleanala-strutec-apt-type-a.pdf | 1 | 0 | 0 | 0 | — | page |

## Worst 25 (crops in sample-plans/corpus/debug/)

| # | file · page | label | printed m² | measured m² | error |
|---|---|---|---|---|---|
| 1 | nsw-gregory-hills-ps.pdf · p7 | A: 6 m2 | 6.0 | 472.4 | 7773% |
| 2 | nsw-gregory-hills-ps.pdf · p7 | A: 3 m2 | 3.0 | 82.6 | 2655% |
| 3 | suny-oneonta-alumni-plans.pdf · p1 | 19 SF | 1.8 | 42.5 | 2309% |
| 4 | east-providence-cc-drawings.pdf · p4 | 118 SF | 11.0 | 189.2 | 1625% |
| 5 | rochester-ha-lake-tower-hall.pdf · p76 | 17 SF | 1.6 | 22.9 | 1349% |
| 6 | rochester-ha-lake-tower-hall.pdf · p77 | 18 SF | 1.7 | 23.7 | 1317% |
| 7 | rochester-ha-lake-tower-hall.pdf · p76 | 18 SF | 1.7 | 22.9 | 1269% |
| 8 | east-providence-cc-drawings.pdf · p3 | THE PROJECT CONSISTS OF THE CONSTRUCTION OF A NEW 19,446 SQ FT SINGLE STORY, PRE | 1806.6 | no fill | — |
| 9 | east-providence-cc-drawings.pdf · p3 | 19,446 SF | 1806.6 | no fill | — |
| 10 | east-providence-cc-drawings.pdf · p3 | 38,000 SF SINGLE STORY | 3530.3 | no fill | — |
| 11 | east-providence-cc-drawings.pdf · p3 | 19,446 SF | 1806.6 | no fill | — |
| 12 | east-providence-cc-drawings.pdf · p3 | 19,446 SF | 1806.6 | no fill | — |
| 13 | east-providence-cc-drawings.pdf · p3 | 19,446 SF | 1806.6 | no fill | — |
| 14 | east-providence-cc-drawings.pdf · p4 | 82 SF | 7.6 | no fill | — |
| 15 | east-providence-cc-drawings.pdf · p4 | 65 SF | 6.0 | no fill | — |
| 16 | east-providence-cc-drawings.pdf · p4 | 81 SF | 7.5 | no fill | — |
| 17 | east-providence-cc-drawings.pdf · p4 | 85 SF | 7.9 | no fill | — |
| 18 | east-providence-cc-drawings.pdf · p4 | 192 SF | 17.8 | no fill | — |
| 19 | kirkwood-east-hall-add2.pdf · p13 | THIS IS A REMODEL OF 50,000 SF ON LEVELS 1 AND 2 OF EAST HALL LOCATED ON THE KIR | 4645.2 | no fill | — |
| 20 | kirkwood-east-hall-add2.pdf · p13 | 13,560 SF | 1259.8 | no fill | — |
| 21 | kirkwood-east-hall-add2.pdf · p13 | 24,200 SF | 2248.3 | no fill | — |
| 22 | nebraska-sidney-rest-area.pdf · p3 | 102- 338 SF | 31.4 | no fill | — |
| 23 | nebraska-sidney-rest-area.pdf · p3 | 101- 103 SF | 9.6 | no fill | — |
| 24 | nebraska-sidney-rest-area.pdf · p3 | 104- 82 SF | 7.6 | no fill | — |
| 25 | nebraska-sidney-rest-area.pdf · p3 | 100- 498 SF | 46.3 | no fill | — |
