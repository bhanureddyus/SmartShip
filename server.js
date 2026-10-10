// =============================================================================
// SmartShip MVP — zero-dependency Node server
// Serves the SPA from /public and a small JSON-file-backed API under /api
// All data is DEMO/SEEDED. Nothing here is a live quote or regulatory record.
// Community reports are UNVERIFIED input; they sit beside engine output and
// never feed eligibility, packing or cost math.
// =============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Engine } = require('./public/js/engine.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
// Overridable so tests can run against a temp copy of the seed store.
const DB_PATH = process.env.SMARTSHIP_DB || path.join(ROOT, 'data', 'db.json');
const UPLOADS = process.env.SMARTSHIP_UPLOADS || path.join(ROOT, 'data', 'uploads');
const EMPTY_DB = {
  shipments: [],        // saved wizard drafts (latest first, capped)
  feedback: [],         // legacy post-shipment feedback rows (kept intact; see migration)
  reports: [],          // community reports, both roles (unverified)
  shareTokens: [],      // single-use receiver share links
  quotes: [],           // "request a quote" clicks (demo capture)
  ruleOverrides: null,  // admin edits of tariff rules (null = seed in UI layer)
  rateOverrides: null,  // admin edits of carrier rates
  metaUpdatedAt: null   // admin-maintained "data last updated" ISO date
};

// ---- limits (spec-labeled assumptions, single constants) ----
const JSON_BODY_MAX = 5e6;          // 5 MB JSON bodies
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTOS_PER_REPORT = 4;        // also the per-shipment+role upload cap
const STORY_MAX = 280;
const SENDER_NAME_MAX = 24;
const CARRIER_MAX = 80;
const REPORTS_KEEP = 500;

const ROLE_STAGES = { sender: ['check', 'pack', 'cost', 'ship'], receiver: ['arrival'] };
const VERDICTS = ['yes', 'not_quite'];
const OUTCOMES = ['smooth', 'hiccup'];
const CONDITIONS = ['all_good', 'damaged', 'missing', 'opened_by_customs'];

