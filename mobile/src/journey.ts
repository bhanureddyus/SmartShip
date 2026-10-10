// Step definitions and navigation guards, mirrored from the web wizard
// (`STEPS`, `stepGuards`, `updateHint` in public/js/app.js). Pure functions so
// the layout and tests share one source of truth.
import type { JourneyState } from './store';

export const STEPS = [
  { key: 'describe', label: 'Describe', cta: 'See if I can ship it' },
  { key: 'check', label: 'Check', cta: 'Plan the packing' },
  { key: 'pack', label: 'Pack', cta: 'Compare costs' },
  { key: 'cost', label: 'Cost', cta: 'Continue with selected' },
  { key: 'ship', label: 'Ship', cta: null },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export function stepIndex(key: string): number {
  const i = STEPS.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

export function clampStep(n: number): number {
  return Math.min(STEPS.length - 1, Math.max(0, n));
}

// Returns null when the step may advance, otherwise the toast the web shows.
export function describeGuard(s: JourneyState): string | null {
  if (!s.items.length) return 'Add at least one item — type it above or add one by hand.';
  const bad = s.items.find((i) => !String(i.desc || '').trim() || !(Number(i.weightKg) > 0));
  if (bad) return 'That item needs a name and a weight above zero.';
  if (s.pending.length) return 'Confirm or dismiss the suggestions first — nothing counts until you do.';
  if (!s.dest) return 'Where is it going? Pick a destination.';
  return null;
}

export function guardFor(step: number): ((s: JourneyState) => string | null) | null {
  return step === 0 ? describeGuard : null;
}

export function navHint(s: JourneyState, totalKg: number): string {
  if (s.step === 0) {
    if (!s.items.length) return 'Add at least one item to continue';
    if (!s.dest) return 'Pick a destination to continue';
    if (s.pending.length) return 'Confirm or dismiss the suggestions first';
    return `${s.items.length} item${s.items.length === 1 ? '' : 's'} · ${totalKg.toFixed(1)} kg`;
  }
  if (s.step === 3) {
    const q = s.cost && s.cost.quotes.find((x) => x.carrierId === s.chosen);
    return q ? `Selected: ${q.name}` : 'Pick an option, or continue with our pick';
  }
  return '';
}

export function titleCase(s: string | null): string | null {
  return s
    ? s
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : s;
}
