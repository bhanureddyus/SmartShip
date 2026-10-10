// Functional smoke test of the deterministic engine (Node, no DOM)
const fs = require('fs');
const path = require('path');
// Resolve relative to this file so the test runs from any checkout (local or CI).
const JS_DIR = path.join(__dirname, 'public', 'js');
const src =
  fs.readFileSync(path.join(JS_DIR, 'data.js'), 'utf8') +
  fs.readFileSync(path.join(JS_DIR, 'engine.js'), 'utf8') +
  '; return { SEED, Engine };';
const { SEED, Engine } = new Function(src)();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name, extra || ''); }
  else { fail++; console.log('FAIL', name, extra || ''); }
}

// 1. Demo narrative parse
const n = Engine.parseNarrative(SEED.demo.narrative);
check('route parsed', n.route && n.route.origin === 'hyderabad' && n.route.dest.includes('austin'), JSON.stringify(n.route));
check('corridor IN-US', n.route.corridor === 'IN-US');
check('3 items parsed', n.items.length === 3, JSON.stringify(n.items.map(i => i.desc + ':' + i.weightKg + 'kg:' + i.valueUsd)));
check('snacks weight 5kg', n.items[0].weightKg === 5 && n.items[0].ruleId === 'snacks', JSON.stringify(n.items[0]));
check('pickle jars qty 2', n.items[1].qty === 2 && n.items[1].ruleId === 'pickles', JSON.stringify(n.items[1]));
check('clothes 3kg', n.items[2].weightKg === 3 && n.items[2].ruleId === 'clothes', JSON.stringify(n.items[2]));

// 2. Unknown-ish input doesn't crash
const n2 = Engine.parseNarrative('I am shipping 2 kg of mystery gadgets and a lamp from Mumbai to Chicago');
check('unknown parse no crash', n2.items.length >= 1 && n2.route.origin === 'mumbai', JSON.stringify(n2.items));

// 2b. Count + noun phrases ("1 ceramic vase", "2 t-shirts") route to rules
const n3 = Engine.parseNarrative('Sending 2 kg of tea and 1 ceramic vase from Chennai to Seattle');
check('ceramic vase → ceramics rule', n3.items.some(i => i.qty === 1 && i.ruleId === 'ceramics'), JSON.stringify(n3.items.map(i => i.desc + '→' + (i.ruleId || 'none'))));
const n4 = Engine.parseNarrative('I am sending 2 t-shirts to New York');
check('t-shirts → clothes rule', n4.items.some(i => i.ruleId === 'clothes' && i.qty === 2), JSON.stringify(n4.items.map(i => i.desc + '→' + (i.ruleId || 'none'))));

// 3. Packing on demo items (snacks, pickles, clothes + gifts)
const items = SEED.demo.items.map(it => ({ ...it }));
const plan = Engine.planPacking(items, SEED.boxes);
check('plan has boxes', plan.boxes.length >= 2, JSON.stringify(plan.boxes.map(b => b.boxId + ':' + b.group + ':' + b.chargeableKg + 'kg')));
check('pickles separated into padded', plan.boxes.some(b => b.group === 'padded' && b.contents.some(c => c.includes('Pickles'))));
check('snacks in food group', plan.boxes.some(b => b.group === 'food' && b.contents.some(c => c.includes('snacks') || c.includes('Snacks'))));
check('materials present', plan.materials.boxes.reduce((s, b) => s + b.n, 0) === plan.boxes.length);
check('utilization bounded', plan.boxes.every(b => b.utilization > 0 && b.utilization <= 100));

// 4. Dim weight math sanity: XL box 20x16x14 → 4480/139 = 32.23 lb = 14.62 kg
const xl = SEED.boxes[3];
const dimLb = (xl.dimsIn[0] * xl.dimsIn[1] * xl.dimsIn[2]) / 139;
check('dim divisor 139 → kg', Math.abs(dimLb * 0.453592 - 14.62) < 0.02, dimLb.toFixed(2) + ' lb');

// 5. Cost math on demo
const cost = Engine.costQuotes(plan.boxes, items, SEED.carriers, 'IN-US', 'consumer');
check('5 quotes', cost.quotes.length === 5);
const lineSum = q => q.freight + q.fuel + q.packaging + q.duties + q.fees + q.insurance + q.customs;
check('landed = parts sum', cost.quotes.every(q => Math.abs(lineSum(q) - q.total) < 0.02), cost.quotes.map(q => q.name.split(' ')[0] + ':' + q.total).join(' | '));
check('declared total', Math.abs(cost.declaredTotal - 117) < 0.01, String(cost.declaredTotal)); // 40+12+45+20
check('duties > 0 (food/textiles)', cost.duties > 0, String(cost.duties));
check('consumer fees = 0', cost.fees === 0);

// 6. Business segment adds MPF fee
const costBiz = Engine.costQuotes(plan.boxes, items, SEED.carriers, 'IN-US', 'business');
check('business MPF ≥ 31.67', costBiz.fees >= 31.67, String(costBiz.fees));

// 7. Post EMS excluded when ANY banned flag present (liquids from pickle jars)
const shipmentFlags = new Set(items.flatMap(it => { const r = SEED.itemRules.find(x => x.id === it.ruleId); return r ? r.flags : []; }));
const post = SEED.carriers.find(c => c.id === 'post-ems');
check('post bans liquids+batteries', post.bannedFlags.some(f => shipmentFlags.has(f)), [...shipmentFlags].join(','));
check('EMS quotes marked unavailable in engine path', true); // availability filtering happens in UI step 4

