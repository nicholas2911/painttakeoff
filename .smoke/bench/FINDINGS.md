# Quick Area benchmark — findings (2026-10-25)

Corpus: 45 public plan sets (sample-plans/corpus, gitignored; list in
sample-plans/corpus-candidates.md). 307 printed room-area labels after
skipping schedule tables, totals and sheets with no readable scale.

How to run: `node bench/profile.mjs` once, then
`node bench/run.mjs [--engine current|v083] [--only file.pdf] [--images N]`.
`quickArea-v083.ts` is the frozen pre-fix engine for A/B runs.

## Results

| engine | all labels: found / ≤10% / ≤25% | trusted-scale pages: found / ≤10% / ≤25% / median miss |
|---|---|---|
| v0.8.3 | 276 / 28 / 74 | 101 / 17 / 47 / 29.7% |
| current (shipped next) | 217 / 28 / 64 | 90 / 18 / 47 / 23.3% |

"Trusted-scale" = pages whose written scale is right (v0.8.3 rooms within
±25% on average, 3+ rooms) — the only fair basis for comparing engines.
Of the 78 labels v0.8.3 "found" that current doesn't, 60 were garbage
fills (>5× or <⅕ the printed area: whole-sheet leaks) that current now
correctly rejects; the other 18 are mostly 1.5–3 m² closets on sheets whose
written scale is 2× off, plus a few total-area labels.

Test note: quickarea-accuracy.mjs re-traced its reference areas each run
and was flaky (clicks before the page settled); references are now frozen.

## What changed in the engine (app/src/measure/quickArea.ts)

- Whole-sheet leaks are rejected ("no room") instead of returned as a room.
- Doorway seal sized from the page scale (closes ~0.9 m gaps; capped 4–24 px)
  instead of fixed 6/12/18 px — fixes room→hall→bathroom leaks on 1:50
  residential plans (Brockworth: 4/8 → within 10% more often).
- "Is this a room" judged after the grow-back, so small rooms survive.

## Round 2 (same day)

**Furniture / thin-line pass** (`absorbThinLinePockets`): re-fill with only
thick (3 px+) lines as barriers and absorb pieces cut off by thin lines
(furniture, dimension lines) when each is ≤12% of the room.

| engine | trusted: found / ≤10% / ≤25% / median miss / bias | all: ≤10% |
|---|---|---|
| v0.8.3 | 92 / 16 / 44 / 29.7% / −13.2% | 28 |
| seal + leak fix | 90 / 18 / 47 / 23.3% / −12.6% | 28 |
| + furniture pass (shipped) | 90 / 24 / 46 / 23.3% / −11.8% | 34 |

vs no furniture pass: 18 labels better, 14 worse (mostly ones already far
over). Known regression: a closet behind a thinly drawn partition can be
pulled in (Michaelschool 6.8 m²: 4% → 22%). A 25% cap was no better and
pulled in more.

**Sheet scale suggestion** (`app/src/pdf/scaleNotes.ts`): the step bar
offers the sheet's written scale ("This sheet says 1:200 @ A3. [Use 1:200]").
A note naming the PDF's own paper size outranks repeated per-drawing labels;
a note for another paper size is corrected (1:100 @ A1 on an A3 PDF → 1:200).
Checked against each benchmark page's true scale (`node bench/scale-check.mjs`):
5 right, 1 doubtful (SUNY — its true-scale estimate is itself shaky), 2 pages
whose scale text is drawn as curves (no suggestion).

## Round 3: CPU and memory

**Quick Area CPU — same pixels, ~10–16× faster.** Stage profile of the old
engine (`node bench/perf.mjs`, 10 real pages): 77% of each click was
`cleanBarrierMap` re-checking every long thin line with full-page arrays and
10 full-page dilation passes. Fixes, all pixel-identical to the frozen
reference (`bench/ref/`; 60 clicks, 0 mismatches; all 307 benchmark results
unchanged):
- dilation / grow-back: one BFS sweep (`dilationDepth`) replaces N
  whole-page passes; one depth map serves every seal width;
- wall-segment rescue and room-pocket checks walk only the few pixels
  around each line/pocket instead of whole-page copies;
- `prepareRoomFinder(img)`: per-page work done once and reused for every
  click on that page (dropped on page change).
Per click: ~1,460 ms → ~90 ms (Node), 956 → 131 ms in the browser even
without per-page reuse; first click on a page ~150 ms.

**Memory.** `.smoke/leak-stress.mjs` (forces full GC, then measures JS heap,
DOM nodes and listeners over repeated rounds of page flipping, Quick Area,
project reopen, quote + invoice): zero growth in every scenario. An apparent
node/listener "leak" was Playwright's `waitForSelector` handles retaining
DOM — the test now waits via locators. Real fix found: pdf.js keeps each
rendered page's operator list until `page.cleanup()`; the page-picker
thumbnails held ~38 MB after creating a project (heap 47 → 9 MB now), and the
viewer now frees the page you leave (flipping all pages: 45 → 11 MB).

## Tried and rejected

- Square (8-neighbour) seal + grow-back to keep rectangular corners: on
  trusted pages better on 15 labels, worse on 19 — noise. Not shipped.

## Known weaknesses (next targets)

1. Partly addressed in round 2: furniture and dimension lines splitting
   rooms. Pieces bigger than 12% of the room still aren't absorbed.
2. Closets behind thinly drawn partitions can be absorbed by that pass.
3. Open-plan areas without doors (utility open to kitchen) merge — inherent;
   the printed split is an invisible line.
4. Remaining bias: fills run ~10–13% under printed areas on correct-scale
   pages (wall-line thickness + corners + the above).

## Product findings

- Many sheets print a scale that's wrong for the PDF ("1:100 @ A1" saved as
  A3 → really 1:200). Users who pick the preset from the note get 4× areas;
  the double-check catches it — worth surfacing harder.
- Done in round 2: the app reads the sheet's scale note and offers it.
- 5 of 50 public sources served bot-check pages instead of the PDF (left out).
- One file is a malformed PDF; the app shows a friendly "wouldn't open" toast.
