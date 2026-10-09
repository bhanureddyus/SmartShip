// Design tokens mirrored from `public/styles.css` + `public/app.css` (light
// mode only in this cut). Values are the resolved light-mode hex/rgba so the
// app reads the same as the web client.

export const colors = {
  // surfaces
  surfaceBase: '#fcfcfc', // --surface-base → --neutral-200
  surfacePrimary: '#ffffff', // --surface-primary → --neutral-100
  surfaceSecondary: '#fcfcfc', // --surface-secondary
  surfaceHover: 'rgba(0, 0, 0, 0.04)', // --surface-hover → --darken-200

  // text
  textPrimary: 'rgba(0, 0, 0, 0.92)', // --darken-1400
  textSecondary: 'rgba(0, 0, 0, 0.64)', // --darken-1100
  textTertiary: 'rgba(0, 0, 0, 0.4)', // --darken-900

  // borders
  borderSubtle: 'rgba(0, 0, 0, 0.04)', // --darken-200
  borderDefault: 'rgba(0, 0, 0, 0.08)', // --darken-400
  borderFocus: '#29a2ff', // --blue-800

  // accent
  accent: '#0588f0', // --blue-900
  accentSoft: '#e6f4fe', // --blue-200
  accentFg: '#0b61ad', // --blue-link

  // buttons
  buttonPrimaryBg: '#080808', // --neutral-1200
  buttonPrimaryFg: '#ffffff', // --neutral-100

  // states
  successBg: '#f0fdf4',
  successFg: '#15803d',
  successBorder: '#22c55e',
  errorBg: '#fef2f2',
  errorFg: '#b91c1c',
  errorBorder: '#ef4444',
  warningBg: '#fff7ed',
  warningFg: '#c2410c',
  warningBorder: '#f97316',
} as const;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  pill: 999,
} as const;

export const font = {
  title: 26,
  h2: 20,
  body: 15,
  small: 13,
  fine: 12.5,
  eyebrow: 12,
} as const;

// `.card` in app.css: white surface, xl radius, lifted shadow, s5 padding.
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
