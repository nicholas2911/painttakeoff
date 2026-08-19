import type { ProjectMeta } from '../pdf/projectStore';

/** Card action sheet: what to do with this project. */
export default function CardActionSheet(props: {
  project: ProjectMeta;
  onOpen(): void;
  onGoToQuote(): void;
  onEdit(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const p = props.project;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal action-sheet">
        <div className="modal-title">{p.name}</div>
        {p.company && <p className="modal-text">{p.company}</p>}
        <div className="action-sheet-buttons">
          <button className="tool go-button action-big" onClick={props.onOpen}>
            Open project
          </button>
          <button className="tool action-big" onClick={props.onGoToQuote}>
            Go to quote
          </button>
          <button className="tool action-big" onClick={props.onEdit}>
            Edit details
          </button>
          <button className="tool danger-button action-big" onClick={props.onDelete}>
            Delete project
          </button>
        </div>
        <div className="modal-actions">
          <button className="tool" onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
