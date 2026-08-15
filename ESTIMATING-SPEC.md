# Estimating Spec — Data Model & Ontario Defaults

This is the functional spec for the quoting engine. Every default below
comes from RESEARCH.md and must be **user-editable** in the price book —
they are starting points, not constants.

## Core quantity model

```
Room / Measurement Group
├── label            e.g. "Level 2 – Room 204"
├── paintCode        e.g. "PT-1"          (grouping key for output)
├── perimeter        LF (traced on plan, scale-calibrated)
├── wallHeight       ft (per group; default per project, e.g. 9')
├── floorMultiplier  int (identical floor plates shortcut, default 1)
├── deductions[]     { type: door|window|slider|custom, count, sfEach }
└── ceilings         SF (area tool on room outline, no deductions)

GROSS WALL SF = perimeter × wallHeight × floorMultiplier
NET WALL SF   = GROSS − Σ(deductions)          ← deduct BEFORE coats
MATERIAL SF   = NET × coats
GALLONS       = MATERIAL SF ÷ coverageRate × (1 + waste)
LABOUR HOURS  = Σ over coats: NET ÷ productionRate[coat]
              + prep hours (default 20–40% of application hours)
COST          = LABOUR HOURS × loadedRate + GALLONS × pricePerGal
              + sundries % + mobilization/minimum
PRICE         = COST × (1 + margin)   or   NET SF × marketRate (cross-check)
```

Trim is a separate measurement class, priced **per LF**, never per SF.
Doors/frames may be priced per unit (e.g. $80–150/door) instead of
deducted — support both conventions via a per-project toggle.

## Default deduction sizes (editable)

| Opening | Default SF |
|---|---|
| Interior door (3'×7') | 21 |
| Standard window | 15 |
| Sliding patio door | 40 |
| Large picture window | 29 |
| Custom | user-entered |

Rule: deduct anything ≥ ~3 SF; ignore plates/vents (absorbed by waste).

## Ontario default rates (CAD)

| Parameter | Default | Range (research) |
|---|---|---|
| Loaded labour rate | $55/hr | $40–75 resi, $60–100 commercial |
| Production: cut & roll walls | 200 SF/hr | 150–250 |
| Production: roll only | 350 SF/hr | 300–400 |
| Production: spray | 900 SF/hr | 800–1,000 |
| Production: textured | 110 SF/hr | 75–150 |
| Second coat time factor | 70% | 60–80% of first coat |
| Prep share of hours | 30% | 20–40% |
| Coverage, smooth drywall | 375 SF/gal | 350–400 |
| Coverage, textured | 275 SF/gal | 250–300 |
| Coverage, primer/new drywall | 325 SF/gal | 300–350 |
| Paint price, contractor grade | $32/gal | $25–40 |
| Paint price, mid grade | $60/gal | $50–70 |
| Paint price, premium | $100/gal | $80–120 |
| Coats | 2 | primer+2 for new work |
| Waste: rolled | 10% | 10–15% |
| Waste: sprayed interior | 20% | 20–25% |
| Heavy prep adder | $1.50/SF | $1.00–2.00 |
| High ceiling / lift adder | +30% labour | +20–40% |
| After-hours commercial | +25% | +20–30% |

## Sanity-check cross-metrics (show on every quote)

- Price per SF of **wall surface** (canonical)
- Price per SF of **floor area** (≈ wall SF ÷ 2.5–3.5) — the number
  GCs and consumers quote; expected bands: interior repaint $2–4.50,
  full interior $3–5, commercial $2–6 (CAD, Ontario)
- Labour share of price (expected 70–80% residential)
- Gallons total (maps to the paint order)

A quote whose cross-metrics fall outside the expected bands gets a
visible warning — cheap way to catch calibration and height errors.

## Scale model

- Scale is stored **per page**: { ratio | calibrated-from-dimension,
  verified: bool, calibratedBy, axisCheckPassed: bool }.
- Support imperial (1/4"=1'-0"=1:48, 1/8"=1:96, 1/2" details) and
  metric (1:50, 1:100, 1:20) — Ontario commercial sets are often metric.
- Auto-detected scale from title block = suggestion only; user confirms.
- Calibration UX: pick the longest written dimension on the sheet →
  enter true length → auto-prompt a perpendicular check → set verified
  flag. Sheets without verification show a badge on every measurement.
- Units: project-level imperial/metric toggle; all math in metric
  internally, display in project units.

## Output (Phase 1: Excel/CSV)

One row per measurement group: label, paint code, perimeter LF, height,
gross SF, deductions SF, net SF, ceiling SF, trim LF, coats, gallons,
labour hours, cost, price. Totals section grouped **by paint code**.
Second sheet: cross-metrics + price-book snapshot used (for audit).
