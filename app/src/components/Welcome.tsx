import { FolderIcon, MeasureIcon, RulerIcon } from './icons';

/** Friendly empty state: the whole app explained as 3 numbered steps. */
export default function Welcome(props: { onOpen(): void }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1 className="welcome-title">Welcome to PaintTakeoff</h1>
        <p className="welcome-sub">Measure your painting plans right on screen. No training needed.</p>

        <div className="welcome-steps">
          <div className="welcome-step">
            <div className="step-number">1</div>
            <FolderIcon size={26} />
            <div className="step-name">Open a plan</div>
            <div className="step-desc">Pick the PDF your architect or GC sent you.</div>
          </div>
          <div className="welcome-step">
            <div className="step-number">2</div>
            <RulerIcon size={26} />
            <div className="step-name">Set the scale</div>
            <div className="step-desc">Tell the app one real length on the page.</div>
          </div>
          <div className="welcome-step">
            <div className="step-number">3</div>
            <MeasureIcon size={26} />
            <div className="step-name">Measure</div>
            <div className="step-desc">Click and drag to get real lengths.</div>
          </div>
        </div>

        <button className="big-open-button" onClick={props.onOpen}>
          <FolderIcon size={22} /> Open a Plan (PDF)
        </button>
        <p className="welcome-hint">…or just drag a PDF file anywhere onto this window.</p>
      </div>
    </div>
  );
}
