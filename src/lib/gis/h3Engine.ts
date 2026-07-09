import type { H3Feature, H3HexProperties } from './types';

// The pre-computed grid is fixed at resolution 9 (confirmed from the source
// data: 15-hex-char index, ~0.095km² average hex area matches H3 res 9).
// Regenerating at a different resolution would need the raw population
// raster/points this repo doesn't have, not just the aggregated grid -- so
// this is a documented constant, not a live parameter.
export const H3_RESOLUTION = 9;

export type H3MetricKey = keyof H3HexProperties;

export const H3_METRIC_OPTIONS: { key: H3MetricKey; label: string }[] = [
  { key: 'population', label: 'Population' },
  { key: 'pop_density_km2', label: 'Population Density' },
  { key: 'building_count', label: 'Building Count' },
  { key: 'building_coverage_pct', label: 'Building Coverage' },
  { key: 'road_density_m_per_km2', label: 'Road Density' },
  { key: 'amenity_total', label: 'Amenity Density' },
  { key: 'green_coverage_pct', label: 'Green Coverage' }
];

export function sortH3Hexes(hexes: H3Feature[], metric: H3MetricKey, direction: 'asc' | 'desc' = 'desc'): H3Feature[] {
  return [...hexes].sort((a, b) => {
    const av = Number(a.properties[metric]) || 0;
    const bv = Number(b.properties[metric]) || 0;
    return direction === 'desc' ? bv - av : av - bv;
  });
}

export function h3ToCsv(hexes: H3Feature[]): string {
  if (hexes.length === 0) return '';
  const cols = Object.keys(hexes[0].properties) as H3MetricKey[];
  const header = cols.join(',');
  const rows = hexes.map(h => cols.map(c => h.properties[c]).join(','));
  return [header, ...rows].join('\n');
}

export function hexCentroid(hex: H3Feature): [number, number] {
  const ring = hex.geometry.coordinates[0] as [number, number][];
  const n = ring.length - 1; // last point duplicates the first
  let sumLng = 0, sumLat = 0;
  for (let i = 0; i < n; i++) { sumLng += ring[i][0]; sumLat += ring[i][1]; }
  return [sumLng / n, sumLat / n];
}
