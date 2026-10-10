import { useEffect } from 'react';
import type { Measurement } from '../measure/measureStore';

/** One snapshot of a page+layer's measurement set, taken right before a
 *  change was applied — so reverting to it undoes everything since. */
export interface HistoryEntry {
  items: Measurement[];
  at: number;
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/** Lightweight, in-session history — last ~20 states for the current page
 *  and layer (real or scratch). Resets when the app restarts; this is a
 *  quick "undo further back" list, not a saved checkpoint system. */
export default function HistoryPanel(props: {
  entries: HistoryEntry[];
  layerLabel: string;
  onRevert(items: Measurement[]): void;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const newestFirst = [...props.entries].reverse();

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal history-modal">
        <div className="modal-title">
          History <span className="pb-sub">{props.layerLabel} — this page, this session</span>
        </div>
        {newestFirst.length === 0 ? (
          <p className="modal-text">Nothing to show yet — changes you make on this page will show up here.</p>
        ) : (
          <div className="history-list">
            {newestFirst.map((entry, i) => (
              <div className="history-row" key={entry.at + i}>
                <span className="history-time">{timeAgo(entry.at)}</span>
                <span className="history-count">
                  {entry.items.length} measurement{entry.items.length === 1 ? '' : 's'}
                </span>
                <button className="tool" onClick={() => props.onRevert(entry.items)}>
                  Revert to here
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="tool go-button" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
