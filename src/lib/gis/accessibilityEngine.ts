import { distance as turfDistance, bearing as turfBearing } from '@turf/turf';
import type { H3Feature, GeoJsonFeature, RoadStats, AccessibilityStats } from './types';
import { hexCentroid } from './h3Engine';

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function bucketHistogram(values: number[], bucketCount: number): { bucket: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const size = (max - min) / bucketCount || 1;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({ bucket: `${Math.round(min + i * size)}`, count: 0 }));
  values.forEach(v => {
    const idx = Math.min(bucketCount - 1, Math.floor((v - min) / size));
    buckets[idx].count++;
  });
  return buckets;
}

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function bearingToCompass(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  return COMPASS_LABELS[Math.round(normalized / 45) % 8];
}

/**
 * POI layers in this dataset are a geometry mix -- e.g. parking is 179 Polygon / 35 Point,
 * schools is 30 Polygon / 13 Point (parking lots and school grounds are frequently mapped as
 * building/area outlines in OSM, not single nodes). A naive `coordinates as [lng, lat]` cast
 * crashes turf's distance() on any Polygon feature. This returns a simple average-of-ring-vertices
 * centroid for polygons (consistent with the same approximation already used for H3 hex centroids)
 * and the point itself for Points.
 */
function featureCentroidLngLat(f: GeoJsonFeature): [number, number] | null {
  const geom = f.geometry;
  if (!geom) return null;
  if (geom.type === 'Point') {
    const c = geom.coordinates as [number, number];
    return Array.isArray(c) && typeof c[0] === 'number' ? c : null;
  }
  if (geom.type === 'Polygon') {
    const ring = (geom.coordinates as [number, number][][])[0];
    if (!ring || ring.length === 0) return null;
    const n = ring.length - 1 || ring.length;
    const sumLng = ring.slice(0, n).reduce((s, p) => s + p[0], 0);
    const sumLat = ring.slice(0, n).reduce((s, p) => s + p[1], 0);
    return [sumLng / n, sumLat / n];
  }
  if (geom.type === 'MultiPolygon') {
    const firstRing = (geom.coordinates as [number, number][][][])[0]?.[0];
    if (!firstRing || firstRing.length === 0) return null;
    const n = firstRing.length - 1 || firstRing.length;
    const sumLng = firstRing.slice(0, n).reduce((s, p) => s + p[0], 0);
    const sumLat = firstRing.slice(0, n).reduce((s, p) => s + p[1], 0);
    return [sumLng / n, sumLat / n];
  }
  return null;
}

function featureWithinM(f: GeoJsonFeature, fromLng: number, fromLat: number, radiusM: number): boolean {
  const c = featureCentroidLngLat(f);
  if (!c) return false;
  return turfDistance([fromLng, fromLat], c, { units: 'meters' }) <= radiusM;
}

function nearestFeatureDistanceM(features: GeoJsonFeature[], fromLng: number, fromLat: number): number | null {
  let min: number | null = null;
  for (const f of features) {
    const c = featureCentroidLngLat(f);
    if (!c) continue;
    const d = turfDistance([fromLng, fromLat], c, { units: 'meters' });
    if (min === null || d < min) min = d;
  }
  return min;
}

export function accessibilityStatusLabel(score: number): 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent' {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Very Good';
  if (score >= 50) return 'Good';
  if (score >= 30) return 'Fair';
  return 'Poor';
}

// ---------------------------------------------------------------------------
// Per-hex convenience functions (map choropleth modes + H3 cell inspector)
// ---------------------------------------------------------------------------

/** "Park Access Score" map mode -- inverted, decayed walking time. Unreachable cells (no routing data) score 0, not a guessed value. */
export function computeHexParkAccessScore(hex: H3Feature): number {
  const wt = hex.properties.walking_time_to_park_minutes;
  if (wt === null || wt === undefined) return 0;
  return Math.round(normalize(30 - Math.min(30, wt), 30));
}

/** "Walkability Score" map mode -- per-cell composite of real road density, intersection density, amenity density, and transit proximity. */
export function computeHexWalkabilityScore(hex: H3Feature): number {
  const areaKm2 = hex.properties.hex_area_km2 || 0.0001;
  const intersectionDensity = (hex.properties.intersection_count_hex || 0) / areaKm2;
  const roadDensity = hex.properties.real_road_density_m_per_km2 || 0;
  const amenity = hex.properties.amenity_total || 0;
  const busDist = hex.properties.nearest_bus_stop_distance_m;
  const transitScore = busDist === null || busDist === undefined ? 0 : normalize(800 - Math.min(800, busDist), 800);
  return Math.round(
    normalize(intersectionDensity, 150) * 0.3 +
    normalize(roadDensity, 40000) * 0.25 +
    normalize(amenity, 20) * 0.2 +
    transitScore * 0.25
  );
}

