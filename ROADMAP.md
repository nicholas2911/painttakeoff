# Painting Takeoff & Quoting Tool — Master Roadmap (v3)

Working name: **PaintTakeoff** (rename before any public launch)

**STATUS (2026-08-16): Phase 1 COMPLETE and field-validated.** The app
(Electron + React, Windows installer, auto-updating via GitHub Releases)
does takeoff → quote → Excel export. A real painting estimator tested it
on his own plan sets and called it "an insane huge help". Repo:
github.com/nicholas2911/painttakeoff · Current release: v0.5.0.

Shipped so far: PDF viewer (fit-page, big-file rendering), per-page scale
calibration (imperial+metric, presets+custom, verified flag, persistence),
chain measurements with snapping + Ctrl+Z + per-page persistence,
measurement kinds (wall/trim/ceiling polygons), openings/deductions with
net wall area, Quick Area (flood-fill room detection, outer-wall
perimeter, red/manual cutouts), Measurements panel with per-row ceiling
heights, Price Book (Ontario defaults, editable), quote engine
(gallons/hours/cost/price + sanity-check warnings), Excel export,
custom title bar + update button ("New update" → download → "Restart
to update") + "✓ Latest version" pill + clickable version number,
CI release pipeline (tag → GitHub Actions → published release).

Companion docs:
- `RESEARCH.md` — domain research: workflow, Ontario rates, competitors.
- `ESTIMATING-SPEC.md` — the quoting data model and default rates.
- `sample-plans/` + `friend-examples/` — dev/test plan sets.

Rule for every phase: **do not start the next phase until the exit gate
of the current one passes.**

---

## What the research changed (v1 → v2)

1. **The core measurement is the PERIMETER, not the polygon.** Estimators
   compute wall SF = perimeter LF × ceiling height − deductions. The MVP
   leads with a perimeter/room trace tool + per-room wall height, with
   area polygons for ceilings and exteriors. (v1 had area-first.)
2. **Paint-code grouping is the organizing principle.** Commercial work
   is specified as PT-1/PT-2/… in finish schedules; output must total
   per paint code, labeled by room. We have a real finish schedule to
   develop against (`sample-plans/commercial-ag-science-missouri-bid-set.pdf`).
3. **Pricing is production-rate based** (SF/hr × loaded labour rate +
   gallons math), not a bare $/SF multiplier. Defaults from Ontario
   research live in ESTIMATING-SPEC.md, all user-editable.
4. **Per-page scale management with a verified flag is a core feature** —
   mixed scales per sheet are a top real-world error source; Bluebeam
   users complain about exactly this.
5. **Metric + imperial both required** (Ontario commercial is often
   1:50/1:100).
6. **Pricing hypothesis revised:** our direct niche neighbors are Easy
   Takeoffs ($39/mo) and Groundplan (~$75/user/mo), not just Bluebeam/
   STACK. New hypothesis: **$49–$79/seat/mo**, positioned as
   "plan-based painting takeoff with real pricing built in" — the gap
   between walkthrough CRMs (PaintScout et al., weak on PDFs) and
   generic/AI tools (Bluebeam, STACK, Togal — expensive or not
   painting-aware).
7. **Deduction conventions are a toggle, not a law** — residential
   painters often don't deduct small openings; commercial bidders do.

---

## Phase 0 — Discovery (1–2 weeks, no code) — PARTIALLY DONE

Already done via research: sample plan library (6 verified sets), the
canonical workflow, Ontario rate defaults, competitor map, Bluebeam pain
points.

Still needed from the friends (one focused session, ~2 hrs):

- [ ] 3–5 of their past bids: plans + the quote they produced (ground
      truth for testing). If they can't share, the sample-plans library
      already covers development — their files just make validation real.
- [ ] Their actual price book: rates, production assumptions, deduction
      habits (do they deduct openings? per-unit door pricing?).
- [ ] Confirm the deliverable format: number, Excel, or proposal PDF?
- [ ] Do they bid commercial (finish schedules / paint codes) or mostly
      residential? This sets which MVP path leads.

**Exit gate:** ESTIMATING-SPEC.md defaults adjusted to their real numbers,
and we have ≥1 past bid with a known-correct quote to test against.

---

## Phase 1 — MVP, single user, no backend (4–8 weeks)

Browser app, no login, no database; localStorage/IndexedDB; free hosting
on Vercel/Netlify. Stack: React + TypeScript + Vite, PDF.js, canvas
overlay, SheetJS for Excel export.

### Milestones (each independently testable against sample-plans/)

- [ ] **M1: Viewer.** PDF upload, paging, smooth zoom/pan, big-file
      handling. Test: the 59-page Habitat set and 36-page school set.
- [ ] **M2: Per-page calibration.** Calibrate from longest written
      dimension; perpendicular axis check; verified flag + unverified
      badges; imperial & metric; page presets. Test: vector sets AND the
      1909 raster scan (anisotropic stretch) AND the 1:50 scale-only set.
- [ ] **M3: Room trace tool (the core).** Trace a room's wall perimeter
      as a closed polyline → LF; per-room wall height input → gross wall
      SF. Editing points, snapping, zoom-while-drawing, undo.
- [ ] **M4: Deductions + counts.** Door/window/slider pins with editable
      SF defaults (21/15/40); deduct-before-coats; per-unit door pricing
      alternative; toggle to not deduct (residential convention).
- [ ] **M5: Ceilings + trim.** Area polygon for ceilings; LF tool for
      baseboard/casing priced per LF.
- [ ] **M6: Groups, paint codes, multipliers.** Every measurement in a
      labeled group with paint code; running totals grouped by code;
      identical-floor multiplier. Test against the Missouri finish
      schedule set.
- [ ] **M7: Quote engine + export.** Production-rate math per
      ESTIMATING-SPEC.md; gallons; labour hours; cross-metrics with
      out-of-band warnings; Excel export (per-group rows + by-code
      totals + price-book snapshot).
- [ ] **M8: Project save/load** (PDF ref + measurements + price book).

### Known hard parts (budget extra time)

1. Scale accuracy on scanned/skewed plans (the Radford 1909 set is the
   stress test).
2. Drawing UX: zoom/pan mid-trace, snapping, undo — where takeoff tools
   live or die.
3. Big-PDF render performance (tile rendering, screen-res only).
4. Per-page scale state management without annoying the user.

**Exit gate:** reproduce 3 known quotes (friends' past bids if available,
else hand-computed quantities from the sample sets) within ~3%, in no
more time than the Bluebeam process.

---

## Phase 2 — Real-world hardening (4–6 weeks)

Friends run live bids in parallel with their current process.

- [ ] Weekly feedback loop; fix top 3 friction points per week.
- [ ] Metrics per bid: time, measured SF vs theirs, features used, bugs.
- [ ] Expected feature asks (build only if asked twice): multi-page
      projects, copy measurements between floors, crew markups/notes,
      keyboard shortcuts, proposal-PDF output with their logo.
- [ ] Quote output polished enough to send a real client.

**Exit gate:** 10 consecutive live bids faster than the old process at
equal accuracy, incl. one won bid quoted entirely from the tool.

---

## Phase 3 — Productize (8–12 weeks)

- [ ] Auth (Clerk/Supabase Auth), cloud project + PDF storage
      (Supabase/Postgres + S3), Stripe per-seat billing.
- [ ] Onboarding: sample project pre-loaded → first room measured in
      5 minutes.
- [ ] 3–5 design-partner painting companies, free/half-price for
      monthly feedback.
- [ ] Landing page, terms/privacy, Sentry, analytics.
- [ ] **Pricing test: $49–$79/seat/mo.** Anchors: Easy Takeoffs $39,
      Groundplan ~$75, Bluebeam $260–590/yr, STACK ~$2,500/yr. Pitch:
      "built for painters, pricing included, half the price."

**Exit gate:** 5 paying companies, <1 churn in 3 months, ≥2 "very
disappointed without it".

---

## Phase 4 — Growth bets (one at a time)

1. **AI-assisted takeoff** — auto room/wall detection, finish-schedule
   parsing (arbitrary table layouts — flagged hard). Premium tier.
   Competitors charge $175–300/user/mo for this; research project, not
   a sprint.
2. **Proposal generation** — branded sendable PDF + e-sign.
3. **Adjacent trades** — drywall, flooring, insulation: same engine,
   new price books.
4. **Team features** — multi-user, shared markups, bid pipeline.

---

## Risks & rules

- **Legal:** clean-room competitor is fine. Don't copy Bluebeam UI,
  icons, branding, copy. Rename + trademark check before launch.
- **Scope discipline:** every feature request must answer "does a
  painting estimator need this to produce a quote?"
- **The "$/sq ft" trap:** wall-surface SF is canonical internally;
  floor-area metrics are derived cross-checks only (they differ ~3×).
- **Don't build Phase 3 infra early.** The MVP can die at any gate
  having cost weeks, not months.

## Timeline at a glance

| Phase | Effort   | Cost     | You have at the end |
|-------|----------|----------|---------------------|
| 0     | 1–2 wks  | $0       | Validated spec      |
| 1     | 4–8 wks  | $0       | Working MVP         |
| 2     | 4–6 wks  | $0       | Proven on live bids |
| 3     | 8–12 wks | <$100/mo | Paying customers    |
| 4     | ongoing  | reinvest | A company           |
