# PaintTakeoff — app

Painting-contractor takeoff/quoting tool. This increment implements
**M1 (PDF plan viewer)** and **M2 (per-page scale calibration)** from
`../ROADMAP.md`. Everything is client-side: no backend, no auth.

## Run it

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build (type-check + production bundle)
npm run preview  # serve the production build
```

Requires Node 18+ (developed on Node 22).

## Windows desktop app (Electron)

The same app is wrapped in Electron (100% client-side, no installer,
no code signing):

```bash
npm run electron:dev    # vite dev server + Electron pointed at it (HMR)
npm run electron:dir    # build + package unpacked to app/release/win-unpacked/
npm run electron:build  # build + package portable exe to app/release/
```

The portable artifact is
`app/release/PaintTakeoff-<version>-portable.exe` — a single
double-clickable file (it self-extracts to a temp dir on each run, so
first launch takes a few seconds). The unpacked build
(`app/release/win-unpacked/PaintTakeoff.exe` + its folder) starts faster
if you keep it in place.

## Releases & auto-update

Installed copies (the NSIS installer, `PaintTakeoff Setup <version>.exe`)
auto-update from GitHub Releases via `electron-updater`. The portable exe
does NOT auto-update — it's for USB sticks.

One-time setup: in `app/package.json`, replace the `GITHUB_OWNER`
placeholder in `build.publish.owner` with the GitHub user/org that owns
the `painttakeoff` repo.

Cutting a release (after the repo exists on GitHub):

```bash
# 1. bump "version" in app/package.json
# 2. commit, then tag with the SAME version:
git tag v0.2.0
git push origin main v0.2.0
# 3. .github/workflows/release.yml builds on windows-latest and publishes
#    the NSIS installer + latest.yml + portable exe to a GitHub Release.
```

electron-builder only publishes when the tag's version matches
`package.json` (`--publish onTagOrDraft`). No code signing — expect
SmartScreen warnings until the app builds reputation (or buy a cert later).

What the user sees: on startup the app checks for updates silently. When
one is downloaded, a banner says "A new version is ready — restart to
update" with **Restart now** / **Later** (Later = it installs on the next
quit). No dialogs, no admin rights (per-user install).

Update troubleshooting: every update event is appended to
`%APPDATA%\PaintTakeoff\painttakeoff-updater.log` on the user's machine —
ask the tester to email that file when an update misbehaves.

You can also pass a PDF on the command line —
`PaintTakeoff.exe "C:\path\to\plans.pdf"` opens it on launch.

Notes:
- The window is frameless with a custom title bar (logo, file name,
  minimize / maximize / close) drawn by the app — web builds don't show it.
- Packaged mode serves the app from a privileged `app://` scheme
  (`electron/main.cjs`) rather than `file://`, so ES modules and the
  PDF.js module worker behave exactly like the web build. Don't
  "simplify" this to `loadFile` — the worker breaks under `file://`.
- Nothing is code-signed, so SmartScreen will warn on first run.

## What's implemented

The UX is a guided 3-step flow aimed at non-technical users:
**1. Open a plan → 2. Set the scale → 3. Measure.** A welcome screen shows
the three steps as numbered cards; a persistent guidance bar under the
toolbar always says what to do next in plain English; light theme by
default with a dark toggle; a "?" button lists the shortcuts.

### M1 — viewer
- Open a PDF via the **Open Plan** button or by **dropping a file anywhere**
  on the window.
- Pages render onto a canvas with PDF.js at `devicePixelRatio × zoom`.
  During a zoom gesture the existing bitmap is CSS-scaled instantly; a crisp
  re-render fires ~160 ms after the gesture settles.
- **Region rendering**: only the visible window (+35% margin) is rasterized,
  via `PageViewport` offsets — a 36"×48" sheet never becomes a full-page
  high-DPI bitmap. A pixel budget (36 MP) shrinks the margin/scale if needed.
- Rendered regions are kept in a ~160 MB LRU cache; stale in-flight renders
  are cancelled when superseded (rapid paging/zooming stays clean).
- Navigation: big ◀ ▶ buttons with "Page 3 of 15", jump-to-page input,
  ArrowLeft/Right keys; zoom buttons + Ctrl/Cmd+wheel zoom centered on the
  cursor; wheel/scroll pans; drag pans (Move Around mode); Space+drag pans
  in any mode; middle-mouse drag pans; Fit menu (whole page / width).

### M2 — per-page scale calibration
- **Set Scale** mode (`C`): click the two ends of a known dimension, then
  type its real length into big **Feet** / **Inches** boxes — or, in metric
  mode, one **Millimetres** box: type the number as printed on the plan
  (`2520`); a meters value with a unit suffix (`2.52 m`) also works.
  Inches accept fractions (`6 1/2`) or decimals; the forgiving text parser
  (`24' 6"`, `7500 mm`, …) still runs underneath. A live plain-English
  preview ("= 24 ft 6 in" / "= 2520 mm (2.52 m)") confirms the entry.
- Scale is stored **per page** as `{ pointsPerMeter, verified, method,
  axisCheckPassed, timestamp }` — PDF points per meter, in page space, so it
  is immune to zoom/pan and page switches.
- After setting the scale (or choosing a preset) you are offered a
  **Double-check**: measure one more known length, ideally perpendicular;
  if it deviates >2% from what you enter as expected, a plain-language
  warning explains the likely stretched scan / wrong scale and the page
  stays **not confirmed** until a check passes.
- **Common scales…** menu per page, labeled in trade language. Imperial:
  1/4" (1:48), 1/8" (1:96), 1/2" (1:24), 3/16" (1:64). Metric, ascending:
  1:20, 1:25, 1:30 (elevations), 1:40, 1:50, 1:75 (floor plans), 1:100,
  1:200 — plus **Custom…** (metric ratio 1:N, or imperial X inch = 1 foot,
  fractions OK). Presets apply unconfirmed and lead into the same
  double-check flow.
