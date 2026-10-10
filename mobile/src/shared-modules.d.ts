// Ambient declarations for the plain-JS files imported from `../public/js`.
// They are typed loosely here and narrowed by the casts in `engine.ts` and
// `data.ts` against the hand-written surface in `engine.d.ts`.
declare module '*/public/js/engine.js' {
  export const Engine: unknown;
}

declare module '*/public/js/data.js' {
  export const SEED: unknown;
  export const VALUE_DEFAULTS: unknown;
}
