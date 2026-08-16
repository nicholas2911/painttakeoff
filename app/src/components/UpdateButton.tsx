import type { UpdateState } from '../types';

/**
 * The manual update button, shown in the title bar when an update exists.
 * available -> flashing "New update: x.y.z"; click downloads with calm
 * progress; ready -> solid green "Restart to update"; error -> retry.
 */
export default function UpdateButton(props: {
  state: UpdateState;
  onDownload(): void;
  onRestart(): void;
  onCheckUpdates(): void;
}) {
  const { state } = props;
  if (state.phase === 'checking') {
    return (
      <span className="update-btn neutral" title="Checking for updates…">
        Checking…
      </span>
    );
  }
  if (state.phase === 'uptodate') {
    return (
      <button
        className="update-btn uptodate"
        title="You're on the latest version — click to check again"
        onClick={props.onCheckUpdates}
      >
        ✓ Latest version
      </button>
    );
  }
  if (state.phase === 'available') {
    return (
      <button
        className="update-btn pulse"
        title="A new version of PaintTakeoff is ready to download"
        onClick={props.onDownload}
      >
        New update{state.version ? `: ${state.version}` : ''}
      </button>
    );
  }
  if (state.phase === 'downloading') {
    return (
      <button className="update-btn busy" disabled title="The update is downloading — you can keep working">
        Downloading update… {state.percent ?? 0}%
      </button>
    );
  }
  if (state.phase === 'ready') {
    return (
      <button
        className="update-btn ready"
        title="Restart PaintTakeoff to finish the update"
        onClick={props.onRestart}
      >
        Restart to update
      </button>
    );
  }
  if (state.phase === 'error') {
    return (
      <button
        className="update-btn failed"
        title="The update didn’t download — click to try again"
        onClick={props.onDownload}
      >
        Update failed — try again
      </button>
    );
  }
  return null;
}