/** "Transit Accessibility" map mode -- decayed distance to nearest bus stop. */
export function computeHexTransitAccessibilityScore(hex: H3Feature): number {
  const d = hex.properties.nearest_bus_stop_distance_m;
  if (d === null || d === undefined) return 0;
  return Math.round(normalize(800 - Math.min(800, d), 800));
}

/** "Barrier Severity" map mode -- normalized weighted primary/secondary road exposure. */
export function computeHexBarrierSeverityScore(hex: H3Feature): number {
  return Math.round(normalize(hex.properties.barrier_score_hex || 0, 6));
}

/**
 * "Underserved Population" map mode -- how poorly served this cell is (long walk + low
 * walkability + low transit + high barrier exposure). Cells with no network routing data are
 * scored as maximum deficit (can't confirm access at all) rather than assumed well-served.
 */
export function computeHexAccessibilityDeficitScore(hex: H3Feature): number {
  const wt = hex.properties.walking_time_to_park_minutes;
  const walkTimeDeficit = wt === null || wt === undefined ? 100 : normalize(Math.min(30, wt), 30);
  const walkability = computeHexWalkabilityScore(hex);
  const transit = computeHexTransitAccessibilityScore(hex);
  const barrier = computeHexBarrierSeverityScore(hex);
  return Math.round(walkTimeDeficit * 0.4 + (100 - walkability) * 0.25 + (100 - transit) * 0.15 + barrier * 0.2);
}

// ---------------------------------------------------------------------------
// Walking catchments (real network-based, computed directly from per-hex fields)
// ---------------------------------------------------------------------------

export interface WalkingCatchmentBand {
  minutes: number;
  label: string;
  population: number;
  areaKm2: number;
  densityPerKm2: number;
  pctOfTotalPopulation: number;
  hexCount: number;
  schoolCount: number;
  busStopCount: number;
  clinicCount: number;
  mosqueCount: number;
  commercialAmenityCount: number;
  avgRouteDistanceM: number | null;
  avgRouteDirectness: number | null;
}

const CATCHMENT_BAND_MINUTES = [5, 10, 15, 20];

export const WALKING_CATCHMENT_METHODOLOGY =
  'Network-based catchments: each H3 cell\'s walking time is the shortest-path network distance ' +
  '(single-source Dijkstra on the drivable circulation graph, from the park center snapped to its ' +
  'nearest graph node -- no entrance point data exists in this dataset) divided by an 80 m/min ' +
  'pedestrian planning speed. Cells with no circulation-graph node inside them (interior blocks ' +
  'reached only by service/pedestrian ways outside the routing graph) are excluded from every band ' +
  'rather than estimated with a Euclidean fallback.';

export function computeWalkingCatchments(hexes: H3Feature[]): WalkingCatchmentBand[] {
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0) || 1;

  return CATCHMENT_BAND_MINUTES.map(minutes => {
    const inBand = hexes.filter(h => {
      const wt = h.properties.walking_time_to_park_minutes;
      return wt !== null && wt !== undefined && wt <= minutes;
    });
    const population = inBand.reduce((s, h) => s + (h.properties.population || 0), 0);
    const areaKm2 = inBand.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
    const distances = inBand.map(h => h.properties.network_distance_to_park_m).filter((d): d is number => d !== null && d !== undefined);
    const directnessValues = inBand.map(h => h.properties.route_directness_ratio).filter((d): d is number => d !== null && d !== undefined);

    return {
      minutes,
      label: `${minutes}-Minute Walk`,
      population: Math.round(population),
      areaKm2: Math.round(areaKm2 * 100) / 100,
      densityPerKm2: areaKm2 > 0 ? Math.round(population / areaKm2) : 0,
      pctOfTotalPopulation: Math.round((population / totalPopulation) * 1000) / 10,
      hexCount: inBand.length,
      schoolCount: inBand.reduce((s, h) => s + (h.properties.school_count || 0), 0),
      busStopCount: inBand.reduce((s, h) => s + (h.properties.bus_stop_count || 0), 0),
      clinicCount: inBand.reduce((s, h) => s + (h.properties.clinic_count || 0), 0),
      mosqueCount: inBand.reduce((s, h) => s + (h.properties.mosque_count || 0), 0),
      commercialAmenityCount: inBand.reduce((s, h) => s + (h.properties.restaurant_count || 0) + (h.properties.cafe_count || 0) + (h.properties.shop_count || 0), 0),
      avgRouteDistanceM: distances.length > 0 ? Math.round(distances.reduce((s, d) => s + d, 0) / distances.length) : null,
      avgRouteDirectness: directnessValues.length > 0 ? Math.round((directnessValues.reduce((s, d) => s + d, 0) / directnessValues.length) * 1000) / 1000 : null
    };
  });
}

