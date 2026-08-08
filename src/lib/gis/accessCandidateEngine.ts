import { centroid as turfCentroid } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { GeoJsonFeature, H3Feature } from './types';
import { toUtm40N } from './grasshopperExportEngine';

export interface AccessCandidateSettings {
  candidateSpacingM: number;
  catchmentRadiusM: number;
  roadEdgeMaxDistanceM: number;
}

export interface AccessCandidate {
  candidate_id: string;
  edge_id: string;
  boundary_parameter: number;
  coordinates: { x: number; y: number; longitude: number; latitude: number; crs: 'EPSG:32640' };
  eligible_roles: { main_entrance: boolean; secondary_entrance: boolean; drop_off: boolean; service_entrance: boolean };
  hard_exclusions: string[];
  metrics_raw: {
    population_pull: number;
    population_within_catchment: number;
    school_generators_within_catchment: number;
    building_generators_within_catchment: number;
    intersection_count_within_catchment: number;
    average_barrier_score: number | null;
    nearest_bus_stop_m: number | null;
    nearest_road_m: number | null;
    nearest_school_boundary_m: number | null;
    nearest_building_boundary_m: number | null;
  };
  metrics_normalized: {
    population_pull: number;
    transit_access: number;
    intersection_connectivity: number;
    road_access: number;
    low_barrier_access: number;
  };
  evidence_status: Record<string, 'computed' | 'missing'>;
}

export interface AccessCandidatePair {
  candidate_a: string;
  candidate_b: string;
  distance_m: number;
  same_edge: boolean;
  catchment_overlap_ratio: number;
  additional_population_served_by_a: number;
  additional_population_served_by_b: number;
  combined_population_served: number;
}

interface Point2 { x: number; y: number }
interface Segment { a: Point2; b: Point2 }

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point2, segment: Segment): number {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) return distance(point, segment.a);
  const t = Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / length2));
  return distance(point, { x: segment.a.x + t * dx, y: segment.a.y + t * dy });
}

function coordinateParts(geometry: GeoJsonFeature['geometry']): number[][][] {
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case 'Point': return [[[coordinates[0], coordinates[1]]]];
    case 'MultiPoint':
    case 'LineString': return [coordinates];
    case 'MultiLineString':
    case 'Polygon': return coordinates;
    case 'MultiPolygon': return coordinates.flat();
    default: return [];
  }
}

function featureSegments(feature: GeoJsonFeature): Segment[] {
  return coordinateParts(feature.geometry).flatMap(part => {
    const points = part.map(([lng, lat]) => toUtm40N(lng, lat));
    if (points.length === 1) return [{ a: points[0], b: points[0] }];
    return points.slice(0, -1).map((point, index) => ({ a: point, b: points[index + 1] }));
  });
}

function minFeatureDistance(point: Point2, features: GeoJsonFeature[]): number | null {
  if (features.length === 0) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (const feature of features)
    for (const segment of featureSegments(feature))
      minimum = Math.min(minimum, distanceToSegment(point, segment));
  return Number.isFinite(minimum) ? minimum : null;
}

function featureCountWithin(point: Point2, features: GeoJsonFeature[], radius: number): number {
  return features.reduce((count, feature) => {
    const segments = featureSegments(feature);
    return count + (segments.some(segment => distanceToSegment(point, segment) <= radius) ? 1 : 0);
  }, 0);
}

function normalize(values: Array<number | null>, inverse = false): number[] {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length === 0) return values.map(() => 0);
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  return values.map(value => {
    if (value === null || !Number.isFinite(value)) return 0;
    const normalized = maximum === minimum ? 1 : (value - minimum) / (maximum - minimum);
    return inverse ? 1 - normalized : normalized;
  });
}

