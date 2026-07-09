import { distance as turfDistance, circle as turfCircle } from '@turf/turf';
import type { H3Feature, GeoJsonFeature, RoadStats } from './types';

export interface AccessibilityAnalysisResult {
  walkabilityScore: number;
  walkabilityMethodology: string;
  networkDistanceNote: string;
  transitAccessibility: { busStopsWithin500m: number };
  parkServiceAreaPolygon: ReturnType<typeof turfCircle>;
}

const TRANSIT_RADIUS_M = 500;

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Walkability Score is a documented composite of real inputs already in the
 * H3 grid (road density, amenity density) plus intersection density from the
 * road graph -- same methodology-transparency pattern as the Analytics tab's
 * Health Score. "Network Distance" and "Transit Accessibility" here are
 * straight-line (Euclidean) buffers, not routed-network distance -- real
 * isochrone/routing analysis needs a road-network router this app doesn't have.
 */
export function computeAccessibilityAnalysis(
  hexes: H3Feature[],
  busStops: GeoJsonFeature[],
  parkCenter: { lat: number; lng: number },
  roadStats: RoadStats | null
): AccessibilityAnalysisResult {
  // Real road density from roads.geojson segment lengths (see urbanEngine.ts --
  // the H3 grid's own road_density field is 0 for every hex in the source data).
  const roadDensity = roadStats?.roadDensityMPerKm2 || 0;
  const avgAmenityDensity = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.amenity_total || 0), 0) / hexes.length;
  const intersectionRatio = !roadStats || roadStats.totalGraphNodes === 0 ? 0 : roadStats.intersectionCount / roadStats.totalGraphNodes;

  const roadScore = normalize(roadDensity, 40000); // ~40,000 m/km2 matches this site's real dense-urban density
  const amenityScore = normalize(avgAmenityDensity, 20);
  const intersectionScore = intersectionRatio * 100;

  const walkabilityScore = Math.round(roadScore * 0.4 + amenityScore * 0.35 + intersectionScore * 0.25);

  const busStopsWithin500m = busStops.filter(stop => {
    const [lng, lat] = stop.geometry.coordinates as [number, number];
    return turfDistance([parkCenter.lng, parkCenter.lat], [lng, lat], { units: 'meters' }) <= TRANSIT_RADIUS_M;
  }).length;

  const parkServiceAreaPolygon = turfCircle([parkCenter.lng, parkCenter.lat], 0.8, { units: 'kilometers' });

  return {
    walkabilityScore: Math.max(0, Math.min(100, walkabilityScore)),
    walkabilityMethodology: 'Composite: 40% road density (from road segment lengths) + 35% amenity density (H3-aggregated) + 25% intersection ratio (road graph), all real OSM-derived data.',
    networkDistanceNote: 'Distances are straight-line buffers, not routed network distance -- no road-network router is available in this build.',
    transitAccessibility: { busStopsWithin500m },
    parkServiceAreaPolygon
  };
}
