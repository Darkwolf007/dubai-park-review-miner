import type { H3Feature, RoadStats } from './types';

export interface UrbanAnalysisResult {
  buildingCount: number;
  buildingDensityPerKm2: number;
  buildingCoveragePct: number;
  floorAreaRatio: number | null;
  floorAreaRatioNote: string;
  roadDensityMPerKm2: number;
  connectivity: RoadStats | null;
}

export function computeUrbanAnalysis(hexes: H3Feature[], roadStats: RoadStats | null): UrbanAnalysisResult {
  const buildingCount = hexes.reduce((s, h) => s + (h.properties.building_count || 0), 0);
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const buildingDensityPerKm2 = totalAreaKm2 === 0 ? 0 : buildingCount / totalAreaKm2;
  const avgBuildingCoverage = hexes.length === 0
    ? 0
    : hexes.reduce((s, h) => s + (h.properties.building_coverage_pct || 0), 0) / hexes.length;

  return {
    buildingCount,
    buildingDensityPerKm2: Math.round(buildingDensityPerKm2 * 10) / 10,
    buildingCoveragePct: Math.round(avgBuildingCoverage * 10) / 10,
    // Only ~2.3% of buildings in this OSM extract carry a building:levels tag --
    // too sparse to aggregate into an honest area-wide FAR, so it's explicitly
    // marked unavailable rather than estimated from a handful of buildings.
    floorAreaRatio: null,
    floorAreaRatioNote: 'Insufficient data: only ~2.3% of buildings in this OSM extract have height/level tags.',
    // The H3 grid's own road_density_m_per_km2 field is 0 for every hex in the
    // source data (verified directly against the GeoPackage -- never populated
    // upstream), so real road density is computed from the roads layer's own
    // segment lengths instead (see scripts/convert_gis_data.py), not from that
    // broken field.
    roadDensityMPerKm2: roadStats ? Math.round(roadStats.roadDensityMPerKm2) : 0,
    connectivity: roadStats
  };
}