export function buildAccessCandidatePackage(input: {
  siteBoundary: Feature<Polygon>;
  h3Catchment: H3Feature[];
  roads: GeoJsonFeature[];
  buildings: GeoJsonFeature[];
  schools: GeoJsonFeature[];
  busStops: GeoJsonFeature[];
  settings: AccessCandidateSettings;
}): { candidates: AccessCandidate[]; pairs: AccessCandidatePair[]; summary: Record<string, unknown> } {
  const ring = input.siteBoundary.geometry.coordinates[0];
  const h3 = input.h3Catchment.map(feature => {
    const [lng, lat] = turfCentroid(feature as any).geometry.coordinates as [number, number];
    return { feature, point: toUtm40N(lng, lat) };
  });
  const busPoints = input.busStops.map(feature => {
    const [lng, lat] = turfCentroid(feature as any).geometry.coordinates as [number, number];
    return toUtm40N(lng, lat);
  });
  const drafts: Array<Omit<AccessCandidate, 'metrics_normalized'> & { catchmentIds: Set<string> }> = [];

  for (let edgeIndex = 0; edgeIndex < ring.length - 1; edgeIndex++) {
    const [aLng, aLat] = ring[edgeIndex];
    const [bLng, bLat] = ring[edgeIndex + 1];
    const a = toUtm40N(aLng, aLat);
    const b = toUtm40N(bLng, bLat);
    const edgeLength = distance(a, b);
    const count = Math.max(1, Math.ceil(edgeLength / input.settings.candidateSpacingM));
    for (let index = 0; index < count; index++) {
      const t = (index + 0.5) / count;
      const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const longitude = aLng + (bLng - aLng) * t;
      const latitude = aLat + (bLat - aLat) * t;
      const roadDistance = minFeatureDistance(point, input.roads);
      const schoolDistance = minFeatureDistance(point, input.schools);
      const buildingDistance = minFeatureDistance(point, input.buildings);
      const busDistance = busPoints.length ? Math.min(...busPoints.map(bus => distance(point, bus))) : null;
      const catchment = h3.filter(item => distance(point, item.point) <= input.settings.catchmentRadiusM);
      const catchmentIds = new Set(catchment.map(item => item.feature.properties.h3_id));
      const populationWithin = catchment.reduce((sum, item) => sum + (item.feature.properties.population || 0), 0);
      const populationPull = catchment.reduce((sum, item) => {
        const weight = Math.max(0, 1 - distance(point, item.point) / input.settings.catchmentRadiusM);
        return sum + (item.feature.properties.population || 0) * weight;
      }, 0);
      const barriers = catchment.map(item => item.feature.properties.barrier_score_hex).filter(Number.isFinite);
      const hardExclusions: string[] = [];
      if (roadDistance === null || roadDistance > input.settings.roadEdgeMaxDistanceM) hardExclusions.push('not_within_approved_road_edge_distance');
      if (schoolDistance !== null && (roadDistance === null || schoolDistance < roadDistance)) hardExclusions.push('school_facing_edge');
      if (buildingDistance !== null && (roadDistance === null || buildingDistance < roadDistance)) hardExclusions.push('building_facing_edge');
      const eligible = hardExclusions.length === 0;
      drafts.push({
        candidate_id: `access-edge-${edgeIndex + 1}-${index + 1}`,
        edge_id: `edge-${edgeIndex + 1}`,
        boundary_parameter: t,
        coordinates: { x: point.x, y: point.y, longitude, latitude, crs: 'EPSG:32640' },
        eligible_roles: { main_entrance: eligible, secondary_entrance: eligible, drop_off: eligible, service_entrance: eligible },
        hard_exclusions: hardExclusions,
        metrics_raw: {
          population_pull: populationPull,
          population_within_catchment: populationWithin,
          school_generators_within_catchment: featureCountWithin(point, input.schools, input.settings.catchmentRadiusM),
          building_generators_within_catchment: featureCountWithin(point, input.buildings, input.settings.catchmentRadiusM),
          intersection_count_within_catchment: catchment.reduce((sum, item) => sum + (item.feature.properties.intersection_count_hex || 0), 0),
          average_barrier_score: barriers.length ? barriers.reduce((sum, value) => sum + value, 0) / barriers.length : null,
          nearest_bus_stop_m: busDistance,
          nearest_road_m: roadDistance,
          nearest_school_boundary_m: schoolDistance,
          nearest_building_boundary_m: buildingDistance
        },
        evidence_status: {
          population: input.h3Catchment.length ? 'computed' : 'missing',
          intersections: input.h3Catchment.length ? 'computed' : 'missing',
          transit: input.busStops.length ? 'computed' : 'missing',
          roads: input.roads.length ? 'computed' : 'missing',
          schools: input.schools.length ? 'computed' : 'missing',
          buildings: input.buildings.length ? 'computed' : 'missing'
        },
        catchmentIds
      });
    }
  }

  const populationNorm = normalize(drafts.map(item => item.metrics_raw.population_pull));
  const transitNorm = normalize(drafts.map(item => item.metrics_raw.nearest_bus_stop_m), true);
  const intersectionNorm = normalize(drafts.map(item => item.metrics_raw.intersection_count_within_catchment));
  const roadNorm = normalize(drafts.map(item => item.metrics_raw.nearest_road_m), true);
  const barrierNorm = normalize(drafts.map(item => item.metrics_raw.average_barrier_score), true);
  const candidates: AccessCandidate[] = drafts.map((draft, index) => {
    const { catchmentIds: _, ...candidate } = draft;
    return {
      ...candidate,
      metrics_normalized: {
        population_pull: populationNorm[index],
        transit_access: transitNorm[index],
        intersection_connectivity: intersectionNorm[index],
        road_access: roadNorm[index],
        low_barrier_access: barrierNorm[index]
      }
    };
  });

  const populationById = new Map(input.h3Catchment.map(feature => [feature.properties.h3_id, feature.properties.population || 0]));
  const pairs: AccessCandidatePair[] = [];
  for (let aIndex = 0; aIndex < drafts.length; aIndex++) {
    if (!drafts[aIndex].eligible_roles.main_entrance) continue;
    for (let bIndex = aIndex + 1; bIndex < drafts.length; bIndex++) {
      if (!drafts[bIndex].eligible_roles.secondary_entrance) continue;
      const aIds = drafts[aIndex].catchmentIds;
      const bIds = drafts[bIndex].catchmentIds;
      const union = new Set([...aIds, ...bIds]);
      const intersection = [...aIds].filter(id => bIds.has(id));
      const unionPopulation = [...union].reduce((sum, id) => sum + (populationById.get(id) || 0), 0);
      const overlapPopulation = intersection.reduce((sum, id) => sum + (populationById.get(id) || 0), 0);
      const additionalPopulationByA = [...aIds].filter(id => !bIds.has(id)).reduce((sum, id) => sum + (populationById.get(id) || 0), 0);
      const additionalPopulationByB = [...bIds].filter(id => !aIds.has(id)).reduce((sum, id) => sum + (populationById.get(id) || 0), 0);
      pairs.push({
        candidate_a: drafts[aIndex].candidate_id,
        candidate_b: drafts[bIndex].candidate_id,
        distance_m: distance(drafts[aIndex].coordinates, drafts[bIndex].coordinates),
        same_edge: drafts[aIndex].edge_id === drafts[bIndex].edge_id,
        catchment_overlap_ratio: unionPopulation > 0 ? overlapPopulation / unionPopulation : 0,
        additional_population_served_by_a: additionalPopulationByA,
        additional_population_served_by_b: additionalPopulationByB,
        combined_population_served: unionPopulation
      });
    }
  }

  return {
    candidates,
    pairs,
    summary: {
      candidate_count: candidates.length,
      eligible_public_candidate_count: candidates.filter(candidate => candidate.eligible_roles.main_entrance).length,
      excluded_school_facing_count: candidates.filter(candidate => candidate.hard_exclusions.includes('school_facing_edge')).length,
      excluded_building_facing_count: candidates.filter(candidate => candidate.hard_exclusions.includes('building_facing_edge')).length,
      pair_count: pairs.length,
      settings: input.settings,
      disclosure: 'Population pull is an inverse-distance-weighted potential-demand model over H3 population, not measured pedestrian footfall. Intersection count and barrier score are source GIS proxies.'
    }
  };
}
