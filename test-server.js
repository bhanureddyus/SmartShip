// Route-level tests for the community report API (Node 20, no DOM, no deps).
// Spins the server on a random port against a TEMP COPY of data/db.json so the
// tracked seed store is never mutated. Covers spec criteria A1, A2, A3, A5.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'smartship-test-'));
const DB_COPY = path.join(TMP, 'db.json');
fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), DB_COPY);
process.env.SMARTSHIP_DB = DB_COPY;
process.env.SMARTSHIP_UPLOADS = path.join(TMP, 'uploads');

const { server } = require('./server.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name, extra || ''); }
  else { fail++; console.log('FAIL', name, extra || ''); }
}

// ---- tiny real images ----
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// A valid 1×1 RGBA PNG built from scratch (signature + IHDR + IDAT + IEND).
function onePixelPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(Buffer.from([0, 0x12, 0x34, 0x56, 0xff]));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))
  ]);
}
// JPEG SOI + APP0 header + EOI — enough bytes to carry the JFIF magic the server checks.
function jpegStub() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'ascii'), Buffer.alloc(16), Buffer.from([0xff, 0xd9])]);
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, p, body, headers) => {
    const r = await fetch(base + p, {
      method,
      headers: headers || (body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body))
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* non-JSON (static) */ }
    return { status: r.status, headers: r.headers, json, text };
  };

  const seed = JSON.parse(fs.readFileSync(DB_COPY, 'utf8'));
  check('seed has no reports yet (migration pending)', seed.reports === undefined && Array.isArray(seed.feedback));

  // ---------------- A5: boot migration ----------------
  let st = (await api('GET', '/api/state')).json.state;
  check('A5 migration creates reports from feedback', Array.isArray(st.reports) && st.reports.length === seed.feedback.length, `${st.reports.length} reports`);
  check('A5 feedback left intact', JSON.stringify(st.feedback) === JSON.stringify(seed.feedback));
  const migrated = st.reports.find(r => r.migratedFrom === 'fb_mv1e6s4h');
  check('A5 migrated row is sender/ship with derived condition', migrated && migrated.role === 'sender' && migrated.stage === 'ship'
    && migrated.condition.includes('opened_by_customs') && migrated.photos.length === 0 && migrated.unverified === true, JSON.stringify(migrated && migrated.condition));
  check('A5 migrated row copies corridor/ruleIds from its shipment', migrated && migrated.corridor === 'IN-US' && migrated.ruleIds.includes('pickles'), JSON.stringify(migrated && migrated.ruleIds));
  check('A5 shareTokens initialised', Array.isArray(st.shareTokens) && st.shareTokens.length === 0);
  const onDisk = JSON.parse(fs.readFileSync(DB_COPY, 'utf8'));
  check('A5 migration persisted once', Array.isArray(onDisk.reports) && onDisk.reports.length === seed.feedback.length);

  const shipment = st.shipments.find(s => s.id === 'shp_mv1e4gs5href');
  const sid = shipment.id;
  const expectedRuleIds = [...new Set(shipment.items.map(i => i.ruleId))];

  // ---------------- A1: POST /api/report ----------------
  let r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'check', verdict: 'yes', story: '  Pickles sailed through.  ' } });
  check('A1 valid report accepted', r.status === 200 && r.json.ok, r.status);
  const rep = r.json.report || {};
  check('A1 stamps id/submittedAt/unverified', /^rp_/.test(rep.id) && !isNaN(Date.parse(rep.submittedAt)) && rep.unverified === true, rep.id);
  check('A1 copies corridor/ruleIds/segment from shipment', rep.corridor === 'IN-US' && rep.segment === 'consumer' && JSON.stringify(rep.ruleIds) === JSON.stringify(expectedRuleIds), JSON.stringify(rep.ruleIds));
  check('A1 story trimmed', rep.story === 'Pickles sailed through.');
  check('A1 photos default []', Array.isArray(rep.photos) && rep.photos.length === 0);
  st = (await api('GET', '/api/state')).json.state;
  check('A1 report visible in /api/state (newest first)', st.reports[0] && st.reports[0].id === rep.id);

  r = await api('POST', '/api/report', { report: { shipmentId: 'shp_nope', role: 'sender', stage: 'check' } });
  check('A1 unknown shipment → 404', r.status === 404, r.status);
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'receiver', stage: 'check' } });
  check('A1 illegal role/stage → 422', r.status === 422, r.status);
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'ship', story: 'x'.repeat(281) } });
  check('A1 story > 280 → 422', r.status === 422, r.status);
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'ship', photos: ['/uploads/shp_other/a.jpg'] } });
  check('A1 photo path outside shipment folder → 422', r.status === 422, r.status);
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'ship', photos: [`/uploads/${sid}/../x.jpg`] } });
  check('A1 photo path traversal → 422', r.status === 422, r.status);
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'ship', verdict: 'maybe' } });
  check('A1 invalid verdict → 422', r.status === 422, r.status);
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'ship', photos: [1, 2, 3, 4, 5].map(i => `/uploads/${sid}/p${i}.jpg`) } });
  check('A1 more than 4 photos → 422', r.status === 422, r.status);

  // legacy alias
  r = await api('POST', '/api/feedback', { feedback: { shipmentId: sid, segment: 'consumer', carrier: 'UPS Worldwide Saver', estimatedCost: 210, actualCost: 238, delay: 'none', inspected: 'yes', damage: 'none', comments: 'Opened at customs, arrived fine.' } });
  check('A1 /api/feedback alias writes sender/ship report', r.status === 200 && r.json.report.role === 'sender' && r.json.report.stage === 'ship'
    && r.json.report.condition.includes('opened_by_customs') && r.json.report.actualCost === 238, JSON.stringify(r.json.report && r.json.report.condition));

  // ---------------- A2: POST /api/photo + GET /uploads ----------------
  const png = onePixelPng();
  r = await api('POST', `/api/photo?shipmentId=${sid}`, png, { 'Content-Type': 'image/png' });
  check('A2 real PNG accepted', r.status === 200 && r.json.ok && r.json.path.startsWith(`/uploads/${sid}/`), r.json && r.json.path);
  const photoPath = r.json.path;
  const served = await fetch(base + photoPath);
  const servedBytes = Buffer.from(await served.arrayBuffer());
  check('A2 uploaded photo is served byte-for-byte', served.status === 200 && served.headers.get('content-type') === 'image/png' && servedBytes.equals(png), served.status);
  check('A2 uploads carry cache header', (served.headers.get('cache-control') || '').includes('max-age=86400'), served.headers.get('cache-control'));
  r = await api('POST', `/api/photo?shipmentId=${sid}`, jpegStub(), { 'Content-Type': 'image/jpeg' });
  check('A2 JPEG accepted with .jpg extension', r.status === 200 && r.json.path.endsWith('.jpg'), r.json && r.json.path);
  r = await api('POST', `/api/photo?shipmentId=${sid}`, Buffer.from('definitely not an image, just text padding here'), { 'Content-Type': 'image/jpeg' });
  check('A2 text with image Content-Type → 415', r.status === 415, r.status);
  r = await api('POST', `/api/photo?shipmentId=${sid}`, png, { 'Content-Type': 'text/plain' });
  check('A2 non-image Content-Type → 415', r.status === 415, r.status);
  r = await api('POST', `/api/photo?shipmentId=shp_nope`, png, { 'Content-Type': 'image/png' });
  check('A2 unknown shipment → 404', r.status === 404, r.status);
  await api('POST', `/api/photo?shipmentId=${sid}`, png, { 'Content-Type': 'image/png' });
  await api('POST', `/api/photo?shipmentId=${sid}`, png, { 'Content-Type': 'image/png' });
  r = await api('POST', `/api/photo?shipmentId=${sid}`, png, { 'Content-Type': 'image/png' });
  check('A2 5th photo for shipment+role → 409', r.status === 409, r.status);
  r = await api('POST', `/api/photo?shipmentId=${sid}&role=receiver`, png, { 'Content-Type': 'image/png' });
  check('A2 receiver role has its own quota', r.status === 200, r.status);
  const big = Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]);
  r = await fetch(`${base}/api/photo?shipmentId=${sid}&role=receiver`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: big }).then(x => x.status).catch(() => 'conn-reset');
  check('A2 photo > 4 MB rejected', r === 413 || r === 'conn-reset', String(r));
  r = await api('GET', '/uploads/../db.json');
  check('A2 path traversal on /uploads blocked', r.status === 403 || r.status === 404, r.status);
  r = await api('GET', `/uploads/${sid}/missing.png`);
  check('A2 missing upload → 404', r.status === 404, r.status);
  // a report may reference the uploaded path
  r = await api('POST', '/api/report', { report: { shipmentId: sid, role: 'sender', stage: 'ship', outcome: 'smooth', photos: [photoPath] } });
  check('A1 report with in-folder photo path accepted', r.status === 200 && r.json.report.photos[0] === photoPath, r.status);

  // ---------------- A3: share tokens ----------------
  r = await api('POST', '/api/share', { shipmentId: sid, senderName: 'Bhanu' });
  check('A3 share token created', r.status === 200 && typeof r.json.token === 'string' && r.json.token.length === 16, r.json && r.json.token);
  const token = r.json.token;
  check('A3 url built from Host header', r.json.url === `${base}/#/r/${token}`, r.json.url);
  const again = await api('POST', '/api/share', { shipmentId: sid });
  check('A3 idempotent per shipment', again.json.token === token);
  r = await api('POST', '/api/share', { shipmentId: 'shp_nope' });
  check('A3 share for unknown shipment → 404', r.status === 404, r.status);
  r = await api('POST', '/api/share', { shipmentId: sid, senderName: 'x'.repeat(25) });
  check('A3 senderName > 24 → 422', r.status === 422, r.status);

  r = await api('GET', `/api/share/${token}`);
  check('A3 context returns sender/origin/dest/boxes', r.status === 200 && r.json.senderName === 'Bhanu' && r.json.origin === 'Hyderabad' && r.json.dest && r.json.used === false && typeof r.json.boxes === 'number', JSON.stringify(r.json));
  check('A3 context leaks no cost or items', r.json.cost === undefined && r.json.items === undefined && r.json.shipment === undefined);
  r = await api('GET', '/api/share/nope-nope-nope');
  check('A3 unknown token GET → 404', r.status === 404, r.status);

  // token-scoped receiver photo upload (the receiver page never sees the shipment id)
  r = await api('POST', `/api/share/${token}/photo`, png, { 'Content-Type': 'image/png' });
  check('A3 token photo upload lands in the shipment folder as receiver', r.status === 200 && r.json.path.startsWith(`/uploads/${sid}/receiver-`), r.json && r.json.path);
  const receiverPhoto = r.json.path;
  r = await api('POST', `/api/share/${token}/photo`, Buffer.from('definitely not an image, just text padding here'), { 'Content-Type': 'image/png' });
  check('A3 token photo rejects non-image bytes → 415', r.status === 415, r.status);
  r = await api('POST', '/api/share/nope-nope-nope/photo', png, { 'Content-Type': 'image/png' });
  check('A3 token photo unknown token → 404', r.status === 404, r.status);

  r = await api('POST', `/api/share/${token}/report`, { report: { role: 'sender', stage: 'check', arrived: true, condition: ['opened_by_customs'], story: 'All jars intact.', senderName: 'Spoof', photos: [receiverPhoto] } });
  check('A3 receiver report forced to receiver/arrival', r.status === 200 && r.json.report.role === 'receiver' && r.json.report.stage === 'arrival' && r.json.report.arrived === true, JSON.stringify(r.json));
  check('A3 receiver report keeps the token-uploaded photo', r.status === 200 && r.json.report.photos[0] === receiverPhoto);
  check('A3 senderName comes from the token, not the body', r.json.report.senderName === 'Bhanu', r.json.report && r.json.report.senderName);
  r = await api('POST', `/api/share/${token}/report`, { report: { arrived: true } });
  check('A3 token reuse → 409', r.status === 409, r.status);
  r = await api('POST', `/api/share/${token}/photo`, png, { 'Content-Type': 'image/png' });
  check('A3 token photo after use → 409', r.status === 409, r.status);
  r = await api('POST', '/api/share/nope-nope-nope/report', { report: { arrived: true } });
  check('A3 unknown token POST → 404', r.status === 404, r.status);
  r = await api('GET', `/api/share/${token}`);
  check('A3 used token returns read-only recap', r.json.used === true && r.json.report && r.json.report.role === 'receiver');
  st = (await api('GET', '/api/state')).json.state;
  check('A3 usedAt persisted on the token', st.shareTokens.find(t => t.token === token).usedAt);
  const fresh = await api('POST', '/api/share', { shipmentId: sid });
  check('A3 a used token is replaced by a fresh one', fresh.json.token !== token);

  // ---------------- moderation + insight route ----------------
  r = await api('PUT', `/api/report/${rep.id}/hidden`, { hidden: true });
  check('PUT hidden sets flag', r.status === 200 && r.json.report.hidden === true, r.status);
  r = await api('PUT', `/api/report/${rep.id}/hidden`, { hidden: 'yes' });
  check('PUT hidden non-boolean → 422', r.status === 422, r.status);
  r = await api('PUT', '/api/report/rp_nope/hidden', { hidden: true });
  check('PUT hidden unknown → 404', r.status === 404, r.status);
  r = await api('GET', '/api/insight?corridor=IN-US&ruleIds=pickles,snacks');
  check('GET insight returns per-rule roll-up with unverified flag', r.status === 200 && r.json.unverified === true && r.json.insight.rules.pickles && typeof r.json.insight.rules.pickles.reports === 'number', JSON.stringify(r.json.insight && r.json.insight.rules));
  st = (await api('GET', '/api/state')).json.state;
  const visible = st.reports.filter(x => !x.hidden && x.corridor === 'IN-US').length;
  check('GET insight excludes hidden reports', r.json.insight.reports === visible, `${r.json.insight.reports} vs ${visible}`);

  // seed store untouched
  const tracked = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
  check('tracked data/db.json not mutated by tests', tracked.reports === undefined || tracked.reports.length === tracked.feedback.length);

  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
