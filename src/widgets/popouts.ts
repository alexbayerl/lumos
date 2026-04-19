import { invoke } from '@tauri-apps/api/core';
import type { WidgetInstance, WidgetKind } from './types';
import { WIDGET_REGISTRY } from './registry';

const STORAGE_KEY = 'cursor-usage-overlay.popouts.v1';

/** A widget the user has torn off into its own desktop window. */
export interface PopOutDescriptor {
  id: string;
  kind: WidgetKind;
  width: number;
  height: number;
}

export function loadPopOuts(): PopOutDescriptor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PopOutDescriptor[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && p.kind in WIDGET_REGISTRY && typeof p.id === 'string');
  } catch {
    return [];
  }
}

export function savePopOuts(list: PopOutDescriptor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Heuristic that turns "grid units" from the registry into a sensible
 * starting pixel size for a free-floating window. Roughly matches what the
 * widget would look like in the dashboard at default density.
 */
function suggestSize(kind: WidgetKind): { width: number; height: number } {
  const def = WIDGET_REGISTRY[kind];
  const COL_PX = 38;
  const ROW_PX = 30;
  const PADDING_X = 36;
  const PADDING_Y = 56; // accounts for drag bar + body padding
  return {
    width: Math.round(def.defaultSize.w * COL_PX + PADDING_X),
    height: Math.round(def.defaultSize.h * ROW_PX + PADDING_Y),
  };
}

/**
 * Asks the Rust backend to spawn (or focus) a window for the given widget
 * and persists the descriptor so the window is recreated on next launch.
 *
 * If `at` is provided (logical screen px), the new window is positioned
 * there — used by drag-to-detach so the popout appears under the cursor.
 */
export async function popOutWidget(
  widget: WidgetInstance,
  at?: { x: number; y: number },
): Promise<PopOutDescriptor> {
  const { width, height } = suggestSize(widget.kind);
  const descriptor: PopOutDescriptor = {
    id: widget.id,
    kind: widget.kind,
    width,
    height,
  };
  await invoke('pop_out_widget', {
    kind: widget.kind,
    id: widget.id,
    width,
    height,
    x: at?.x,
    y: at?.y,
  });
  return descriptor;
}

/** Closes a popped-out window (Rust will fire `popout-closed` afterward). */
export async function closePopOut(id: string): Promise<void> {
  await invoke('close_widget_window', { id });
}

/** Restore previously popped-out widgets after the main app starts. */
export async function restorePopOuts(list: PopOutDescriptor[]): Promise<void> {
  for (const p of list) {
    try {
      await invoke('pop_out_widget', {
        kind: p.kind,
        id: p.id,
        width: p.width,
        height: p.height,
      });
    } catch {
      // Ignore individual failures — keep restoring the rest.
    }
  }
}
