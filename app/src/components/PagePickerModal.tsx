import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Page picker: thumbnail grid of every page with checkboxes. Thumbnails
 * render lazily (only when scrolled into view, a few at a time) so 150-page
 * sets stay fast. Selection is a set of ORIGINAL page indices (0-based).
 */
export default function PagePickerModal(props: {
  doc: PDFDocumentProxy;
  initial: Set<number>;
  title: string;
  confirmLabel: string;
  onConfirm(pages: number[]): void;
  onCancel(): void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(props.initial));
  const numPages = props.doc.numPages;
  const thumbsRef = useRef(new Map<number, string>());
  const [, setThumbVersion] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const renderingRef = useRef(new Set<number>());

  // Lazy thumbnail rendering: only cards in view, 3 at a time.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const renderThumb = async (pageIdx: number, img: HTMLImageElement) => {
      if (thumbsRef.current.has(pageIdx) || renderingRef.current.has(pageIdx)) return;
      renderingRef.current.add(pageIdx);
      try {
        const page = await props.doc.getPage(pageIdx + 1);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = 180 / vp0.width;
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = Math.round(vp0.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({
          canvasContext: ctx,
          viewport: page.getViewport({ scale }),
          background: '#ffffff',
        }).promise;
        thumbsRef.current.set(pageIdx, canvas.toDataURL('image/png'));
        img.src = thumbsRef.current.get(pageIdx)!;
        setThumbVersion((v) => v + 1);
      } catch {
        /* thumb just stays blank */
      } finally {
        renderingRef.current.delete(pageIdx);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target as HTMLImageElement;
          const idx = parseInt(img.dataset.page ?? '', 10);
          if (!Number.isNaN(idx)) void renderThumb(idx, img);
        }
      },
      { root: grid, rootMargin: '200px' },
    );
    const imgs = grid.querySelectorAll('img[data-page]');
    imgs.forEach((img) => observer.observe(img));
    return () => observer.disconnect();
  }, [props.doc, numPages]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const sorted = Array.from(selected).sort((a, b) => a - b);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="modal picker-modal">
        <div className="modal-title">{props.title}</div>
        <p className="modal-text">
          Pick the pages you'll measure on — the rest stay out of the way. You can change this later.
        </p>
        <div className="picker-links">
          <button className="unit-switch" onClick={() => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i)))}>
            Select all
          </button>
          <button className="unit-switch" onClick={() => setSelected(new Set())}>
            Select none
          </button>
        </div>
        <div className="picker-grid" ref={gridRef}>
          {Array.from({ length: numPages }, (_, i) => (
            <button
              key={i}
              className={`picker-card ${selected.has(i) ? 'selected' : ''}`}
              onClick={() => toggle(i)}
            >
              <img data-page={i} alt="" />
              <span className="picker-check">{selected.has(i) ? '✓' : ''}</span>
              <span className="picker-num">Page {i + 1}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions picker-footer">
          <button className="tool" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            className="tool go-button"
            disabled={selected.size === 0}
            onClick={() => props.onConfirm(sorted)}
          >
            {props.confirmLabel.replace('{n}', String(selected.size)).replace('{total}', String(numPages))}
          </button>
        </div>
      </div>
    </div>
  );
}
