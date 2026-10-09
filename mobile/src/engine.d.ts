// Hand-written types for the plain-JS engine and seed in `../../public/js`.
// Keep this in step with `engine.js` / `data.js`; only the surface the mobile
// app uses is typed here.

export type Segment = 'consumer' | 'business';
export type Restriction = 'ok' | 'caution' | 'restricted';
export type Confidence = 'high' | 'medium' | 'low';

export interface ItemRule {
  id: string;
  name: string;
  keywords: string[];
  hts: string;
  dutyRate: number;
  flags: string[];
  restriction: Restriction;
  docs: string[];
  consumerNote: string;
  businessNote: string;
  effectiveDate: string | null;
  source: string | null;
  confidence: Confidence | null;
  defaultWeightKgPerUnit?: number;
  volumePerKg?: number;
  valuePerKg?: number;
  valuePerUnit?: number;
}

export interface Item {
  uid: string;
  desc: string;
  qty: number;
  unit: string;
  weightKg: number;
  valueUsd: number;
  ruleId: string | null;
  source: string;
}

export interface ParsedItem {
  uid: string;
  desc: string;
  qty: number;
  unit: string;
  weightKg: number | null;
}

export interface ParsedRoute {
  origin: string | null;
  dest: string;
  originCountry: 'IN' | 'CN';
  corridor: 'IN-US' | 'CN-US';
}

export interface ParsedNarrative {
  route: ParsedRoute | null;
  items: ParsedItem[];
  unknown: string[];
  raw: string;
}

export interface Eligibility {
  category: string;
  hts: string;
  dutyRate: number | null;
  flags: string[];
  restriction: Restriction;
  docs: string[];
  note: string;
  effectiveDate: string | null;
  source: string | null;
  confidence: Confidence | null;
}

export interface BoxSpec {
  id: string;
  name: string;
  dimsIn: [number, number, number];
  maxKg: number;
  tareKg: number;
  cost: number;
}

export interface BoxPlan {
  seq: number;
  boxId: string;
  boxName: string;
  dimsIn: [number, number, number];
  tareKg: number;
  group: 'padded' | 'food' | 'general';
  groupNote: string;
  forced: boolean;
  contents: string[];
  actualKg: number;
  dimKg: number;
  chargeableKg: number;
  utilization: number;
}

export interface PackingPlan {
  boxes: BoxPlan[];
  materials: {
    boxes: { label: string; n: number }[];
    tapeRolls: number;
    bubbleWrapRolls: number;
    linerBags: number;
    labels: number;
  };
  notes: string[];
  splitHint: string | null;
  groups: { key: 'padded' | 'food' | 'general'; label: string; weightKg: number; items: string[] }[];
}

export interface Carrier {
  id: string;
  name: string;
  tier: string;
  tracking: string;
  features?: string[];
  bannedFlags?: string[];
  banNote?: string;
  customsIncluded?: string | null;
  quoteLabel?: string;
  rates: Record<string, { base: number; perKg: number; daysMin: number; daysMax: number }>;
}

export interface Quote {
  carrierId: string;
  name: string;
  tier: string;
  freight: number;
  fuel: number;
  packaging: number;
  duties: number;
  fees: number;
  insurance: number;
  customs: number;
  total: number;
  daysMin: number;
  daysMax: number;
  tracking: string;
  features: string[];
  customsIncluded: string | null;
  quoteLabel: string;
}

export interface CostResult {
  quotes: Quote[];
  chargeableKg: number;
  packagingCost: number;
  duties: number;
  fees: number;
  declaredTotal: number;
  dutyLines: { item: string; value: number; rate: number; duty: number }[];
}

export type OptMode = 'cheapest' | 'fastest' | 'balance';

export interface InsightStory {
  story: string;
  role: 'sender' | 'receiver';
  stage: string;
  senderName: string | null;
  submittedAt: string;
}

export interface RuleInsight {
  reports: number;
  sparse: boolean;
  yes?: number;
  notQuite?: number;
  openedByCustoms?: number;
  damaged?: number;
  missing?: number;
  refusedHint?: number;
  stories?: InsightStory[];
  photos?: string[];
}

export interface Insight {
  corridor: string | null;
  reports: number;
  rules: Record<string, RuleInsight>;
  costSamples: { estimated: number; actual: number; carrier: string | null; submittedAt: string }[];
  stories: InsightStory[];
  photos: string[];
}

export interface EngineApi {
  parseNarrative(text: string): ParsedNarrative;
  matchRule(name: string): ItemRule | null;
  makeItem(desc: string, qty: number, unit: string, weightKg: number | null, rule: ItemRule | null, source: string): Item;
  eligibilityFor(item: Item, rules: ItemRule[], segment: Segment): Eligibility;
  planPacking(items: Item[], boxes: BoxSpec[], rules?: ItemRule[]): PackingPlan;
  costQuotes(boxes: BoxPlan[], items: Item[], carriers: Carrier[], corridor: string, segment: Segment, rules?: ItemRule[]): CostResult;
  pickBest(quotes: Quote[], mode: OptMode): Quote | null;
  insightFor(reports: unknown[], corridor: string | null, ruleIds: string[]): Insight;
  round2(n: number): number;
  DIM_DIVISOR: number;
  INSIGHT_MIN_REPORTS: number;
}

export interface Seed {
  meta: {
    productName: string;
    productLine: string;
    dataLastUpdated: string;
    disclaimer: string;
    corridors: { id: string; label: string; from: string; to: string }[];
    originCountries: { id: 'IN' | 'CN'; label: string; cities: string[] }[];
    destinations: string[];
  };
  flagInfo: Record<string, { label: string; tip: string }>;
  restrictionLevels: Record<Restriction, { label: string; cls: string }>;
  itemRules: ItemRule[];
  boxes: BoxSpec[];
  carriers: Carrier[];
  demo: {
    id: string;
    route: { originCountry: 'IN' | 'CN'; origin: string; dest: string; corridor: string };
    segment: Segment;
    narrative: string;
    items: Item[];
  };
}

export const Engine: EngineApi;
export const SEED: Seed;
export const VALUE_DEFAULTS: { perKg: number; perUnit: number };
