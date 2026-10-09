// =============================================================================
// Ship2US — main app (journey, persistence, simulated AI, feedback)
// Deterministic engine does all math. Photo "AI" is a labeled demo heuristic.
// UI layer only — engine.js / data.js are untouched.
// =============================================================================

(() => {
  const LS_KEY = 'ship2us_state_v1';
  const STEPS = [
    { key: 'describe', label: 'Describe' },
    { key: 'check', label: 'Check' },
    { key: 'pack', label: 'Pack' },
    { key: 'cost', label: 'Cost' },
    { key: 'ship', label: 'Ship' }
  ];
  let offline = false;
  let serverState = null;
  let saveTimer = null;
  let editingUid = null;      // item currently expanded for editing (UI only)

  let state = newState();
  function newState() {
    return {
      id: 'shp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
      updatedAt: null
    };
  }

  // ---------- icons (inline, stroke-based) ----------
  const I = {
    spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    stop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4m0-4h.01"/></svg>',
    box: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v8"/></svg>',
    shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>',
    food: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h14l-1.5 9h-11z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    shirt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 4-5 3 2 4 2-1v10h10V10l2 1 2-4-5-3a3 3 0 0 1-8 0z"/></svg>',
    camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pencil: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/></svg>',
    play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    scissors: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>'
  };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const money = n => '$' + (Math.round((+n || 0) * 100) / 100).toFixed(2);
  const money0 = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
  window.showToast = showToast;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function openModal(html) {
    const host = document.getElementById('modalHost');
    host.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    host.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    return host;
  }
  function closeModal() { document.getElementById('modalHost').innerHTML = ''; }
  function tip(text) { return `<button type="button" class="tip" data-tip="${esc(text)}" aria-label="${esc(text)}">?</button>`; }
  function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  // tap-to-toggle tooltips on touch devices
  document.addEventListener('click', e => {
    const t = e.target.closest('.tip');
    document.querySelectorAll('.tip.open').forEach(x => { if (x !== t) x.classList.remove('open'); });
    if (t) t.classList.toggle('open');
  });

  window.__ss = { get serverState() { return serverState; }, getRules, get state() { return state; } };

  function getRules() { return (serverState && serverState.ruleOverrides) || SEED.itemRules; }
  function getCarriers() { return (serverState && serverState.rateOverrides) || SEED.carriers; }
  function dataUpdated() { return (serverState && serverState.metaUpdatedAt) || SEED.meta.dataLastUpdated; }
  function ruleOf(item) { return getRules().find(r => r.id === item.ruleId) || null; }
  function flagsOf(item) { const r = ruleOf(item); return r ? (r.flags || []) : []; }
  function totalKg() { return state.items.reduce((s, i) => s + (+i.weightKg || 0), 0); }

  // ---------- persistence ----------
  function saveState() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked — keep going */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistServer, 800);
  }
  async function persistServer() {
    try {
      const r = await fetch('/api/shipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipment: { ...state } }) });
      const j = await r.json();
      if (j.ok) offline = false;
    } catch (e) { offline = true; }
  }

  async function boot() {
    try {
      const r = await fetch('/api/state');
      const j = await r.json();
      serverState = j.state || null;
    } catch (e) { offline = true; }

    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { restored = null; }
    if (restored && restored.view && (restored.items || []).length) {
      state = { ...newState(), ...restored };
      if (state.view === 'wizard') showToast('Welcome back — your draft is right where you left it.');
    }
    const fm = document.getElementById('footerMeta');
    if (fm) fm.textContent = 'Demo data · updated ' + dataUpdated();
    if (offline) showToast('Offline demo mode — your draft saves to this browser only.');
    route();
  }

  // ---------- router ----------
  function route() {
    const hash = location.hash || '#/';
    const root = document.getElementById('appRoot');
    const receiverMatch = hash.match(/^#\/r\/([A-Za-z0-9_-]+)$/);
    setChrome(!receiverMatch);
    if (receiverMatch) { renderReceiver(root, receiverMatch[1]); return; }
    document.getElementById('navAdmin').classList.toggle('active', hash.startsWith('#/admin'));
    document.getElementById('navAbout').classList.toggle('active', hash.startsWith('#/about'));
    if (hash.startsWith('#/admin')) { Admin.render(root); return; }
    if (hash.startsWith('#/about')) { renderAbout(root); return; }
    if (hash.startsWith('#/estimate')) {
      if (state.view !== 'wizard') { state.view = 'wizard'; state.step = 0; saveState(); }
      renderWizard(root); return;
    }
    if (state.view === 'wizard') { renderWizard(root); return; }
    renderLanding(root);
  }
  window.addEventListener('hashchange', route);

  // ---------- LANDING ----------
  function renderLanding(root) {
    const hasDraft = state.items.length > 0;
    root.innerHTML = `
      <div class="page page-wide">
        <section class="hero">
          <h1>Ship smarter.<span class="accent-text">Know before you ship.</span></h1>
          <p class="sub">Get an intelligent estimate for your international shipment in minutes — what you can ship, how to pack it, and what it will really cost.</p>
          <div class="hero-ctas">
            <button class="btn btn-primary btn-lg" id="ctaStart">${hasDraft ? 'Continue my estimate' : 'Start my estimate'} ${I.arrow}</button>
            <button class="btn btn-secondary btn-lg" id="ctaDemo">${I.play} Try the demo</button>
          </div>
          <div class="hero-pills">
            <span class="chip">🇮🇳 India → United States</span>
            <span class="chip">🇨🇳 China → United States</span>
            <span class="chip">Personal &amp; small business</span>
          </div>
        </section>

        <div class="page">
          <div class="card demo-card" id="ctaDemo2" role="button" tabindex="0">
            <div class="ic">${I.play}</div>
            <div style="flex:1;min-width:0;">
              <div class="t">See it with a real shipment: Hyderabad → Austin</div>
              <div class="s">5 kg of snacks, 2 homemade pickle jars, 3 kg of clothes, and a couple of gifts — food rules, packing, and a full cost picture in about two minutes.</div>
            </div>
            <span class="arrow">${I.arrow}</span>
          </div>
        </div>

        <div class="journey">
          ${[
            ['Describe', 'Type it like you’d say it. We make the list.'],
            ['Check', 'Plain answers on what may get a second look.'],
            ['Pack', 'Boxes and cushioning sized to not pay for air.'],
            ['Cost', 'Shipping, duties, insurance — one honest number.'],
            ['Ship', 'Checklists, a declaration draft, your next move.']
          ].map(([t, d], i) => `<div class="j"><div class="n">${i + 1}</div><div class="t">${t}</div><div class="d">${d}</div></div>`).join('')}
        </div>

        <p class="fine" style="text-align:center;margin-top:var(--space-8);">Clickable prototype with seeded rules, sample rates, and a simulated photo scan. Nothing here is a live quote or a customs decision.</p>
      </div>`;

    root.querySelector('#ctaStart').addEventListener('click', () => startWizard(hasDraft ? 'resume' : null));
    root.querySelector('#ctaDemo').addEventListener('click', () => startWizard(loadDemo()));
    const d2 = root.querySelector('#ctaDemo2');
    d2.addEventListener('click', () => startWizard(loadDemo()));
    d2.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startWizard(loadDemo()); } });
  }

  function loadDemo() {
    const d = SEED.demo;
    const s = newState();
    s.view = 'wizard';
    s.segment = d.segment;
    s.originCountry = d.route.originCountry;
    s.origin = d.route.origin;
    s.dest = d.route.dest;
    s.corridor = d.route.corridor;
    s.narrative = d.narrative;
    s.items = d.items.map(it => ({ ...it, uid: 'it_' + Math.random().toString(36).slice(2, 9) }));
    return s;
  }

  function startWizard(preset) {
    if (preset === 'resume') {
      state.view = 'wizard';
    } else if (preset) {
      state = preset;
      showToast('Demo loaded — walk through the five steps.');
    } else {
      state = newState();
      state.view = 'wizard';
    }
    editingUid = null;
    saveState();
    if (location.hash !== '#/estimate') { location.hash = '#/estimate'; return; }
    renderWizard(document.getElementById('appRoot'));
  }

  function goStep(n) {
    state.step = Math.min(4, Math.max(0, n));
    editingUid = null;
    saveState();
    renderWizard(document.getElementById('appRoot'));
    scrollTop();
  }

  // ---------- WIZARD shell ----------
  function renderWizard(root) {
    const step = Math.min(4, Math.max(0, state.step));
    const routeLabel = state.dest ? `${esc(state.origin)} → ${esc(state.dest)}` : esc(state.origin) + ' → …';
    root.innerHTML = `
      <div class="page">
        <div class="stepper" role="list">
          ${STEPS.map((s, i) => `<div class="s ${i < step ? 'done' : ''} ${i === step ? 'current' : ''}" data-step="${i}" role="listitem" aria-current="${i === step ? 'step' : 'false'}"><span class="n">${i < step ? I.check.replace('width="18" height="18"', 'width="13" height="13"') : i + 1}</span><span class="l">${s.label}</span></div>`).join('')}
        </div>
        ${step > 0 ? `<div class="step-context"><b>${routeLabel}</b> · ${state.items.length} item${state.items.length === 1 ? '' : 's'} · ${totalKg().toFixed(1)} kg · ${state.segment === 'business' ? 'Small business' : 'Personal'}</div>` : ''}
        <div class="step-body" id="stepBody"></div>
        <div class="actionbar"><div class="actionbar-inner">
          <button class="btn btn-ghost" id="navBack">${I.back} ${step === 0 ? 'Home' : 'Back'}</button>
          <span class="hint" id="navHint"></span>
          ${step < 4 ? `<button class="btn btn-primary btn-lg" id="navNext">${['See if I can ship it', 'Plan the packing', 'Compare costs', 'Continue with selected'][step]} ${I.arrow}</button>` : `<button class="btn btn-secondary" id="navNew">Start another estimate</button>`}
        </div></div>
      </div>`;

    const body = root.querySelector('#stepBody');
    [renderStepDescribe, renderStepEligibility, renderStepPacking, renderStepCost, renderStepShip][step](body);

    root.querySelectorAll('.stepper .s.done').forEach(el => el.addEventListener('click', () => goStep(+el.dataset.step)));
    root.querySelector('#navBack').addEventListener('click', () => {
      if (step === 0) { state.view = 'landing'; saveState(); location.hash = '#/'; return; }
      goStep(step - 1);
    });
    const next = root.querySelector('#navNext');
    if (next) next.addEventListener('click', () => {
      const guard = stepGuards[step];
      if (guard && !guard(body)) return;
      goStep(step + 1);
    });
    const nw = root.querySelector('#navNew');
    if (nw) nw.addEventListener('click', () => {
      openConfirm('Start another estimate?', 'This clears the current draft. Your feedback and quote requests are already saved.', 'Start fresh', () => {
        state = newState(); state.view = 'wizard'; editingUid = null; saveState(); renderWizard(root); scrollTop();
      });
    });
    updateHint();
  }

  function updateHint() {
    const h = document.getElementById('navHint');
    if (!h) return;
    if (state.step === 0) {
      if (!state.items.length) h.textContent = 'Add at least one item to continue';
      else if (!state.dest) h.textContent = 'Pick a destination to continue';
      else if (state.pending.length) h.textContent = 'Confirm or dismiss the suggestions first';
      else h.textContent = `${state.items.length} item${state.items.length === 1 ? '' : 's'} · ${totalKg().toFixed(1)} kg`;
    } else if (state.step === 3) {
      const q = state.cost && state.cost.quotes.find(x => x.carrierId === state.chosen);
      h.textContent = q ? `Selected: ${q.name}` : 'Pick an option, or continue with our pick';
    } else h.textContent = '';
  }

  function openConfirm(title, body, cta, onOk) {
    const host = openModal(`<h2>${esc(title)}</h2><p class="lede">${esc(body)}</p><div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mOk">${esc(cta)}</button></div>`);
    host.querySelector('#mCancel').addEventListener('click', closeModal);
    host.querySelector('#mOk').addEventListener('click', () => { closeModal(); onOk(); });
  }

  const stepGuards = {
    0: (body) => {
      if (!state.items.length) { showToast('Add at least one item — type it above or add one by hand.'); body.querySelector('#narrative') && body.querySelector('#narrative').focus(); return false; }
      const bad = state.items.find(i => !String(i.desc || '').trim() || !(+i.weightKg > 0));
      if (bad) { editingUid = bad.uid; renderStepDescribe(body); showToast('That item needs a name and a weight above zero.'); return false; }
      if (state.pending.length) { showToast('Confirm or dismiss the suggestions first — nothing counts until you do.'); return false; }
      if (!state.dest) { showToast('Where is it going? Pick a destination.'); body.querySelector('#selDest').classList.add('is-invalid'); body.querySelector('#selDest').focus(); return false; }
      return true;
    }
  };

  // ---------- STEP 1: DESCRIBE ----------
  function renderStepDescribe(body) {
    const rules = getRules();
    const org = SEED.meta.originCountries.find(c => c.id === state.originCountry) || SEED.meta.originCountries[0];
    const cities = org.cities.includes(state.origin) ? org.cities : org.cities.concat(state.origin ? [state.origin] : []);
    const dests = SEED.meta.destinations.includes(state.dest) || !state.dest ? SEED.meta.destinations : SEED.meta.destinations.concat([state.dest]);

    body.innerHTML = `
      <div class="step-head">
        <h2 class="title">What are you shipping?</h2>
        <p class="lede">Describe it like you’d tell a friend. We’ll turn it into a list you can fix.</p>
      </div>

      <div class="card">
        <div class="stack">
          <div class="field">
            <span class="field-label">I’m shipping as</span>
            <div class="segment" id="segToggle" role="radiogroup">
              <button type="button" role="radio" aria-checked="${state.segment === 'consumer'}" data-seg="consumer" class="${state.segment === 'consumer' ? 'active' : ''}">Personal</button>
              <button type="button" role="radio" aria-checked="${state.segment === 'business'}" data-seg="business" class="${state.segment === 'business' ? 'active' : ''}">Small business</button>
            </div>
          </div>
          <div class="grid-3">
            <div class="field"><label class="field-label" for="selCountry">From</label>
              <select class="input" id="selCountry">${SEED.meta.originCountries.map(c => `<option value="${c.id}" ${c.id === state.originCountry ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label" for="selOrigin">City</label>
              <select class="input" id="selOrigin">${cities.map(c => `<option ${c === state.origin ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
            <div class="field span-2"><label class="field-label" for="selDest">To ${tip('This prototype covers US destinations. India → US and China → US corridors are seeded.')}</label>
              <select class="input" id="selDest"><option value="" ${!state.dest ? 'selected' : ''} disabled>Choose a US city</option>${dests.map(d => `<option ${d === state.dest ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
          </div>
          <div class="field">
            <label class="field-label" for="narrative">What’s in the box?</label>
            <div class="composer">
              <textarea class="input" id="narrative" placeholder="e.g. 5 kg of snacks, 2 pickle jars, and 3 kg of clothes">${esc(state.narrative)}</textarea>
              <div class="composer-bar">
                <button class="btn btn-primary btn-sm" id="btnParse" type="button">${I.spark} Make my list</button>
                <span class="note">Reads quantities and weights · check its work below</span>
              </div>
            </div>
            ${!state.items.length ? `<div class="examples">${['5 kg of snacks and 2 pickle jars', '3 kg of clothes and 2 gifts', '1 ceramic vase and 2 kg of tea'].map(x => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
            <div id="parseNote"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Your items ${state.items.length ? `<span class="badge badge-neutral">${state.items.length}</span>` : ''}</span>
          ${state.items.length ? `<span class="muted">${totalKg().toFixed(1)} kg · ${money0(state.items.reduce((s, i) => s + (+i.valueUsd || 0), 0))} declared</span>` : ''}
        </div>
        <div class="items" id="itemList">
          ${state.items.length ? state.items.map(it => itemCard(it, rules)).join('') : `<div class="empty"><div class="ic">${I.box.replace('width="22" height="22"', 'width="32" height="32"')}</div>Nothing yet. Describe your shipment above, or add an item by hand.</div>`}
        </div>

        ${state.pending.length ? `
        <div class="stack" style="margin-top:var(--space-4);">
          ${state.pending.map(p => `
            <div class="suggestion" data-uid="${p.uid}">
              <div class="body">
                <div class="row" style="gap:6px;margin-bottom:2px;"><span class="badge badge-sim">Simulated AI suggestion</span></div>
                <div class="t">${esc(p.desc)}</div>
                <div class="m">${p.qty} ${esc(p.unit)} · ~${p.weightKg} kg · ~${money(p.valueUsd)}</div>
              </div>
              <div class="acts">
                <button class="btn btn-primary btn-sm" data-act="confirm">Add</button>
                <button class="btn btn-ghost btn-sm" data-act="dismiss">Dismiss</button>
              </div>
            </div>`).join('')}
          <p class="fine">Nothing counts until you add it. Suggestions come from a demo heuristic, not a live vision model.</p>
        </div>` : ''}

        <div class="add-row">
          <button class="btn btn-secondary btn-sm" id="btnAddItem" type="button">${I.plus} Add by hand</button>
          <label class="btn btn-secondary btn-sm photo-label" id="photoLabel">${I.camera} Add a photo <span class="badge badge-sim" style="margin-left:4px;">simulated</span><input type="file" id="photoInput" accept="image/*" multiple></label>
          ${state.photoNames.length ? `<span class="muted" style="align-self:center;">${state.photoNames.length} photo${state.photoNames.length === 1 ? '' : 's'} · stays on your device</span>` : ''}
        </div>
      </div>`;

    // segment + route
    body.querySelectorAll('#segToggle button').forEach(b => b.addEventListener('click', () => {
      state.segment = b.dataset.seg; saveState();
      body.querySelectorAll('#segToggle button').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', x === b); });
    }));
    body.querySelector('#selCountry').addEventListener('change', e => {
      state.originCountry = e.target.value;
      const c = SEED.meta.originCountries.find(x => x.id === state.originCountry);
      state.origin = c.cities[0];
      state.corridor = state.originCountry === 'CN' ? 'CN-US' : 'IN-US';
      saveState(); renderStepDescribe(body);
    });
    body.querySelector('#selOrigin').addEventListener('change', e => { state.origin = e.target.value; saveState(); });
    body.querySelector('#selDest').addEventListener('change', e => { state.dest = e.target.value; e.target.classList.remove('is-invalid'); saveState(); updateHint(); });

    // narrative + parse
    const ta = body.querySelector('#narrative');
    ta.addEventListener('input', e => { state.narrative = e.target.value; });
    ta.addEventListener('change', () => saveState());
    ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runParse(body); } });
    body.querySelector('#btnParse').addEventListener('click', () => runParse(body));
    body.querySelectorAll('.examples .chip').forEach(c => c.addEventListener('click', () => { ta.value = c.dataset.ex; state.narrative = ta.value; runParse(body); }));

    // item cards
    body.querySelectorAll('.item').forEach(card => bindItemCard(card, body));

    body.querySelector('#btnAddItem').addEventListener('click', () => {
      const it = Engine.makeItem('New item', 1, 'piece', 0.5, null, 'manual');
      state.items.push(it); editingUid = it.uid;
      saveState(); renderStepDescribe(body);
      const inp = body.querySelector(`.item[data-uid="${it.uid}"] input[data-f="desc"]`);
      if (inp) { inp.focus(); inp.select(); }
    });

    // suggestions
    body.querySelectorAll('.suggestion').forEach(row => {
      const uid = row.dataset.uid;
      row.querySelector('[data-act="confirm"]').addEventListener('click', () => {
        const p = state.pending.find(x => x.uid === uid);
        if (p) { state.pending = state.pending.filter(x => x.uid !== uid); state.items.push({ ...p, source: 'ai-confirmed' }); saveState(); renderStepDescribe(body); showToast('Added to your list.'); }
      });
      row.querySelector('[data-act="dismiss"]').addEventListener('click', () => {
        state.pending = state.pending.filter(x => x.uid !== uid); saveState(); renderStepDescribe(body);
      });
    });

    // photo simulation
    body.querySelector('#photoInput').addEventListener('change', e => {
      const files = Array.from(e.target.files || []).slice(0, 3);
      if (!files.length) return;
      state.photoNames = state.photoNames.concat(files.map(f => f.name)).slice(0, 3);
      const picks = [];
      for (const f of files) {
        let h = 0; for (const ch of f.name) h = (h * 31 + ch.charCodeAt(0)) % 997;
        picks.push(SEED.photoPool[h % SEED.photoPool.length]);
        picks.push(SEED.photoPool[(h + 3) % SEED.photoPool.length]);
      }
      const uniq = picks.filter((p, i) => picks.findIndex(q => q.desc === p.desc) === i).slice(0, 4);
      const lbl = body.querySelector('#photoLabel');
      lbl.innerHTML = `${I.spark} Scanning (simulated)…`;
      lbl.style.pointerEvents = 'none';
      setTimeout(() => {
        state.pending = state.pending.concat(uniq.map(p => ({ ...Engine.makeItem(p.desc, p.qty, p.unit, p.weightKg, Engine.matchRule(p.desc), 'ai-simulated'), source: 'ai-simulated' })));
        saveState(); renderStepDescribe(body);
        showToast('Suggestions ready — add the ones that match.');
      }, 1400);
    });
    updateHint();
  }

  function runParse(body) {
    const parsed = Engine.parseNarrative(state.narrative);
    const notes = [];
    if (parsed.route) {
      state.origin = title(parsed.route.origin) || state.origin;
      if (parsed.route.originCountry) { state.originCountry = parsed.route.originCountry; state.corridor = parsed.route.corridor; }
      state.dest = title(parsed.route.dest) || state.dest;
      notes.push(`Route set to <b>${esc(state.origin)} → ${esc(state.dest)}</b>.`);
    }
    if (parsed.items.length) {
      state.items = state.items.concat(parsed.items);
      notes.push(`Added <b>${parsed.items.length} item${parsed.items.length === 1 ? '' : 's'}</b>. Weights and values are estimates — tap any item to fix it.`);
    }
    if (parsed.unknown.length) notes.push(`Couldn’t read “<b>${esc(parsed.unknown.join(', '))}</b>” — add it by hand. No guesses went into your list.`);
    if (!parsed.items.length && !parsed.route) notes.push(`Nothing matched. Try “<i>3 kg of snacks and 2 t-shirts</i>”, or add items by hand.`);
    if (parsed.items.length) state.narrative = '';
    saveState();
    renderStepDescribe(body);
    const note = body.querySelector('#parseNote');
    if (notes.length) note.innerHTML = `<div class="parse-note"><span class="ic">${I.spark}</span><div>${notes.join('<br>')}</div></div>`;
  }

  function title(s) { return s ? s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : s; }

  function itemCard(it, rules) {
    const r = rules.find(x => x.id === it.ruleId);
    const editing = editingUid === it.uid;
    const src = it.source === 'ai-confirmed' ? `<span class="badge badge-sim" title="Suggested by the simulated photo scan; confirmed by you.">AI · you confirmed</span>` : '';
    if (!editing) {
      return `<div class="item" data-uid="${it.uid}" role="button" tabindex="0" aria-label="Edit ${esc(it.desc)}">
        <div class="name">${esc(it.desc)} ${src}</div>
        <span class="edit">${I.pencil}</span>
        <div class="meta">${it.qty} ${esc(it.unit)} · ${it.weightKg} kg · ${money(it.valueUsd)} · <span class="cat">${r ? esc(r.name) : 'Needs a category'}</span></div>
      </div>`;
    }
    const ruleOpts = ['<option value="" ' + (!it.ruleId ? 'selected' : '') + '>Other / not sure</option>'].concat(rules.map(x => `<option value="${x.id}" ${x.id === it.ruleId ? 'selected' : ''}>${esc(x.name)}</option>`)).join('');
    const units = ['piece', 'kg', 'jar', 'box', 'pack', 'l'].map(u => `<option ${u === it.unit ? 'selected' : ''}>${u}</option>`).join('');
    return `<div class="item editing" data-uid="${it.uid}">
      <div class="item-editor">
        <div class="field span-2"><label class="field-label">What is it</label><input class="input" value="${esc(it.desc)}" data-f="desc" placeholder="e.g. Homemade pickles"></div>
        <div class="field span-2"><label class="field-label">Category ${tip('Drives the shipping check and the duty estimate. Change it if our guess is wrong.')}</label><select class="input" data-f="ruleId">${ruleOpts}</select></div>
        <div class="field"><label class="field-label">Quantity</label><div class="qty-unit"><input class="input" type="number" inputmode="decimal" min="0" step="1" value="${it.qty}" data-f="qty"><select class="input" data-f="unit">${units}</select></div></div>
        <div class="field"><label class="field-label">Weight (kg)</label><input class="input" type="number" inputmode="decimal" min="0" step="0.1" value="${it.weightKg}" data-f="weight"></div>
        <div class="field"><label class="field-label">Value ($) ${tip('What it is worth. Keep it honest — under-declaring is a violation.')}</label><input class="input" type="number" inputmode="decimal" min="0" step="1" value="${it.valueUsd}" data-f="value"></div>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-act="remove" type="button">Remove</button>
          <button class="btn btn-primary btn-sm" data-act="done" type="button">${I.check} Done</button>
        </div>
      </div>
    </div>`;
  }

  function bindItemCard(card, body) {
    const uid = card.dataset.uid;
    const it = state.items.find(x => x.uid === uid);
    if (!it) return;
    if (!card.classList.contains('editing')) {
      const open = () => { editingUid = uid; renderStepDescribe(body); const inp = body.querySelector(`.item[data-uid="${uid}"] input[data-f="desc"]`); if (inp) inp.focus(); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      return;
    }
    card.addEventListener('input', e => {
      const f = e.target.dataset.f; if (!f) return;
      if (f === 'desc') it.desc = e.target.value;
      else if (f === 'qty') it.qty = parseFloat(e.target.value) || 1;
      else if (f === 'unit') it.unit = e.target.value;
      else if (f === 'weight') it.weightKg = Engine.round2(parseFloat(e.target.value) || 0);
      else if (f === 'value') it.valueUsd = Engine.round2(parseFloat(e.target.value) || 0);
      else if (f === 'ruleId') it.ruleId = e.target.value === '' ? null : e.target.value;
      e.target.classList.toggle('is-invalid', (f === 'weight' && !(it.weightKg > 0)) || (f === 'desc' && !it.desc.trim()));
      saveState(); updateHint();
    });
    card.addEventListener('change', e => { if (e.target.dataset.f) card.dispatchEvent(new Event('input')); });
    card.querySelector('[data-act="done"]').addEventListener('click', () => {
      if (!it.desc.trim()) { card.querySelector('[data-f="desc"]').classList.add('is-invalid'); showToast('Give the item a name.'); return; }
      if (!(it.weightKg > 0)) { card.querySelector('[data-f="weight"]').classList.add('is-invalid'); showToast('Weight needs to be above zero.'); return; }
      editingUid = null; saveState(); renderStepDescribe(body);
    });
    card.querySelector('[data-act="remove"]').addEventListener('click', () => {
      state.items = state.items.filter(x => x.uid !== uid); editingUid = null; saveState(); renderStepDescribe(body);
    });
  }

  // ---------- STEP 2: ELIGIBILITY ----------
  function renderStepEligibility(body) {
    const rules = getRules();
    const isBiz = state.segment === 'business';
    const rank = { ok: 0, caution: 1, restricted: 2 };
    const evals = state.items.map(it => ({ it, el: Engine.eligibilityFor(it, rules, state.segment) }));
    const worst = evals.reduce((w, e) => rank[e.el.restriction] > rank[w] ? e.el.restriction : w, 'ok');
    const counts = { ok: 0, caution: 0, restricted: 0 };
    evals.forEach(e => counts[e.el.restriction]++);
    const headline = {
      ok: ['Looks good to ship', 'Nothing in your list is likely to need a second look.'],
      caution: [`${counts.caution + counts.restricted} item${counts.caution + counts.restricted === 1 ? '' : 's'} may get a second look`, 'Usually fine with the right paperwork. Details below.'],
      restricted: [`${counts.restricted} item${counts.restricted === 1 ? '' : 's'} often restricted`, 'It may be refused at the border. Read the note, then decide — you can still continue.']
    }[worst];
    const vIcon = { ok: I.check, caution: I.warn, restricted: I.stop }[worst];

    const cards = evals.sort((a, b) => rank[b.el.restriction] - rank[a.el.restriction]).map(({ it, el }) => {
      const rl = SEED.restrictionLevels[el.restriction] || SEED.restrictionLevels.caution;
      const confN = el.confidence === 'high' ? 3 : el.confidence === 'medium' ? 2 : el.confidence === 'low' ? 1 : 0;
      return `<div class="elig">
        <div class="elig-top">
          <div><div class="name">${esc(it.desc)}</div><div class="meta">${it.qty} ${esc(it.unit)} · ${it.weightKg} kg · ${money(it.valueUsd)}</div></div>
          <span class="badge badge-${rl.cls === 'ok' ? 'success' : rl.cls === 'caution' ? 'warning' : 'error'}">${rl.label}</span>
        </div>
        <p class="note">${esc(el.note)}</p>
        ${el.flags.length ? `<div class="facts">${el.flags.map(f => { const fi = SEED.flagInfo[f]; return fi ? `<span class="chip warn">${fi.label} ${tip(fi.tip)}</span>` : ''; }).join('')}</div>` : ''}
        <details>
          <summary>Where this comes from</summary>
          <dl class="detail-grid">
            <dt>Category</dt><dd>${esc(el.category)}</dd>
            <dt>Code ${tip('An HTS-style classification guess — illustrative, not a binding ruling. A broker confirms the real code.')}</dt><dd>${esc(el.hts)}</dd>
            <dt>Est. duty ${tip('Applied to your declared value in the cost step. Illustrative only.')}</dt><dd>${el.dutyRate == null ? '—' : (el.dutyRate * 100).toFixed(1) + '%'}</dd>
            ${el.source ? `<dt>Source</dt><dd>${esc(el.source)}${el.effectiveDate ? ` · effective ${esc(el.effectiveDate)}` : ''}</dd>` : ''}
            ${el.confidence ? `<dt>Confidence</dt><dd>${esc(el.confidence)} <span class="conf">${[1, 2, 3].map(n => `<i class="${n <= confN ? 'on' : ''}"></i>`).join('')}</span></dd>` : ''}
            <dt>Status</dt><dd style="font-weight:400;color:var(--text-tertiary);">Illustrative — not a customs determination</dd>
          </dl>
        </details>
      </div>`;
    }).join('');

    const allDocs = [...new Set(evals.flatMap(e => e.el.docs || []))];

    body.innerHTML = `
      <div class="step-head">
        <h2 class="title">Can I ship this?</h2>
        <p class="lede">${isBiz ? 'Viewed as a commercial import — formal entry, documented values, product rules.' : 'Viewed as a personal shipment — gift and household framing.'}</p>
      </div>
      <div class="verdict ${worst}"><div class="ic">${vIcon}</div><div><div class="t">${headline[0]}</div><div class="s">${headline[1]}</div></div></div>
      <div class="callout callout-info" style="margin-bottom:var(--space-3);"><span class="ic">${I.info}</span><div>${isBiz
        ? '<b>Commercial framing:</b> expect a formal entry with duties and a processing fee. Some products need FDA or other registrations — the cost step includes an illustrative fee.'
        : '<b>Personal framing:</b> gifts and household goods often clear with light paperwork. The US has a personal exemption for gifts (commonly cited near $800 per person — illustrative; policy changes, so verify before shipping).'}</div></div>
      <div>${cards}</div>
      <div class="card" style="margin-top:var(--space-3);">
        <div class="card-head"><span class="card-title">Have these ready</span></div>
        <ul class="doc-list">${allDocs.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
      </div>
      <p class="fine" style="margin-top:var(--space-3);">Sources named are the kinds of agencies that govern these rules; this prototype does not redistribute their text. Every estimate is illustrative and non-binding.</p>`;
  }

  // ---------- STEP 3: PACKING ----------
  function renderStepPacking(body) {
    const plan = Engine.planPacking(state.items, SEED.boxes, getRules());
    state.packing = plan;
    const icon = g => g === 'padded' ? I.shield : g === 'food' ? I.food : I.shirt;
    const totalCharge = plan.boxes.reduce((s, b) => s + b.chargeableKg, 0);

    body.innerHTML = `
      <div class="step-head">
        <h2 class="title">Pack it like this</h2>
        <p class="lede">${plan.boxes.length} box${plan.boxes.length === 1 ? '' : 'es'} from our standard sizes — fragile and food items kept apart, sized so you don’t pay for air.</p>
      </div>
      <div>
        ${plan.boxes.map(b => `
          <div class="box">
            <div class="ic">${icon(b.group)}</div>
            <div class="body">
              <div class="t">Box ${b.seq} · ${esc(b.boxName)} <span class="muted" style="font-weight:400;">${b.dimsIn.join('×')} in</span></div>
              <div class="m">${b.contents.map(esc).join(' · ')}</div>
              <div class="util" title="Estimated space used"><div style="width:${b.utilization}%"></div></div>
              <div class="w"><span>Space used <b>${b.utilization}%</b></span><span>Weight <b>${b.actualKg} kg</b></span><span>Billed as <b>${b.chargeableKg} kg</b> ${tip(`Carriers bill the larger of actual weight and “dimensional” weight (L×W×H ÷ ${Engine.DIM_DIVISOR}, inches → pounds). This box: ${b.dimKg} kg dimensional.`)}</span></div>
            </div>
          </div>`).join('')}
      </div>
      ${plan.splitHint ? `<div class="callout callout-warn" style="margin-top:var(--space-3);"><span class="ic">${I.scissors}</span><div><b>Consider splitting this shipment.</b> ${esc(plan.splitHint)}</div></div>` : ''}

      <div class="card" style="margin-top:var(--space-3);">
        <div class="card-head"><span class="card-title">Shopping list</span><span class="muted">Billed weight ${Engine.round2(totalCharge)} kg</span></div>
        <div class="row">
          ${plan.materials.boxes.map(b => `<span class="chip">${b.n}× ${esc(b.label)}</span>`).join('')}
          <span class="chip">${plan.materials.tapeRolls}× packing tape</span>
          ${plan.materials.bubbleWrapRolls ? `<span class="chip">${plan.materials.bubbleWrapRolls}× bubble wrap</span>` : ''}
          ${plan.materials.linerBags ? `<span class="chip">${plan.materials.linerBags}× sealed liner bag</span>` : ''}
          <span class="chip">${plan.materials.labels}× labels &amp; “fragile” stickers</span>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">How to pack each group</span></div>
        <ul class="doc-list">
          ${plan.groups.map(g => `<li><span><b>${esc(g.label)}</b> (${g.weightKg} kg) — ${esc({ padded: 'own padded box, double cushioning, “fragile” on every side', food: 'sealed liner bag, packed away from clothes and electronics', general: 'folded tight, heavier items at the bottom' }[g.key] || '')}</span></li>`).join('')}
          <li><span>Jars get a leak-proof wrap, then a liner bag around the whole group.</span></li>
          <li><span>Put a contents card inside every box — it helps if customs opens it.</span></li>
        </ul>
      </div>
      <p class="fine" style="margin-top:var(--space-3);">The plan re-computes whenever your items change. Space used is an estimate from typical densities, not a 3D fit.</p>`;
  }

  // ---------- STEP 4: COSTS ----------
  function renderStepCost(body) {
    if (!state.packing) state.packing = Engine.planPacking(state.items, SEED.boxes, getRules());
    const carriers = getCarriers();
    const cost = Engine.costQuotes(state.packing.boxes, state.items, carriers, state.corridor, state.segment, getRules());
    state.cost = cost;

    const shipmentFlags = new Set(state.items.flatMap(flagsOf));
    const availability = carriers.map(c => { const banned = (c.bannedFlags || []).filter(f => shipmentFlags.has(f)); return { id: c.id, ok: banned.length === 0, banned }; });
    const avOf = id => availability.find(a => a.id === id);
    const availQuotes = cost.quotes.filter(q => avOf(q.carrierId).ok);
    const best = Engine.pickBest(availQuotes.length ? availQuotes : cost.quotes, state.optMode);
    if (!state.chosen || !avOf(state.chosen) || !avOf(state.chosen).ok) state.chosen = best ? best.carrierId : null;

    const sorted = cost.quotes.slice().sort((a, b) => {
      const ab = avOf(a.carrierId), bb = avOf(b.carrierId);
      if (ab.ok !== bb.ok) return ab.ok ? -1 : 1;
      if (best && a.carrierId === best.carrierId) return -1;
      if (best && b.carrierId === best.carrierId) return 1;
      return a.total - b.total;
    });
    const isBiz = state.segment === 'business';
    const lo = Math.min(...availQuotes.map(q => q.total)), hi = Math.max(...availQuotes.map(q => q.total));

    body.innerHTML = `
      <div class="step-head">
        <h2 class="title">What it really costs</h2>
        <p class="lede">${availQuotes.length ? `${money0(lo)}–${money0(hi)} all-in across ${availQuotes.length} option${availQuotes.length === 1 ? '' : 's'}` : 'Options'} — shipping, packaging, estimated duties, insurance and handling in one number. Illustrative estimates, never live quotes.</p>
      </div>
      <div class="pref" id="optToggle" role="radiogroup" style="margin-bottom:var(--space-4);">
        ${[['cheapest', 'Cheapest'], ['fastest', 'Fastest'], ['balance', 'Best balance']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${state.optMode === k}" class="${state.optMode === k ? 'active' : ''}" data-opt="${k}">${l}</button>`).join('')}
      </div>
      <div>
        ${sorted.map(q => {
          const av = avOf(q.carrierId);
          const isBest = best && q.carrierId === best.carrierId && av.ok;
          const isChosen = state.chosen === q.carrierId;
          const carrier = carriers.find(c => c.id === q.carrierId) || {};
          return `<div class="quote ${isChosen && av.ok ? 'best' : ''} ${av.ok ? '' : 'off'}" data-id="${q.carrierId}">
            <div class="quote-top">
              <div>
                <div class="name">${esc(q.name)} ${isBest ? '<span class="badge badge-success">Our pick</span>' : ''}${isChosen && av.ok && !isBest ? '<span class="badge badge-neutral">Selected</span>' : ''}</div>
                <div class="tier">${esc(q.tier)} · ${q.daysMin}–${q.daysMax} days · ${esc(q.tracking)}</div>
              </div>
              <div class="price"><div class="v">${money0(q.total)}</div><div class="d">estimate, all-in</div></div>
            </div>
            ${av.ok ? `
            <div class="feats">${q.customsIncluded ? `<span class="badge badge-success">${esc(q.customsIncluded)}</span>` : ''}${q.features.map(f => `<span class="badge badge-neutral">${esc(f)}</span>`).join('')}</div>
            <details>
              <summary>See the breakdown</summary>
              <div class="breakdown">
                <span>Shipping (incl. fuel ${money(q.fuel)})</span><span>${money(q.freight + q.fuel)}</span>
                <span>Packaging</span><span>${money(q.packaging)}</span>
                <span>Estimated duties</span><span>${money(q.duties)}</span>
                ${q.fees ? `<span>${isBiz ? 'Entry processing fee' : 'Fees'}</span><span>${money(q.fees)}</span>` : ''}
                <span>Insurance (on ${money(cost.declaredTotal)} declared)</span><span>${money(q.insurance)}</span>
                <span>Customs handling</span><span>${money(q.customs)}</span>
                <div class="total"><span>Total estimate</span><span>${money(q.total)}</span></div>
              </div>
              <p class="fine" style="margin-top:8px;">Illustrative estimate — not a live quote. Billed weight ${cost.chargeableKg} kg.</p>
            </details>
            <div class="acts">
              <button class="btn ${isChosen ? 'btn-primary' : 'btn-secondary'}" data-choose="${q.carrierId}">${isChosen ? I.check + ' Selected' : 'Choose this'}</button>
              <button class="btn btn-ghost" data-quote="${q.carrierId}">Request a real quote</button>
            </div>` : `
            <div class="callout callout-err" style="margin-top:var(--space-3);"><span class="ic">${I.stop}</span><div><b>Not available for this shipment.</b> ${esc(carrier.banNote || 'Restricted items.')} (${av.banned.map(f => (SEED.flagInfo[f] || {}).label || f).join(', ')})</div></div>`}
          </div>`;
        }).join('')}
      </div>
      <details style="margin-top:var(--space-3);"><summary class="fine" style="cursor:pointer;font-weight:600;">How duties were estimated</summary>
        <p class="fine" style="margin-top:6px;">${cost.dutyLines.map(d => `${esc(d.item)} @ ${(d.rate * 100).toFixed(1)}%`).join(' · ')}. Applied to declared values; illustrative, not a customs determination.</p>
      </details>`;

    body.querySelector('#optToggle').addEventListener('click', e => {
      const b = e.target.closest('button[data-opt]'); if (!b) return;
      state.optMode = b.dataset.opt; state.chosen = null; saveState(); renderStepCost(body);
    });
    body.querySelectorAll('button[data-choose]').forEach(b => b.addEventListener('click', () => {
      state.chosen = b.dataset.choose; saveState(); renderStepCost(body); updateHint();
    }));
    body.querySelectorAll('button[data-quote]').forEach(b => b.addEventListener('click', () => requestQuote(cost.quotes.find(x => x.carrierId === b.dataset.quote))));
    updateHint();
  }

  function requestQuote(q) {
    const host = openModal(`
      <h2>Request a real quote</h2>
      <p class="lede">${esc(q.name)} · our estimate was ${money(q.total)} (${q.daysMin}–${q.daysMax} days). This demo doesn’t contact carriers — we record your interest so a pilot partner can follow up.</p>
      <div class="field" style="margin-top:var(--space-4);"><label class="field-label" for="qEmail">Email (optional)</label><input class="input" id="qEmail" type="email" inputmode="email" placeholder="you@example.com"></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="qCancel">Cancel</button><button class="btn btn-primary" id="qSend">Record my request</button></div>`);
    host.querySelector('#qCancel').addEventListener('click', closeModal);
    host.querySelector('#qSend').addEventListener('click', async () => {
      const email = host.querySelector('#qEmail').value.trim();
      try {
        await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: { shipmentId: state.id, carrierId: q.carrierId, carrierName: q.name, estTotal: q.total, email, corridor: state.corridor, segment: state.segment } }) });
      } catch (e) { /* offline */ }
      closeModal();
      showToast('Recorded. Demo only — nothing was sent to the carrier.');
    });
  }

  // ---------- STEP 5: SHIP ----------
  function renderStepShip(body) {
    const cost = state.cost || Engine.costQuotes((state.packing || Engine.planPacking(state.items, SEED.boxes, getRules())).boxes, state.items, getCarriers(), state.corridor, state.segment, getRules());
    const chosen = cost.quotes.find(q => q.carrierId === state.chosen) || Engine.pickBest(cost.quotes, state.optMode) || cost.quotes[0];
    const rules = getRules();
    const isBiz = state.segment === 'business';
    const refCode = 'SHIP2US-' + state.id.slice(-6).toUpperCase();
    const boxes = state.packing ? state.packing.boxes : [];

    const allDocs = [...new Set(state.items.flatMap(it => (Engine.eligibilityFor(it, rules, state.segment).docs || [])))];
    const prepItems = [
      'Print 2 copies of the itemized invoice — one goes inside box 1',
      ...allDocs,
      state.items.some(i => flagsOf(i).includes('food')) ? 'Put the recipient’s phone and email on the invoice (FDA prior notice uses them)' : null,
      state.items.some(i => flagsOf(i).includes('batteries')) ? 'Attach the lithium-battery handling label (if batteries are included)' : null,
      'Stick the shipping label on firmly and tape over its edges',
      isBiz ? 'Keep invoice values consistent with your books' : 'Sign the gift statement if you’re claiming gift treatment'
    ].filter(Boolean);
    const packKeys = boxes.map(b => 'box' + b.seq).concat(['mats']);
    const prepKeys = prepItems.map((_, i) => 'prep' + i);
    const allKeys = packKeys.concat(prepKeys);
    const doneCount = allKeys.filter(k => state.checklist[k]).length;
    const pct = allKeys.length ? Math.round(doneCount / allKeys.length * 100) : 0;

    const declRows = state.items.map(it => { const r = ruleOf(it); return `<tr><td>${esc(it.desc)}<div class="muted">${r ? esc(r.name) : 'Uncategorized'}</div></td><td class="num">${it.qty} ${esc(it.unit)}</td><td class="num">${money(it.valueUsd)}</td><td class="num">${esc(r ? r.hts : '—')}</td></tr>`; }).join('');
    const ck = (key, label) => `<li class="${state.checklist[key] ? 'done' : ''}"><label><input type="checkbox" data-ck="${key}" ${state.checklist[key] ? 'checked' : ''}><span>${label}</span></label></li>`;

    body.innerHTML = `
      <div class="step-head">
        <h2 class="title">You’re ready to ship</h2>
        <p class="lede">Everything you need for hand-over. Tick things off as you go — progress saves.</p>
      </div>
      <div class="summary">
        <div class="st"><div class="v">${money0(chosen.total)}</div><div class="k">est. with ${esc(chosen.name.split(' ')[0])}</div></div>
        <div class="st"><div class="v">${chosen.daysMin}–${chosen.daysMax} days</div><div class="k">estimated transit</div></div>
        <div class="st"><div class="v">${boxes.length} box${boxes.length === 1 ? '' : 'es'}</div><div class="k">${totalKg().toFixed(1)} kg · ${state.items.length} items</div></div>
      </div>

      <div class="card" style="margin-top:var(--space-3);">
        <div class="card-head"><span class="card-title">Checklist</span><span class="muted">${doneCount}/${allKeys.length} done</span></div>
        <div class="progress-line" style="margin-bottom:var(--space-4);"><div style="width:${pct}%"></div></div>
        <div class="eyebrow" style="margin-bottom:8px;">Packing</div>
        <ul class="checks">
          ${boxes.map(b => ck('box' + b.seq, `<b>Box ${b.seq}</b> (${esc(b.boxName)}): ${b.contents.map(esc).join(' · ')} — seal, label, contents card inside`)).join('')}
          ${ck('mats', 'Materials on hand: tape, cushioning, liner bags, labels')}
        </ul>
        <div class="eyebrow" style="margin:var(--space-4) 0 8px;">Paperwork ${tip('Built from your items. Confirm with your carrier before hand-over.')}</div>
        <ul class="checks">${prepItems.map((p, i) => ck('prep' + i, esc(p))).join('')}</ul>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Declaration draft <span class="badge badge-neutral">review before filing</span></span><button class="btn btn-secondary btn-sm" id="btnCopyDecl">${I.copy} Copy</button></div>
        <div class="table-scroll"><table class="decl">
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Value</th><th class="num">Code</th></tr></thead>
          <tbody>${declRows}</tbody>
          <tfoot><tr><td><b>Totals</b></td><td></td><td class="num"><b>${money(cost.declaredTotal)}</b></td><td class="num muted">duties ~${money(cost.duties)}</td></tr></tfoot>
        </table></div>
        <p class="fine" style="margin-top:8px;">Draft only. Values must be honest — under-declaring is a violation.</p>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Your referral link <span class="badge badge-neutral">placeholder</span></span></div>
        <div class="copy-row"><input class="input" readonly value="https://ship2us.example/r/${refCode}" id="refInput"><button class="btn btn-secondary" id="btnCopyRef">${I.copy}</button></div>
        <p class="fine" style="margin-top:8px;">Referral tracking, booking and tracking links appear here once real carrier integration is live.</p>
      </div>

      <div class="card" id="feedbackCard">
        <div class="card-head"><span class="card-title">Shipped something like this before?</span></div>
        <p class="muted" style="margin-bottom:var(--space-3);">Tell us how it went. It shows in admin as <b>unverified community input</b>, kept apart from seeded data.</p>
        ${state.feedbackDone ? `<div class="callout callout-ok"><span class="ic">${I.check}</span><div>Thanks — recorded as unverified community input.</div></div>` : `
        <div class="fb-grid">
          <div class="field"><label class="field-label">Carrier used</label><select class="input" id="fbCarrier">${cost.quotes.map(q => `<option value="${esc(q.name)}">${esc(q.name)}</option>`).join('')}<option value="Other">Other</option></select></div>
          <div class="field"><label class="field-label">Our estimate ($)</label><input class="input" id="fbEst" type="number" inputmode="decimal" value="${Math.round(chosen.total)}"></div>
          <div class="field"><label class="field-label">What you paid ($)</label><input class="input" id="fbAct" type="number" inputmode="decimal" placeholder="actual"></div>
          <div class="field"><label class="field-label">Delay</label><select class="input" id="fbDelay"><option>none</option><option>1–2 days</option><option>3–7 days</option><option>8+ days</option></select></div>
          <div class="field"><label class="field-label">Customs opened it?</label><select class="input" id="fbInspect"><option value="no">No</option><option value="yes">Yes</option></select></div>
          <div class="field"><label class="field-label">Damage</label><select class="input" id="fbDamage"><option>none</option><option>minor</option><option>severe</option></select></div>
        </div>
        <div class="field" style="margin-top:var(--space-3);"><label class="field-label">Anything that surprised you? (optional)</label><textarea class="input" id="fbComments" style="min-height:72px;"></textarea></div>
        <div style="margin-top:var(--space-3);"><button class="btn btn-primary" id="fbSubmit">Send feedback</button></div>`}
      </div>`;

    body.querySelectorAll('input[data-ck]').forEach(cb => cb.addEventListener('change', () => {
      state.checklist[cb.dataset.ck] = cb.checked; saveState();
      cb.closest('li').classList.toggle('done', cb.checked);
      const n = allKeys.filter(k => state.checklist[k]).length;
      body.querySelector('.progress-line > div').style.width = (allKeys.length ? Math.round(n / allKeys.length * 100) : 0) + '%';
      body.querySelector('.card-head .muted').textContent = `${n}/${allKeys.length} done`;
      if (n === allKeys.length) showToast('All set — you’re ready to hand it over.');
    }));

    body.querySelector('#btnCopyDecl').addEventListener('click', () => {
      const lines = ['SHIPMENT DECLARATION DRAFT (review before filing)', `Route: ${state.origin} → ${state.dest} (${state.corridor})`, `Segment: ${state.segment}`, ''];
      state.items.forEach(it => { const r = ruleOf(it); lines.push(`- ${it.desc} | qty ${it.qty} ${it.unit} | value $${it.valueUsd} | ${r ? r.hts : '—'} ${r ? '(' + r.name + ')' : ''}`); });
      lines.push('', 'Totals: declared ' + money(cost.declaredTotal) + ' · est. duties ' + money(cost.duties), 'Illustrative draft — not a customs document.');
      copyText(lines.join('\n'));
    });
    body.querySelector('#btnCopyRef').addEventListener('click', () => copyText(`https://ship2us.example/r/${refCode}`));

    const fbBtn = body.querySelector('#fbSubmit');
    if (fbBtn) fbBtn.addEventListener('click', async () => {
      const f = {
        shipmentId: state.id, segment: state.segment,
        carrier: body.querySelector('#fbCarrier').value,
        estimatedCost: parseFloat(body.querySelector('#fbEst').value) || 0,
        actualCost: parseFloat(body.querySelector('#fbAct').value) || 0,
        delay: body.querySelector('#fbDelay').value,
        inspected: body.querySelector('#fbInspect').value,
        damage: body.querySelector('#fbDamage').value,
        comments: body.querySelector('#fbComments').value.trim().slice(0, 600)
      };
      fbBtn.disabled = true;
      try { await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: f }) }); }
      catch (e) { showToast('Demo service unreachable — feedback kept in this browser only.'); }
      state.feedbackDone = true; saveState(); renderStepShip(body);
      showToast('Thank you — recorded as unverified community input.');
    });
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => showToast('Copied.')).catch(() => showToast('Copy blocked by the browser — select the text manually.'));
    } else showToast('Copy not supported here — select the text manually.');
  }

  // =====================================================================
  // RECEIVER ARRIVAL FLOW — #/r/:token
  // Chrome-free, session-only. Talks only to the token-scoped share routes,
  // so this page never learns the shipment id, items or cost. Kept in one
  // block so the sender-side changes to this file merge without overlap.
  // =====================================================================
  const RCV_MAX_PHOTOS = 4;
  const RCV_MAX_EDGE = 1600;   // px, long edge after client-side downscale
  const RCV_STORY_MAX = 280;
  const RCV_CONDITIONS = [
    ['all_good', 'All good'],
    ['damaged', 'Something damaged'],
    ['missing', 'Something missing'],
    ['opened_by_customs', 'Was opened by customs']
  ];
  const RCV_PANES_ARRIVED = ['arrived', 'condition', 'photos', 'story', 'send'];
  const RCV_PANES_WAITING = ['arrived', 'story', 'send']; // nothing to rate or photograph yet
  let rcv = null; // { token, status, ctx, pane, arrived, condition, photos, story, sending, error }

  function setChrome(on) { document.body.classList.toggle('chrome-less', !on); }
  function conditionLabel(key) { const c = RCV_CONDITIONS.find(([k]) => k === key); return c ? c[1] : key; }
  function receiverPanes(r) { return r.arrived === false ? RCV_PANES_WAITING : RCV_PANES_ARRIVED; }
  function receiverHeadline(ctx) {
    const who = ctx.senderName ? esc(ctx.senderName) : 'Someone';
    const what = typeof ctx.boxes === 'number' && ctx.boxes > 0 ? `${ctx.boxes} box${ctx.boxes === 1 ? '' : 'es'}` : 'a shipment';
    const from = ctx.origin ? ` from ${esc(ctx.origin)}` : '';
    return `${who} sent you ${what}${from}. Did it arrive?`;
  }
  // Condition taps: "All good" is exclusive with the problem taps.
  function toggleCondition(list, key) {
    if (list.includes(key)) return list.filter(k => k !== key);
    return key === 'all_good' ? ['all_good'] : [...list.filter(k => k !== 'all_good'), key];
  }
  function receiverRoot() { return document.getElementById('appRoot'); }

  async function fetchShareContext(token) {
    const r = await fetch(`/api/share/${encodeURIComponent(token)}`);
    if (r.status === 404) return { status: 'invalid' };
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'bad context');
    return { status: j.used ? 'used' : 'open', ctx: j };
  }

  async function renderReceiver(root, token) {
    if (!rcv || rcv.token !== token) {
      rcv = { token, status: 'loading', ctx: null, pane: 0, arrived: null, condition: [], photos: [], story: '', sending: false, error: null };
    }
    if (rcv.status === 'loading') {
      root.innerHTML = `<div class="page rcv"><div class="rcv-pane"><p class="muted">Opening your link…</p></div></div>`;
      try { Object.assign(rcv, await fetchShareContext(token)); }
      catch (e) { rcv.status = 'offline'; }
    }
    drawReceiver(root);
  }

  function drawReceiver(root) {
    const r = rcv;
    const page = inner => `<div class="page rcv">${inner}</div>`;
    if (r.status === 'invalid') {
      root.innerHTML = page(`<div class="rcv-pane rcv-center"><div class="rcv-ic">${I.stop}</div><h1 class="rcv-h">This link isn't valid</h1><p class="lede">Ask the sender for a fresh one.</p></div>`);
      return;
    }
    if (r.status === 'offline') {
      root.innerHTML = page(`<div class="rcv-pane rcv-center"><div class="rcv-ic">${I.warn}</div><h1 class="rcv-h">Couldn't open this link</h1><p class="lede">Check your connection and try again.</p><button class="btn btn-primary btn-lg" id="rcvRetry">Try again</button></div>`);
      root.querySelector('#rcvRetry').addEventListener('click', () => { r.status = 'loading'; renderReceiver(root, r.token); });
      return;
    }
    if (r.status === 'used' || r.status === 'sent') {
      const justSent = r.status === 'sent';
      root.innerHTML = page(`<div class="rcv-pane">
        <div class="callout callout-ok"><span class="ic">${I.check}</span><div><b>${justSent ? 'Sent — thank you.' : 'Already sent — thank you.'}</b> ${justSent ? 'The next family shipping this way will see it.' : 'This link has been used; here is what was shared.'}</div></div>
        <h2 class="rcv-h rcv-h-sm">${justSent ? 'What you told us' : 'What was reported'}</h2>
        ${renderReceiverSummary(r.ctx.report || {}, { photos: (r.ctx.report && r.ctx.report.photos) || [] })}
        <p class="fine">Shown to future senders as <b>community input · unverified</b>.</p>
      </div>`);
      return;
    }
    const panes = receiverPanes(r);
    r.pane = Math.min(r.pane, panes.length - 1);
    const key = panes[r.pane];
    root.innerHTML = page(`
      <div class="rcv-top">
        ${r.pane > 0 ? `<button class="icon-btn" id="rcvBack" aria-label="Back">${I.back}</button>` : '<span class="icon-btn" aria-hidden="true"></span>'}
        <div class="rcv-dots" role="progressbar" aria-label="Step ${r.pane + 1} of ${panes.length}" aria-valuemin="1" aria-valuemax="${panes.length}" aria-valuenow="${r.pane + 1}">${panes.map((_, i) => `<i class="${i <= r.pane ? 'on' : ''}"></i>`).join('')}</div>
        <span class="icon-btn" aria-hidden="true"></span>
      </div>
      <div class="rcv-pane" data-pane="${key}">${renderReceiverPane(key, r)}</div>
      <p class="fine rcv-foot">Takes about 30 seconds. No account — your answers appear to the next family as <b>community input · unverified</b>.</p>`);
    bindReceiverPane(root, key, r);
  }

  function renderReceiverPane(key, r) {
    const next = (label, disabled) => `<button class="btn btn-primary btn-lg btn-block" id="rcvNext" ${disabled ? 'disabled' : ''}>${label} ${I.arrow}</button>`;
    switch (key) {
      case 'arrived':
        return `<h1 class="rcv-h">${receiverHeadline(r.ctx)}</h1>
          <p class="lede">${r.ctx.dest ? `Heading to ${esc(r.ctx.dest)}.` : ''} Two taps and you're done.</p>
          <div class="rcv-choices">
            <button class="rcv-choice ${r.arrived === true ? 'on' : ''}" data-arrived="true"><span class="ic">${I.check}</span>Yes, it arrived</button>
            <button class="rcv-choice ${r.arrived === false ? 'on' : ''}" data-arrived="false"><span class="ic">${I.box}</span>Still waiting</button>
          </div>`;
      case 'condition':
        return `<h1 class="rcv-h">How was it?</h1><p class="lede">Tap everything that applies.</p>
          <div class="rcv-choices">${RCV_CONDITIONS.map(([k, label]) => `<button class="rcv-choice ${r.condition.includes(k) ? 'on' : ''}" data-cond="${k}" aria-pressed="${r.condition.includes(k)}">${label}</button>`).join('')}</div>
          ${next('Next', r.condition.length === 0)}`;
      case 'photos':
        return `<h1 class="rcv-h">Add photos</h1><p class="lede">Up to ${RCV_MAX_PHOTOS} — the box, what was inside, anything that surprised you.</p>
          ${renderReceiverPhotoPicker(r)}
          ${next(r.photos.length ? 'Next' : 'Skip for now', false)}`;
      case 'story':
        return `<h1 class="rcv-h">One line for the next family</h1><p class="lede">Optional. What would you tell someone ${r.ctx.origin ? `shipping from ${esc(r.ctx.origin)}` : 'shipping the same way'}?</p>
          <textarea class="input" id="rcvStory" maxlength="${RCV_STORY_MAX}" placeholder="e.g. Everything came in one piece — the jars were wrapped well.">${esc(r.story)}</textarea>
          <div class="fine rcv-count" id="rcvCount">${r.story.length}/${RCV_STORY_MAX}</div>
          ${next(r.story.trim() ? 'Next' : 'Skip', false)}`;
      case 'send': {
        const pending = r.photos.some(p => p.status === 'uploading');
        return `<h1 class="rcv-h">Ready to send?</h1><p class="lede">One tap. You can't edit it afterwards.</p>
          ${renderReceiverSummary(r, { photos: r.photos.filter(p => p.status !== 'error').map(p => p.preview) })}
          ${r.error ? `<div class="callout callout-err" style="margin-bottom:var(--space-3);"><span class="ic">${I.warn}</span><div>${esc(r.error)}</div></div>` : ''}
          <button class="btn btn-primary btn-lg btn-block" id="rcvSend" ${pending || r.sending ? 'disabled' : ''}>${r.sending ? 'Sending…' : pending ? 'Waiting for photos to finish…' : 'Send'}</button>`;
      }
      default: return '';
    }
  }

  // Own picker so this PR does not depend on the sender-side `renderPhotoPicker`.
  function renderReceiverPhotoPicker(r) {
    const statusLabel = { uploading: 'Uploading…', error: "Couldn't add this one" };
    return `<div class="rcv-photos">
      ${r.photos.map(p => `<div class="rcv-thumb ${p.status}" data-pid="${p.id}">
        ${p.preview ? `<img src="${esc(p.preview)}" alt="Your photo">` : ''}
        ${statusLabel[p.status] ? `<span class="st">${statusLabel[p.status]}</span>` : ''}
        <button type="button" class="rcv-thumb-x" data-remove="${p.id}" aria-label="Remove photo">&times;</button>
      </div>`).join('')}
      ${r.photos.length < RCV_MAX_PHOTOS ? `<label class="rcv-add"><input type="file" id="rcvFile" accept="image/*" capture="environment" multiple>${I.camera}<span>Add photo</span></label>` : ''}
    </div>`;
  }

  // Shared between the Send pane (previews) and the read-only recap (served paths).
  function renderReceiverSummary(rep, { photos }) {
    const arrived = rep.arrived === true ? 'Arrived' : rep.arrived === false ? 'Still waiting' : null;
    const conds = Array.isArray(rep.condition) ? rep.condition : [];
    return `<div class="rcv-recap">
      ${arrived ? `<div><div class="k">Status</div><div class="row"><span class="chip">${arrived}</span></div></div>` : ''}
      ${conds.length ? `<div><div class="k">How it was</div><div class="row">${conds.map(c => `<span class="chip">${esc(conditionLabel(c))}</span>`).join('')}</div></div>` : ''}
      ${photos.length ? `<div><div class="k">Photos</div><div class="rcv-photos">${photos.map(src => `<div class="rcv-thumb done"><img src="${esc(src)}" alt="Receiver photo"></div>`).join('')}</div></div>` : ''}
      ${rep.story && rep.story.trim() ? `<div><div class="k">For the next family</div><q>${esc(rep.story.trim())}</q></div>` : ''}
      ${rep.submittedAt ? `<div class="fine">Sent ${esc(String(rep.submittedAt).slice(0, 10))}</div>` : ''}
    </div>`;
  }

  function bindReceiverPane(root, key, r) {
    const back = root.querySelector('#rcvBack');
    if (back) back.addEventListener('click', () => { r.pane = Math.max(0, r.pane - 1); drawReceiver(root); scrollTop(); });
    const advance = () => { r.pane += 1; drawReceiver(root); scrollTop(); };
    const nextBtn = root.querySelector('#rcvNext');
    if (nextBtn) nextBtn.addEventListener('click', advance);

    if (key === 'arrived') {
      root.querySelectorAll('[data-arrived]').forEach(b => b.addEventListener('click', () => {
        r.arrived = b.dataset.arrived === 'true';
        if (!r.arrived) r.condition = [];
        advance();
      }));
    }
    if (key === 'condition') {
      root.querySelectorAll('[data-cond]').forEach(b => b.addEventListener('click', () => {
        r.condition = toggleCondition(r.condition, b.dataset.cond);
        drawReceiver(root);
      }));
    }
    if (key === 'photos') bindReceiverPhotoPicker(root, r);
    if (key === 'story') {
      const ta = root.querySelector('#rcvStory');
      ta.addEventListener('input', () => {
        r.story = ta.value.slice(0, RCV_STORY_MAX);
        root.querySelector('#rcvCount').textContent = `${r.story.length}/${RCV_STORY_MAX}`;
        nextBtn.innerHTML = `${r.story.trim() ? 'Next' : 'Skip'} ${I.arrow}`;
      });
    }
    if (key === 'send') root.querySelector('#rcvSend').addEventListener('click', () => sendReceiverReport(root, r));
  }

  function bindReceiverPhotoPicker(root, r) {
    const file = root.querySelector('#rcvFile');
    if (file) file.addEventListener('change', () => { addReceiverPhotos(r, Array.from(file.files || [])); });
    root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      const p = r.photos.find(x => x.id === b.dataset.remove);
      if (p && p.preview) URL.revokeObjectURL(p.preview);
      r.photos = r.photos.filter(x => x.id !== b.dataset.remove);
      drawReceiver(root);
    }));
  }

  // Re-render only on panes that show upload state; the story textarea keeps the caret.
  function redrawReceiverIfUploadPane() {
    if (rcv !== null && rcv.status === 'open' && ['photos', 'send'].includes(receiverPanes(rcv)[rcv.pane])) drawReceiver(receiverRoot());
  }

  // Long edge capped so a 12 MB phone shot never hits the server's 4 MB limit.
  function downscaleImage(file, maxEdge) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
      img.src = url;
    });
  }

  async function addReceiverPhotos(r, files) {
    for (const file of files) {
      if (r.photos.length >= RCV_MAX_PHOTOS) break;
      const p = { id: 'ph_' + Math.random().toString(36).slice(2, 8), status: 'uploading', preview: '', path: null };
      r.photos.push(p);
      redrawReceiverIfUploadPane();
      try {
        const blob = await downscaleImage(file, RCV_MAX_EDGE);
        p.preview = URL.createObjectURL(blob);
        redrawReceiverIfUploadPane();
        const res = await fetch(`/api/share/${encodeURIComponent(r.token)}/photo`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok || !j.path) throw new Error(j.error || 'Upload failed');
        p.status = 'done';
        p.path = j.path;
      } catch (e) {
        p.status = 'error'; // red ring + "Couldn't add this one"; the rest proceed
      }
      redrawReceiverIfUploadPane();
    }
  }

  async function sendReceiverReport(root, r) {
    if (r.sending) return;
    r.sending = true; r.error = null;
    drawReceiver(root);
    const report = { arrived: r.arrived, photos: r.photos.filter(p => p.status === 'done').map(p => p.path) };
    if (r.arrived && r.condition.length) report.condition = r.condition;
    if (r.story.trim()) report.story = r.story.trim().slice(0, RCV_STORY_MAX);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(r.token)}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 404) r.status = 'invalid';
      else if (res.status === 409) Object.assign(r, await fetchShareContext(r.token)); // someone else used it first — show their recap
      else if (!res.ok || !j.ok) throw new Error(j.error || 'Send failed');
      else { r.ctx = { ...r.ctx, used: true, report: j.report }; r.status = 'sent'; }
    } catch (e) {
      r.error = "Couldn't send — check your connection and try again.";
    }
    r.sending = false;
    drawReceiver(root);
    scrollTop();
  }

  // ---------- ABOUT ----------
  function renderAbout(root) {
    root.innerHTML = `
      <div class="page">
        <div class="step-head"><h2 class="title">How Ship2US works</h2><p class="lede">A clickable prototype for the end-to-end journey — not a live service.</p></div>
        <div class="card">
          <ul class="about-list">
            <li><span class="n">1</span><span><b>Fixed rules do all the math.</b> Packing, duty and cost numbers come from a seeded rule set — same input, same output, every time.</span></li>
            <li><span class="n">2</span><span><b>“AI” features are simulated.</b> The photo suggestion is a demo heuristic, and every suggestion waits for your confirmation before it counts.</span></li>
            <li><span class="n">3</span><span><b>Every regulatory estimate is labeled</b> with its source agency, an effective date and a confidence level — plus a persistent note that none of it is binding.</span></li>
            <li><span class="n">4</span><span><b>All prices are illustrative.</b> “Request a real quote” records your interest for a human follow-up; nothing is sent to carriers.</span></li>
            <li><span class="n">5</span><span><b>Feedback is community input</b> — stored separately, marked unverified, never merged into the rules automatically.</span></li>
          </ul>
          <div class="row" style="margin-top:var(--space-5);">
            <a class="btn btn-primary" href="#/estimate">Get an estimate</a>
            <a class="btn btn-secondary" href="#/admin">Admin</a>
          </div>
        </div>
      </div>`;
  }

  boot();
})();
