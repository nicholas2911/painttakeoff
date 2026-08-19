import { useState } from 'react';
import { FolderIcon } from './icons';

/** New project: name / company / notes / the plan PDF. One calm modal.
 *  In edit mode (existing project), the PDF section is hidden. */
export default function NewProjectModal(props: {
  file: File | null;
  edit?: { name: string; company: string; notes: string };
  onPickFile(): void;
  onCancel(): void;
  onCreate(name: string, company: string, notes: string): void;
}) {
  const [name, setName] = useState(() =>
    props.edit ? props.edit.name : props.file ? props.file.name.replace(/\.pdf$/i, '') : '',
  );
  const [company, setCompany] = useState(props.edit?.company ?? '');
  const [notes, setNotes] = useState(props.edit?.notes ?? '');
  const editing = !!props.edit;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="modal">
        <div className="modal-title">{editing ? 'Edit project' : 'New project'}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && (editing || props.file)) props.onCreate(name.trim(), company.trim(), notes.trim());
          }}
        >
          <label className="np-field">
            <span>Name of project</span>
            <input
              autoFocus
              className="np-input big"
              value={name}
              placeholder="e.g. Summerville Pines repaint"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="np-field">
            <span>Project manager / company</span>
            <input
              className="np-input"
              value={company}
              placeholder="Optional"
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <label className="np-field">
            <span>Notes</span>
            <textarea
              className="np-input"
              rows={3}
              value={notes}
              placeholder="Anything about this job — client quirks, deadlines, colours…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {!editing && (
          <div className="np-file">
            {props.file ? (
              <span className="np-file-name">📄 {props.file.name}</span>
            ) : (
              <button type="button" className="tool" onClick={props.onPickFile}>
                <FolderIcon /> Pick the plan PDF
              </button>
            )}
          </div>
          )}
          <div className="modal-actions">
            <button type="button" className="tool" onClick={props.onCancel}>
              Cancel
            </button>
            <button type="submit" className="tool go-button" disabled={!name.trim() || (!editing && !props.file)}>
              {editing ? 'Save changes' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