- New documents open at **fit-page** — the whole first sheet is visible
  immediately.
- Toolbar badge states: green **Scale is set ✓**, amber
  **⚠ Scale not confirmed — fix** (click it to run the double-check at any
  time), gray **No scale on this page**.
- Per-page scale persists in `localStorage` keyed by the PDF fingerprint +
  page number (`pt:v1:scale:*`) — reopening the same file restores
  calibration.
- Right-click or Esc cancels any in-progress action.

### Measurements (lengths + rough areas)
- **Measure** mode (`M`): chain measuring — click to start, each click adds
  a segment (live segment + running total in the guidance bar), double-click
  or **Enter** finishes, **Ctrl+Z** undoes the last point (or, when not
  drawing, removes the most recent measurement on the page), Esc cancels.
  **Left-drag always pans the plan, in every mode.** Points **snap** to
  existing measurement endpoints/vertices within ~10px (ring indicator), so
  walls connect without gaps; closing a loop snaps to the chain's start.
  Finished measurements stay drawn on the page and persist per page
  (`pt:v1:measure:*`). Click one in Move Around mode (or in the panel) to
  select it; **Delete** removes it.
- **Measurements panel** (toolbar toggle with count badge): the current
  page's measurements with rename-on-click and per-row delete. Every row
  has an editable **ceiling height** (default at the top of the panel,
  persisted as `pt:v1:default-height-m`) and shows **wall area =
  length × height**. Totals: length, floor area, and **total wall area**
  (the quoting number) — units never mixed.
- **Quick Area** mode (`A`): click inside a room — a flood fill on a
  downscaled raster of the page estimates floor area and a rough perimeter.
  Perimeter counts **outer walls only**: barrier components are classified
  on the raw (undilated) raster so room labels, PT codes and symbols punch
  no fake edges into it. **Cut out an obstacle** clicks inside an enclosed
  island/fixture; **Draw a cut-out** traces a polygon by hand — both show
  in **red** and persist with the saved room. The result card gives rough
  wall area (perimeter × editable ceiling height); every number editable.
  Always labeled "rough" — it is flood fill, not AI.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` / `C` / `M` / `A` | Move Around / Set Scale / Measure / Quick Area |
| `←` / `→` | Previous / next page |
| `+` / `-` | Zoom in / out |
| `Enter` or double-click | Finish a measurement chain |
| `Ctrl` + `Z` | Undo last point · remove latest measurement |
| `Delete` | Remove the selected measurement |
| `Space` (hold) | Pan with drag (extra — left-drag always pans) |
| `Esc` | Cancel whatever is in progress |
| `Ctrl` + wheel | Zoom centered on cursor |

## Manual testing with `../sample-plans/`

- `residential-permit-chicago-townhouse.pdf` (15p, 1/4"=1'-0", vector) —
  best first test: Calibrate on a written dimension, run the perpendicular
  check, then Measure walls. Try the 1:48 preset instead and verify it.
- `commercial-school-bid-set-princeton.pdf` (~30 MB, 36p, mixed scales) —
  the big-file stress test: rapid paging, deep Ctrl+wheel zoom on the
  36"×48" sheets, per-page scales on detail sheets vs floor plans.
- `scale-only-student-housing-aau.pdf` (156p, 1:50, no written dims) —
  use the 1:50 preset, then verify against a nominal 3'-0" door.
- `residential-scan-radford-ideal-homes-1909.pdf` (128p raster scan) —
  calibrate, then do the perpendicular check; the anisotropic scan stretch
  should trip the >2% warning on some pages.
- `commercial-ag-science-missouri-bid-set.pdf` — has the finish schedule
  used in later milestones.
- `residential-habitat-page-street-cd-set.pdf` (59p) — large residential
  set, good for paging/render-cache behavior.

## Structure

```
electron/   main.cjs       (window, app:// protocol, CLI-arg PDF open, IPC)
            preload.cjs    (contextBridge: window.painttakeoff)
src/
  pdf/      pdfDocument.ts  (worker setup, file loading, fingerprint)
            pageRenderer.ts (region rendering, LRU bitmap cache, cancel)
  measure/  units.ts        (length parsing/formatting, all math in meters)
            presets.ts      (scale presets, ratio <-> points-per-meter)
            scaleStore.ts   (per-page scale state, pt:v1:scale:*)
            measureStore.ts (per-page measurements, pt:v1:measure:*)
            floodfill.ts    (Quick Area: barrier map, flood fill, cutouts)
  components/
            Viewer.tsx      (camera state, render scheduling, page rasters)
            Overlay.tsx     (interaction + drawing layer: picking, chain
                             measure, finished measurements, area overlays)
            Toolbar.tsx     (nav, zoom, modes, presets, units/theme/? toggles)
            StepBar.tsx     (the always-on "what to do next" bar)
            Welcome.tsx     (empty state: 3 numbered steps + big open button)
            MeasurementsPanel.tsx (per-page list, rename, totals)
            QuickAreaCard.tsx     (rough room result + cutouts)
            Modals.tsx      (Set Scale, double-check, custom scale, shortcuts)
            icons.tsx       (inline stroke icons, no icon library)
  App.tsx                   (guided-flow state machine, keyboard, drag&drop)
```

## Known limitations (to be addressed in later milestones)

- No snapping to vector geometry when picking calibration points.
- The axis check does not enforce perpendicularity of the picked segment —
  it only compares lengths (per spec).
- Scale state persists, but measurements/projects do not (that is M8).
- Raster scans render whole-page images; very deep zooms on the 1909 scan
  may take a moment on the first render of a region.
