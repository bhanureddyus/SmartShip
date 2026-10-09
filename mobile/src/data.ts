// Seed data imported from the web client (see engine.ts for the rationale).
import type { Seed } from './engine.d';
import { SEED as RawSeed } from '../../public/js/data.js';

export const SEED = RawSeed as unknown as Seed;
export type { Seed } from './engine.d';