// ---------------------------------------------------------------------------
// Pedestrian network quality (explainable, adjustable-weight walkability score)
// ---------------------------------------------------------------------------

export interface WalkabilityWeights {
  connectivity: number;
  intersectionDensity: number;
  routeDirectness: number;
  transitAccess: number;
  amenityAccess: number;
  sidewalkCoverage: number;
}

/**
 * Reference weighting (Connectivity 25% / Intersection Density 15% / Route Directness 15% /
 * Transit Access 15% / Amenity Access 10% / Sidewalk Coverage 10% / Shade Coverage 10%) drops
 * Shade Coverage -- no tree-canopy/shade data source exists in this dataset -- and renormalizes
 * the remaining six weights proportionally to sum to 100, rather than silently zeroing a slot.
 */
export const DEFAULT_WALKABILITY_WEIGHTS: WalkabilityWeights = {
  connectivity: 28,
  intersectionDensity: 17,
  routeDirectness: 17,
  transitAccess: 17,
  amenityAccess: 11,
  sidewalkCoverage: 10
};

export interface WalkabilityComponent {
  key: string;
  label: string;
  score: number;
  weightPct: number;
}

export interface PedestrianNetworkQualityResult {
  walkabilityScore: number;
  weights: WalkabilityWeights;
  components: WalkabilityComponent[];
  connectivityScore: number;
  intersectionDensityPerKm2: number;
  avgBlockLengthM: number | null;
  avgBlockSizeM2: number | null;
  deadEndRatioPct: number;
  routeDirectnessAvg: number | null;
  sidewalkCoveragePct: number;
  shadeCoverageNote: string;
  methodology: string;
}

export function computePedestrianNetworkQuality(
  hexes: H3Feature[],
  roadStats: RoadStats | null,
  weights: WalkabilityWeights = DEFAULT_WALKABILITY_WEIGHTS
): PedestrianNetworkQualityResult {
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0) || 1;
  const totalIntersections = hexes.reduce((s, h) => s + (h.properties.intersection_count_hex || 0), 0);
  const intersectionDensityPerKm2 = totalIntersections / totalAreaKm2;

  const connectivityScore = roadStats && roadStats.totalGraphNodes > 0 ? (roadStats.intersectionCount / roadStats.totalGraphNodes) * 100 : 0;
  const intersectionDensityScore = normalize(intersectionDensityPerKm2, 400);

  const directnessValues = hexes.map(h => h.properties.route_directness_ratio).filter((d): d is number => d !== null && d !== undefined);
  const routeDirectnessAvg = directnessValues.length > 0 ? directnessValues.reduce((s, d) => s + d, 0) / directnessValues.length : null;
  const routeDirectnessScore = routeDirectnessAvg !== null ? routeDirectnessAvg * 100 : 0;

  const transitScores = hexes.map(computeHexTransitAccessibilityScore);
  const transitAccessScore = transitScores.length > 0 ? transitScores.reduce((s, v) => s + v, 0) / transitScores.length : 0;

  const avgAmenityDensity = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.amenity_total || 0), 0) / hexes.length;
  const amenityAccessScore = normalize(avgAmenityDensity, 20);

  const pedestrianLengthM = roadStats?.hierarchy.pedestrianCycling.lengthM || 0;
  const totalLengthM = roadStats?.totalRoadLengthM || 1;
  const sidewalkCoveragePct = (pedestrianLengthM / totalLengthM) * 100;
  const sidewalkCoverageScore = normalize(sidewalkCoveragePct, 40);

  const deadEndRatioPct = roadStats && roadStats.totalGraphNodes > 0 ? (roadStats.deadEndCount / roadStats.totalGraphNodes) * 100 : 0;

  const components: WalkabilityComponent[] = [
    { key: 'connectivity', label: 'Connectivity', score: Math.round(connectivityScore), weightPct: weights.connectivity },
    { key: 'intersectionDensity', label: 'Intersection Density', score: Math.round(intersectionDensityScore), weightPct: weights.intersectionDensity },
    { key: 'routeDirectness', label: 'Route Directness', score: Math.round(routeDirectnessScore), weightPct: weights.routeDirectness },
    { key: 'transitAccess', label: 'Transit Access', score: Math.round(transitAccessScore), weightPct: weights.transitAccess },
    { key: 'amenityAccess', label: 'Amenity Access', score: Math.round(amenityAccessScore), weightPct: weights.amenityAccess },
    { key: 'sidewalkCoverage', label: 'Sidewalk / Pedestrian-Way Coverage', score: Math.round(sidewalkCoverageScore), weightPct: weights.sidewalkCoverage }
  ];

  const weightSum = components.reduce((s, c) => s + c.weightPct, 0) || 1;
  const walkabilityScore = Math.round(components.reduce((s, c) => s + c.score * c.weightPct, 0) / weightSum);

  return {
    walkabilityScore: Math.max(0, Math.min(100, walkabilityScore)),
    weights,
    components,
    connectivityScore: Math.round(connectivityScore),
    intersectionDensityPerKm2: Math.round(intersectionDensityPerKm2 * 10) / 10,
    avgBlockLengthM: roadStats?.avgBlockSizeKm2 ? Math.round(Math.sqrt(roadStats.avgBlockSizeKm2 * 1_000_000)) : null,
    avgBlockSizeM2: roadStats?.avgBlockSizeKm2 ? Math.round(roadStats.avgBlockSizeKm2 * 1_000_000) : null,
    deadEndRatioPct: Math.round(deadEndRatioPct * 10) / 10,
    routeDirectnessAvg: routeDirectnessAvg !== null ? Math.round(routeDirectnessAvg * 1000) / 1000 : null,
    sidewalkCoveragePct: Math.round(sidewalkCoveragePct * 10) / 10,
    shadeCoverageNote: 'Shade Coverage (10% in the reference weighting) has no data source in this dataset -- no tree-canopy/shade layer exists. Its weight is redistributed proportionally across the six components above rather than left as a silent gap.',
    methodology: `Weighted composite, adjustable: ${components.map(c => `${c.label} ${c.weightPct}%`).join(', ')}. All six components are computed from real OSM-derived data (see each metric's own note).`
  };
}

