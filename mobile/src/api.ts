// Typed fetch wrappers for every `/api/*` route in `server.js`.
// Shapes are read from the server, not guessed; keep both in step.
import type { Carrier, Insight, Item, ItemRule, Segment } from './engine.d';

export const DEFAULT_API_BASE = 'https://07j9khjyer-3000.hosted.obvious.ai';

export function apiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE;
  return (env && env.trim() ? env.trim() : DEFAULT_API_BASE).replace(/\/+$/, '');
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---- report model (mirrors the spec and server validation) ----
export type ReportRole = 'sender' | 'receiver';
export type ReportStage = 'check' | 'pack' | 'cost' | 'ship' | 'arrival';
export type Verdict = 'yes' | 'not_quite';
export type Outcome = 'smooth' | 'hiccup';
export type Condition = 'all_good' | 'damaged' | 'missing' | 'opened_by_customs';

export interface Report {
  id: string;
  shipmentId: string;
  role: ReportRole;
  stage: ReportStage;
  corridor: string;
  ruleIds: string[];
  segment: Segment;
  verdict?: Verdict;
  outcome?: Outcome;
  carrier?: string;
  estimatedCost?: number;
  actualCost?: number;
  arrived?: boolean;
  condition?: Condition[];
  story?: string;
  photos: string[];
  senderName?: string;
  submittedAt: string;
  unverified: true;
  hidden?: boolean;
}

export interface SenderReportInput {
  shipmentId: string;
  role: 'sender';
  stage: Exclude<ReportStage, 'arrival'>;
  verdict?: Verdict;
  outcome?: Outcome;
  carrier?: string;
  estimatedCost?: number;
  actualCost?: number;
  story?: string;
  photos?: string[];
}

export interface ReceiverReportInput {
  arrived: boolean;
  condition?: Condition[];
  story?: string;
  photos?: string[];
}

export interface ShareContext {
  senderName: string | null;
  boxes: number | null;
  origin: string | null;
  dest: string | null;
  used: boolean;
  report?: Report;
}

export interface ServerState {
  shipments: ShipmentRecord[];
  reports: Report[];
  quotes: unknown[];
  shareTokens: unknown[];
  ruleOverrides: ItemRule[] | null;
  rateOverrides: Carrier[] | null;
  metaUpdatedAt: string;
}

// What the web client POSTs as `shipment` — the mobile store writes the same shape.
export interface ShipmentRecord {
  id: string;
  segment: Segment;
  originCountry: 'IN' | 'CN';
  origin: string;
  dest: string;
  corridor: string;
  items: Item[];
  packing?: { boxes: unknown[] } | null;
  savedAt?: string;
  [key: string]: unknown;
}

// ---- helpers ----
async function parseJson<T extends { ok: boolean; error?: string }>(res: Response): Promise<T> {
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, `Bad response (${res.status})`);
  }
  if (!res.ok || !body.ok) throw new ApiError(res.status, body.error || `Request failed (${res.status})`);
  return body;
}

async function getJson<T extends { ok: boolean; error?: string }>(path: string): Promise<T> {
  return parseJson<T>(await fetch(apiBase() + path));
}

async function sendJson<T extends { ok: boolean; error?: string }>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson<T>(res);
}

// ---- routes ----
export async function getState(): Promise<ServerState> {
  const r = await getJson<{ ok: true; state: ServerState }>('/api/state');
  return r.state;
}

export async function saveShipment(shipment: ShipmentRecord): Promise<ShipmentRecord> {
  const r = await sendJson<{ ok: true; shipment: ShipmentRecord }>('POST', '/api/shipment', { shipment });
  return r.shipment;
}

export async function postReport(report: SenderReportInput): Promise<Report> {
  const r = await sendJson<{ ok: true; report: Report }>('POST', '/api/report', { report });
  return r.report;
}

export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';

// Raw bytes, no multipart — the server sniffs magic bytes and caps at 4 MB.
export async function uploadPhoto(shipmentId: string, role: ReportRole, body: Blob | ArrayBuffer, mime: PhotoMime): Promise<string> {
  const q = `?shipmentId=${encodeURIComponent(shipmentId)}&role=${role}`;
  const res = await fetch(apiBase() + '/api/photo' + q, { method: 'POST', headers: { 'Content-Type': mime }, body });
  const r = await parseJson<{ ok: true; path: string }>(res);
  return r.path;
}

export function photoUrl(path: string): string {
  return path.startsWith('http') ? path : apiBase() + path;
}

export interface ShareResult {
  token: string;
  url: string;
  senderName: string | null;
}

export async function createShare(shipmentId: string, senderName?: string): Promise<ShareResult> {
  const r = await sendJson<{ ok: true } & ShareResult>('POST', '/api/share', { shipmentId, senderName });
  return { token: r.token, url: r.url, senderName: r.senderName };
}

export async function getShare(token: string): Promise<ShareContext> {
  const r = await getJson<{ ok: true } & ShareContext>(`/api/share/${encodeURIComponent(token)}`);
  return { senderName: r.senderName, boxes: r.boxes, origin: r.origin, dest: r.dest, used: r.used, report: r.report };
}

export async function postReceiverReport(token: string, report: ReceiverReportInput): Promise<Report> {
  const r = await sendJson<{ ok: true; report: Report }>('POST', `/api/share/${encodeURIComponent(token)}/report`, { report });
  return r.report;
}

export async function getInsight(corridor: string | null, ruleIds: string[]): Promise<Insight> {
  const params = new URLSearchParams();
  if (corridor) params.set('corridor', corridor);
  if (ruleIds.length) params.set('ruleIds', ruleIds.join(','));
  const qs = params.toString();
  const r = await getJson<{ ok: true; insight: Insight; unverified: true }>('/api/insight' + (qs ? '?' + qs : ''));
  return r.insight;
}

export async function setReportHidden(id: string, hidden: boolean): Promise<Report> {
  const r = await sendJson<{ ok: true; report: Report }>('PUT', `/api/report/${encodeURIComponent(id)}/hidden`, { hidden });
  return r.report;
}

export interface QuoteRequest {
  shipmentId: string;
  carrierId: string;
  carrierName: string;
  estTotal: number;
  email: string;
  corridor: string;
  segment: Segment;
}

export async function requestQuote(quote: QuoteRequest): Promise<void> {
  await sendJson<{ ok: true }>('POST', '/api/quote', { quote });
}
