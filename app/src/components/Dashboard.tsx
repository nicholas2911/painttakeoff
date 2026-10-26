import { useState } from 'react';
import type { ProjectMeta } from '../pdf/projectStore';
import { FolderIcon, MeasureIcon, RulerIcon } from './icons';
import pkg from '../../package.json';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Per-version "what's new" bullets — plain English, updated at release time. */
const WHATS_NEW: Record<string, string[]> = {
  '0.6.0': [
    'Projects! Your plans live on the home screen — pick up where you left off.',
    'Page picker: measure only the pages you need.',
    'Price Book + Quote + Excel export: measurements turn into a price.',
  ],
  '0.7.0': [
    'Project cards now have their own menu — open, go straight to the quote, edit details, or delete.',
    'Create a real invoice from a quote, with your own tax rows (HST, GST + PST, or none).',
  ],
  '0.8.0': [
    'Quote view: flip paint grade, heavy prep, and high-ceiling add-ons right on the quote, plus drop in extra price-book line items by hand.',
    'A "Simple $/SF" pricing mode for walls, for quick jobs that don’t need the full build-up.',
    'Scratch overlay: measure something on a page without it ever counting toward the total. Undo, Clear, and History are all in the toolbar now.',
  ],
  '0.8.1': [
    'A visual refresh — refined colors, friendlier buttons and dialogs, and a cleaner first-run screen.',
    'Fixed: invoice numbers no longer skip ahead when you re-save the same invoice, and deleting a project now cleans up everything it left behind.',
  ],
  '0.8.2': [
    'New look: forest green and cream, with a light/dark switch (moon/sun) at the top of the window.',
    'Measuring fixes: each wall keeps the height it was drawn at, plan dimensions like 7’-0″ fill in correctly, 15/16″ reads right, and rotated pages line up with your clicks.',
    'Quote and invoice fixes: add-ons now appear on the invoice, tax lines add up to the cent, and an invoice tells you when the quote has changed since.',
    'Quick Area room sizes are more accurate, and opening a PDF while the app is already running now uses the same window.',
  ],
  '0.8.3': [
    'The quote is now one clean line-item table, with the price in a green band and add-ons right in the list.',
    'Invoices get a classic letterhead look — your company name in serif, a green rule, and the total boxed in green.',
    'The Price Book, page picker and Measurements panel match the new forest-and-cream style, in light and dark.',
  ],
  '0.8.4': [
    'Quick Area is about 10× faster, and measures rooms more accurately — it now sees past furniture and dimension lines, and stops at doorways on large-scale house plans.',
    'The app reads the scale written on each sheet and offers it with one click — and catches “1:100 @ A1” notes on A3 PDFs (really 1:200).',
    'No more giant “rooms” when a click escapes across the whole sheet, and the app uses far less memory with big plan sets.',
  ],
};

const TIPS = [
  'Start a wall where the last one ended — the line snaps into place for you.',
  'Quick Area gives a rough room size in one click; cut out islands in red.',
  'Ctrl+Z undoes your last point — or your last measurement.',
  'The version number up top checks for updates when you click it.',
  'Calibrate off the LONGEST written dimension on the sheet — it’s the most accurate.',
  'Different ceiling heights? Set the height on each wall row in the Measurements list.',
  'Esc backs out of anything. Left-drag always moves the plan.',
  'Use the Pages button to hide pages you’ll never measure on.',
];

/** Projects count shown next to the recent-projects heading. */
export interface DashStats {
  projects: number;
}