// ---------------------------------------------------------------------------
// Transit accessibility
// ---------------------------------------------------------------------------

export interface TransitAccessibilityResult {
  busStopDensityPerKm2: number;
  popWithin400mOfBusStop: number;
  popWithin400mPct: number;
  avgNearestBusStopDistanceM: number | null;
  transitAccessibilityScore: number;
  transitAccessibilityLabel: 'Low' | 'Moderate' | 'High';
  metroAvailable: false;
  metroNote: string;
  parkingAvailable: boolean;
  parkingWithin500mCount: number | null;
}

export function computeTransitAccessibility(
  hexes: H3Feature[],
  busStops: GeoJsonFeature[],
  parkCenter: { lat: number; lng: number },
  parkingFeatures: GeoJsonFeature[] | null
): TransitAccessibilityResult {
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0) || 1;
  const busStopDensityPerKm2 = busStops.length / totalAreaKm2;

  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0);
  const hexesNear400m = hexes.filter(h => (h.properties.nearest_bus_stop_distance_m ?? Infinity) <= 400);
  const popWithin400mOfBusStop = hexesNear400m.reduce((s, h) => s + (h.properties.population || 0), 0);
  const popWithin400mPct = totalPopulation > 0 ? (popWithin400mOfBusStop / totalPopulation) * 100 : 0;

  const distances = hexes.map(h => h.properties.nearest_bus_stop_distance_m).filter((d): d is number => d !== null && d !== undefined);
  const avgNearestBusStopDistanceM = distances.length > 0 ? Math.round(distances.reduce((s, d) => s + d, 0) / distances.length) : null;

  const transitScores = hexes.map(computeHexTransitAccessibilityScore);
  const transitAccessibilityScore = transitScores.length > 0 ? Math.round(transitScores.reduce((s, v) => s + v, 0) / transitScores.length) : 0;
  const transitAccessibilityLabel: 'Low' | 'Moderate' | 'High' = transitAccessibilityScore >= 60 ? 'High' : transitAccessibilityScore >= 30 ? 'Moderate' : 'Low';

  const parkingWithin500mCount = parkingFeatures ? parkingFeatures.filter(f => featureWithinM(f, parkCenter.lng, parkCenter.lat, 500)).length : null;

  return {
    busStopDensityPerKm2: Math.round(busStopDensityPerKm2 * 10) / 10,
    popWithin400mOfBusStop: Math.round(popWithin400mOfBusStop),
    popWithin400mPct: Math.round(popWithin400mPct * 10) / 10,
    avgNearestBusStopDistanceM,
    transitAccessibilityScore,
    transitAccessibilityLabel,
    metroAvailable: false,
    metroNote: 'No metro/subway station data in this OSM extract -- metro catchments and metro-to-park walking time cannot be computed.',
    parkingAvailable: parkingFeatures !== null,
    parkingWithin500mCount
  };
}

