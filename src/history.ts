import { Store } from '@tauri-apps/plugin-store';
import type { UsageSnapshot, UsageSummaryResponse } from './types';

const STORE_FILE = 'usage-history.json';
const KEY = 'snapshots';
/** keep up to 14 days, dedup near-duplicates */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 4_000;
const DEDUPE_GAP_MS = 60_000;

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export async function loadHistory(): Promise<UsageSnapshot[]> {
  try {
    const store = await getStore();
    const raw = (await store.get<UsageSnapshot[]>(KEY)) ?? [];
    return prune(raw);
  } catch {
    return [];
  }
}

export async function recordSnapshot(
  current: UsageSnapshot[],
  fetchedAt: string,
  summary: UsageSummaryResponse,
): Promise<UsageSnapshot[]> {
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return current;
  const plan = summary.individualUsage.plan;
  const next: UsageSnapshot = { t, used: plan.used, limit: plan.limit };

  const last = current[current.length - 1];
  let merged = current;
  if (
    last &&
    last.used === next.used &&
    last.limit === next.limit &&
    next.t - last.t < DEDUPE_GAP_MS
  ) {
    merged = [...current.slice(0, -1), next];
  } else {
    merged = [...current, next];
  }

  const pruned = prune(merged);

  try {
    const store = await getStore();
    await store.set(KEY, pruned);
    await store.save();
  } catch {
    // non-fatal: in-memory history still works for the session
  }
  return pruned;
}

function prune(snapshots: UsageSnapshot[]): UsageSnapshot[] {
  if (snapshots.length === 0) return snapshots;
  const cutoff = Date.now() - MAX_AGE_MS;
  const filtered = snapshots
    .filter((s) => Number.isFinite(s.t) && s.t >= cutoff)
    .sort((a, b) => a.t - b.t);
  if (filtered.length <= MAX_ENTRIES) return filtered;
  return filtered.slice(filtered.length - MAX_ENTRIES);
}

export async function clearHistory(): Promise<void> {
  try {
    const store = await getStore();
    await store.set(KEY, []);
    await store.save();
  } catch {
    // ignore
  }
}
