// =============================================================================
// SmartShip MVP — DETERMINISTIC RULES ENGINE
// All math here is deterministic. "AI" flavor lives in the UI and is clearly
// labeled as simulated. No network calls, no randomness in any cost path.
// =============================================================================

const Engine = (() => {

  const LB_PER_KG = 2.20462;
  const KG_PER_LB = 0.453592;
  const DIM_DIVISOR = 139; // imperial divisor: inches → pounds
  const L_TO_CUIN = 61.024;

  // ---------- utilities ----------
  const round2 = n => Math.round(n * 100) / 100;

  // ---------- 1. Natural-language parser (demo-grade, rule based) ----------
  const CITY_COUNTRY = {
    hyderabad: 'IN', mumbai: 'IN', 'new delhi': 'IN', delhi: 'IN', bengaluru: 'IN', bangalore: 'IN',
    chennai: 'IN', kolkata: 'IN', pune: 'IN', shanghai: 'CN', shenzhen: 'CN', beijing: 'CN', guangzhou: 'CN'
  };

  const UNIT_WORDS = {
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
    g: 'g', gram: 'g', grams: 'g',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', ltr: 'l', ltrs: 'l',
    jar: 'jar', jars: 'jar', box: 'box', boxes: 'box', pack: 'pack', packs: 'pack',
    piece: 'piece', pieces: 'piece', item: 'piece', items: 'piece', unit: 'piece', units: 'piece',
    bottle: 'bottle', bottles: 'bottle', can: 'can', cans: 'can', bag: 'bag', bags: 'bag'
  };

  function parseNarrative(text) {
    const out = { route: null, items: [], unknown: [], raw: text };
    if (!text || !text.trim()) return out;
    let t = ' ' + text.toLowerCase().replace(/[’']/g, "'") + ' ';

    // Route: "... from <city> to <place>" (primary) or "... to <place>" (destination-only)
    const m = t.match(/from\s+([a-z\s]{3,30}?)\s+to\s+([a-z\s,]{3,40})/);
    let routeIdx = -1, routeLen = 0;
    if (m) {
      const origin = m[1].trim().replace(/[^a-z\s]/g, '').trim();
      let dest = m[2].split(/,|\.|!|\?|;| and /)[0].trim();
      const country = CITY_COUNTRY[origin] || null;
      out.route = {
        origin,
        dest,
        originCountry: country || 'IN',
        corridor: country === 'CN' ? 'CN-US' : 'IN-US'
      };
      routeIdx = m.index; routeLen = m[0].length;
    } else {
      const m2 = t.match(/\bto\s+([a-z\s]{3,30})\s*[.!?]?\s*$/);
      if (m2) {
        out.route = { origin: null, dest: m2[1].trim(), originCountry: 'IN', corridor: 'IN-US' };
        routeIdx = m2.index; routeLen = m2[0].length;
      }
    }

    // Split into clauses on commas and ' and '
    let clauses = t.replace(/^.*?(?:shipping|send|sending|carry)?\s*/, '');
    if (out.route) clauses = t.slice(0, routeIdx) + ' ' + t.slice(routeIdx + routeLen);
    clauses = clauses
      .replace(/\b(?:i'?m|we'?re|we are|i am|plan(?:ning)? to|want to|need to)\b/g, ' ')
      .replace(/\b(?:shipping|ship|send|sending)\b/g, ' ')
      .replace(/,?\s*and\s+/g, ', ')
      .replace(/\bin all\b|\btotal\b|\bplease\b/g, ' ')
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    let uid = 1;
    for (const clause of clauses) {
      if (!clause || clause === 'from' || clause === 'to') continue;
      const item = parseClause(clause);
      if (item) { item.uid = 'p' + (uid++); out.items.push(item); }
      else out.unknown.push(clause);
    }
    return out;
  }

  function parseClause(clause) {
    clause = clause.replace(/^(?:of|some|my|the|a|an)\s+/, '');

    // Pattern A: "<n> <weight/vol unit> of <name>"
    let m = clause.match(/(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|g|grams?|lbs?|pounds?|litres?|liters?|ltrs?|l)\s+(?:of\s+)?([a-z\s\-']{2,60})/);
    if (m) {
      const num = parseFloat(m[1]);
      const unitRaw = m[2];
      let name = m[3].trim();
      const kind = UNIT_WORDS[unitRaw] || unitRaw;
      let weightKg = null;
      if (['kg', 'g', 'lb'].includes(kind)) {
        if (kind === 'kg') weightKg = num;
        else if (kind === 'g') weightKg = num / 1000;
        else weightKg = num * KG_PER_LB;
      } else if (kind === 'l') {
        weightKg = num; // treat litres≈kg for liquids, user can correct
      }
      const rule = matchRule(name);
      const qtyLabel = ['kg', 'g', 'lb', 'l'].includes(kind) ? 'kg' : 'piece';
      const qty = ['kg', 'g', 'lb', 'l'].includes(kind) ? round2(weightKg) : num;
      const item = makeItem(name, qty, qtyLabel, weightKg || round2(num), rule, 'parsed');
      if (['kg', 'g', 'lb', 'l'].includes(kind)) item.desc = rule ? rule.name : titleCase(name);
      return item;
    }

    // Pattern B: "<n> [adjectives] <container> [of <name>]"
    // e.g. "2 pickle jars", "2 homemade pickle jars", "2 jars of pickles", "3 packs of biscuits"
    m = clause.match(/(\d+)\s+((?:[a-z][a-z'\-]*\s+){0,3})?(jars?|boxes?|packs?|pieces?|items?|units?|bottles?|cans?|bags?|tins?)\b(?:\s+of\s+([a-z\s\-']{2,60}))?/);
    if (m) {
      const qty = parseInt(m[1]);
      const adj = (m[2] || '').trim();
      const cont = m[3];
      const ofName = (m[4] || '').trim();
      const rule = matchRule(ofName || (adj ? adj + ' ' + cont : cont));
      const desc = ofName
        ? (rule ? rule.name : ofName)
        : (adj ? (adj + ' ' + cont) : cont);
      const w = ((rule && rule.defaultWeightKgPerUnit) || 0.5) * qty;
      return makeItem(desc, qty, UNIT_WORDS[cont] || 'piece', round2(w), rule, 'parsed');
    }

    // Pattern C: "<name> <n> <container>" e.g. "pickle jars 2" (rare)
    m = clause.match(/([a-z\s\-']{2,40}?)\s+(\d+)\s*(jars?|boxes?|packs?|pieces?|items?|bottles?)$/);
    if (m) {
      const qty = parseInt(m[2]);
      const name = (m[1] + ' ' + m[3]).trim();
      const rule = matchRule(m[1]);
      const w = ((rule && rule.defaultWeightKgPerUnit) || 0.5) * qty;
      return makeItem(name, qty, m[3], round2(w), rule, 'parsed');
    }

    // Pattern D: "<n> <name>" e.g. "1 ceramic vase", "2 t-shirts", "3 gifts"
    m = clause.match(/^(\d+)\s+((?:[a-z][a-z'\-]*\s+){0,3}[a-z][a-z'\-]*)$/);
    if (m) {
      const qty = parseInt(m[1]);
      const name = m[2].trim();
      if (!/\b(from|to|and|or|with)\b/.test(name)) {
        const rule = matchRule(name);
        const w = ((rule && rule.defaultWeightKgPerUnit) || 0.5) * qty;
        return makeItem(rule ? rule.name : titleCase(name), qty, 'piece', round2(w), rule, 'parsed');
      }
    }

    // Pattern E: bare item name → 1 piece
    const name = clause.replace(/^(?:and|also)\s+/, '').trim();
    if (name.length >= 2 && /^[a-z]/.test(name)) {
      const rule = matchRule(name);
      return makeItem(name, 1, 'piece', ((rule && rule.defaultWeightKgPerUnit) || 0.5), rule, 'parsed');
    }
    return null;
  }

  // Keyword → rule matching (longest keyword hit wins)
  function matchRule(name) {
    const n = ' ' + name.toLowerCase() + ' ';
    let best = null, bestLen = 0;
    for (const rule of SEED.itemRules) {
      for (const kw of rule.keywords) {
        if (n.includes(kw) && kw.length > bestLen) { best = rule; bestLen = kw.length; }
      }
    }
    return best || null;
  }

  function estimateValue(rule, weightKg, qty, unit) {
    if (!rule) return round2(qty * (VALUE_DEFAULTS.perUnit));
    if (unit === 'kg' || unit === 'l') {
      return round2(weightKg * (rule.valuePerKg || VALUE_DEFAULTS.perKg));
    }
    return round2(qty * (rule.valuePerUnit || VALUE_DEFAULTS.perUnit));
  }

  function makeItem(desc, qty, unit, weightKg, rule, source) {
    const weight = weightKg != null && weightKg > 0 ? round2(weightKg) : (rule ? (rule.defaultWeightKgPerUnit || 0.5) * qty : 0.5 * qty);
    return {
      uid: 'it_' + Math.random().toString(36).slice(2, 9),
      desc: titleCase(desc),
      qty, unit,
      weightKg: round2(weight),
      valueUsd: estimateValue(rule, weight, qty, unit),
      ruleId: rule ? rule.id : null,
      source
    };
  }

  function titleCase(s) {
    return s.replace(/\b([a-z])/g, (c, p) => p.toUpperCase()).replace(/\bKg\b|\bLb\b/g, m => m.toLowerCase());
  }

  // ---------- 2. Eligibility (deterministic lookups) ----------
  function eligibilityFor(item, rules, segment) {
    const rule = rules.find(r => r.id === item.ruleId) || null;
    if (!rule) {
      return {
        category: 'Uncategorized item',
        hts: '—', dutyRate: null, flags: [], restriction: 'caution',
        docs: ['Itemized invoice', 'Detailed description (add one for a category estimate)'],
        note: segment === 'business'
          ? 'We could not match this item to a category yet. A precise description on the invoice helps the broker classify it.'
          : 'We could not match this item to a category yet — add a short description (what it is, what it is made of) and we will estimate it.',
        effectiveDate: null, source: null, confidence: null
      };
    }
    return {
      category: rule.name, hts: rule.hts, dutyRate: rule.dutyRate,
      flags: rule.flags || [], restriction: rule.restriction,
      docs: rule.docs || [],
      note: segment === 'business' ? rule.businessNote : rule.consumerNote,
      effectiveDate: rule.effectiveDate, source: rule.source, confidence: rule.confidence
    };
  }

  // ---------- 3. Packing planner ----------
  // Separation rule: fragile/liquids → padded box; food → food box; general → general box
  function planPacking(items, boxes, rules) {
    rules = rules || SEED.itemRules;
    const groups = { padded: [], food: [], general: [] };
    for (const it of items) {
      const rule = rules.find(r => r.id === it.ruleId);
      const flags = rule ? (rule.flags || []) : [];
      if (flags.includes('fragile') || flags.includes('liquids')) groups.padded.push({ item: it, flags });
      else if (flags.includes('food') || flags.includes('agricultural')) groups.food.push({ item: it, flags });
      else groups.general.push({ item: it, flags });
    }

    const boxVolume = b => b.dimsIn[0] * b.dimsIn[1] * b.dimsIn[2];
    const itemVolume = (it) => {
      const rule = rules.find(r => r.id === it.ruleId);
      const perKg = rule ? rule.volumePerKg : 2.5;
      return round2(it.weightKg * perKg * L_TO_CUIN); // cubic inches
    };

    const plan = { boxes: [], materials: {}, notes: [], splitHint: null, groups: [] };
    let boxSeq = 1;

    const GROUP_META = {
      padded: { label: 'Fragile & liquids', note: 'Packed with double cushioning, sealed liners for liquids, and “Fragile” labels on all sides.' },
      food:   { label: 'Food items',        note: 'Food is packed away from clothing and electronics, in a liner bag, sealed tight to keep smells and spills in.' },
      general:{ label: 'Clothing & general', note: 'Soft goods are folded tight to save space; heavier items sit at the bottom.' }
    };

    for (const [key, groupItems] of Object.entries(groups)) {
      if (!groupItems.length) continue;
      const totalW = groupItems.reduce((s, g) => s + g.item.weightKg, 0);
      const totalV = groupItems.reduce((s, g) => s + itemVolume(g.item), 0);
      plan.groups.push({ key, label: GROUP_META[key].label, weightKg: round2(totalW), items: groupItems.map(g => g.item.desc + ' ×' + g.item.qty) });

      // Greedy fill: pick the smallest box that can hold a full group if possible,
      // otherwise chunk into boxes by weight & volume capacity.
      let remaining = groupItems.map(g => ({ ...g.item, vol: itemVolume(g.item) }));
      while (remaining.length) {
        // choose box: smallest that fits remaining weight OR a chunk
        const cand = boxes.slice().sort((a, b) => boxVolume(a) - boxVolume(b));
        let chosen = cand[0];
        for (const b of cand) {
          const w = remaining.reduce((s, r) => s + r.weightKg, 0);
          const v = remaining.reduce((s, r) => s + r.vol, 0);
          if (w <= b.maxKg && v <= boxVolume(b) * 0.92) { chosen = b; break; }
        }
        // fill greedily
        const inBox = [];
        let usedW = 0, usedV = 0;
        const wLimit = chosen.maxKg, vLimit = boxVolume(chosen) * 0.92;
        // heaviest-first for balance
        remaining.sort((a, b) => b.weightKg - a.weightKg);
        for (const r of remaining) {
          if (usedW + r.weightKg <= wLimit && usedV + r.vol <= vLimit) {
            inBox.push(r); usedW += r.weightKg; usedV += r.vol;
          }
        }
        if (!inBox.length) {
          // single item too big for chosen box — force into largest box
          const big = remaining.sort((a, b) => b.weightKg - a.weightKg)[0];
          const bigBox = boxes[boxes.length - 1];
          inBox.push(big); usedW = big.weightKg; usedV = big.vol;
          remaining = remaining.filter(r => r !== big);
          plan.boxes.push(makeBoxPlan(boxSeq++, bigBox, key, inBox, usedW, usedV, boxVolume(bigBox), GROUP_META[key].note, true));
          continue;
        }
        remaining = remaining.filter(r => !inBox.includes(r));
        plan.boxes.push(makeBoxPlan(boxSeq++, chosen, key, inBox, usedW, usedV, boxVolume(chosen), GROUP_META[key].note, false));
      }
    }

    // Overweight → split-shipment hint
    const heaviest = Math.max(...plan.boxes.map(b => b.actualKg));
    if (plan.boxes.length >= 3) {
      plan.splitHint = 'Three or more boxes: many forwarders price 2+ box shipments better than couriers, and separate food boxes reduce inspection risk for the rest of your shipment.';
    } else if (heaviest > 20) {
      plan.splitHint = 'A box is over 20 kg — consider splitting it. Lighter boxes move through handling faster and cost less per kg.';
    }

    // Materials list
    const mats = plan.boxes.reduce((acc, b) => {
      acc[b.boxId] = (acc[b.boxId] || 0) + 1;
      return acc;
    }, {});
    plan.materials = {
      boxes: Object.entries(mats).map(([id, n]) => ({ label: (boxes.find(b => b.id === id) || {}).name || id, n })),
      tapeRolls: Math.max(1, Math.ceil(plan.boxes.length / 2)),
      bubbleWrapRolls: plan.boxes.filter(b => b.group === 'padded').length,
      linerBags: plan.boxes.filter(b => b.group === 'food').length,
      labels: plan.boxes.length * 2
    };
    return plan;
  }

  function makeBoxPlan(seq, box, group, contents, usedW, usedV, boxVol, note, forceBig) {
    const dimLb = (box.dimsIn[0] * box.dimsIn[1] * box.dimsIn[2]) / DIM_DIVISOR;
    const dimKg = round2(dimLb * KG_PER_LB);
    const actualKg = round2(usedW + box.tareKg);
    return {
      seq, boxId: box.id, boxName: box.name, dimsIn: box.dimsIn, tareKg: box.tareKg,
      group, groupNote: note, forced: forceBig,
      contents: contents.map(c => `${c.desc} ×${c.qty}`),
      actualKg, dimKg,
      chargeableKg: round2(Math.max(actualKg, dimKg)),
      utilization: Math.min(100, Math.round((usedV / boxVol) * 100))
    };
  }

  // ---------- 4. Landed-cost math ----------
  const MPF = { rate: 0.003464, min: 31.67, max: 614.35 }; // merchandise processing fee (formal entries)

  function costQuotes(boxes, items, carriers, corridor, segment, rules) {
    rules = rules || SEED.itemRules;
    const chargeableKg = boxes.reduce((s, b) => s + b.chargeableKg, 0);
    const packagingCost = boxes.reduce((s, b) => {
      const box = SEED.boxes.find(x => x.id === b.boxId);
      const cushion = b.group === 'padded' ? 4 : 1.5;
      return s + (box ? box.cost : 2) + cushion;
    }, 0);

    const declaredTotal = items.reduce((s, i) => s + i.valueUsd, 0);

    // Duties & fees per item via rules
    const dutyLines = items.map(i => {
      const rule = rules.find(r => r.id === i.ruleId);
      const rate = rule ? rule.dutyRate : 0.06;
      return { item: i.desc, value: i.valueUsd, rate, duty: round2(i.valueUsd * rate) };
    });
    const duties = round2(dutyLines.reduce((s, d) => s + d.duty, 0));

    // Fees: commercial formal entries carry a processing fee; personal shipments don't in this model
    let fees = 0;
    if (segment === 'business' && declaredTotal > 0) {
      fees = Math.min(MPF.max, Math.max(MPF.min, round2(declaredTotal * MPF.rate)));
    }

    const quotes = carriers.map(c => {
      const r = (c.rates || {})[corridor] || Object.values(c.rates || {})[0] || { base: 30, perKg: 7, daysMin: 5, daysMax: 9 };
      const freight = round2(r.base + r.perKg * chargeableKg);
      const fuel = round2(freight * (c.fuelPct || 0));
      const insurance = round2(Math.max(c.insuranceMin || 0, declaredTotal * (c.insuranceRate || 0.01)));
      const customs = c.customsFee || 0;
      const total = round2(freight + fuel + packagingCost + duties + fees + insurance + customs);
      return {
        carrierId: c.id, name: c.name, tier: c.tier,
        freight, fuel, packaging: round2(packagingCost), duties, fees, insurance, customs,
        total, daysMin: r.daysMin, daysMax: r.daysMax,
        tracking: c.tracking, features: c.features || [],
        customsIncluded: c.customsIncluded || null,
        quoteLabel: c.quoteLabel || 'Illustrative estimate — request a live quote'
      };
    });
    return { quotes, chargeableKg: round2(chargeableKg), packagingCost: round2(packagingCost), duties, fees, declaredTotal: round2(declaredTotal), dutyLines };
  }

  function pickBest(quotes, mode) {
    const eligible = quotes;
    if (!eligible.length) return null;
    if (mode === 'cheapest') return eligible.reduce((a, b) => (b.total < a.total ? b : a));
    if (mode === 'fastest') return eligible.reduce((a, b) => (b.daysMax < a.daysMax ? b : a));
    // balance: normalized cost + time
    const minC = Math.min(...eligible.map(q => q.total)), maxC = Math.max(...eligible.map(q => q.total));
    const minT = Math.min(...eligible.map(q => q.daysMax)), maxT = Math.max(...eligible.map(q => q.daysMax));
    const score = q => ((q.total - minC) / (maxC - minC || 1)) + ((q.daysMax - minT) / (maxT - minT || 1));
    return eligible.reduce((a, b) => (score(b) < score(a) ? b : a));
  }

  return { parseNarrative, matchRule, makeItem, eligibilityFor, planPacking, costQuotes, pickBest, round2, DIM_DIVISOR };
})();