// ---------------------------------------------------------------------------
// Barrier & safety analysis
// ---------------------------------------------------------------------------

export interface BarrierRow {
  type: string;
  count: number;
  severity: 'Low' | 'Medium' | 'High';
  note: string;
}

export interface BarrierAnalysisResult {
  barriers: BarrierRow[];
  totalBarrierExposureScore: number;
  barrierExposureLabel: 'Low' | 'Moderate' | 'High';
  crossingDeficiencyNote: string;
  methodology: string;
}

export function computeBarrierAnalysis(hexes: H3Feature[], roadStats: RoadStats | null): BarrierAnalysisResult {
  const primaryCount = roadStats?.hierarchy.primary.count || 0;
  const secondaryCount = roadStats?.hierarchy.secondary.count || 0;
  const deadEndCount = roadStats?.deadEndCount || 0;

  const barriers: BarrierRow[] = [
    { type: 'Primary Road Segments', count: primaryCount, severity: 'High', note: 'Major roads a pedestrian must cross to reach the park -- highest severity, since these typically lack frequent signalized crossings.' },
    { type: 'Secondary Road Segments', count: secondaryCount, severity: 'Medium', note: 'Arterial/collector roads -- moderate crossing difficulty.' },
    { type: 'Dead-End Streets', count: deadEndCount, severity: 'Medium', note: 'Degree-1 nodes on the road graph -- fragment the walking grid and force detours.' },
    { type: 'Pedestrian Crossings', count: 0, severity: 'Low', note: 'No dedicated crossing-point layer in this dataset -- cannot count or locate actual crossings (a real gap, not a measured zero).' },
    { type: 'Fenced Parcels', count: 0, severity: 'Low', note: 'No fence/barrier tagging captured in this OSM extract.' },
    { type: 'Canals / Waterways', count: 0, severity: 'Low', note: 'No waterway layer in this dataset.' },
    { type: 'Construction Zones', count: 0, severity: 'Low', note: 'No temporal/construction-status tagging in this dataset.' },
    { type: 'Steep Slopes', count: 0, severity: 'Low', note: 'No elevation/terrain data in this dataset -- Dubai\'s flat coastal-plain topography makes this a low-priority gap regardless.' }
  ];

  const avgBarrierScore = hexes.length > 0 ? hexes.reduce((s, h) => s + (h.properties.barrier_score_hex || 0), 0) / hexes.length : 0;
  const totalBarrierExposureScore = Math.round(normalize(avgBarrierScore, 4));
  const barrierExposureLabel: 'Low' | 'Moderate' | 'High' = totalBarrierExposureScore >= 60 ? 'High' : totalBarrierExposureScore >= 30 ? 'Moderate' : 'Low';

  return {
    barriers,
    totalBarrierExposureScore,
    barrierExposureLabel,
    crossingDeficiencyNote: 'A true crossing-deficiency map would compare barrier locations against actual crossing points -- not buildable without a crossing-point layer, which this dataset does not have.',
    methodology: 'Counts shown as 0 with a note reflect genuine data gaps, never a measured zero. Primary/Secondary Road Segment and Dead-End counts are real, from the same road-hierarchy and graph-degree computations used in Urban Analysis -- Road Network Analysis.'
  };
}

// ---------------------------------------------------------------------------
// Accessibility KPIs
// ---------------------------------------------------------------------------

export interface AccessibilityKPIs {
  pop5MinWalk: number;
  pop10MinWalk: number;
  pop15MinWalk: number;
  popOutside15MinWalk: number;
  avgWalkingDistanceM: number | null;
  medianWalkingDistanceM: number | null;
  maxWalkingDistanceM: number | null;
  populationWeightedWalkingDistanceM: number | null;
  entranceCount: number;
  entranceCountNote: string;
  popServedPerEntrance: number;
  nearestBusStopDistanceM: number | null;
  busStopsWithin500m: number;
  metroStationsWithin2km: number | null;
  metroNote: string;
  parkingFacilitiesWithin500m: number | null;
  parkingNote: string;
  pedestrianCrossingCount: number | null;
  pedestrianCrossingNote: string;
  roadBarrierCount: number;
  deadEndStreetCount: number;
  accessibleRouteCoveragePct: number | null;
  accessibleRouteNote: string;
  universalAccessibilityScore: number | null;
  universalAccessibilityNote: string;
  overallAccessibilityScore: number;
}

