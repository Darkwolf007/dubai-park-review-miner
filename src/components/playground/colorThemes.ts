// Data-layer color themes for the Dataset Explorer's per-layer Style panel. Distinct from the
// Mux brand palette (index.css --color-mux-*, used for the panel chrome itself). Ramps are
// 7-stop ColorBrewer-style sequential palettes (the same families QGIS ships by default --
// YlOrRd, Blues, Greens, RdPu, Oranges, Greys), not arbitrary hand-picked hues.
export interface ColorTheme {
  id: string;
  label: string;
  solid: string;
  /** 7 stops, light to dark -- ColorBrewer sequential-family ramps, QGIS's own default style. */
  ramp: readonly string[];
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'indigo', label: 'Indigo', solid: '#4338ca', ramp: ['#eef2ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3'] },
  { id: 'ylorrd', label: 'YlOrRd', solid: '#b91c1c', ramp: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'] },
  { id: 'blues', label: 'Blues', solid: '#1d4ed8', ramp: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'] },
  { id: 'greens', label: 'Greens', solid: '#15803d', ramp: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#31a354', '#006d2c'] },
  { id: 'rdpu', label: 'RdPu', solid: '#a3195b', ramp: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#c51b8a', '#7a0177'] },
  { id: 'oranges', label: 'Oranges', solid: '#c2410c', ramp: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#e6550d', '#a63603'] },
  { id: 'greys', label: 'Greys', solid: '#334155', ramp: ['#f7f7f7', '#e6e6e6', '#cccccc', '#b3b3b3', '#969696', '#636363', '#252525'] }
];

/** Distinct "no data" fill for null/undefined values (e.g. H3 cells with no network route) --
 * never silently coerced into the ramp's lowest bucket, which would misrepresent "no data" as
 * "best value". Matches QGIS's convention of rendering NULL features with a neutral hatch/grey. */
export const NO_DATA_COLOR = '#d4d4d4';

export function getColorTheme(id: string | null | undefined): ColorTheme {
  return COLOR_THEMES.find(t => t.id === id) || COLOR_THEMES[0];
}

export interface LayerStyle {
  opacity: number;
  /** null = use the layer's own categorical default color (layerConfig.color) for solid render
   * modes, or the Indigo ramp default for choropleth -- only a real theme id overrides it. */
  colorThemeId: string | null;
  /** true = smooth gradient across quantile-ranked stops; false = 5-class quantile "graduated"
   * symbology (QGIS's Quantile/Equal Count classification) -- only meaningful for
   * choropleth/pointChoropleth render modes. */
  gradient: boolean;
}

export const DEFAULT_LAYER_STYLE: LayerStyle = { opacity: 0.8, colorThemeId: null, gradient: true };

// ---------------------------------------------------------------------------
// QGIS-style quantile classification. Distance/density fields in this dataset are heavily
// skewed (e.g. barrier_score_hex: p10=0, max=124) -- a naive linear min/max gradient crushes
// almost the entire grid into one end of the ramp. Quantile (equal-count) classification, QGIS's
// own default graduated-symbology mode, ranks each value by percentile among the real
// (non-null) values instead, so the color range is always used evenly regardless of skew.
// ---------------------------------------------------------------------------

export interface QuantileClassifier {
  /** Ascending, non-null, non-NaN values used to build the classification. */
  sorted: number[];
  /** Class break values (5 classes -> 4 internal breaks + min/max), QGIS-legend style. */
  breaks: number[];
}

export function buildQuantileClassifier(values: (number | null | undefined)[]): QuantileClassifier {
  const sorted = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return { sorted: [], breaks: [] };
  const classCount = 5;
  const breaks: number[] = [sorted[0]];
  for (let i = 1; i < classCount; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i / classCount) * sorted.length));
    breaks.push(sorted[idx]);
  }
  breaks.push(sorted[sorted.length - 1]);
  return { sorted, breaks };
}

function percentileRank(sorted: number[], value: number): number {
  if (sorted.length <= 1) return 0.5;
  // Binary search for insertion point -- fine at this data size (<1000 features/layer) without it too.
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo / (sorted.length - 1 || 1);
}

/** Returns NO_DATA_COLOR for null/undefined -- callers must not coerce missing values to 0 first. */
export function quantileColorForValue(ramp: readonly string[], value: number | null | undefined, classifier: QuantileClassifier, gradient: boolean): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_DATA_COLOR;
  if (classifier.sorted.length === 0) return ramp[Math.floor(ramp.length / 2)];
  const t = percentileRank(classifier.sorted, value);
  if (gradient) {
    const idx = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
    return ramp[idx];
  }
  const classCount = 5;
  const classIdx = Math.min(classCount - 1, Math.floor(t * classCount));
  const stopIdx = Math.round((classIdx / (classCount - 1)) * (ramp.length - 1));
  return ramp[stopIdx];
}

/** Human-readable class-break labels for the map legend, QGIS graduated-legend style. */
export function quantileLegendLabels(classifier: QuantileClassifier, formatValue: (v: number) => string = v => String(Math.round(v * 100) / 100)): string[] {
  if (classifier.breaks.length < 2) return [];
  const labels: string[] = [];
  for (let i = 0; i < classifier.breaks.length - 1; i++) {
    labels.push(`${formatValue(classifier.breaks[i])} - ${formatValue(classifier.breaks[i + 1])}`);
  }
  return labels;
}
