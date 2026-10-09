// =============================================================================
// Ship2US — ADMIN VIEW (tabbed demo-data manager)
// Edits are DEMO overrides persisted to the prototype API, never live data.
// UI layer only — same endpoints and data shapes as before.
// =============================================================================
const Admin = (() => {

  let server = { ruleOverrides: null, rateOverrides: null, metaUpdatedAt: null, feedback: [], quotes: [], shipments: [] };
  let rules = [];   // working copies
  let rates = [];
  let tab = 'rules';
  let dirty = false;
  let openIds = new Set(); // which cards are expanded (preserved across re-renders)

  const IC = {
    caret: '<svg class="caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const money = n => '$' + (Math.round((+n || 0) * 100) / 100).toFixed(2);
  const toast = m => { if (window.showToast) showToast(m); };

  async function fetchState() {
    try {
      const r = await fetch('/api/state');
      const j = await r.json();
      server = j.state || server;
      return true;
    } catch (e) { return false; }
  }

  function mergedRules() { return server.ruleOverrides || SEED.itemRules; }
  function mergedRates() { return server.rateOverrides || SEED.carriers; }
  function dataUpdated() { return server.metaUpdatedAt || SEED.meta.dataLastUpdated; }

  function freshness(updatedStr) {
    const days = Math.floor((Date.now() - new Date(updatedStr + 'T00:00:00Z').getTime()) / 86400000);
    return { days, stale: days > 60 };
  }

  function restrictionBadge(level) {
    const cls = level === 'ok' ? 'badge-success' : level === 'caution' ? 'badge-warning' : 'badge-error';
    const label = (SEED.restrictionLevels[level] || {}).label || level;
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  async function render(root) {
    const ok = await fetchState();
    if (!ok) {
      root.innerHTML = `
        <div class="page">
          <div class="step-head"><h2 class="title">Admin</h2><p class="lede">The demo data service isn't reachable right now. The app keeps working with seeded data — reload this page to retry.</p></div>
          <a class="btn btn-secondary" href="#/">${IC.back} Back to the app</a>
        </div>`;
      return;
    }
    rules = JSON.parse(JSON.stringify(mergedRules()));
    rates = JSON.parse(JSON.stringify(mergedRates()));
    dirty = false;
    root.innerHTML = `
      <div class="page page-wide">
        <div class="admin-head">
          <div>
            <div class="eyebrow">Admin</div>
            <h2 class="title">Demo data manager</h2>
            <p class="lede">Seeded tariff rules, restriction flags and sample carrier rates behind the prototype. Everything here is illustrative.</p>
            <div class="row" style="margin-top:var(--space-3);" id="freshBox"></div>
          </div>
          <div class="row">
            <a class="btn btn-ghost" href="#/">${IC.back} Back to app</a>
            <button class="btn btn-secondary" id="btnReset">Restore seed defaults</button>
          </div>
        </div>

        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-tab="rules">Tariff rules</button>
          <button class="tab" role="tab" data-tab="rates">Carrier rates</button>
          <button class="tab" role="tab" data-tab="fb">Feedback &amp; quotes</button>
        </div>
        <div id="tabBody"></div>

        <div class="actionbar"><div class="actionbar-inner">
          <span class="hint" id="dirtyFlag">All changes saved · new estimates use the current data</span>
          <span class="spacer"></span>
          <button class="btn btn-primary" id="btnSave">Save all edits</button>
        </div></div>
      </div>`;

    renderFresh();
    root.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.tab; // edits are kept when switching tabs
      root.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
      renderTab();
    }));
    root.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');

    document.getElementById('btnSave').addEventListener('click', saveAll);
    document.getElementById('btnReset').addEventListener('click', () => {
      const host = document.getElementById('modalHost');
      host.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">
        <h2>Restore seed defaults?</h2>
        <p class="lede">Rule and rate overrides are discarded. Feedback and quote requests are kept.</p>
        <div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mOk">Restore</button></div>
      </div></div>`;
      const close = () => { host.innerHTML = ''; };
      host.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
      host.querySelector('#mCancel').addEventListener('click', close);
      host.querySelector('#mOk').addEventListener('click', () => { close(); resetSeed(); });
    });
    renderTab();
  }

  function renderFresh() {
    const box = document.getElementById('freshBox');
    if (!box) return;
    const u = dataUpdated();
    const f = freshness(u);
    box.innerHTML = `<span class="fresh ${f.stale ? 'stale' : ''}"><span class="dot"></span>Data last updated <b>&nbsp;${esc(u)}</b>&nbsp;· ${f.days} days ago${f.stale ? ' · review recommended' : ''}</span>
      <span class="badge badge-neutral">Seeded demo values, not live data</span>`;
    const fm = document.getElementById('footerMeta');
    if (fm) fm.textContent = 'Demo data · updated ' + u;
  }

  function setDirty(v) {
    dirty = v;
    const d = document.getElementById('dirtyFlag');
    if (d) d.textContent = v ? 'Unsaved edits — save to apply them to new estimates' : 'All changes saved · new estimates use the current data';
  }
  const markDirty = () => setDirty(true);

  function renderTab() {
    const body = document.getElementById('tabBody');
    if (!body) return;
    if (tab === 'rules') renderRules(body);
    else if (tab === 'rates') renderRates(body);
    else renderFeedback(body);
  }

  function bindCards(body) {
    body.querySelectorAll('details.admin-card').forEach(d => {
      d.addEventListener('toggle', () => { if (d.open) openIds.add(d.dataset.id); else openIds.delete(d.dataset.id); });
    });
  }

  const field = (label, inner, span) => `<div class="field ${span || ''}"><span class="field-label">${label}</span>${inner}</div>`;

  // ---------- Tariff rules editor ----------
  function renderRules(body) {
    const flagOpts = Object.keys(SEED.flagInfo);
    body.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:var(--space-3);">
        <p class="muted">${rules.length} categories. Duty rates feed the demo cost math only — tap a category to edit it.</p>
        <button class="btn btn-secondary btn-sm" id="addRule">${IC.plus} Add category</button>
      </div>
      <datalist id="flagList">${flagOpts.map(f => `<option value="${f}"></option>`).join('')}</datalist>
      ${rules.map((r, i) => `
      <details class="admin-card" data-i="${i}" data-id="${esc(r.id)}" ${openIds.has(r.id) ? 'open' : ''}>
        <summary>
          <span class="name">${esc(r.name)}</span>
          <span class="badge badge-neutral">${esc(r.hts)}</span>
          <span class="badge badge-neutral">${(r.dutyRate * 100).toFixed(1)}% duty</span>
          ${restrictionBadge(r.restriction)}
          ${IC.caret}
        </summary>
        <div class="body">
          <div class="admin-grid">
            ${field('Category name', `<input class="input" value="${esc(r.name)}" data-f="name">`, 'span-2')}
            ${field('HTS-style code', `<input class="input" value="${esc(r.hts)}" data-f="hts">`)}
            ${field('Duty rate %', `<input class="input" type="number" step="0.1" min="0" max="200" value="${(r.dutyRate * 100).toFixed(1)}" data-f="dutyPct">`)}
            ${field('Restriction', `<select class="input" data-f="restriction">${Object.entries(SEED.restrictionLevels).map(([k, v]) => `<option value="${k}" ${r.restriction === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
            ${field('Confidence', `<select class="input" data-f="confidence">${['high', 'medium', 'low'].map(c => `<option value="${c}" ${r.confidence === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
            ${field('Source', `<input class="input" value="${esc(r.source)}" data-f="source">`)}
            ${field('Effective date', `<input class="input" type="date" value="${esc(r.effectiveDate)}" data-f="effectiveDate">`)}
            ${field('Restriction flags <span class="muted">(comma-separated)</span>', `<input class="input" value="${esc((r.flags || []).join(', '))}" data-f="flags" list="flagList">`, 'span-2')}
            ${field('Required documents <span class="muted">(comma-separated)</span>', `<input class="input" value="${esc((r.docs || []).join(', '))}" data-f="docs">`, 'span-2')}
            ${field('Consumer framing note', `<textarea class="input" rows="2" data-f="consumerNote">${esc(r.consumerNote)}</textarea>`, 'span-2')}
            ${field('Business framing note', `<textarea class="input" rows="2" data-f="businessNote">${esc(r.businessNote)}</textarea>`, 'span-2')}
          </div>
          <p class="fine">Parser keywords: ${esc((r.keywords || []).join(', ')) || '—'} <button type="button" class="tip" data-tip="Keyword matching is part of the demo parser and is not editable here." aria-label="About keywords">?</button></p>
        </div>
      </details>`).join('')}`;

    body.querySelectorAll('details.admin-card').forEach(card => {
      const i = +card.dataset.i;
      card.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('change', () => {
          const f = inp.dataset.f;
          if (f === 'dutyPct') rules[i].dutyRate = (parseFloat(inp.value) || 0) / 100;
          else if (f === 'flags') rules[i].flags = inp.value.split(',').map(s => s.trim()).filter(s => SEED.flagInfo[s]);
          else if (f === 'docs') rules[i].docs = inp.value.split(',').map(s => s.trim()).filter(Boolean);
          else rules[i][f] = inp.value;
          // keep the collapsed summary in sync without a full re-render
          const s = card.querySelector('summary');
          s.querySelector('.name').textContent = rules[i].name;
          const badges = s.querySelectorAll('.badge');
          badges[0].textContent = rules[i].hts;
          badges[1].textContent = (rules[i].dutyRate * 100).toFixed(1) + '% duty';
          badges[2].outerHTML = restrictionBadge(rules[i].restriction);
          markDirty();
        });
      });
    });
    bindCards(body);
    body.querySelector('#addRule').addEventListener('click', () => {
      const id = 'rule_' + Date.now().toString(36);
      rules.push({
        id, name: 'New category', keywords: [], hts: '0000.00', dutyRate: 0.05,
        source: 'USITC / CBP', effectiveDate: new Date().toISOString().slice(0, 10), confidence: 'low',
        restriction: 'caution', flags: [], volumePerKg: 2.5, valuePerKg: 12,
        docs: ['Itemized invoice'], consumerNote: '', businessNote: ''
      });
      openIds.add(id);
      markDirty();
      renderTab();
      const el = body.querySelector(`details[data-id="${id}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const n = el.querySelector('[data-f="name"]'); if (n) { n.focus(); n.select(); } }
    });
  }

  // ---------- Carrier rates editor ----------
  function renderRates(body) {
    body.innerHTML = `
      <p class="muted" style="margin-bottom:var(--space-3);">Sample rates per corridor. They feed the comparison step and are labeled “illustrative” everywhere in the app.</p>
      <datalist id="flagList2">${Object.keys(SEED.flagInfo).map(f => `<option value="${f}"></option>`).join('')}</datalist>
      ${rates.map((c, i) => {
        const inus = (c.rates || {})['IN-US'] || {};
        return `
      <details class="admin-card" data-i="${i}" data-id="${esc(c.id || c.name)}" ${openIds.has(c.id || c.name) ? 'open' : ''}>
        <summary>
          <span class="name">${esc(c.name)}</span>
          <span class="badge badge-neutral">${esc(c.tier)}</span>
          <span class="badge badge-neutral">IN→US from $${inus.base || 0} + $${inus.perKg || 0}/kg</span>
          ${IC.caret}
        </summary>
        <div class="body">
          <div class="admin-grid">
            ${field('Carrier name', `<input class="input" value="${esc(c.name)}" data-f="name">`, 'span-2')}
            ${field('Service tier', `<input class="input" value="${esc(c.tier)}" data-f="tier">`, 'span-2')}
          </div>
          ${['IN-US', 'CN-US'].map(cor => {
            const r = (c.rates || {})[cor] || { base: 0, perKg: 0, daysMin: 0, daysMax: 0 };
            return `<div class="card-soft">
              <div class="corridor-row">
                <span class="cl">${cor === 'IN-US' ? 'India → US' : 'China → US'}</span>
                ${field('Base $', `<input class="input" type="number" min="0" step="1" value="${r.base}" data-rate="${cor}.base">`)}
                ${field('$ per kg', `<input class="input" type="number" min="0" step="0.1" value="${r.perKg}" data-rate="${cor}.perKg">`)}
                ${field('Days min', `<input class="input" type="number" min="1" value="${r.daysMin}" data-rate="${cor}.daysMin">`)}
                ${field('Days max', `<input class="input" type="number" min="1" value="${r.daysMax}" data-rate="${cor}.daysMax">`)}
              </div>
            </div>`;
          }).join('')}
          <div class="admin-grid">
            ${field('Fuel surcharge %', `<input class="input" type="number" min="0" step="1" value="${Math.round((c.fuelPct || 0) * 100)}" data-f="fuelPct">`)}
            ${field('Insurance %', `<input class="input" type="number" min="0" step="0.1" value="${((c.insuranceRate || 0) * 100).toFixed(1)}" data-f="insPct">`)}
            ${field('Customs fee $', `<input class="input" type="number" min="0" step="1" value="${c.customsFee || 0}" data-f="customsFee">`)}
            ${field('Will not accept <span class="muted">(flags)</span>', `<input class="input" value="${esc((c.bannedFlags || []).join(', '))}" data-f="bannedFlags" list="flagList2">`)}
            ${field('Carrier note <span class="muted">(shown when a shipment hits a banned flag)</span>', `<input class="input" value="${esc(c.banNote || '')}" data-f="banNote">`, 'span-4')}
          </div>
        </div>
      </details>`; }).join('')}`;

    body.querySelectorAll('details.admin-card').forEach(card => {
      const i = +card.dataset.i;
      card.querySelectorAll('[data-rate]').forEach(inp => {
        inp.addEventListener('change', () => {
          const [cor, k] = inp.dataset.rate.split('.');
          if (!rates[i].rates) rates[i].rates = {};
          if (!rates[i].rates[cor]) rates[i].rates[cor] = {};
          rates[i].rates[cor][k] = parseFloat(inp.value) || 0;
          const inus = rates[i].rates['IN-US'] || {};
          card.querySelectorAll('summary .badge')[1].textContent = `IN→US from $${inus.base || 0} + $${inus.perKg || 0}/kg`;
          markDirty();
        });
      });
      card.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('change', () => {
          const f = inp.dataset.f;
          if (f === 'fuelPct') rates[i].fuelPct = (parseFloat(inp.value) || 0) / 100;
          else if (f === 'insPct') rates[i].insuranceRate = (parseFloat(inp.value) || 0) / 100;
          else if (f === 'customsFee') rates[i].customsFee = parseFloat(inp.value) || 0;
          else if (f === 'bannedFlags') rates[i].bannedFlags = inp.value.split(',').map(s => s.trim()).filter(s => SEED.flagInfo[s]);
          else rates[i][f] = inp.value;
          card.querySelector('summary .name').textContent = rates[i].name;
          card.querySelectorAll('summary .badge')[0].textContent = rates[i].tier;
          markDirty();
        });
      });
    });
    bindCards(body);
  }

  // ---------- Feedback & quote requests ----------
  function renderFeedback(body) {
    const fb = server.feedback || [];
    const qt = server.quotes || [];
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title">Post-shipment feedback <span class="badge badge-warning">Unverified community input</span></span>
          <span class="muted">${fb.length} submission${fb.length === 1 ? '' : 's'}</span>
        </div>
        <p class="muted" style="margin-bottom:var(--space-3);">Estimated vs actual outcomes reported by demo users. Kept separate from seeded data — never merged into the rule set without review.</p>
        ${fb.length ? fb.slice().reverse().map(f => {
          const delta = (+f.actualCost || 0) - (+f.estimatedCost || 0);
          return `
          <div class="fb-card">
            <div class="head">
              <span class="strong">${esc(f.carrier || 'Unspecified carrier')}</span>
              <span class="badge badge-warning">Unverified</span>
              <span class="badge badge-neutral">${esc(f.segment || 'consumer')}</span>
              <span class="spacer"></span>
              <span class="muted">${esc((f.submittedAt || '').slice(0, 10))}</span>
            </div>
            <div class="facts">
              <span>Estimated <b>${money(f.estimatedCost)}</b> · actual <b>${money(f.actualCost)}</b>${f.estimatedCost ? ` <b class="${delta > 0 ? 'delta-up' : 'delta-down'}">(${delta >= 0 ? '+' : ''}${money(delta)})</b>` : ''}</span>
              <span>Delay <b>${esc(f.delay || 'none')}</b></span>
              <span>Inspected <b>${f.inspected === 'yes' ? 'yes' : 'no'}</b></span>
              <span>Damage <b>${esc(f.damage || 'none')}</b></span>
            </div>
            ${f.comments ? `<q>${esc(f.comments)}</q>` : ''}
          </div>`; }).join('') : '<div class="empty">No feedback yet. It appears here the moment someone submits the post-shipment form.</div>'}
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Quote requests <span class="badge badge-neutral">Demo capture</span></span>
          <span class="muted">${qt.length} request${qt.length === 1 ? '' : 's'}</span>
        </div>
        ${qt.length ? qt.slice().reverse().map(q => `
          <div class="fb-card">
            <div class="head"><span class="strong">${esc(q.carrierName || 'Carrier')}</span><span class="spacer"></span><span class="muted">${esc((q.requestedAt || '').slice(0, 10))}</span></div>
            <div class="facts"><span>Estimate shown <b>${money(q.estTotal)}</b></span>${q.email ? `<span>Contact <b>${esc(q.email)}</b></span>` : ''}</div>
          </div>`).join('') : '<div class="empty">No quote requests yet.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Saved shipment drafts</span><span class="muted">${(server.shipments || []).length} on the server</span></div>
        <p class="muted">Drafts persist server-side as users move through the journey — the prototype keeps the latest 25.</p>
      </div>`;
  }

  // ---------- Save / reset ----------
  async function saveAll() {
    const btn = document.getElementById('btnSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const [a, b] = await Promise.all([
        fetch('/api/rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules }) }),
        fetch('/api/rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates }) })
      ]);
      if (!a.ok || !b.ok) throw new Error('save failed');
      setDirty(false);
      await fetchState();
      renderFresh();
      toast('Saved. Data last updated set to ' + dataUpdated() + '.');
    } catch (e) {
      toast('Could not save — the demo service is unreachable. Your edits stay on this screen.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save all edits'; }
    }
  }

  async function resetSeed() {
    try {
      const r = await fetch('/api/reset', { method: 'POST' });
      if (!r.ok) throw new Error();
      toast('Seed defaults restored.');
      openIds = new Set();
      render(document.getElementById('appRoot'));
    } catch (e) {
      toast('Could not reset — the demo service is unreachable.');
    }
  }

  return { render };
})();