export function computeAccessibilityKPIs(
  hexes: H3Feature[],
  roadStats: RoadStats | null,
  accessibilityStats: AccessibilityStats | null,
  busStops: GeoJsonFeature[],
  parkCenter: { lat: number; lng: number },
  pedestrianQuality: PedestrianNetworkQualityResult,
  transit: TransitAccessibilityResult,
  catchments: WalkingCatchmentBand[]
): AccessibilityKPIs {
  const c5 = catchments.find(c => c.minutes === 5)!;
  const c10 = catchments.find(c => c.minutes === 10)!;
  const c15 = catchments.find(c => c.minutes === 15)!;
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0);

  const reachable = hexes.filter(h => h.properties.network_distance_to_park_m !== null && h.properties.network_distance_to_park_m !== undefined);
  const distances = reachable.map(h => h.properties.network_distance_to_park_m as number).sort((a, b) => a - b);
  const avgWalkingDistanceM = distances.length > 0 ? Math.round(distances.reduce((s, d) => s + d, 0) / distances.length) : null;
  const medianWalkingDistanceM = distances.length > 0 ? Math.round(distances[Math.floor(distances.length / 2)]) : null;
  const maxWalkingDistanceM = distances.length > 0 ? Math.round(distances[distances.length - 1]) : null;

  const weightedSum = reachable.reduce((s, h) => s + (h.properties.population || 0) * (h.properties.network_distance_to_park_m || 0), 0);
  const weightedPop = reachable.reduce((s, h) => s + (h.properties.population || 0), 0);
  const populationWeightedWalkingDistanceM = weightedPop > 0 ? Math.round(weightedSum / weightedPop) : null;

  const busStopsWithin500m = busStops.filter(stop => featureWithinM(stop, parkCenter.lng, parkCenter.lat, 500)).length;

  const nearestBusStopDistanceM = accessibilityStats && busStops.length > 0
    ? (() => {
      const d = nearestFeatureDistanceM(busStops, accessibilityStats.entranceNode.lng, accessibilityStats.entranceNode.lat);
      return d !== null ? Math.round(d) : null;
    })()
    : null;

  const roadBarrierCount = (roadStats?.hierarchy.primary.count || 0) + (roadStats?.hierarchy.secondary.count || 0);
  const deadEndStreetCount = roadStats?.deadEndCount || 0;

  const overallAccessibilityScore = Math.round(
    pedestrianQuality.walkabilityScore * 0.45 +
    transit.transitAccessibilityScore * 0.25 +
    normalize(c15.pctOfTotalPopulation, 100) * 0.3
  );

  return {
    pop5MinWalk: c5.population,
    pop10MinWalk: c10.population,
    pop15MinWalk: c15.population,
    popOutside15MinWalk: Math.max(0, Math.round(totalPopulation - c15.population)),
    avgWalkingDistanceM,
    medianWalkingDistanceM,
    maxWalkingDistanceM,
    populationWeightedWalkingDistanceM,
    entranceCount: 1,
    entranceCountNote: 'No park entrance point data exists in this dataset -- the verified park center (snapped to its nearest routable street node) is used as a single-entrance proxy for all network calculations.',
    popServedPerEntrance: Math.round(totalPopulation),
    nearestBusStopDistanceM,
    busStopsWithin500m,
    metroStationsWithin2km: null,
    metroNote: 'No metro/subway station data in this OSM extract.',
    parkingFacilitiesWithin500m: transit.parkingWithin500mCount,
    parkingNote: transit.parkingWithin500mCount === null ? 'Parking layer not loaded for this run.' : 'Straight-line count within 500m of the park center.',
    pedestrianCrossingCount: null,
    pedestrianCrossingNote: 'No dedicated pedestrian-crossing point layer in this dataset (OSM highway=crossing nodes were not captured in this extract).',
    roadBarrierCount,
    deadEndStreetCount,
    accessibleRouteCoveragePct: null,
    accessibleRouteNote: 'No sidewalk/ramp/wheelchair-accessibility tagging in this dataset beyond a sparse wheelchair tag on 33 toilet features -- not enough to characterize route accessibility.',
    universalAccessibilityScore: null,
    universalAccessibilityNote: 'Same limitation as Accessible Route Coverage -- no systematic accessibility tagging exists in this OSM extract.',
    overallAccessibilityScore
  };
}

