// =============================================================================
// SmartShip MVP — zero-dependency Node server
// Serves the SPA from /public and a small JSON-file-backed API under /api
// All data is DEMO/SEEDED. Nothing here is a live quote or regulatory record.
// =============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const EMPTY_DB = {
  shipments: [],        // saved wizard drafts (latest first, capped)
  feedback: [],         // post-shipment community feedback (unverified)
  quotes: [],           // "request a quote" clicks (demo capture)
  ruleOverrides: null,  // admin edits of tariff rules (null = seed in UI layer)
  rateOverrides: null,  // admin edits of carrier rates
  metaUpdatedAt: null   // admin-maintained "data last updated" ISO date
};

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (e) { return JSON.parse(JSON.stringify(EMPTY_DB)); }
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
  '.ico': 'image/x-icon'
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function touchMeta(db) {
  db.metaUpdatedAt = new Date().toISOString().slice(0, 10);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

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
  let body = '';
  req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
  req.on('end', () => {
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch (e) { return json(res, 400, { ok: false, error: 'Bad JSON body' }); }
    const db = readDB();
    try {
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

        case 'POST /api/feedback': {
          const f = data.feedback || {};
          f.id = 'fb_' + Date.now().toString(36);
          f.submittedAt = new Date().toISOString();
          f.unverified = true; // community input is never merged with seed data
          db.feedback.unshift(f);
          db.feedback = db.feedback.slice(0, 200);
          writeDB(db);
          return json(res, 200, { ok: true, feedback: f });
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

server.listen(PORT, '0.0.0.0', () => console.log(`SmartShip MVP listening on :${PORT}`));
