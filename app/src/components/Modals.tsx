import { useEffect, useState, type ReactNode } from 'react';
import {
  formatLength,
  formatLengthWords,
  parseLengthToMeters,
  parseMixedNumber,
  type UnitSystem,
} from '../measure/units';

function ModalShell(props: { title: string; children: ReactNode; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="modal">
        <div className="modal-title">{props.title}</div>
        {props.children}
      </div>
    </div>
  );
}

/**
 * The primary length input: big separate boxes that match how trades
 * actually talk — [Feet] [Inches] or [meters]. The forgiving text parser
 * still runs underneath, so "6 1/2" or "24.5" in any box just works.
 */
export function LengthBoxes(props: {
  units: UnitSystem;
  onValue(meters: number | null): void;
  onSwitchUnits(): void;
}) {
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [mmText, setMmText] = useState('');

  let parsed: number | null = null;
  let touched = false;
  if (props.units === 'imperial') {
    const ft = feet.trim();
    const inch = inches.trim();
    touched = ft !== '' || inch !== '';
    if (ft !== '' && inch !== '') parsed = parseLengthToMeters(`${ft}' ${inch}"`, 'imperial');
    else if (ft !== '') parsed = parseLengthToMeters(`${ft}'`, 'imperial');
    else if (inch !== '') parsed = parseLengthToMeters(`${inch}"`, 'imperial');
  } else {
    // Metric plans print dimensions in millimetres ("2520") — a bare number
    // is mm. A value with a unit suffix ("2.52 m", "2520 mm") still works.
    const t = mmText.trim().toLowerCase();
    touched = t !== '';
    if (t === '') parsed = null;
    else if (/^\d+(?:\.\d+)?$/.test(t)) parsed = parseFloat(t) / 1000;
    else parsed = parseLengthToMeters(t, 'metric');
  }
  const valid = parsed !== null && parsed > 0;

  useEffect(() => {
    props.onValue(valid ? parsed : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feet, inches, mmText, props.units]);

  return (
    <div className="length-boxes">
      {props.units === 'imperial' ? (
        <div className="boxes-row">
          <label className="length-box">
            <input
              autoFocus
              value={feet}
              inputMode="decimal"
              placeholder="24"
              onChange={(e) => setFeet(e.target.value)}
            />
            <span>Feet</span>
          </label>
          <label className="length-box">
            <input
              value={inches}
              inputMode="text"
              placeholder={`6 1/2`}
              onChange={(e) => setInches(e.target.value)}
            />
            <span>Inches</span>
          </label>
        </div>
      ) : (
        <div className="boxes-row">
          <label className="length-box wide">
            <input
              autoFocus
              value={mmText}
              inputMode="decimal"
              placeholder="2520"
              onChange={(e) => setMmText(e.target.value)}
            />
            <span>Millimetres</span>
          </label>
        </div>
      )}
      <div className={`parse-preview ${touched && !valid ? 'invalid' : ''}`}>
        {!touched
          ? props.units === 'imperial'
            ? 'Inches can be a fraction, like 6 1/2'
            : 'Type the millimetres as printed on the plan — e.g. 2520'
          : !valid
            ? props.units === 'imperial'
              ? 'That doesn’t look like a length — try whole feet in the first box, inches in the second.'
              : 'That doesn’t look like a length — type the number as printed on the plan, like 2520.'
            : props.units === 'imperial'
              ? `= ${formatLengthWords(parsed as number, props.units)}`
              : `= ${Math.round((parsed as number) * 1000)} mm (${parseFloat(
                  (parsed as number).toFixed(3),
                )} m)`}
      </div>
      <button type="button" className="unit-switch" onClick={props.onSwitchUnits}>
        {props.units === 'imperial' ? 'Work in meters instead' : 'Work in feet & inches instead'}
      </button>
    </div>
  );
}

/** Step 2: the user picked two points; ask how long that line really is. */
export function CalibrationModal(props: {
  units: UnitSystem;
  onSubmit(meters: number): void;
  onCancel(): void;
  onSwitchUnits(): void;
}) {
  const [meters, setMeters] = useState<number | null>(null);
  return (
    <ModalShell title="Set the scale" onCancel={props.onCancel}>
      <p className="modal-text">How long is that line in real life?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (meters !== null && meters > 0) props.onSubmit(meters);
        }}
      >
        <LengthBoxes units={props.units} onValue={setMeters} onSwitchUnits={props.onSwitchUnits} />
        <div className="modal-actions">
          <button type="button" className="tool" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="tool go-button" disabled={meters === null || meters <= 0}>
            Set Scale
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** After the scale is set: offer the double-check. */
export function AxisPromptModal(props: { onMeasure(): void; onSkip(): void }) {
  return (
    <ModalShell title="Double-check (optional, but smart)" onCancel={props.onSkip}>
      <p className="modal-text">
        Your scale is set. To be sure it’s right, measure <strong>one more thing</strong> you know
        the length of — ideally pointing the other way (up-and-down instead of side-to-side).
      </p>
      <div className="modal-actions">
        <button className="tool" onClick={props.onSkip}>
          Skip this
        </button>
        <button className="tool go-button" onClick={props.onMeasure}>
          Measure one more thing
        </button>
      </div>
    </ModalShell>
  );
}

/** Double-check: the user measured a second line; what should it be? */
export function AxisExpectedModal(props: {
  units: UnitSystem;
  measuredMeters: number;
  onSubmit(expectedMeters: number): void;
  onCancel(): void;
  onSwitchUnits(): void;
}) {
  const [meters, setMeters] = useState<number | null>(null);
  return (
    <ModalShell title="Double-check" onCancel={props.onCancel}>
      <p className="modal-text">
        That line measures <strong>{formatLength(props.measuredMeters, props.units)}</strong> with
        the current scale. How long should it really be?
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (meters !== null && meters > 0) props.onSubmit(meters);
        }}
      >
        <LengthBoxes units={props.units} onValue={setMeters} onSwitchUnits={props.onSwitchUnits} />
        <div className="modal-actions">
          <button type="button" className="tool" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="tool go-button" disabled={meters === null || meters <= 0}>
            Check it
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Double-check failed by more than 2%: warn, stay unconfirmed. */
export function AxisWarningModal(props: {
  units: UnitSystem;
  measuredMeters: number;
  expectedMeters: number;
  onRemeasure(): void;
  onLeaveUnverified(): void;
}) {
  const deviation =
    Math.abs(props.measuredMeters - props.expectedMeters) / props.expectedMeters;
  return (
    <ModalShell title="Hmm, that doesn’t match" onCancel={props.onLeaveUnverified}>
      <p className="modal-text warning-text">
        That line measured <strong>{formatLength(props.measuredMeters, props.units)}</strong>, but
        you said it should be{' '}
        <strong>{formatLength(props.expectedMeters, props.units)}</strong> — off by{' '}
        <strong>{(deviation * 100).toFixed(1)}%</strong>.
      </p>
      <p className="modal-text">
        The plan might be stretched, or the scale might be wrong. Best to try again — your scale is{' '}
        <strong>not confirmed</strong> yet.
      </p>
      <div className="modal-actions">
        <button className="tool" onClick={props.onLeaveUnverified}>
          Keep it anyway
        </button>
        <button className="tool go-button" onClick={props.onRemeasure}>
          Try again
        </button>
      </div>
    </ModalShell>
  );
}

/** Custom scale: metric ratio (1 : N) or imperial (X inch = 1 foot). */
export function CustomScaleModal(props: {
  onSubmit(ratio: number): void;
  onCancel(): void;
}) {
  const [ratioText, setRatioText] = useState('');
  const [inchText, setInchText] = useState('');

  const ratioParsed = parseMixedNumber(ratioText);
  const inchParsed = parseMixedNumber(inchText);
  // X inch = 1 foot  ->  ratio = 12 / X
  const fromInch = inchParsed !== null && inchParsed > 0 ? 12 / inchParsed : null;
  const ratio =
    ratioParsed !== null && ratioParsed > 0 ? ratioParsed : fromInch;
  const touched = ratioText.trim() !== '' || inchText.trim() !== '';
  const valid = ratio !== null && ratio >= 1 && ratio <= 10000;

  let preview = 'Fill in either box — e.g. 75 on the left, or 3/16 on the right.';
  if (touched && !valid) preview = 'That doesn’t look like a scale — try 75, or 1/4.';
  else if (valid && ratio !== null) {
    preview =
      ratio >= 12
        ? `= 1:${parseFloat(ratio.toFixed(2))} — 1 mm on paper = ${parseFloat((ratio).toFixed(1))} mm in real life (1 inch = ${parseFloat((ratio / 12).toFixed(2))} ft)`
        : `= 1:${parseFloat(ratio.toFixed(2))}`;
  }

  return (
    <ModalShell title="Custom scale" onCancel={props.onCancel}>
      <p className="modal-text">
        Type the scale exactly as it’s printed on the plan — either way works.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && ratio !== null) props.onSubmit(ratio);
        }}
      >
        <div className="custom-scale-row">
          <label className="length-box">
            <div className="custom-scale-metric">
              <span className="cs-one">1 :</span>
              <input
                autoFocus
                value={ratioText}
                inputMode="decimal"
                placeholder="75"
                onChange={(e) => {
                  setRatioText(e.target.value);
                  if (e.target.value.trim()) setInchText('');
                }}
              />
            </div>
            <span>Metric ratio</span>
          </label>
          <div className="cs-or">or</div>
          <label className="length-box">
            <div className="custom-scale-metric">
              <input
                value={inchText}
                inputMode="text"
                placeholder="3/16"
                onChange={(e) => {
                  setInchText(e.target.value);
                  if (e.target.value.trim()) setRatioText('');
                }}
              />
              <span className="cs-one">inch = 1 foot</span>
            </div>
            <span>Imperial</span>
          </label>
        </div>
        <div className={`parse-preview ${touched && !valid ? 'invalid' : ''}`}>{preview}</div>
        <div className="modal-actions">
          <button type="button" className="tool" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="tool go-button" disabled={!valid}>
            Use this scale
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Discoverable shortcut list ("?" button in the toolbar). */
export function ShortcutsModal(props: { onClose(): void }) {
  const rows: [string, string][] = [
    ['Drag', 'Move around the plan'],
    ['Scroll', 'Move up and down'],
    ['Ctrl + scroll', 'Zoom in and out'],
    ['Hold Space + drag', 'Move around while using any tool'],
    ['←  →', 'Previous / next page'],
    ['V · C · M · A', 'Move Around · Set Scale · Measure · Quick Area'],
    ['+  −', 'Zoom in / out'],
    ['Enter or double-click', 'Finish a measurement'],
    ['Delete', 'Remove the selected measurement'],
    ['Right-click', 'Undo last point / cancel'],
    ['Esc', 'Cancel whatever you’re doing'],
  ];
  return (
    <ModalShell title="Handy shortcuts" onCancel={props.onClose}>
      <div className="shortcut-list">
        {rows.map(([keys, what]) => (
          <div className="shortcut-row" key={keys}>
            <span className="shortcut-keys">{keys}</span>
            <span>{what}</span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="tool go-button" onClick={props.onClose}>
          Got it
        </button>
      </div>
    </ModalShell>
  );
}