// ---- JSON store ----
function newReportId() { return 'rp_' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'); }

// One-time derivation of legacy feedback rows into the report model. Pure: db in, report rows out.
function reportFromFeedback(fb, shipments) {
  const shipment = shipments.find(s => s.id === fb.shipmentId) || null;
  const condition = [];
  if (fb.inspected === 'yes') condition.push('opened_by_customs');
  if (fb.damage && fb.damage !== 'none') condition.push('damaged');
  const delayed = fb.delay && fb.delay !== 'none';
  return {
    id: fb.id ? 'rp_' + String(fb.id).replace(/^fb_/, '') : newReportId(),
    shipmentId: fb.shipmentId || null,
    role: 'sender',
    stage: 'ship',
    corridor: shipment ? shipment.corridor : (fb.corridor || null),
    ruleIds: shipment ? itemRuleIds(shipment) : [],
    segment: shipment ? shipment.segment : (fb.segment || null),
    outcome: condition.length || delayed ? 'hiccup' : 'smooth',
    carrier: fb.carrier || undefined,
    estimatedCost: typeof fb.estimatedCost === 'number' ? fb.estimatedCost : undefined,
    actualCost: typeof fb.actualCost === 'number' ? fb.actualCost : undefined,
    condition,
    story: typeof fb.comments === 'string' ? fb.comments.trim().slice(0, STORY_MAX) : undefined,
    photos: [],
    submittedAt: fb.submittedAt || new Date().toISOString(),
    unverified: true,
    migratedFrom: fb.id || null
  };
}

function readDB() {
  let db;
  try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (e) { db = JSON.parse(JSON.stringify(EMPTY_DB)); }
  // Boot migration: runs exactly once because `reports` exists afterwards. `feedback` is left intact.
  if (db.reports === undefined) {
    db.reports = (db.feedback || []).map(fb => reportFromFeedback(fb, db.shipments || []));
    db.shareTokens = db.shareTokens || [];
    writeDB(db);
  }
  for (const k of Object.keys(EMPTY_DB)) if (db[k] === undefined) db[k] = JSON.parse(JSON.stringify(EMPTY_DB[k]));
  return db;
}
function writeDB(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DB_PATH + '.tmp', DB_PATH);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function touchMeta(db) {
  db.metaUpdatedAt = new Date().toISOString().slice(0, 10);
}

// ---- report helpers (pure) ----
function itemRuleIds(shipment) {
  return [...new Set((shipment.items || []).map(it => it.ruleId).filter(Boolean))];
}

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

// Validates and normalises a client report against its shipment. Returns
// { ok:true, report } or { ok:false, code, error }. `forced` pins role/stage
// (receiver token route) so the client cannot pick them.
function buildReport(input, shipment, forced) {
  const src = input && typeof input === 'object' ? input : {};
  const role = forced ? forced.role : src.role;
  const stage = forced ? forced.stage : src.stage;
  const fail = (code, error) => ({ ok: false, code, error });

  if (!ROLE_STAGES[role] || !ROLE_STAGES[role].includes(stage)) return fail(422, 'Illegal role/stage pair');
  if (src.verdict !== undefined && !VERDICTS.includes(src.verdict)) return fail(422, 'Invalid verdict');
  if (src.outcome !== undefined && !OUTCOMES.includes(src.outcome)) return fail(422, 'Invalid outcome');
  if (src.arrived !== undefined && typeof src.arrived !== 'boolean') return fail(422, 'arrived must be boolean');
  for (const k of ['estimatedCost', 'actualCost']) {
    if (src[k] !== undefined && (!isFiniteNumber(src[k]) || src[k] < 0)) return fail(422, `${k} must be a non-negative number`);
  }
  for (const [k, max] of [['story', STORY_MAX], ['senderName', SENDER_NAME_MAX], ['carrier', CARRIER_MAX]]) {
    if (src[k] === undefined || src[k] === null) continue;
    if (typeof src[k] !== 'string') return fail(422, `${k} must be a string`);
    if (src[k].trim().length > max) return fail(422, `${k} exceeds ${max} characters`);
  }
  if (src.condition !== undefined) {
    if (!Array.isArray(src.condition) || src.condition.some(c => !CONDITIONS.includes(c))) return fail(422, 'Invalid condition');
  }
  const photos = src.photos === undefined ? [] : src.photos;
  if (!Array.isArray(photos) || photos.length > PHOTOS_PER_REPORT) return fail(422, `photos must be an array of at most ${PHOTOS_PER_REPORT}`);
  const prefix = `/uploads/${shipment.id}/`;
  for (const p of photos) {
    if (typeof p !== 'string' || !p.startsWith(prefix) || p.slice(prefix.length).includes('/') || p.includes('..')) {
      return fail(422, 'Photo path outside the shipment folder');
    }
  }

  const str = v => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const report = {
    id: newReportId(),
    shipmentId: shipment.id,
    role, stage,
    corridor: shipment.corridor,
    ruleIds: itemRuleIds(shipment),
    segment: shipment.segment,
    verdict: src.verdict,
    outcome: src.outcome,
    carrier: str(src.carrier),
    estimatedCost: src.estimatedCost,
    actualCost: src.actualCost,
    arrived: src.arrived,
    condition: src.condition ? [...new Set(src.condition)] : undefined,
    story: str(src.story),
    photos,
    senderName: str(src.senderName),
    submittedAt: new Date().toISOString(),
    unverified: true // literal — community input is never merged with seed data
  };
  for (const k of Object.keys(report)) if (report[k] === undefined) delete report[k];
  return { ok: true, report };
}

function storeReport(db, report) {
  db.reports.unshift(report);
  db.reports = db.reports.slice(0, REPORTS_KEEP);
}

// ---- photo helpers ----
const IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: buf => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/png': { ext: 'png', magic: buf => buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: buf => buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP' }
};
function contentTypeOf(req) { return String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(); }
const SHARE_ROUTE_RE = /^\/api\/share\/([A-Za-z0-9_-]+)(\/report|\/photo)?$/;
// Raw-byte routes: the sender upload and the token-scoped receiver upload share one body cap and one handler.
function isPhotoRoute(req, url) {
  if (req.method !== 'POST') return false;
  if (url.pathname === '/api/photo') return true;
  const m = url.pathname.match(SHARE_ROUTE_RE);
  return Boolean(m && m[2] === '/photo');
}

