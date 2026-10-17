import { useEffect } from 'react';
import type { UpdateState } from '../types';
import UpdateButton from './UpdateButton';
import { MoonIcon, SunIcon } from './icons';
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
  theme: 'light' | 'dark';
  onToggleTheme(): void;
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
        <span className="logo-mark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="13" height="7" rx="2" fill="currentColor" />
            <rect x="6" y="11" width="3.4" height="8" rx="1.2" fill="currentColor" opacity="0.85" />
            <path d="M15 7.5h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </span>
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
      <button
        className="tb-theme"
        onClick={props.onToggleTheme}
        title={props.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        aria-label={props.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {props.theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
      </button>
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
