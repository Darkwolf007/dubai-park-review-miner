// Hex equivalents of the Pill.tsx category color map, for contexts that need
// real color values (charts, SVG, React Flow) rather than Tailwind classes.
// Deliberately a separate dimension from park identity color (parkColors.ts)
// so the two never visually collide when both appear in the same view.
const CATEGORY_HEX: Record<string, string> = {
  'shade / heat comfort': '#f97316',
  'toilets': '#f43f5e',
  'cleanliness': '#f59e0b',
  'parking': '#3b82f6',
  'safety': '#a855f7',
  'playground': '#ec4899',
  'accessibility': '#14b8a6',
  'lighting': '#eab308',
  'crowding': '#6366f1',
  'maintenance': '#ef4444',
  'seating': '#78716c',
  'sports facilities': '#10b981',
  'pets': '#d97706',
  'food / cafe': '#fb923c',
  'water features': '#06b6d4',
  'landscape / greenery': '#84cc16'
};
const DEFAULT_COLOR = '#6366f1';

export function getCategoryColor(category: string): string {
  return CATEGORY_HEX[category] || DEFAULT_COLOR;
}