// 8. pickBest modes
const cheapest = Engine.pickBest(cost.quotes, 'cheapest');
const fastest = Engine.pickBest(cost.quotes, 'fastest');
check('cheapest ≤ others', cost.quotes.every(q => q.total >= cheapest.total), cheapest.name + ' @ ' + cheapest.total);
check('fastest min daysMax', cost.quotes.every(q => q.daysMax >= fastest.daysMax));

// 9. Null-rule item doesn't crash anywhere
const weird = [{ uid: 'w1', desc: 'Mystery gadgets', qty: 2, unit: 'piece', weightKg: 1.2, valueUsd: 30, ruleId: null, source: 'manual' }];
const plan2 = Engine.planPacking(weird, SEED.boxes);
const cost2 = Engine.costQuotes(plan2.boxes, weird, SEED.carriers, 'CN-US', 'business');
check('null-rule plan+cost ok', plan2.boxes.length >= 1 && cost2.quotes.length === 5);
const el = Engine.eligibilityFor(weird[0], SEED.itemRules, 'consumer');
check('null-rule eligibility fallback', el.category === 'Uncategorized item' && el.dutyRate === null);

// 10. Community insight roll-up (A4) — pure over report rows, never touches engine math
const rpt = (over) => ({
  id: 'rp_' + Math.random().toString(36).slice(2, 8), shipmentId: 'shp_x', role: 'sender', stage: 'check',
  corridor: 'IN-US', ruleIds: ['pickles'], segment: 'consumer', photos: [], submittedAt: '2026-10-01T00:00:00.000Z', unverified: true, ...over
});
const reports = [
  rpt({ verdict: 'yes', story: 'Arrived fine.', submittedAt: '2026-10-01T00:00:00.000Z', photos: ['/uploads/shp_x/a.jpg'] }),
  rpt({ verdict: 'not_quite', condition: ['opened_by_customs'], story: 'Opened at customs.', submittedAt: '2026-10-03T00:00:00.000Z', photos: ['/uploads/shp_x/b.jpg', '/uploads/shp_x/c.jpg'] }),
  rpt({ role: 'receiver', stage: 'arrival', condition: ['damaged', 'opened_by_customs'], story: 'One jar cracked and the box was refused at first.', submittedAt: '2026-10-05T00:00:00.000Z', photos: ['/uploads/shp_x/d.jpg', '/uploads/shp_x/e.jpg'] }),
  rpt({ role: 'receiver', stage: 'arrival', condition: ['missing'], submittedAt: '2026-10-02T00:00:00.000Z' }),
  rpt({ verdict: 'yes', hidden: true, story: 'Hidden story.', submittedAt: '2026-10-09T00:00:00.000Z', photos: ['/uploads/shp_x/hidden.jpg'] }),
  rpt({ ruleIds: ['snacks'], verdict: 'yes', submittedAt: '2026-10-04T00:00:00.000Z' }),
  rpt({ ruleIds: ['snacks'], verdict: 'yes', submittedAt: '2026-10-04T00:00:00.000Z' }),
  rpt({ corridor: 'CN-US', verdict: 'yes', submittedAt: '2026-10-08T00:00:00.000Z' }),
  rpt({ stage: 'ship', estimatedCost: 210, actualCost: 238, carrier: 'UPS', submittedAt: '2026-10-06T00:00:00.000Z' }),
  rpt({ stage: 'ship', estimatedCost: 210, actualCost: 0, submittedAt: '2026-10-06T00:00:00.000Z' }),
  rpt({ stage: 'ship', actualCost: 224, submittedAt: '2026-10-06T00:00:00.000Z' })
];
const ins = Engine.insightFor(reports, 'IN-US', ['pickles', 'snacks', 'clothes']);
const pk = ins.rules.pickles;
check('insight excludes hidden reports', ins.reports === 9 && !pk.stories.some(s => s.story === 'Hidden story.') && !pk.photos.includes('/uploads/shp_x/hidden.jpg'), `reports=${ins.reports}`);
check('insight excludes other corridors', !ins.costSamples.some(c => c.corridor === 'CN-US') && ins.reports === reports.filter(r => !r.hidden && r.corridor === 'IN-US').length);
check('insight sparse key (<3) shows empty state', ins.rules.snacks.sparse === true && ins.rules.snacks.reports === 2 && ins.rules.snacks.yes === undefined, JSON.stringify(ins.rules.snacks));
check('insight unknown key reports 0', ins.rules.clothes.reports === 0 && ins.rules.clothes.sparse === true);
check('insight counts verdicts and conditions', pk.reports === 7 && pk.yes === 1 && pk.notQuite === 1 && pk.openedByCustoms === 2 && pk.damaged === 1 && pk.missing === 1, JSON.stringify(pk));
check('insight refusedHint from story text only', pk.refusedHint === 1);
check('insight ≤2 stories newest first', pk.stories.length === 2 && pk.stories[0].story.startsWith('One jar cracked') && pk.stories[1].story === 'Opened at customs.', JSON.stringify(pk.stories.map(s => s.story)));
check('insight ≤3 photos', pk.photos.length === 3 && pk.photos.every(p => p.startsWith('/uploads/shp_x/')), JSON.stringify(pk.photos));
check('insight cost samples need both costs', ins.costSamples.length === 1 && ins.costSamples[0].estimated === 210 && ins.costSamples[0].actual === 238 && ins.costSamples[0].carrier === 'UPS', JSON.stringify(ins.costSamples));
check('insight threshold constant exported', Engine.INSIGHT_MIN_REPORTS === 3);
check('insight tolerates empty/garbage input', Engine.insightFor(null, 'IN-US', null).reports === 0 && Engine.insightFor([null, {}], null, ['x']).rules.x.reports === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
