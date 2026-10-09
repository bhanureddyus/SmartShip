// Journey state: React context + AsyncStorage persistence. The shape mirrors
// the web client's `state` (public/js/app.js newState()) plus the community
// fields from the spec (`reported`, `share`, `pendingReports`), so a shipment
// saved from either client lands in the same `/api/shipment` row.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CostResult, Item, OptMode, PackingPlan, Segment } from './engine.d';
import { SEED } from './data';
import { Engine } from './engine';
import { postReport, saveShipment, type SenderReportInput, type ShipmentRecord } from './api';

export const STORAGE_KEY = 'ship2us.mobile.state.v1';
export const SENDER_NAME_KEY = 'ship2us.mobile.senderName';

export type SenderStage = 'check' | 'pack' | 'cost' | 'ship';
export type View = 'landing' | 'wizard';

export interface JourneyState {
  id: string;
  view: View;
  step: number; // 0..4 — describe, check, pack, cost, ship
  segment: Segment;
  originCountry: 'IN' | 'CN';
  origin: string;
  dest: string;
  corridor: string;
  narrative: string;
  items: Item[];
  pending: Item[];
  photoNames: string[];
  optMode: OptMode;
  chosen: string | null;
  checklist: Record<string, boolean>;
  feedbackDone: boolean;
  updatedAt: string | null;
  // community loop
  reported: Partial<Record<SenderStage, true>>;
  share: { token: string; url: string } | null;
  pendingReports: SenderReportInput[];
  // engine outputs cached between steps (same keys as web)
  packing: PackingPlan | null;
  cost: CostResult | null;
}

export function newShipmentId(): string {
  return 'shp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newState(): JourneyState {
  return {
    id: newShipmentId(),
    view: 'landing',
    step: 0,
    segment: 'consumer',
    originCountry: 'IN',
    origin: 'Hyderabad',
    dest: '',
    corridor: 'IN-US',
    narrative: '',
    items: [],
    pending: [],
    photoNames: [],
    optMode: 'balance',
    chosen: null,
    checklist: {},
    feedbackDone: false,
    updatedAt: null,
    reported: {},
    share: null,
    pendingReports: [],
    packing: null,
    cost: null,
  };
}

// Mirrors web `loadDemo()`: Hyderabad → Austin with the seeded items.
export function demoState(): JourneyState {
  const d = SEED.demo;
  const s = newState();
  s.view = 'wizard';
  s.segment = d.segment;
  s.originCountry = d.route.originCountry;
  s.origin = d.route.origin;
  s.dest = d.route.dest;
  s.corridor = d.route.corridor;
  s.narrative = d.narrative;
  s.items = d.items.map((it) => ({ ...it, uid: 'it_' + Math.random().toString(36).slice(2, 9) }));
  return s;
}

export function totalKg(items: Item[]): number {
  return items.reduce((s, i) => s + (Number(i.weightKg) || 0), 0);
}

export function ruleIdsOf(items: Item[]): string[] {
  return [...new Set(items.map((i) => i.ruleId).filter((r): r is string => Boolean(r)))];
}

// Pure: what the server stores for this journey. Same keys the web posts.
export function toShipmentRecord(s: JourneyState): ShipmentRecord {
  return {
    id: s.id,
    view: s.view,
    step: s.step,
    segment: s.segment,
    originCountry: s.originCountry,
    origin: s.origin,
    dest: s.dest,
    corridor: s.corridor,
    narrative: s.narrative,
    items: s.items,
    pending: s.pending,
    photoNames: s.photoNames,
    optMode: s.optMode,
    chosen: s.chosen,
    checklist: s.checklist,
    feedbackDone: s.feedbackDone,
    updatedAt: s.updatedAt,
    packing: s.packing ? { boxes: s.packing.boxes } : null,
    source: 'mobile',
  };
}

// Recompute packing + cost from items so later steps never read stale output.
export function withEngineOutputs(s: JourneyState): JourneyState {
  if (!s.items.length) return { ...s, packing: null, cost: null };
  const packing = Engine.planPacking(s.items, SEED.boxes, SEED.itemRules);
  const cost = Engine.costQuotes(packing.boxes, s.items, SEED.carriers, s.corridor, s.segment, SEED.itemRules);
  return { ...s, packing, cost };
}

type Updater = (prev: JourneyState) => JourneyState;

export interface Store {
  state: JourneyState;
  hydrated: boolean;
  offline: boolean;
  update: (fn: Updater) => void;
  replace: (next: JourneyState) => void;
  // Posts a sender report for a stage; on network failure queues it locally.
  report: (input: Omit<SenderReportInput, 'shipmentId' | 'role'>) => Promise<'sent' | 'queued'>;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function parseStoredState(raw: string | null): JourneyState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<JourneyState>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') return null;
    return { ...newState(), ...parsed };
  } catch {
    return null;
  }
}

export function useStoreValue(): Store {
  const [state, setState] = useState<JourneyState>(newState);
  const [hydrated, setHydrated] = useState(false);
  const [offline, setOffline] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const restored = parseStoredState(raw);
        if (restored) setState(restored);
      })
      .catch((e: unknown) => console.warn('state restore failed', e))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist locally on every change, then debounce the server write (web: 800 ms).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e: unknown) => console.warn('state save failed', e));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveShipment(toShipmentRecord(stateRef.current))
        .then(() => setOffline(false))
        .catch(() => setOffline(true));
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  const update = useCallback((fn: Updater) => {
    setState((prev) => ({ ...fn(prev), updatedAt: new Date().toISOString() }));
  }, []);

  const replace = useCallback((next: JourneyState) => {
    setState({ ...next, updatedAt: new Date().toISOString() });
  }, []);

  const flushQueue = useCallback(async () => {
    const queued = stateRef.current.pendingReports;
    if (!queued.length) return;
    const stillPending: SenderReportInput[] = [];
    for (const r of queued) {
      try {
        await postReport(r);
      } catch {
        stillPending.push(r);
      }
    }
    if (stillPending.length !== queued.length) update((p) => ({ ...p, pendingReports: stillPending }));
  }, [update]);

  useEffect(() => {
    if (hydrated) flushQueue();
  }, [hydrated, flushQueue]);

  const report = useCallback<Store['report']>(
    async (input) => {
      const full: SenderReportInput = { ...input, shipmentId: stateRef.current.id, role: 'sender' };
      // The server validates the shipment exists, so make sure it is saved first.
      try {
        await saveShipment(toShipmentRecord(stateRef.current));
        await postReport(full);
        update((p) => ({ ...p, reported: { ...p.reported, [input.stage]: true } }));
        setOffline(false);
        return 'sent';
      } catch {
        setOffline(true);
        update((p) => ({ ...p, reported: { ...p.reported, [input.stage]: true }, pendingReports: [...p.pendingReports, full] }));
        return 'queued';
      }
    },
    [update],
  );

  return useMemo(() => ({ state, hydrated, offline, update, replace, report }), [state, hydrated, offline, update, replace, report]);
}
