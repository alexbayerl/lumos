import { useMemo, useRef, useState, useEffect } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import { LogicalPosition, Window, getCurrentWindow } from '@tauri-apps/api/window';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { WidgetContext, WidgetInstance } from './types';
import { WIDGET_REGISTRY } from './registry';
import { popOutWidget, type PopOutDescriptor } from './popouts';

interface Props {
  layout: WidgetInstance[];
  setLayout: (next: WidgetInstance[]) => void;
  ctx: WidgetContext;
  editable: boolean;
  onRemove: (id: string) => void;
  /** Notified when a widget tears off so the parent can persist the popout. */
  onPopOut: (descriptor: PopOutDescriptor) => void;
  poppedOutIds: Set<string>;
}

const COLS = 12;
const ROW_HEIGHT = 32;
const MARGIN: [number, number] = [8, 8];

const DETACH_TRAVEL_THRESHOLD = 6;
const DETACH_OUT_THRESHOLD = 4;

interface MainBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function readMainBounds(): Promise<MainBounds> {
  const win = getCurrentWindow();
  const [pos, size, sf] = await Promise.all([
    win.outerPosition(),
    win.outerSize(),
    win.scaleFactor(),
  ]);
  const logPos = pos.toLogical(sf);
  const logSize = size.toLogical(sf);
  return { x: logPos.x, y: logPos.y, w: logSize.width, h: logSize.height };
}

function isOutside(b: MainBounds, sx: number, sy: number): boolean {
  return (
    sx < b.x - DETACH_OUT_THRESHOLD ||
    sx > b.x + b.w + DETACH_OUT_THRESHOLD ||
    sy < b.y - DETACH_OUT_THRESHOLD ||
    sy > b.y + b.h + DETACH_OUT_THRESHOLD
  );
}

export function WidgetGrid({
  layout,
  setLayout,
  ctx,
  editable,
  onRemove,
  onPopOut,
  poppedOutIds,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        setWidth((prev) => (prev !== w ? w : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rglLayout: Layout[] = useMemo(
    () =>
      layout.map<Layout>((w) => {
        const def = WIDGET_REGISTRY[w.kind];
        return {
          i: w.id,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          minW: def.minSize.w,
          minH: def.minSize.h,
        };
      }),
    [layout],
  );

  function handleChange(next: Layout[]): void {
    const byId = new Map(next.map((l) => [l.i, l]));
    const merged = layout.map((w) => {
      const l = byId.get(w.id);
      if (!l) return w;
      return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
    });
    if (merged.some((w, i) => w !== layout[i])) {
      setLayout(merged);
    }
  }

  /**
   * Drag-to-detach handler. Attached to every `.widget-frame` so the user can
   * grab anywhere on a widget (except inner buttons / inputs) and drag it.
   *
   * 1. We track the pointer in screen coordinates.
   * 2. Once the cursor exits the main window's bounds we spawn a popout at
   *    the cursor and remove the widget from the dashboard layout.
   * 3. We then keep moving the popout under the cursor until pointerup
   *    (native window dragging can't be transferred mid-mousedown across
   *    HWNDs, so we proxy the drag via setPosition calls).
   */
  function startTearOff(ev: React.PointerEvent, widget: WidgetInstance): void {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    // Don't intercept clicks on inner controls.
    if (target.closest('button, input, textarea, a, .react-resizable-handle')) return;

    const startSX = ev.screenX;
    const startSY = ev.screenY;
    let detached = false;
    let bounds: MainBounds | null = null;
    let popoutWin: Window | null = null;
    let lastMove = 0;
    let pendingPos: { x: number; y: number } | null = null;
    let raf: number | null = null;

    const cellRect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    // Where on the widget the user grabbed — we offset the popout so that
    // point sits under the cursor when it materialises.
    const grabOffsetX = Math.min(120, Math.max(20, ev.clientX - cellRect.left));
    const grabOffsetY = Math.min(40, Math.max(8, ev.clientY - cellRect.top));

    void readMainBounds().then((b) => {
      bounds = b;
    });

    function flushMove(): void {
      raf = null;
      if (!popoutWin || !pendingPos) return;
      const { x, y } = pendingPos;
      pendingPos = null;
      void popoutWin.setPosition(new LogicalPosition(x, y));
    }

    function scheduleMove(x: number, y: number): void {
      pendingPos = { x, y };
      if (raf == null) raf = requestAnimationFrame(flushMove);
    }

    async function detach(sx: number, sy: number): Promise<void> {
      detached = true;
      // Stop any in-progress react-grid-layout drag (edit mode).
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const targetX = sx - grabOffsetX;
      const targetY = sy - grabOffsetY;
      try {
        const descriptor = await popOutWidget(widget, { x: targetX, y: targetY });
        onPopOut(descriptor);
        onRemove(widget.id);
        popoutWin = await Window.getByLabel(`popout-${widget.id}`);
      } catch {
        cleanup();
      }
    }

    function onMove(e: PointerEvent): void {
      const sx = e.screenX;
      const sy = e.screenY;
      const traveled = Math.hypot(sx - startSX, sy - startSY);
      if (!detached) {
        if (!bounds || traveled < DETACH_TRAVEL_THRESHOLD) return;
        if (isOutside(bounds, sx, sy)) {
          void detach(sx, sy);
        }
      } else {
        const now = performance.now();
        if (now - lastMove < 8) return;
        lastMove = now;
        scheduleMove(sx - grabOffsetX, sy - grabOffsetY);
      }
    }

    function onUp(): void {
      cleanup();
    }

    function cleanup(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (raf != null) cancelAnimationFrame(raf);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return (
    <div
      ref={hostRef}
      className={`widget-grid-host ${editable ? 'is-editing' : ''}`}
    >
      <GridLayout
        className="widget-grid"
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        width={width}
        margin={MARGIN}
        layout={rglLayout}
        onLayoutChange={handleChange}
        isDraggable={editable}
        isResizable={editable}
        // The whole frame is the drag handle; this matches the
        // drag-to-detach gesture so users get one consistent behavior
        // whether they're rearranging in-grid or pulling onto the desktop.
        draggableHandle=".widget-frame"
        draggableCancel="button, input, textarea, a, .react-resizable-handle"
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms
      >
        {layout.map((w) => {
          const def = WIDGET_REGISTRY[w.kind];
          const Component = def.Component;
          const isPoppedOut = poppedOutIds.has(w.id);
          return (
            <div key={w.id} className="widget-cell">
              <div
                className={`widget-frame ${isPoppedOut ? 'is-popped-out' : ''}`}
                onPointerDown={(ev) => startTearOff(ev, w)}
                title={
                  editable
                    ? 'Drag to rearrange · pull outside the window to detach'
                    : 'Drag onto your desktop to detach as its own window'
                }
              >
                {editable && (
                  <div className="widget-edit-bar">
                    <span className="widget-edit-label">{def.label}</span>
                    <button
                      type="button"
                      className="widget-toolbar-btn danger"
                      title="Remove widget"
                      aria-label="Remove"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onRemove(w.id)}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {/* Subtle, hover-only grip in the corner — purely a visual
                    affordance; the entire frame is draggable. */}
                {!editable && (
                  <span className="widget-grip-hint" aria-hidden="true">
                    <span /> <span /> <span />
                  </span>
                )}
                <div className="widget-body">
                  <Component ctx={ctx} />
                </div>
              </div>
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
