import type { ParkDetails } from '../googlePlaces';

// Categorical, CVD-safe palette (validated via the dataviz skill's
// validate_palette.js: lightness band, chroma floor, and adjacent-pair
// CVD separation all PASS at worst ΔE 24.2). Fixed order matters -- it's
// the CVD-safety mechanism, not cosmetic, so never reorder or cycle it.
export const PARK_COLOR_PALETTE = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834'  // orange
];

/**
 * Assigns a park's color by its fixed index in the master park list (never
 * by its index within the current selection) so a park's color never shifts
 * when other parks are added to or removed from the selection.
 */
export function getParkColor(placeId: string, allParks: ParkDetails[]): string {
  const index = allParks.findIndex(p => p.placeId === placeId);
  const safeIndex = index === -1 ? 0 : index;
  return PARK_COLOR_PALETTE[safeIndex % PARK_COLOR_PALETTE.length];
}
