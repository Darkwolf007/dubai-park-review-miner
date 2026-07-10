import type { H3Feature, RoadStats } from './types';

export type MorphologyStatus = 'good' | 'watch' | 'critical' | 'unavailable';

export interface MorphologyMetric {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  status: MorphologyStatus;
  note?: string;
}

export interface UrbanMorphologyResult {
  metrics: MorphologyMetric[];
  blockCountEstimate: number | null;
  avgBlockSizeKm2: number | null;
  avgBuildingFootprintM2: number;
  builtOpenRatio: number;
  voidRatioPct: number;
  permeabilityScore: number | null;
}

/**
 * Block size, urban grain, built/open ratio, and void ratio are real,
 * computed from the H3 grid + the road graph's Euler's-formula block
 * estimate (scripts/convert_gis_data.py). Permeability is a documented proxy
 * (intersection density ratio) -- true pedestrian permeability needs
 * building-frontage/access-point data this dataset doesn't have. Edge
 * Conditions, Street Enclosure, Street Wall Ratio, and Urban Continuity are
 * all explicitly unavailable: each needs building height and/or frontage-line
 * data that isn't present (building height tags cover only ~2.3% of buildings).
 */
export function computeUrbanMorphology(hexes: H3Feature[], roadStats: RoadStats | null): UrbanMorphologyResult {
  const totalBuildingArea = hexes.reduce((s, h) => s + (h.properties.building_area_m2 || 0), 0);
  const totalBuildingCount = hexes.reduce((s, h) => s + (h.properties.building_count || 0), 0);
  const avgBuildingFootprintM2 = totalBuildingCount === 0 ? 0 : totalBuildingArea / totalBuildingCount;

  const avgBuildingCoverage = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.building_coverage_pct || 0), 0) / hexes.length;
  const avgGreenCoverage = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.green_coverage_pct || 0), 0) / hexes.length;
  const builtOpenRatio = avgGreenCoverage === 0 ? avgBuildingCoverage : avgBuildingCoverage / avgGreenCoverage;
  const voidRatioPct = Math.max(0, 100 - avgBuildingCoverage - avgGreenCoverage);

  const permeabilityScore = roadStats && roadStats.totalGraphNodes > 0
    ? Math.round((roadStats.intersectionCount / roadStats.totalGraphNodes) * 100)
    : null;

  const metrics: MorphologyMetric[] = [
    {
      key: 'blockSize', label: 'Block Size',
      value: roadStats?.avgBlockSizeKm2 ?? null,
      displayValue: roadStats?.avgBlockSizeKm2 ? `${Math.round(roadStats.avgBlockSizeKm2 * 1_000_000).toLocaleString()} m²` : 'N/A',
      status: roadStats?.avgBlockSizeKm2 ? 'good' : 'unavailable',
      note: roadStats?.blockEstimateMethodology
    },
    {
      key: 'urbanGrain', label: 'Urban Grain (Avg Building Footprint)',
      value: Math.round(avgBuildingFootprintM2),
      displayValue: `${Math.round(avgBuildingFootprintM2).toLocaleString()} m²`,
      status: avgBuildingFootprintM2 < 150 ? 'good' : avgBuildingFootprintM2 < 400 ? 'watch' : 'critical',
      note: avgBuildingFootprintM2 < 150 ? 'Fine urban grain (many small buildings).' : avgBuildingFootprintM2 < 400 ? 'Medium urban grain.' : 'Coarse urban grain (large-footprint buildings dominate).'
    },
    {
      key: 'builtOpenRatio', label: 'Built / Open Ratio',
      value: Math.round(builtOpenRatio * 100) / 100,
      displayValue: `${Math.round(builtOpenRatio * 100) / 100} : 1`,
      status: builtOpenRatio > 3 ? 'critical' : builtOpenRatio > 1.5 ? 'watch' : 'good',
      note: 'Average building coverage % divided by average green coverage % across the H3 grid.'
    },
    {
      key: 'voidRatio', label: 'Urban Void Ratio',
      value: Math.round(voidRatioPct * 10) / 10,
      displayValue: `${Math.round(voidRatioPct * 10) / 10}%`,
      status: voidRatioPct > 60 ? 'watch' : 'good',
      note: 'Residual non-built, non-green share of the study area (roads, parking, bare/paved land).'
    },
    {
      key: 'permeability', label: 'Permeability (Proxy)',
      value: permeabilityScore,
      displayValue: permeabilityScore !== null ? `${permeabilityScore}/100` : 'N/A',
      status: permeabilityScore === null ? 'unavailable' : permeabilityScore > 50 ? 'good' : 'watch',
      note: 'Proxy: intersection-density ratio on the road graph. True pedestrian permeability would need frontage/access-point data.'
    },
    { key: 'edgeConditions', label: 'Edge Conditions', value: null, displayValue: 'N/A', status: 'unavailable', note: 'Requires building setback/frontage-line data not present in this dataset.' },
    { key: 'streetEnclosure', label: 'Street Enclosure', value: null, displayValue: 'N/A', status: 'unavailable', note: 'Requires building height data (only ~2.3% of buildings tagged) to compute a height-to-width ratio.' },
    { key: 'streetWallRatio', label: 'Street Wall Ratio', value: null, displayValue: 'N/A', status: 'unavailable', note: 'Requires building frontage/party-wall data not present in this dataset.' },
    { key: 'urbanContinuity', label: 'Urban Continuity', value: null, displayValue: 'N/A', status: 'unavailable', note: 'Requires contiguous building-line data not present in this dataset.' }
  ];

  return {
    metrics,
    blockCountEstimate: roadStats?.blockCountEstimate ?? null,
    avgBlockSizeKm2: roadStats?.avgBlockSizeKm2 ?? null,
    avgBuildingFootprintM2: Math.round(avgBuildingFootprintM2),
    builtOpenRatio: Math.round(builtOpenRatio * 100) / 100,
    voidRatioPct: Math.round(voidRatioPct * 10) / 10,
    permeabilityScore
  };
}
