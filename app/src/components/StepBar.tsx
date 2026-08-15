import type { ReactNode } from 'react';

/**
 * The persistent guidance bar under the toolbar. Always tells the user, in
 * plain words, what to do next — the "spoon feeding" layer.
 */
export default function StepBar(props: {
  kind: 'action' | 'info' | 'success';
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`step-bar ${props.kind}`}>
      <span className="step-bar-title">{props.title}</span>
      <span className="step-bar-text">{props.children}</span>
    </div>
  );
}