/** Start screen: full-window home on cream paper. */
export default function Dashboard(props: {
  projects: ProjectMeta[];
  projectStats: Record<string, string | null>;
  stats: DashStats;
  whatsNew: boolean;
  onDismissWhatsNew(): void;
  onNewProject(): void;
  onOpenProject(id: string): void;
  onDeleteProject(id: string): void;
}) {
  const empty = props.projects.length === 0;
  const [query, setQuery] = useState('');
  const shown = query.trim()
    ? props.projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          p.company.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : props.projects;
  const tip = TIPS[Math.floor(Date.now() / 86400000) % TIPS.length];
  // No fallback to an older version's notes — showing a past release's
  // bullets under the CURRENT version number is more confusing than just
  // not showing the card for a version that hasn't gotten its own entry yet.
  const notes = WHATS_NEW[pkg.version];

  return (
    <div className="dashboard">
      <div className="dash-hero">
        <div className="dash-inner">
          <h1 className="dash-greeting">{greeting()}</h1>
          <p className="dash-sub">What are we quoting today?</p>
          <button className="big-open-button" onClick={props.onNewProject}>
            <FolderIcon size={20} /> New project
          </button>
        </div>
      </div>

      <div className="dash-inner">
        {props.whatsNew && notes && (
          <div className="whatsnew">
            <div className="whatsnew-title">What’s new in {pkg.version}</div>
            <ul>
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <button className="tool whatsnew-dismiss" onClick={props.onDismissWhatsNew}>
              Got it
            </button>
          </div>
        )}

        {empty && (
          <div className="dash-howto">
            <div className="dash-howto-item">
              <span className="dash-howto-icon">
                <FolderIcon size={18} />
                <span className="dash-howto-num">1</span>
              </span>
              <span><strong>New project</strong> — name it, pick the PDF.</span>
            </div>
            <div className="dash-howto-arrow" aria-hidden="true">→</div>
            <div className="dash-howto-item">
              <span className="dash-howto-icon">
                <RulerIcon size={18} />
                <span className="dash-howto-num">2</span>
              </span>
              <span><strong>Set the scale</strong> — one real length on the page.</span>
            </div>
            <div className="dash-howto-arrow" aria-hidden="true">→</div>
            <div className="dash-howto-item">
              <span className="dash-howto-icon">
                <MeasureIcon size={18} />
                <span className="dash-howto-num">3</span>
              </span>
              <span><strong>Measure & quote</strong> — walls, ceilings, openings.</span>
            </div>
          </div>
        )}

        {!empty && (
          <div className="dash-recent">
            <div className="dash-recent-head">
              <div className="dash-recent-title">
                Pick up where you left off
                <span className="dash-count-pill">{props.stats.projects} {props.stats.projects === 1 ? 'project' : 'projects'}</span>
              </div>
              {props.projects.length > 6 && (
                <input
                  className="dash-search"
                  placeholder="Find a project…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
            </div>
            <div className="dash-grid">
              {shown.map((p) => (
                <div
                  key={p.id}
                  className="dash-card"
                  onClick={() => props.onOpenProject(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && props.onOpenProject(p.id)}
                >
                  {p.thumbDataUrl ? (
                    <img className="dash-thumb" src={p.thumbDataUrl} alt="" />
                  ) : (
                    <div className="dash-thumb dash-thumb-empty">PDF</div>
                  )}
                  <div className="dash-card-body">
                    <div className="dash-card-name">{p.name}</div>
                    {p.company && <div className="dash-card-company">{p.company}</div>}
                    <div className="dash-card-meta">
                      {fmtDate(p.modifiedAt)} · {p.pages.length} of {p.numPages} pages
                    </div>
                    {props.projectStats[p.id] && (
                      <div className="dash-card-stat">{props.projectStats[p.id]}</div>
                    )}
                  </div>
                  <button
                    className="mp-trash dash-delete"
                    title="Delete project"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDeleteProject(p.id);
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))}
              {shown.length === 0 && (
                <p className="dash-none">Nothing matches “{query}”.</p>
              )}
            </div>
          </div>
        )}

        <div className="dash-tip">
          <span><strong className="dash-tip-label">Tip</strong> {tip}</span>
        </div>

        <p className="dash-footer-hint">…or drag a plan PDF anywhere onto this window.</p>
      </div>
    </div>
  );
}
