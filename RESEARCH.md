# Research Report — Painting Takeoff Domain

Compiled 2026-08-15 from live web research + downloaded plan sets.
This is the domain knowledge base for the project. Sources cited inline.

---

## 1. Sample plan library (downloaded, verified)

Location: `sample-plans/`. All files verified as valid PDFs. Inspection
script kept at `inspect_plans.py` (venv at `.venv/`).

| File | Scenario | Type | Pages | Notes |
|---|---|---|---|---|
| `residential-habitat-page-street-cd-set.pdf` | Dimensioned | Residential (Philly rowhouses) | 59 | Vector, 758 dimension strings, full CD set incl. door/window schedules. Richest sample. |
| `residential-permit-chicago-townhouse.pdf` | Dimensioned | Residential (real permit set) | 15 | Vector, 271 dims, 1/4"=1'-0". |
| `commercial-school-bid-set-princeton.pdf` | Dimensioned | Commercial (HS renovation bid set) | 36 | Vector, 511 dims, mixed scales + many "NOT TO SCALE" detail sheets. References a room finish schedule not included in excerpt. |
| `commercial-ag-science-missouri-bid-set.pdf` | Dimensioned **+ finish schedule** | Commercial/institutional | 22 | Vector. Real room finish schedule with paint codes ("PAINT IPS-1A eggshell, SW7063", semi-gloss frames). Ideal for paint-code logic. |
| `scale-only-student-housing-aau.pdf` | **Scale-only** | Residential concept | 156 | Vector, 0 dims, 18× "1:50" notations. Caveat: thesis report, plans are small embedded figures. |
| `residential-scan-radford-ideal-homes-1909.pdf` | Dimensioned | Residential | 128 | **Raster scan** (OCR layer only). Tests the scanned-plan calibration path. |

Gap: a professional full-size **scale-only** plan set is hard to find
without logins. Fallback candidate if needed:
`https://www.njuhsd.com/documents/NUHS%20Bldg%20J%20Stair%20Repair_20201104.pdf`
(sparse dims + graphic scales).

Test coverage achieved: residential/commercial × dimensioned/scale-only
× vector/scan × with/without finish schedule.

---

## 2. How painting estimators actually do takeoffs

Canonical formula (every source agrees):
**Wall SF = (room perimeter LF × ceiling height) − opening deductions**,
per room, per paint code.

Workflow (sources: easytakeoffs.com/trades/painting, tradeteksoftware.com,
PaintPRO magazine blueprint guide):

1. Pull the sheets that matter (see §3); check printed scale against a
   written dimension on each sheet.
2. Trace each room's wall **perimeter** with a polyline → LF of wall.
   Example: 14'×18' room = 64 LF; at 9' ceilings = 576 SF gross wall.
3. Apply wall height — the critical non-plan dimension. Sources in order
   of reliability: finish schedule ceiling-height column → building/wall
   sections → reflected ceiling plan. Assuming 8' when rooms are 10' is a
   25% error — a classic estimating mistake.
4. Deduct openings (conventions: 21 SF interior door (3'×7'), 15 SF
   window, 40 SF sliding door; deduct anything ≥ ~3 SF; deduct BEFORE
   applying coat multiplier). Note: whether to deduct small openings at
   all is a live convention debate — many residential painters don't;
   commercial bidders from plans do. → make it a toggle.
5. Ceilings: area-measure the room outline (ceiling SF ≈ floor SF minus
   soffits/skylights). Normally no deductions.
6. Trim separately in **LF** (baseboard, casing per door/window side,
   crown). Never folded into wall SF — different product, 2–3× labor.
7. Exterior: area off exterior elevations, or perimeter × height.
8. Materials: gallons = (SF × coats) ÷ coverage rate; waste 10–15%
   rolled, 20–25% sprayed.
9. **Group totals by paint code** (PT-1 walls, PT-2 ceilings…), labeled
   by room number, so output maps 1:1 to the bid form and paint order.

