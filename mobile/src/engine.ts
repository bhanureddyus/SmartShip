// The engine is IMPORTED from the web client, never copied. Metro reaches
// `../public/js` via `watchFolders` (metro.config.js); Jest resolves the same
// relative path. `engine.js` is plain JS, so the typed surface comes from the
// hand-written `engine.d.ts` beside this file.
import type { EngineApi } from './engine.d';
import { Engine as RawEngine } from '../../public/js/engine.js';

export const Engine = RawEngine as unknown as EngineApi;

export type {
  BoxPlan,
  BoxSpec,
  Carrier,
  CostResult,
  Eligibility,
  EngineApi,
  Insight,
  InsightStory,
  Item,
  ItemRule,
  OptMode,
  PackingPlan,
  ParsedNarrative,
  Quote,
  Restriction,
  RuleInsight,
  Segment,
} from './engine.d';