// Validates and writes one uploaded image. Returns { code, body } so both photo routes answer identically.
function storePhoto(req, raw, shipmentId, role) {
  const type = IMAGE_TYPES[contentTypeOf(req)];
  if (!type) return { code: 415, body: { ok: false, error: 'Content-Type must be image/jpeg, image/png or image/webp' } };
  if (raw.length < 12 || !type.magic(raw)) return { code: 415, body: { ok: false, error: 'Body is not a valid image' } };
  const dir = path.join(UPLOADS, shipmentId);
  if (countPhotos(dir, role) >= PHOTOS_PER_REPORT) return { code: 409, body: { ok: false, error: `At most ${PHOTOS_PER_REPORT} photos per shipment` } };
  fs.mkdirSync(dir, { recursive: true });
  const name = `${role}-${newReportId().slice(3)}.${type.ext}`;
  fs.writeFileSync(path.join(dir, name), raw);
  return { code: 200, body: { ok: true, path: `/uploads/${shipmentId}/${name}` } };
}

// Files are named `<role>-<id>.<ext>` so the per-shipment+role cap is a directory listing, not a db field.
function countPhotos(dir, role) {
  try { return fs.readdirSync(dir).filter(f => f.startsWith(role + '-')).length; }
  catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
}

// ---- share helpers ----
function newShareToken() { return crypto.randomBytes(12).toString('base64url'); }
function shareUrl(req, token) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}/#/r/${token}`;
}
function shareContext(token, db) {
  const shipment = db.shipments.find(s => s.id === token.shipmentId) || {};
  const report = token.usedAt ? db.reports.find(r => r.shipmentId === token.shipmentId && r.role === 'receiver') : undefined;
  // Deliberately NOT the full shipment: no cost, no items detail.
  return {
    senderName: token.senderName || null,
    boxes: shipment.packing && Array.isArray(shipment.packing.boxes) ? shipment.packing.boxes.length : null,
    origin: shipment.origin || null,
    dest: shipment.dest || null,
    used: Boolean(token.usedAt),
    report: report || undefined
  };
}

