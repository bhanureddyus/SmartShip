// Fetches community insight for the current shipment's corridor + rule ids.
// Insight is displayed beside engine output and never fed into it.
import { useEffect, useState } from 'react';
import { getInsight } from './api';
import type { Insight } from './engine.d';

export function useInsight(corridor: string | null, ruleIds: string[]): Insight | null {
  const [insight, setInsight] = useState<Insight | null>(null);
  const key = `${corridor}|${ruleIds.join(',')}`;
  useEffect(() => {
    let cancelled = false;
    getInsight(corridor, ruleIds)
      .then((ins) => {
        if (!cancelled) setInsight(ins);
      })
      .catch((e: unknown) => console.warn('insight unavailable', e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return insight;
}