Shortcuts estimators use: identical floor plates → measure one floor,
multiply. This must be a first-class feature, not a workaround.

## 3. Which sheets painters use (and ignore)

| Sheet | What it gives the painter |
|---|---|
| Floor plan (A-series) | The key sheet. Perimeters, room layout, door/window locations keyed to schedules. |
| Room finish schedule | Paint codes per room per surface; often ceiling height. The scope map. |
| Reflected ceiling plan | Ceiling materials (ACT = no paint), height changes, soffits, exposed structure. |
| Building/wall sections | Wall heights, soffit profiles, wainscot — "the only place you will see these items". |
| Interior elevations | Accent walls, wainscot, cabinets/shelving to subtract. |
| Exterior elevations | Direct facade areas, substrates. |
| Door/window schedules | Exact opening sizes for deductions; door/frame counts (often priced per unit, not SF). |
| Specs Division 9 (09 91 00) | Paint system per code: product, sheen, coat count, primer, prep. |
| Site plan | Fences, poles, bollards, striping — exterior scope people forget. |

S/M/P/E engineering sheets: irrelevant except exposed-structure ceilings.

**Finish schedule reality:** no standard format exists — every architect
lays it out differently. Manual cross-referencing schedule↔plan is the
norm. Any auto-parsing must handle arbitrary table layouts (Phase 4
problem, not MVP).

## 4. Scale calibration in practice

