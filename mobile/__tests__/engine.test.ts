// M2 — engine parity. The mobile app imports public/js/engine.js through
// Metro's watchFolders; this test proves that import yields exactly what the
// web test runner (root test-engine.js) gets when it concatenates
// data.js + engine.js and evaluates them as browser globals.
import fs from 'node:fs';
import path from 'node:path';
import { SEED } from '../src/data';
import { Engine } from '../src/engine';
import type { Item } from '../src/engine.d';

const PUBLIC_JS = path.resolve(__dirname, '../../public/js');

// Exactly the loading strategy of root test-engine.js: concatenate the two
// files into one function body (no `module`, so the CommonJS tail is skipped)
// and return the top-level consts the browser would see as globals.
function loadWebGlobals(): { Engine: typeof Engine; SEED: typeof SEED } {
  const src =
    fs.readFileSync(path.join(PUBLIC_JS, 'data.js'), 'utf8') +
    fs.readFileSync(path.join(PUBLIC_JS, 'engine.js'), 'utf8') +
    '; return { SEED, Engine };';
  return new Function(src)() as { Engine: typeof Engine; SEED: typeof SEED };
}

const demoItems = (): Item[] => SEED.demo.items.map((it) => ({ ...it }));

describe('shared engine import (M2)', () => {
  const web = loadWebGlobals();

  test('exports the same surface as the browser global', () => {
    expect(Object.keys(Engine).sort()).toEqual(Object.keys(web.Engine).sort());
    expect(SEED.demo.items.map((i) => i.uid)).toEqual(web.SEED.demo.items.map((i) => i.uid));
  });

  test('demo shipment: packing plan matches the web runner', () => {
    const mobile = Engine.planPacking(demoItems(), SEED.boxes, SEED.itemRules);
    const browser = web.Engine.planPacking(web.SEED.demo.items.map((it) => ({ ...it })), web.SEED.boxes, web.SEED.itemRules);
    expect(mobile.boxes.map((b) => [b.boxId, b.group, b.chargeableKg])).toEqual(browser.boxes.map((b) => [b.boxId, b.group, b.chargeableKg]));
    // Same structural assertions the root suite makes.
    expect(mobile.boxes.length).toBeGreaterThanOrEqual(2);
    expect(mobile.boxes.some((b) => b.group === 'padded' && b.contents.some((c) => c.includes('Pickles')))).toBe(true);
    expect(mobile.boxes.every((b) => b.utilization > 0 && b.utilization <= 100)).toBe(true);
  });

  test('demo shipment: chargeable weight, best carrier, and totals match the web runner', () => {
    const items = demoItems();
    const plan = Engine.planPacking(items, SEED.boxes, SEED.itemRules);
    const cost = Engine.costQuotes(plan.boxes, items, SEED.carriers, 'IN-US', 'consumer', SEED.itemRules);

    const wItems = web.SEED.demo.items.map((it) => ({ ...it }));
    const wPlan = web.Engine.planPacking(wItems, web.SEED.boxes, web.SEED.itemRules);
    const wCost = web.Engine.costQuotes(wPlan.boxes, wItems, web.SEED.carriers, 'IN-US', 'consumer', web.SEED.itemRules);

    const chargeable = (p: typeof plan) => Engine.round2(p.boxes.reduce((s, b) => s + b.chargeableKg, 0));
    expect(chargeable(plan)).toBe(chargeable(wPlan));
    expect(cost.quotes.map((q) => [q.carrierId, q.total])).toEqual(wCost.quotes.map((q) => [q.carrierId, q.total]));
    expect(Engine.pickBest(cost.quotes, 'cheapest')?.carrierId).toBe(web.Engine.pickBest(wCost.quotes, 'cheapest')?.carrierId);

    // Pinned values, computed from the web engine on 2026-10-09 — a change here
    // means the shared engine changed, not the mobile app.
    expect(chargeable(plan)).toBe(12.55);
    expect(cost.quotes.length).toBe(5);
    expect(cost.declaredTotal).toBeCloseTo(117, 2);
    expect(cost.fees).toBe(0);
    expect(cost.duties).toBeGreaterThan(0);
    const totals = Object.fromEntries(cost.quotes.map((q) => [q.carrierId, q.total]));
    expect(totals).toEqual({ dhl: 219.01, 'fedex-econ': 190.89, 'ups-saver': 209.5, 'post-ems': 114.63, forwarder: 146.8 });
    expect(Engine.pickBest(cost.quotes, 'cheapest')?.carrierId).toBe('post-ems');
    const lineSum = (q: (typeof cost.quotes)[number]) => q.freight + q.fuel + q.packaging + q.duties + q.fees + q.insurance + q.customs;
    expect(cost.quotes.every((q) => Math.abs(lineSum(q) - q.total) < 0.02)).toBe(true);
  });

  test('business segment adds MPF, as the root suite asserts', () => {
    const items = demoItems();
    const plan = Engine.planPacking(items, SEED.boxes, SEED.itemRules);
    const biz = Engine.costQuotes(plan.boxes, items, SEED.carriers, 'IN-US', 'business', SEED.itemRules);
    expect(biz.fees).toBeGreaterThanOrEqual(31.67);
  });

  test('insightFor hides moderated reports and returns the sparse state under 3 reports', () => {
    const base = { shipmentId: 'shp_1', role: 'sender', stage: 'check', corridor: 'IN-US', ruleIds: ['pickles'], segment: 'consumer', photos: [], submittedAt: '2026-10-09T00:00:00Z', unverified: true as const };
    const reports = [
      { ...base, id: 'rp_1', verdict: 'yes' },
      { ...base, id: 'rp_2', verdict: 'yes', hidden: true },
      { ...base, id: 'rp_3', verdict: 'not_quite' },
    ];
    const ins = Engine.insightFor(reports, 'IN-US', ['pickles']);
    expect(ins.rules.pickles.reports).toBe(2);
    expect(ins.rules.pickles.reports).toBeLessThan(3);
  });
});
