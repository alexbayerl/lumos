import { useEffect, useRef, useState } from 'react';
import { WIDGET_LIST } from './registry';
import type { WidgetKind } from './types';

interface Props {
  onAdd: (kind: WidgetKind) => void;
}

/** Tiny popover used in edit mode to add new widget instances. */
export function AddWidgetMenu({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="add-widget-wrap">
      <button
        type="button"
        className="button"
        onClick={() => setOpen((v) => !v)}
        title="Add a widget"
      >
        + Add widget
      </button>
      {open && (
        <div className="add-widget-pop" role="menu">
          {WIDGET_LIST.map((def) => (
            <button
              key={def.kind}
              type="button"
              className="add-widget-item"
              role="menuitem"
              onClick={() => {
                onAdd(def.kind);
                setOpen(false);
              }}
            >
              <span className="add-widget-label">{def.label}</span>
              <span className="add-widget-desc">{def.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
