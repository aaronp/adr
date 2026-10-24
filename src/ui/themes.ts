/** Theme ids map to [data-theme] blocks in styles.css. Swatch colours are for the picker only. */
export const THEMES = [
  { id: 'paper', label: 'Graph paper', swatch: { bg: '#f2f4f3', primary: '#15181c', accent: '#e0662b' } },
  { id: 'night', label: 'Night shift', swatch: { bg: '#111316', primary: '#ecefed', accent: '#ff8a4c' } },
  { id: 'blueprint', label: 'Blueprint', swatch: { bg: '#0f2747', primary: '#ffffff', accent: '#ffb347' } },
  { id: 'warm', label: 'Warm ledger', swatch: { bg: '#f5f0e6', primary: '#7a2e1c', accent: '#c8642b' } }
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];

export const isThemeId = (v: string): v is ThemeId => THEMES.some((t) => t.id === v);

/** CSS custom property for the i-th series colour (8 per theme, cycling). */
export const seriesColor = (i: number): string => `var(--s${(i % 8) + 1})`;
/** Neutral ramp used for criteria in the weighted-bars view (6 steps, cycling). */
export const rampColor = (i: number): string => `var(--ramp${(i % 6) + 1})`;