// ---- static serving (public/ and data/uploads/) ----
function serveStatic(res, baseDir, rel, extraHeaders, onMiss) {
  const file = path.normalize(path.join(baseDir, rel));
  if (file !== baseDir && !file.startsWith(baseDir + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) return onMiss();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...extraHeaders });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Permissive CORS: the Expo app (Expo Go, or the web export on another hosted
  // origin) calls /api/* cross-origin. Set before routing so every response —
  // static, uploads, API, errors — carries the headers.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (url.pathname.startsWith('/uploads/')) {
    return serveStatic(res, UPLOADS, url.pathname.slice('/uploads'.length), { 'Cache-Control': 'public, max-age=86400' },
      () => { res.writeHead(404); res.end('Not found'); });
  }

  if (!url.pathname.startsWith('/api/')) {
    // ---- static files ----
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // SPA fallback: serve index for extension-less paths
        if (!path.extname(rel)) {
          return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, b2) => {
            if (e2) { res.writeHead(404); return res.end('Not found'); }
            res.writeHead(200, { 'Content-Type': MIME['.html'] });
            res.end(b2);
          });
        }
        res.writeHead(404); return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
    return;
  }

  // ---- API ----
  const photoRoute = isPhotoRoute(req, url);
  const bodyMax = photoRoute ? PHOTO_MAX_BYTES : JSON_BODY_MAX;
  const chunks = [];
  let received = 0, tooLarge = false;
  req.on('data', c => {
    received += c.length;
    if (received > bodyMax) {
      if (!tooLarge) { tooLarge = true; json(res, 413, { ok: false, error: `Body exceeds ${bodyMax} bytes` }); req.destroy(); }
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (tooLarge) return;
    const raw = Buffer.concat(chunks);
    let data = {};
    if (!photoRoute) {
      try { data = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch (e) { return json(res, 400, { ok: false, error: 'Bad JSON body' }); }
    }
    const db = readDB();
    try {
      // Parameterised routes first; the fixed ones fall through to the switch.
      const shareMatch = url.pathname.match(SHARE_ROUTE_RE);
      if (shareMatch) {
        const token = db.shareTokens.find(t => t.token === shareMatch[1]);
        if (req.method === 'GET' && !shareMatch[2]) {
          if (!token) return json(res, 404, { ok: false, error: 'Unknown share token' });
          return json(res, 200, { ok: true, ...shareContext(token, db) });
        }
        if (req.method === 'POST' && shareMatch[2]) {
          if (!token) return json(res, 404, { ok: false, error: 'Unknown share token' });
          if (token.usedAt) return json(res, 409, { ok: false, error: 'This link was already used' });
          const shipment = db.shipments.find(s => s.id === token.shipmentId);
          if (!shipment) return json(res, 404, { ok: false, error: 'Unknown shipment' });
          if (shareMatch[2] === '/photo') {
            // The receiver page never learns the shipment id; the token scopes the upload and pins the role.
            const stored = storePhoto(req, raw, shipment.id, 'receiver');
            return json(res, stored.code, stored.body);
          }
          const built = buildReport({ ...(data.report || {}), senderName: token.senderName }, shipment, { role: 'receiver', stage: 'arrival' });
          if (!built.ok) return json(res, built.code, { ok: false, error: built.error });
          token.usedAt = built.report.submittedAt;
          storeReport(db, built.report);
          writeDB(db);
          return json(res, 200, { ok: true, report: built.report });
        }
      }
      const hiddenMatch = url.pathname.match(/^\/api\/report\/([A-Za-z0-9_]+)\/hidden$/);
      if (hiddenMatch && req.method === 'PUT') {
        const report = db.reports.find(r => r.id === hiddenMatch[1]);
        if (!report) return json(res, 404, { ok: false, error: 'Unknown report' });
        if (typeof data.hidden !== 'boolean') return json(res, 422, { ok: false, error: 'hidden must be boolean' });
        report.hidden = data.hidden; // admin moderation; hidden reports never reach insight
        writeDB(db);
        return json(res, 200, { ok: true, report });
      }

      switch (req.method + ' ' + url.pathname) {
        case 'GET /api/state':
          return json(res, 200, { ok: true, state: db });

        case 'POST /api/shipment': {
          const s = data.shipment || {};
          s.id = s.id || 'shp_' + Date.now().toString(36);
          s.savedAt = new Date().toISOString();
          db.shipments = [s, ...db.shipments.filter(x => x.id !== s.id)].slice(0, 25);
          writeDB(db);
          return json(res, 200, { ok: true, shipment: s });
        }

        case 'POST /api/report': {
          const input = data.report || {};
          const shipment = db.shipments.find(s => s.id === input.shipmentId);
          if (!shipment) return json(res, 404, { ok: false, error: 'Unknown shipment' });
          const built = buildReport(input, shipment, null);
          if (!built.ok) return json(res, built.code, { ok: false, error: built.error });
          storeReport(db, built.report);
          writeDB(db);
          return json(res, 200, { ok: true, report: built.report });
        }

        case 'POST /api/feedback': {
          // Legacy alias for the current web client: the six-field card becomes a sender/ship report.
          const f = data.feedback || {};
          const shipment = db.shipments.find(s => s.id === f.shipmentId);
          if (!shipment) return json(res, 404, { ok: false, error: 'Unknown shipment' });
          const built = buildReport({
            role: 'sender', stage: 'ship',
            carrier: f.carrier,
            estimatedCost: isFiniteNumber(f.estimatedCost) ? f.estimatedCost : undefined,
            actualCost: isFiniteNumber(f.actualCost) ? f.actualCost : undefined,
            outcome: (f.inspected === 'yes' || (f.damage && f.damage !== 'none') || (f.delay && f.delay !== 'none')) ? 'hiccup' : 'smooth',
            condition: [f.inspected === 'yes' ? 'opened_by_customs' : null, f.damage && f.damage !== 'none' ? 'damaged' : null].filter(Boolean),
            story: typeof f.comments === 'string' ? f.comments.trim().slice(0, STORY_MAX) : undefined
          }, shipment, null);
          if (!built.ok) return json(res, built.code, { ok: false, error: built.error });
          storeReport(db, built.report);
          writeDB(db);
          return json(res, 200, { ok: true, feedback: built.report, report: built.report });
        }

        case 'POST /api/photo': {
          const shipmentId = url.searchParams.get('shipmentId') || '';
          const role = url.searchParams.get('role') || 'sender';
          if (!ROLE_STAGES[role]) return json(res, 422, { ok: false, error: 'Invalid role' });
          if (!db.shipments.some(s => s.id === shipmentId)) return json(res, 404, { ok: false, error: 'Unknown shipment' });
          const stored = storePhoto(req, raw, shipmentId, role);
          return json(res, stored.code, stored.body);
        }

        case 'POST /api/share': {
          const shipmentId = data.shipmentId || '';
          if (!db.shipments.some(s => s.id === shipmentId)) return json(res, 404, { ok: false, error: 'Unknown shipment' });
          const senderName = typeof data.senderName === 'string' ? data.senderName.trim() : '';
          if (senderName.length > SENDER_NAME_MAX) return json(res, 422, { ok: false, error: `senderName exceeds ${SENDER_NAME_MAX} characters` });
          let token = db.shareTokens.find(t => t.shipmentId === shipmentId && !t.usedAt);
          if (!token) {
            token = { token: newShareToken(), shipmentId, createdAt: new Date().toISOString() };
            db.shareTokens.unshift(token);
          }
          if (senderName) token.senderName = senderName;
          writeDB(db);
          return json(res, 200, { ok: true, token: token.token, url: shareUrl(req, token.token), senderName: token.senderName || null });
        }

        case 'GET /api/insight': {
          const corridor = url.searchParams.get('corridor') || null;
          const ruleIds = (url.searchParams.get('ruleIds') || '').split(',').map(s => s.trim()).filter(Boolean);
          return json(res, 200, { ok: true, insight: Engine.insightFor(db.reports, corridor, ruleIds), unverified: true });
        }

        case 'POST /api/quote': {
          const q = data.quote || {};
          q.id = 'qt_' + Date.now().toString(36);
          q.requestedAt = new Date().toISOString();
          db.quotes.unshift(q);
          db.quotes = db.quotes.slice(0, 200);
          writeDB(db);
          return json(res, 200, { ok: true, quote: q });
        }

        case 'PUT /api/rules': {
          db.ruleOverrides = data.rules || [];
          touchMeta(db);
          writeDB(db);
          return json(res, 200, { ok: true, metaUpdatedAt: db.metaUpdatedAt });
        }

        case 'PUT /api/rates': {
          db.rateOverrides = data.rates || [];
          touchMeta(db);
          writeDB(db);
          return json(res, 200, { ok: true, metaUpdatedAt: db.metaUpdatedAt });
        }

        case 'PUT /api/meta': {
          db.metaUpdatedAt = data.dataLastUpdated || db.metaUpdatedAt;
          writeDB(db);
          return json(res, 200, { ok: true, metaUpdatedAt: db.metaUpdatedAt });
        }

        case 'POST /api/reset': {
          db.ruleOverrides = null;
          db.rateOverrides = null;
          touchMeta(db);
          writeDB(db);
          return json(res, 200, { ok: true, metaUpdatedAt: db.metaUpdatedAt });
        }

        default:
          return json(res, 404, { ok: false, error: 'Unknown endpoint' });
      }
    } catch (e) {
      return json(res, 500, { ok: false, error: String((e && e.message) || e) });
    }
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`SmartShip MVP listening on :${PORT}`));
}

module.exports = { server, readDB, writeDB, buildReport, reportFromFeedback, DB_PATH, UPLOADS };
