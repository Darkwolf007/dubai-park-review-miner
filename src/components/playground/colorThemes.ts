// Data-layer color themes for the Dataset Explorer's per-layer Style panel. Distinct from the
// Mux brand palette (index.css --color-mux-*, used for the panel chrome itself) -- these are
// chosen for mutual distinguishability across several simultaneously-active map layers, with
// Orange included as one option so it still reads as part of the same system.
export interface ColorTheme {
  id: string;
  label: string;
  solid: string;
  /** 5 stops, light to dark -- used for smooth choropleth gradients. */
  ramp: [string, string, string, string, string];
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'indigo', label: 'Indigo', solid: '#4338ca', ramp: ['#e0e7ff', '#a5b4fc', '#818cf8', '#6366f1', '#4338ca'] },
  { id: 'orange', label: 'Orange', solid: '#c2410c', ramp: ['#ffedd5', '#fdba74', '#fb923c', '#f97316', '#c2410c'] },
  { id: 'teal', label: 'Teal', solid: '#0d9488', ramp: ['#ccfbf1', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488'] },
  { id: 'rose', label: 'Rose', solid: '#be123c', ramp: ['#ffe4e6', '#fda4af', '#fb7185', '#f43f5e', '#be123c'] },
  { id: 'amber', label: 'Amber', solid: '#b45309', ramp: ['#fef3c7', '#fcd34d', '#fbbf24', '#f59e0b', '#b45309'] },
  { id: 'slate', label: 'Slate', solid: '#334155', ramp: ['#f1f5f9', '#cbd5e1', '#94a3b8', '#64748b', '#334155'] }
];

export const DEFAULT_COLOR_THEME_ID = COLOR_THEMES[0].id;

export function getColorTheme(id: string | undefined): ColorTheme {
  return COLOR_THEMES.find(t => t.id === id) || COLOR_THEMES[0];
}

export interface LayerStyle {
  opacity: number;
  colorThemeId: string;
  /** true = smooth 5-stop gradient; false = 3-class stepped (Low/Medium/High) -- only meaningful for choropleth/pointChoropleth render modes. */
  gradient: boolean;
}

export const DEFAULT_LAYER_STYLE: LayerStyle = { opacity: 0.8, colorThemeId: DEFAULT_COLOR_THEME_ID, gradient: true };

/** Picks 3 representative stops (low/mid/high) from the 5-stop ramp for stepped/classed mode. */
export function steppedStopsFromRamp(ramp: readonly string[]): [string, string, string] {
  return [ramp[0], ramp[2], ramp[4]];
}

export function rampColorForValue(ramp: readonly string[], value: number, min: number, max: number, gradient: boolean): string {
  if (max === min) return ramp[Math.floor(ramp.length / 2)];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (gradient) {
    const idx = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
    return ramp[idx];
  }
  const stops = steppedStopsFromRamp(ramp);
  const idx = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[idx];
}
