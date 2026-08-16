import { useEffect } from 'react';
import type { UpdateState } from '../types';
import UpdateButton from './UpdateButton';
import pkg from '../../package.json';

/**
 * Custom window title bar — Electron only (the caller renders it only when
 * the preload bridge exists). The drag region uses -webkit-app-region: drag,
 * which also gives standard Windows double-click-to-maximize behavior.
 */
export default function TitleBar(props: {
  fileName: string | null;
  maximized: boolean;
  onMaximizedChange(v: boolean): void;
  update: UpdateState | null;
  onCheckUpdates(): void;
}) {
  const controls = window.painttakeoff?.windowControls;
  const updates = window.painttakeoff?.updates;
  const { onMaximizedChange } = props;

  useEffect(() => {
    if (!controls) return;
    void controls.isMaximized().then(onMaximizedChange);
    controls.onMaximizeChange(onMaximizedChange);
  }, [controls, onMaximizedChange]);

  if (!controls) return null;

  return (
    <div className="titlebar">
      <div className="tb-brand">
        <span className="logo-mark">P</span>
        <span className="wordmark">PaintTakeoff</span>
        {updates ? (
          <button
            className="tb-version"
            title="Check for updates"
            onClick={props.onCheckUpdates}
          >
            v{pkg.version}
          </button>
        ) : (
          <span className="tb-version static">v{pkg.version}</span>
        )}
        {props.fileName && (
          <span className="tb-file" title={props.fileName}>
            {props.fileName}
          </span>
        )}
      </div>
      <div className="tb-drag" />
      {props.update && updates && (
        <div className="tb-update">
          <UpdateButton
            state={props.update}
            onDownload={() => updates.download()}
            onRestart={() => updates.restart()}
            onCheckUpdates={props.onCheckUpdates}
          />
        </div>
      )}
      <div className="tb-buttons">
        <button
          className="win-btn"
          data-win="minimize"
          title="Minimize"
          onClick={() => controls.minimize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          className="win-btn"
          data-win="maximize"
          title={props.maximized ? 'Restore down' : 'Maximize'}
          onClick={() => controls.toggleMaximize()}
        >
          {props.maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="3.2" y="1" width="7.8" height="7.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.8 8.8v2.2H1V3.2h2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button
          className="win-btn close"
          data-win="close"
          title="Close"
          onClick={() => controls.close()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