// ---------------------------------------------------------------------------
// Park entrance analysis (single derived-proxy entrance -- see entranceCountNote)
// ---------------------------------------------------------------------------

export interface EntranceAnalysisResult {
  entranceCount: number;
  note: string;
  entrance: {
    label: string;
    lat: number;
    lng: number;
    snapDistanceM: number;
    populationServedWithin15Min: number;
    catchment15MinPct: number;
    avgWalkingDistanceM: number | null;
    nearbyBusStopsWithin300m: number;
    nearbySchoolsWithin1km: number;
    entranceAccessibilityScore: number;
  } | null;
  scopeNote: string;
}

export function computeEntranceAnalysis(
  accessibilityStats: AccessibilityStats | null,
  kpis: AccessibilityKPIs,
  catchments: WalkingCatchmentBand[],
  busStops: GeoJsonFeature[],
  schools: GeoJsonFeature[] | null
): EntranceAnalysisResult {
  if (!accessibilityStats) {
    return {
      entranceCount: 0,
      note: 'Network routing was unavailable for this run (networkx missing or empty circulation graph at conversion time).',
      entrance: null,
      scopeNote: ''
    };
  }

  const { lat, lng, snapDistanceM } = accessibilityStats.entranceNode;
  const nearbyBusStopsWithin300m = busStops.filter(stop => featureWithinM(stop, lng, lat, 300)).length;
  const nearbySchoolsWithin1km = schools ? schools.filter(s => featureWithinM(s, lng, lat, 1000)).length : 0;

  const c15 = catchments.find(c => c.minutes === 15);
  // Uses the 15-minute catchment's average route distance (a local figure, ~782m in this
  // dataset), not the site-wide avgWalkingDistanceM KPI -- that KPI averages over every reachable
  // hex across the full 5km study radius (including hexes near the extract's edge, ~9km away by
  // network distance), which would make any single entrance's score collapse toward 0 regardless
  // of how well-connected it actually is immediately around itself.
  const localAvgDistanceM = c15?.avgRouteDistanceM ?? kpis.avgWalkingDistanceM;
  const entranceAccessibilityScore = Math.round(
    normalize(nearbyBusStopsWithin300m, 5) * 0.4 +
    (localAvgDistanceM !== null ? normalize(2000 - Math.min(2000, localAvgDistanceM), 2000) : 0) * 0.6
  );

  return {
    entranceCount: 1,
    note: 'No park entrance/gate point data exists anywhere in the source OSM extract (confirmed via table introspection -- no entrance table). The verified park center, snapped to its nearest routable street node, is used as a single-entrance proxy for every metric below, clearly labeled throughout.',
    entrance: {
      label: 'Primary Entrance (Derived Proxy)',
      lat, lng, snapDistanceM,
      populationServedWithin15Min: c15?.population || 0,
      catchment15MinPct: c15?.pctOfTotalPopulation || 0,
      avgWalkingDistanceM: kpis.avgWalkingDistanceM,
      nearbyBusStopsWithin300m,
      nearbySchoolsWithin1km,
      entranceAccessibilityScore
    },
    scopeNote: 'Entrance ranking, entrance demand heatmap, footfall estimation, and "Add Proposed Entrance" before/after scenario testing all require multiple real entrance locations to compare against one another -- not built here, since only one derivable entrance point exists for this site.'
  };
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export interface AccessibilityExecutiveSummary {
  studyArea: string;
  pop5MinWalk: number;
  pop10MinWalk: number;
  pop15MinWalk: number;
  transitAccessibilityLabel: string;
  bestPerformingEntrance: string;
  mostUnderservedZone: string;
  overallAccessibilityScore: number;
  overallAccessibilityStatus: string;
}

export function computeAccessibilityExecutiveSummary(
  hexes: H3Feature[],
  kpis: AccessibilityKPIs,
  transit: TransitAccessibilityResult,
  parkCenter: { lat: number; lng: number }
): AccessibilityExecutiveSummary {
  const ranked = [...hexes].sort((a, b) => {
    const scoreA = computeHexAccessibilityDeficitScore(a) * (a.properties.population || 0);
    const scoreB = computeHexAccessibilityDeficitScore(b) * (b.properties.population || 0);
    return scoreB - scoreA;
  });
  const topDeficitHexes = ranked.slice(0, Math.max(1, Math.round(hexes.length * 0.05)));

  let mostUnderservedZone = 'Insufficient data';
  if (topDeficitHexes.length > 0) {
    const centroids = topDeficitHexes.map(hexCentroid);
    const avgLng = centroids.reduce((s, c) => s + c[0], 0) / centroids.length;
    const avgLat = centroids.reduce((s, c) => s + c[1], 0) / centroids.length;
    const brg = turfBearing([parkCenter.lng, parkCenter.lat], [avgLng, avgLat]);
    mostUnderservedZone = `${bearingToCompass(brg)} Residential Edge`;
  }

  return {
    studyArea: '5 km Context',
    pop5MinWalk: kpis.pop5MinWalk,
    pop10MinWalk: kpis.pop10MinWalk,
    pop15MinWalk: kpis.pop15MinWalk,
    transitAccessibilityLabel: transit.transitAccessibilityLabel,
    bestPerformingEntrance: 'Not applicable -- only one derivable entrance point exists (see Park Entrance Analysis).',
    mostUnderservedZone,
    overallAccessibilityScore: kpis.overallAccessibilityScore,
    overallAccessibilityStatus: accessibilityStatusLabel(kpis.overallAccessibilityScore)
  };
}

// ---------------------------------------------------------------------------
// Top-level report bundle
// ---------------------------------------------------------------------------

export interface AccessibilityAnalysisReportData {
  executiveSummary: AccessibilityExecutiveSummary;
  kpis: AccessibilityKPIs;
  catchments: WalkingCatchmentBand[];
  catchmentMethodology: string;
  entrance: EntranceAnalysisResult;
  transit: TransitAccessibilityResult;
  pedestrianQuality: PedestrianNetworkQualityResult;
  barriers: BarrierAnalysisResult;
  topUnderservedCells: { h3Id: string; population: number; deficitScore: number; walkingTimeMinutes: number | null }[];
  walkingTimeHistogram: { bucket: string; count: number }[];
  reachabilityNote: string;
}

export function computeAccessibilityAnalysisReport(
  hexes: H3Feature[],
  busStops: GeoJsonFeature[],
  parkCenter: { lat: number; lng: number },
  roadStats: RoadStats | null,
  accessibilityStats: AccessibilityStats | null,
  parkingFeatures: GeoJsonFeature[] | null,
  schools: GeoJsonFeature[] | null
): AccessibilityAnalysisReportData {
  const catchments = computeWalkingCatchments(hexes);
  const pedestrianQuality = computePedestrianNetworkQuality(hexes, roadStats);
  const transit = computeTransitAccessibility(hexes, busStops, parkCenter, parkingFeatures);
  const barriers = computeBarrierAnalysis(hexes, roadStats);
  const kpis = computeAccessibilityKPIs(hexes, roadStats, accessibilityStats, busStops, parkCenter, pedestrianQuality, transit, catchments);
  const entrance = computeEntranceAnalysis(accessibilityStats, kpis, catchments, busStops, schools);
  const executiveSummary = computeAccessibilityExecutiveSummary(hexes, kpis, transit, parkCenter);

  const topUnderservedCells = [...hexes]
    .map(h => ({
      h3Id: h.properties.h3_id,
      population: Math.round(h.properties.population || 0),
      deficitScore: computeHexAccessibilityDeficitScore(h),
      walkingTimeMinutes: h.properties.walking_time_to_park_minutes ?? null
    }))
    .sort((a, b) => (b.deficitScore * b.population) - (a.deficitScore * a.population))
    .slice(0, 20);

  const reachableWalkTimes = hexes.map(h => h.properties.walking_time_to_park_minutes).filter((v): v is number => v !== null && v !== undefined);
  const walkingTimeHistogram = bucketHistogram(reachableWalkTimes, 8);

  const totalHexCount = hexes.length;
  const reachableCount = reachableWalkTimes.length;
  const reachabilityNote = accessibilityStats
    ? accessibilityStats.unreachableHexNote
    : `${totalHexCount - reachableCount} of ${totalHexCount} H3 cells have no network-routed walking time (network routing unavailable for this run).`;

  return {
    executiveSummary,
    kpis,
    catchments,
    catchmentMethodology: WALKING_CATCHMENT_METHODOLOGY,
    entrance,
    transit,
    pedestrianQuality,
    barriers,
    topUnderservedCells,
    walkingTimeHistogram,
    reachabilityNote
  };
}