- Must support imperial (1/4"=1'-0" = 1:48, 1/8" = 1:96) AND metric
  (1:50, 1:100 — standard on Ontario commercial sets), plus detail
  scales (1:20, 1:10, 1/2"=1'-0").
- Best practice: calibrate from the **longest** written dimension on the
  sheet; check on the **perpendicular axis** (scans stretch
  anisotropically); verify by measuring a second known dimension.
- Scale is **per-page, not per-set**. Mixed scales across sheets are a
  classic error source → per-page scale presets with a "verified" flag
  is a genuine product feature, not polish.
- "Do not scale drawings" stamps: estimators scale anyway (written dims
  are too sparse). Real risks: reproduction distortion, architects
  printing the wrong scale in the title block. → auto-detected scale is
  a suggestion to be confirmed, never trusted.
- No-scale sheets: calibrate off a known door width (3'-0" nominal) or
  grid lines; if nothing exists, mark quantities from that sheet
  "assumed".

## 5. Ontario pricing data (CAD, current sources 2024–2026)

### Rates
- Residential interior walls (Toronto): **$1.80–$3.00/sq ft** floor area;
  mid-range $2.50–$4.00; whole rooms (walls+ceiling+trim) ~$5.00
  (HomeStars, Jan 2026).
- Ontario-wide interior walls $2.50–$4.50; ceilings $1.00–$2.50;
  trim/baseboards **$1.50–$3.50 per LF**; doors $80–$150/door
  (Painters Near Me, Jun 2025).
- Full interior incl. everything: $3–5/sq ft of floor area (JJ MFG, 2025).
- Commercial Ontario: **$2–$6/sq ft** (Enviro Painting Ottawa, Jan 2026);
  dated 2018 forum data: new construction $4–5, repaints ~$6.
- ⚠️ "$/sq ft" ambiguity is the biggest data trap: consumer numbers are
  per sq ft of FLOOR area; pros compute per sq ft of WALL surface
  (≈2.5–3.5× floor area). Our data model stores wall-surface SF as
  canonical and derives floor-area equivalents for sanity checks.

### Labour
- Ontario painter wages (NOC 73112): low $18, median **$25**, high $36/hr.
- Billable rates: Toronto $40–75/hr residential; commercial $60–100/hr.
- Implied loaded multiplier on wages: **1.6–3×**.
- Labour = 70–80% of job price; materials 10–20%.

### Materials & production
- Paint (3.78L can): contractor grade $25–40, mid $50–70, premium
  $80–120 (CAD).
- Coverage: **350–400 SF/gal/coat** smooth; 250–300 textured; primer on
  new drywall 300–350; stucco 200–250. Rough surfaces can drop to 150.
- Coats: 2 finish coats standard; primer+2 for new/dark-to-light (+3rd
  coat for drastic colour change, +15–25% material).
- Production rates: cut-and-roll walls **150–250 SF/hr** (consensus),
  roll-only 300–400, spray 800–1,000, textured brush/roll 75–150;
  2nd coat ≈ 60–80% of 1st-coat hours; prep = 20–40% of total hours.
- Waste: 10% rolled smooth, 15% textured, 20% sprayed interior, 25%
  sprayed exterior.
- Multipliers: extensive prep +$1.00–2.00/SF; high ceilings/lifts
  +20–40% labour; after-hours commercial +20–30%.

## 6. Bluebeam reality check

Official pricing: Basics $260, Core $330, Complete $440, Max $590
per user/year (bluebeam.com/pricing). Tier gating: Basics has only
length+area; perimeter/volume/count/custom columns need Core+;
Quantity Link (Excel sync) needs Complete.

How painters actually use it: Calibrate → Area/Perimeter with the
**"Depth" trick** (enter wall height in Depth field → Wall Area column
populates; build tool-chest presets per common height) → Dynamic Fill
for rooms → Count/Visual Search for openings → Markups List as the
quantity worksheet → export/link to Excel for pricing.

Pain points (aggregated from G2/Capterra/Reddit via secondary sources):
1. Paying for bloat — "I use maybe 10% of what Bluebeam can do".
2. Steep learning curve — built for architects, weeks of training.
3. **No painting intelligence** — wall-height workaround is manual per
   room, no auto opening deduction, no finish-code grouping, no gallons
   math.
4. **No pricing at all** — quantities must leave the app for Excel.
5. Per-sheet calibration tedium; mixed-scale errors.
6. No native Mac. 7. Subscription-only, prices rising 5–15%/yr.

## 7. Competitor landscape

General takeoff: PlanSwift ~$1,749–2,000/user/yr (assemblies); STACK
free tier, paid ~$2,499–2,988/user/yr; Groundplan ~US$75/user/mo
(trade-friendly, generic); On-Screen Takeoff + Takeoff Boost (AI,
auto-takes-off both sides of interior walls — partially verified).

Painting-specific but walkthrough/CRM-oriented (residential repaint,
weak on plan PDFs): PaintScout $119/seat/mo + $99 ops add-on; PEP Cloud
(pricing not published); Estimate Rocket $139–359/mo; DripJobs $97–147/mo
+ add-ons.

AI takeoff: Togal.AI $250–300/user/mo (quantities only, no pricing);
Kreo Lite $35/user/mo, AI needs Pro $175/user/mo; Beam AI ~$8,000+/yr
done-for-you (reads finish schedules automatically).

Cheap niche neighbors (our direct bracket): **Easy Takeoffs $39/mo**
(painting page, uses perimeter×height + 21/15 SF deduction model),
ScopeTakeoff $100/user/mo (paint assemblies, SOV output), Vertigraph
BidScreen XL (Excel-embedded, live gallons formulas).

**The gap:** everything painting-specific is walkthrough/CRM (residential
repaint); everything plan-based is generic or AI-expensive.
"Commercial + new-build painting takeoff from PDF, finish-schedule-aware,
with built-in pricing, at a tradesman price" is thinly occupied. That is
our position.

## 8. Caveats

- HomeStars per-room figure (~$1,013/bedroom) is ~2017 vintage — stale
  low-end anchor; prefer the 2024–2026 $/SF ranges.
- GTA-vs-smaller-Ontario-market differential: no clean public data.
- Canadian commercial new-construction $/SF more recent than 2018: not
  found publicly. PCA production-rate manual and RSMeans Canada are the
  authoritative PAID sources if precision is ever needed.
- Exact deduction values (21/15/40 SF) are one well-documented
  convention, not law — make them editable defaults.
- Reddit-sourced pain points come via aggregators (Reddit blocks
  scraping), not direct threads.
