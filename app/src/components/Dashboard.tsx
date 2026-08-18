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

/** Start screen: full-window home on blueprint paper. */
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
  const notes = WHATS_NEW[pkg.version] ?? WHATS_NEW['0.6.0'];

  return (
    <div className="dashboard">
      <div className="dash-hero">
        <div className="dash-inner">
          <h1 className="dash-greeting">{greeting()}!</h1>
          <p className="dash-sub">What are we quoting today?</p>
          <button className="big-open-button" onClick={props.onNewProject}>
            <FolderIcon size={22} /> New Project
          </button>
        </div>
      </div>

      <div className="dash-inner">
        {props.whatsNew && (
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
              <span className="step-number">1</span>
              <FolderIcon size={20} />
              <span><strong>New project</strong> — name it, pick the PDF.</span>
            </div>
            <div className="dash-howto-item">
              <span className="step-number">2</span>
              <RulerIcon size={20} />
              <span><strong>Set the scale</strong> — one real length on the page.</span>
            </div>
            <div className="dash-howto-item">
              <span className="step-number">3</span>
              <MeasureIcon size={20} />
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
          <strong>Did you know?</strong> {tip}
        </div>

        <p className="dash-footer-hint">…or drag a plan PDF anywhere onto this window.</p>
      </div>
    </div>
  );
}
