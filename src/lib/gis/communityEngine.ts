import { distance as turfDistance, bearing as turfBearing } from '@turf/turf';
import type { H3Feature, GeoJsonFeature, RoadStats } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computePersonaAnalytics, type PersonaId, type PersonaStat } from '../analytics/personas';
import { computeHealthScore, type SubscoreResult } from '../analytics/healthScore';
import { textMatchesAny } from '../analytics/shared';
import { computeCatchmentAnalysis, type CatchmentRing, computeHexDemandScore } from './populationEngine';
import { computeWalkingCatchments, type WalkingCatchmentBand } from './accessibilityEngine';
import { hexVoidRatioPct } from './environmentalEngine';
import { hexCentroid } from './h3Engine';

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function bearingToCompass(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  return COMPASS_LABELS[Math.round(normalized / 45) % 8];
}

/**
 * Facility centroid helper, tolerant of Point/Polygon/MultiPolygon geometry
 * (parks/playgrounds/schools in this OSM extract are a mix -- a naive Point
 * cast previously crashed Accessibility Analysis on the same data; same fix
 * applied here from the start).
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
    return [ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n, ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n];
  }
  if (geom.type === 'MultiPolygon') {
    const firstRing = (geom.coordinates as [number, number][][][])[0]?.[0];
    if (!firstRing || firstRing.length === 0) return null;
    const n = firstRing.length - 1 || firstRing.length;
    return [firstRing.slice(0, n).reduce((s, p) => s + p[0], 0) / n, firstRing.slice(0, n).reduce((s, p) => s + p[1], 0) / n];
  }
  return null;
}

function countWithinM(features: GeoJsonFeature[] | null, fromLng: number, fromLat: number, radiusM: number): number {
  if (!features) return 0;
  return features.filter(f => {
    const c = featureCentroidLngLat(f);
    return c ? turfDistance([fromLng, fromLat], c, { units: 'meters' }) <= radiusM : false;
  }).length;
}

// ---------------------------------------------------------------------------
// Facility layers (lazily fetched by the caller, passed in as a bundle)
// ---------------------------------------------------------------------------

export interface CommunityFacilityLayers {
  schools: GeoJsonFeature[] | null;
  mosques: GeoJsonFeature[] | null;
  clinics: GeoJsonFeature[] | null;
  hospitals: GeoJsonFeature[] | null;
  playgrounds: GeoJsonFeature[] | null;
  sports: GeoJsonFeature[] | null;
  restaurants: GeoJsonFeature[] | null;
  cafes: GeoJsonFeature[] | null;
  shops: GeoJsonFeature[] | null;
  toilets: GeoJsonFeature[] | null;
  drinkingWater: GeoJsonFeature[] | null;
  parks: GeoJsonFeature[] | null;
}

export const EMPTY_FACILITY_LAYERS: CommunityFacilityLayers = {
  schools: null, mosques: null, clinics: null, hospitals: null, playgrounds: null, sports: null,
  restaurants: null, cafes: null, shops: null, toilets: null, drinkingWater: null, parks: null
};

const FACILITY_LAYER_DEFS: { key: keyof CommunityFacilityLayers; label: string }[] = [
  { key: 'schools', label: 'Schools' },
  { key: 'mosques', label: 'Mosques' },
  { key: 'clinics', label: 'Clinics' },
  { key: 'hospitals', label: 'Hospitals' },
  { key: 'playgrounds', label: 'Playgrounds' },
  { key: 'sports', label: 'Sports Facilities' },
  { key: 'restaurants', label: 'Restaurants' },
  { key: 'cafes', label: 'Cafés' },
  { key: 'shops', label: 'Retail (All Shops)' },
  { key: 'toilets', label: 'Public Toilets' },
  { key: 'drinkingWater', label: 'Drinking Water Points' },
  { key: 'parks', label: 'Existing Parks' }
];

// ---------------------------------------------------------------------------
// Social infrastructure -- real facility counts/density/distance-to-park
// ---------------------------------------------------------------------------

export interface FacilityTypeStats {
  key: string;
  label: string;
  loaded: boolean;
  count: number | null;
  densityPerKm2: number | null;
  avgDistanceToParkM: number | null;
  avgWalkingTimeToParkMinutes: number | null;
  populationPerFacility: number | null;
  note?: string;
}

export function computeFacilityTypeStats(
  facilities: CommunityFacilityLayers,
  totalAreaKm2: number,
  totalPopulation: number,
  parkCenter: { lat: number; lng: number }
): FacilityTypeStats[] {
  return FACILITY_LAYER_DEFS.map(def => {
    const features = facilities[def.key];
    if (!features) {
      return { key: def.key, label: def.label, loaded: false, count: null, densityPerKm2: null, avgDistanceToParkM: null, avgWalkingTimeToParkMinutes: null, populationPerFacility: null, note: 'Not fetched for this run.' };
    }
    const count = features.length;
    const distances = features.map(f => {
      const c = featureCentroidLngLat(f);
      return c ? turfDistance([parkCenter.lng, parkCenter.lat], c, { units: 'meters' }) : null;
    }).filter((d): d is number => d !== null);
    const avgDistanceToParkM = distances.length > 0 ? Math.round(distances.reduce((s, d) => s + d, 0) / distances.length) : null;
    return {
      key: def.key,
      label: def.label,
      loaded: true,
      count,
      densityPerKm2: totalAreaKm2 > 0 ? Math.round((count / totalAreaKm2) * 100) / 100 : null,
      avgDistanceToParkM,
      avgWalkingTimeToParkMinutes: avgDistanceToParkM !== null ? Math.round((avgDistanceToParkM / 80) * 10) / 10 : null,
      populationPerFacility: count > 0 ? Math.round(totalPopulation / count) : null,
      note: avgDistanceToParkM !== null ? 'Distance is straight-line (Euclidean) from the verified park center to each facility centroid, not network-routed.' : undefined
    };
  });
}

export function computeSupermarketCount(shops: GeoJsonFeature[] | null): number | null {
  if (!shops) return null;
  return shops.filter(f => (f.properties as any)?.shop === 'supermarket').length;
}

// ---------------------------------------------------------------------------
// Community catchments (Euclidean rings + real facility counts; network-based bands reused as-is from Accessibility)
// ---------------------------------------------------------------------------

export interface CommunityCatchmentRing {
  radiusM: number;
  label: string;
  population: number;
  areaKm2: number;
  densityPerKm2: number;
  households: null;
  householdsNote: string;
  schools: number;
  mosques: number;
  clinics: number;
  hospitals: number;
  sportsFacilities: number;
  playgrounds: number;
  retail: number;
  busStops: number;
  existingParks: number;
}

export function computeCommunityCatchments(
  hexes: H3Feature[],
  parkCenter: { lat: number; lng: number },
  facilities: CommunityFacilityLayers,
  busStops: GeoJsonFeature[]
): CommunityCatchmentRing[] {
  const popRings: CatchmentRing[] = computeCatchmentAnalysis(hexes, parkCenter);
  return popRings.map(ring => ({
    radiusM: ring.radiusM,
    label: ring.label,
    population: ring.population,
    areaKm2: ring.areaKm2,
    densityPerKm2: ring.densityPerKm2,
    households: null,
    householdsNote: 'No household-count dataset in this build -- would require official demographic data.',
    schools: countWithinM(facilities.schools, parkCenter.lng, parkCenter.lat, ring.radiusM),
    mosques: countWithinM(facilities.mosques, parkCenter.lng, parkCenter.lat, ring.radiusM),
    clinics: countWithinM(facilities.clinics, parkCenter.lng, parkCenter.lat, ring.radiusM),
    hospitals: countWithinM(facilities.hospitals, parkCenter.lng, parkCenter.lat, ring.radiusM),
    sportsFacilities: countWithinM(facilities.sports, parkCenter.lng, parkCenter.lat, ring.radiusM),
    playgrounds: countWithinM(facilities.playgrounds, parkCenter.lng, parkCenter.lat, ring.radiusM),
    retail: countWithinM(facilities.shops, parkCenter.lng, parkCenter.lat, ring.radiusM),
    busStops: countWithinM(busStops, parkCenter.lng, parkCenter.lat, ring.radiusM),
    existingParks: countWithinM(facilities.parks, parkCenter.lng, parkCenter.lat, ring.radiusM)
  }));
}

export { computeWalkingCatchments };
export type { WalkingCatchmentBand };

// ---------------------------------------------------------------------------
// Per-hex real composites (H3 Community Analysis + map modes)
// ---------------------------------------------------------------------------
// The H3 grid's per-hex school_count/mosque_count/clinic_count/hospital_count/
// playground_count/sports_count fields are a "nearby presence" signal, not a
// literal distinct count (verified: they read ~1 in 837/860 hexes regardless
// of true facility density -- see the original engine's methodology note,
// carried forward here). They ARE still real and spatially varying, so they
// remain useful as presence/absence proximity signals for per-cell demand
// scoring -- just never summed grid-wide and presented as a literal facility
// count (use computeFacilityTypeStats/computeCommunityCatchments for those).

export function hexFamilyDemandScore(hex: H3Feature): number {
  const school = normalize(hex.properties.school_count || 0, 2);
  const playground = normalize(hex.properties.playground_count || 0, 2);
  const pop = normalize(hex.properties.pop_density_km2 || 0, 20000);
  return Math.round(school * 0.3 + playground * 0.3 + pop * 0.4);
}

export function hexYouthDemandScore(hex: H3Feature): number {
  const sports = normalize(hex.properties.sports_count || 0, 2);
  const school = normalize(hex.properties.school_count || 0, 2);
  return Math.round(sports * 0.55 + school * 0.45);
}

export function hexOlderAdultDemandScore(hex: H3Feature): number {
  const mosque = normalize(hex.properties.mosque_count || 0, 2);
  const clinic = normalize(hex.properties.clinic_count || 0, 2);
  const pop = normalize(hex.properties.pop_density_km2 || 0, 20000);
  return Math.round(mosque * 0.3 + clinic * 0.3 + pop * 0.4);
}

export function hexFacilityAccessScore(hex: H3Feature): number {
  return Math.round(normalize(hex.properties.amenity_total || 0, 20));
}

const DIVERSITY_FIELDS = ['school_count', 'mosque_count', 'clinic_count', 'hospital_count', 'playground_count', 'sports_count', 'restaurant_count', 'cafe_count', 'shop_count'] as const;

export function hexCommunityDiversityScore(hex: H3Feature): number {
  const present = DIVERSITY_FIELDS.filter(f => ((hex.properties as any)[f] || 0) > 0).length;
  return Math.round((present / DIVERSITY_FIELDS.length) * 100);
}

export function hexPlaygroundDeficitScore(hex: H3Feature): number {
  const hasPlayground = (hex.properties.playground_count || 0) > 0;
  const popScore = normalize(hex.properties.pop_density_km2 || 0, 20000);
  return hasPlayground ? Math.round(popScore * 0.3) : Math.round(popScore);
}

export function hexSportsDeficitScore(hex: H3Feature): number {
  const hasSports = (hex.properties.sports_count || 0) > 0;
  const popScore = normalize(hex.properties.pop_density_km2 || 0, 20000);
  return hasSports ? Math.round(popScore * 0.3) : Math.round(popScore);
}

export function hexGreenSpaceDeficitScore(hex: H3Feature): number {
  return Math.round(normalize(100 - (hex.properties.green_coverage_pct || 0), 100));
}

/** Composite: population pressure + accessibility deficit (real network walking time where available) + green deficit + facility deficit. */
export function hexCommunityVulnerabilityScore(hex: H3Feature): number {
  const popScore = normalize(hex.properties.pop_density_km2 || 0, 20000);
  const greenDeficit = hexGreenSpaceDeficitScore(hex);
  const walkTime = hex.properties.walking_time_to_park_minutes;
  const accessDeficit = walkTime === null || walkTime === undefined ? 100 : normalize(Math.min(60, walkTime), 60);
  const facilityDeficit = normalize(20 - (hex.properties.amenity_total || 0), 20);
  return Math.round(popScore * 0.3 + greenDeficit * 0.2 + accessDeficit * 0.3 + facilityDeficit * 0.2);
}

/** High where vulnerability is high AND there is available land (void ratio) to act on it. */
export function hexCommunityOpportunityScore(hex: H3Feature): number {
  const vulnerability = hexCommunityVulnerabilityScore(hex);
  const voidRatio = hexVoidRatioPct(hex);
  return Math.round(normalize(vulnerability, 100) * 0.6 + normalize(voidRatio, 100) * 0.4);
}

// ---------------------------------------------------------------------------
// Community KPIs
// ---------------------------------------------------------------------------

export type CommMetricStatus = 'good' | 'watch' | 'critical' | 'unavailable';
export type CommMetricConfidence = 'High' | 'Medium' | 'Low' | 'N/A';

export interface CommunityMetric {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  unit?: string;
  benchmark?: string;
  status: CommMetricStatus;
  priority: 'Low' | 'Medium' | 'High';
  confidence: CommMetricConfidence;
  dataSource: string;
  note?: string;
}

export interface CommunityKPIs {
  metrics: CommunityMetric[];
  totalPopulation: number;
  facilityAccessScore: number;
  communityDiversityScore: number;
  familyDemandScore: number;
  youthDemandScore: number;
  olderAdultSupportScore: number;
  socialInfrastructureDeficitScore: number;
  overallCommunityScore: number;
}

export function computeCommunityKPIs(
  hexes: H3Feature[],
  facilityStats: FacilityTypeStats[],
  reviews: NLPAnalyzedReview[]
): CommunityKPIs {
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0);
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const popDensity = totalAreaKm2 > 0 ? totalPopulation / totalAreaKm2 : 0;

  const facilityAccessScore = hexes.length === 0 ? 0 : Math.round(hexes.reduce((s, h) => s + hexFacilityAccessScore(h), 0) / hexes.length);
  const communityDiversityScore = hexes.length === 0 ? 0 : Math.round(hexes.reduce((s, h) => s + hexCommunityDiversityScore(h), 0) / hexes.length);
  const familyDemandScore = hexes.length === 0 ? 0 : Math.round(hexes.reduce((s, h) => s + hexFamilyDemandScore(h), 0) / hexes.length);
  const youthDemandScore = hexes.length === 0 ? 0 : Math.round(hexes.reduce((s, h) => s + hexYouthDemandScore(h), 0) / hexes.length);
  const olderAdultSupportScore = hexes.length === 0 ? 0 : Math.round(hexes.reduce((s, h) => s + hexOlderAdultDemandScore(h), 0) / hexes.length);
  const socialInfrastructureDeficitScore = 100 - facilityAccessScore;

  const findStat = (key: string) => facilityStats.find(f => f.key === key);
  const schools = findStat('schools');
  const playgrounds = findStat('playgrounds');
  const sports = findStat('sports');
  const clinics = findStat('clinics');

  const overallCommunityScore = Math.round(facilityAccessScore * 0.3 + communityDiversityScore * 0.25 + familyDemandScore * 0.25 + (100 - socialInfrastructureDeficitScore) * 0.2);

  const metrics: CommunityMetric[] = [
    { key: 'totalPopulation', label: 'Total Population', value: Math.round(totalPopulation), displayValue: Math.round(totalPopulation).toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'H3 Grid (population raster aggregation)' },
    { key: 'popDensity', label: 'Population Density', value: Math.round(popDensity), displayValue: `${Math.round(popDensity).toLocaleString()}/km²`, unit: '/km²', status: 'good', priority: 'Low', confidence: 'High', dataSource: 'H3 Grid' },
    { key: 'households', label: 'Estimated Households', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Requires official household-size data -- not present.' },
    { key: 'avgHouseholdSize', label: 'Average Household Size', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'childrenPop', label: 'Children Population', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'No age-band census/population data -- see Family and Age-Group Analysis for a proxy-based demand estimate instead.' },
    { key: 'youthPop', label: 'Youth Population', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'workingAgePop', label: 'Working-Age Population', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'olderAdultPop', label: 'Older-Adult Population', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'familyHouseholdShare', label: 'Family Household Share', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'schoolsCount', label: 'Schools Count', value: schools?.count ?? null, displayValue: schools?.count !== null && schools?.count !== undefined ? schools.count.toLocaleString() : 'Not loaded', status: schools?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: schools?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features)' },
    { key: 'nurseriesCount', label: 'Nurseries Count', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'No dedicated nursery/kindergarten layer -- only 2 buildings carry amenity=kindergarten sitewide, too sparse to report as a count.' },
    { key: 'universitiesCount', label: 'Universities Count', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Zero amenity=university features in this OSM extract.' },
    { key: 'mosquesCount', label: 'Mosques Count', value: findStat('mosques')?.count ?? null, displayValue: findStat('mosques')?.count?.toLocaleString() ?? 'Not loaded', status: findStat('mosques')?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: findStat('mosques')?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features)' },
    { key: 'communityCentersCount', label: 'Community Centers Count', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Zero amenity=community_centre features in this OSM extract.' },
    { key: 'clinicsCount', label: 'Clinics Count', value: clinics?.count ?? null, displayValue: clinics?.count?.toLocaleString() ?? 'Not loaded', status: clinics?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: clinics?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features)' },
    { key: 'hospitalsCount', label: 'Hospitals Count', value: findStat('hospitals')?.count ?? null, displayValue: findStat('hospitals')?.count?.toLocaleString() ?? 'Not loaded', status: findStat('hospitals')?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: findStat('hospitals')?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features)' },
    { key: 'playgroundsCount', label: 'Playgrounds Count', value: playgrounds?.count ?? null, displayValue: playgrounds?.count?.toLocaleString() ?? 'Not loaded', status: playgrounds?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: playgrounds?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features)' },
    { key: 'sportsCount', label: 'Sports Facilities Count', value: sports?.count ?? null, displayValue: sports?.count?.toLocaleString() ?? 'Not loaded', status: sports?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: sports?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features)' },
    { key: 'librariesCount', label: 'Libraries Count', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Only 2 buildings carry amenity=library sitewide -- too sparse to report as a reliable count.' },
    { key: 'culturalFacilitiesCount', label: 'Cultural Facilities Count', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'retailCount', label: 'Retail and Daily-Needs Facilities Count', value: findStat('shops')?.count ?? null, displayValue: findStat('shops')?.count?.toLocaleString() ?? 'Not loaded', status: findStat('shops')?.loaded ? 'good' : 'unavailable', priority: 'Low', confidence: findStat('shops')?.loaded ? 'High' : 'N/A', dataSource: 'OSM Extract (distinct features, all shop= subtypes)' },
    { key: 'popPerSchool', label: 'Population per School', value: schools?.populationPerFacility ?? null, displayValue: schools?.populationPerFacility?.toLocaleString() ?? 'N/A', status: 'good', priority: 'Low', confidence: schools?.loaded ? 'Medium' : 'N/A', dataSource: 'Composite (total population / distinct facility count)' },
    { key: 'popPerPlayground', label: 'Population per Playground', value: playgrounds?.populationPerFacility ?? null, displayValue: playgrounds?.populationPerFacility?.toLocaleString() ?? 'N/A', status: (playgrounds?.populationPerFacility ?? 0) > 8000 ? 'critical' : 'good', priority: (playgrounds?.populationPerFacility ?? 0) > 8000 ? 'High' : 'Low', confidence: playgrounds?.loaded ? 'Medium' : 'N/A', dataSource: 'Composite' },
    { key: 'popPerSports', label: 'Population per Sports Facility', value: sports?.populationPerFacility ?? null, displayValue: sports?.populationPerFacility?.toLocaleString() ?? 'N/A', status: 'good', priority: 'Low', confidence: sports?.loaded ? 'Medium' : 'N/A', dataSource: 'Composite' },
    { key: 'popPerClinic', label: 'Population per Clinic', value: clinics?.populationPerFacility ?? null, displayValue: clinics?.populationPerFacility?.toLocaleString() ?? 'N/A', status: 'good', priority: 'Low', confidence: clinics?.loaded ? 'Medium' : 'N/A', dataSource: 'Composite' },
    { key: 'popPerCommunityFacility', label: 'Population per Community Facility', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'No single "community facility" layer exists -- see individual facility-type ratios above instead.' },
    { key: 'facilityAccessScore', label: 'Facility-Access Score', value: facilityAccessScore, displayValue: `${facilityAccessScore}/100`, status: facilityAccessScore >= 60 ? 'good' : facilityAccessScore >= 35 ? 'watch' : 'critical', priority: facilityAccessScore >= 60 ? 'Low' : 'High', confidence: 'Medium', dataSource: 'Composite (H3 amenity-presence density)' },
    { key: 'communityDiversityScore', label: 'Community Diversity Score', value: communityDiversityScore, displayValue: `${communityDiversityScore}/100`, status: communityDiversityScore >= 60 ? 'good' : 'watch', priority: communityDiversityScore >= 60 ? 'Low' : 'Medium', confidence: 'Medium', dataSource: 'Composite (share of 9 facility types present per H3 cell)' },
    { key: 'familyDemandScore', label: 'Family Demand Score', value: familyDemandScore, displayValue: `${familyDemandScore}/100`, status: familyDemandScore >= 60 ? 'watch' : 'good', priority: familyDemandScore >= 60 ? 'High' : 'Medium', confidence: 'Low', dataSource: 'Composite (school/playground presence + population density)' },
    { key: 'youthDemandScore', label: 'Youth Demand Score', value: youthDemandScore, displayValue: `${youthDemandScore}/100`, status: youthDemandScore >= 60 ? 'watch' : 'good', priority: youthDemandScore >= 60 ? 'High' : 'Medium', confidence: 'Low', dataSource: 'Composite (sports/school presence)' },
    { key: 'olderAdultSupportScore', label: 'Older-Adult Support Score', value: olderAdultSupportScore, displayValue: `${olderAdultSupportScore}/100`, status: olderAdultSupportScore >= 60 ? 'good' : 'watch', priority: olderAdultSupportScore >= 60 ? 'Low' : 'Medium', confidence: 'Low', dataSource: 'Composite (mosque/clinic presence + population density)' },
    { key: 'socialInfrastructureDeficitScore', label: 'Social-Infrastructure Deficit Score', value: socialInfrastructureDeficitScore, displayValue: `${socialInfrastructureDeficitScore}/100`, status: socialInfrastructureDeficitScore >= 60 ? 'critical' : socialInfrastructureDeficitScore >= 35 ? 'watch' : 'good', priority: socialInfrastructureDeficitScore >= 60 ? 'High' : 'Medium', confidence: 'Medium', dataSource: 'Composite (100 - Facility-Access Score)' },
    { key: 'overallCommunityScore', label: 'Overall Community Score', value: overallCommunityScore, displayValue: `${overallCommunityScore}/100`, status: overallCommunityScore >= 60 ? 'good' : overallCommunityScore >= 35 ? 'watch' : 'critical', priority: overallCommunityScore >= 60 ? 'Low' : 'High', confidence: 'Medium', dataSource: 'Composite (30% facility access + 25% diversity + 25% family demand + 20% low deficit)' }
  ];

  return {
    metrics,
    totalPopulation: Math.round(totalPopulation),
    facilityAccessScore,
    communityDiversityScore,
    familyDemandScore,
    youthDemandScore,
    olderAdultSupportScore,
    socialInfrastructureDeficitScore,
    overallCommunityScore
  };
}

// ---------------------------------------------------------------------------
// Family and age-group demand (proxy-based, evidence-driven -- no real age data)
// ---------------------------------------------------------------------------

export interface AgeGroupDemand {
  key: string;
  label: string;
  demandLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
  demandScore: number;
  evidence: string[];
  recommendedPrograms: string[];
  note: string;
}

interface AgeGroupDef {
  key: string;
  label: string;
  personaIds: PersonaId[];
  facilityKeys: string[];
  healthScoreKeys: string[];
  recommendedPrograms: string[];
}

const AGE_GROUP_DEFS: AgeGroupDef[] = [
  { key: 'youngChildren', label: 'Young Children', personaIds: ['children', 'parents'], facilityKeys: ['playgrounds', 'schools'], healthScoreKeys: ['playQuality', 'familyFriendliness'], recommendedPrograms: ['Inclusive playground', 'Nature play', 'Water play', 'Family seating', 'Toilets', 'Drinking fountains', 'Shade'] },
  { key: 'olderChildren', label: 'Older Children', personaIds: ['children'], facilityKeys: ['sports', 'schools'], healthScoreKeys: ['playQuality'], recommendedPrograms: ['Sports court', 'Nature play', 'Jogging loop'] },
  { key: 'teenagers', label: 'Teenagers', personaIds: ['teenagers'], facilityKeys: ['sports', 'schools'], healthScoreKeys: ['playQuality', 'communityActivity'], recommendedPrograms: ['Teen zone', 'Sports court', 'Outdoor fitness'] },
  { key: 'youngAdults', label: 'Young Adults', personaIds: ['joggers', 'cyclists', 'weekendSocial'], facilityKeys: ['sports'], healthScoreKeys: ['walkability', 'communityActivity'], recommendedPrograms: ['Jogging loop', 'Outdoor fitness', 'Community plaza'] },
  { key: 'families', label: 'Families', personaIds: ['parents', 'caregivers'], facilityKeys: ['schools', 'mosques', 'playgrounds'], healthScoreKeys: ['familyFriendliness'], recommendedPrograms: ['Family seating', 'Picnic area', 'Event lawn'] },
  { key: 'workingAdults', label: 'Working Adults', personaIds: ['joggers', 'residents'], facilityKeys: ['cafes', 'shops'], healthScoreKeys: ['walkability'], recommendedPrograms: ['Café', 'Jogging loop', 'Quiet garden'] },
  { key: 'olderAdults', label: 'Older Adults', personaIds: ['seniors'], facilityKeys: ['mosques', 'clinics'], healthScoreKeys: ['safety', 'accessibility'], recommendedPrograms: ['Senior activity area', 'Quiet garden', 'Shaded seating'] },
  { key: 'peopleOfDetermination', label: 'People of Determination', personaIds: ['peopleOfDetermination'], facilityKeys: ['clinics'], healthScoreKeys: ['accessibility'], recommendedPrograms: ['Accessible routes', 'Sensory garden', 'Inclusive playground equipment'] },
  { key: 'caregivers', label: 'Caregivers', personaIds: ['caregivers', 'parents'], facilityKeys: ['playgrounds', 'clinics'], healthScoreKeys: ['familyFriendliness', 'safety'], recommendedPrograms: ['Family seating', 'Toilets', 'Shaded rest areas'] }
];

function demandLevelFromScore(score: number): 'Low' | 'Moderate' | 'High' | 'Very High' {
  if (score >= 75) return 'Very High';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Moderate';
  return 'Low';
}

export function computeAgeGroupDemand(
  reviews: NLPAnalyzedReview[],
  personas: PersonaStat[],
  healthScore: SubscoreResult[],
  facilityStats: FacilityTypeStats[]
): AgeGroupDemand[] {
  const totalReviews = reviews.length || 1;

  return AGE_GROUP_DEFS.map(def => {
    const personaReviewCount = def.personaIds.reduce((s, id) => s + (personas.find(p => p.id === id)?.reviewCount || 0), 0);
    const personaShareScore = normalize((personaReviewCount / totalReviews) * 100, 40);

    const relevantHealthScores = def.healthScoreKeys.map(k => healthScore.find(h => h.key === k)?.score).filter((v): v is number => v !== undefined);
    const healthScoreAvg = relevantHealthScores.length > 0 ? relevantHealthScores.reduce((s, v) => s + v, 0) / relevantHealthScores.length : 50;

    const relevantFacilityCounts = def.facilityKeys.map(k => facilityStats.find(f => f.key === k)?.count).filter((v): v is number => v !== null && v !== undefined);
    const facilityScore = relevantFacilityCounts.length > 0 ? normalize(relevantFacilityCounts.reduce((s, v) => s + v, 0), 100) : 50;

    const demandScore = Math.round(personaShareScore * 0.45 + healthScoreAvg * 0.3 + facilityScore * 0.25);

    const evidence: string[] = [];
    if (personaReviewCount > 0) evidence.push(`${personaReviewCount} review mention(s) matching relevant persona keywords`);
    def.facilityKeys.forEach(k => {
      const stat = facilityStats.find(f => f.key === k);
      if (stat?.loaded) evidence.push(`${stat.count} ${stat.label.toLowerCase()} in the study area`);
    });
    relevantHealthScores.length > 0 && evidence.push(`Relevant review-sentiment score: ${Math.round(healthScoreAvg)}/100`);
    if (evidence.length === 0) evidence.push('Limited supporting evidence available for this run.');

    return {
      key: def.key,
      label: def.label,
      demandLevel: demandLevelFromScore(demandScore),
      demandScore,
      evidence,
      recommendedPrograms: def.recommendedPrograms,
      note: 'No official age-band population data exists for this site -- this is a proxy demand estimate from review-sentiment personas, nearby facility presence, and related Health Score subscores, not a measured population share.'
    };
  });
}

// ---------------------------------------------------------------------------
// Community activity patterns (real keyword-mention frequency, NOT measured foot traffic)
// ---------------------------------------------------------------------------

export interface ActivityPatternBucket {
  key: string;
  label: string;
  mentionCount: number;
  mentionSharePct: number;
}

const TIME_KEYWORDS: Record<string, string[]> = {
  earlyMorning: ['early morning', 'sunrise', 'dawn'],
  morning: ['morning'],
  midday: ['midday', 'noon', 'lunch time', 'lunchtime'],
  afternoon: ['afternoon'],
  evening: ['evening', 'sunset', 'dusk'],
  night: ['night', 'nighttime'],
  weekend: ['weekend', 'saturday', 'sunday'],
  friday: ['friday']
};

const TIME_LABELS: Record<string, string> = {
  earlyMorning: 'Early Morning', morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon',
  evening: 'Evening', night: 'Night', weekend: 'Weekend', friday: 'Friday'
};

export const ACTIVITY_PATTERN_METHODOLOGY = 'Counts real occurrences of time-of-day/day-of-week words in review text (e.g. "evening", "weekend") -- this is an estimated activity pattern derived from available review language, NOT measured foot traffic or verified visit timestamps. Review publish dates are vague relative strings ("2 months ago") and cannot be used to infer visit time-of-day.';

export function computeActivityPatterns(reviews: NLPAnalyzedReview[]): ActivityPatternBucket[] {
  const total = reviews.length || 1;
  return Object.entries(TIME_KEYWORDS).map(([key, keywords]) => {
    const mentionCount = reviews.filter(r => textMatchesAny(r.reviewText, keywords)).length;
    return { key, label: TIME_LABELS[key], mentionCount, mentionSharePct: Math.round((mentionCount / total) * 1000) / 10 };
  });
}

// ---------------------------------------------------------------------------
// Program demand analysis
// ---------------------------------------------------------------------------

export interface ProgramDef {
  key: string;
  name: string;
  primaryUsers: string[];
  personaIds: PersonaId[];
  healthScoreKeys: string[];
  shadeRequirement: number;
  noiseTolerance: number;
  accessibilityRequirement: number;
  visibilityRequirement: number;
  targetAreaM2: number;
  minAreaM2: number;
  maxAreaM2: number;
  minCount: number;
  maxCount: number;
  preferredAdjacencies: string[];
  avoidAdjacencies: string[];
}

// Area ranges and requirement scores are standard landscape-architecture planning benchmarks
// (typical public-park program sizing), not measurements of this specific site -- disclosed in
// the Grasshopper export's methodology block, not presented as site-derived figures.
export const PROGRAM_DEFS: ProgramDef[] = [
  { key: 'inclusivePlayground', name: 'Inclusive Playground', primaryUsers: ['children', 'families', 'People of Determination'], personaIds: ['children', 'parents', 'peopleOfDetermination'], healthScoreKeys: ['playQuality', 'familyFriendliness'], shadeRequirement: 0.9, noiseTolerance: 0.7, accessibilityRequirement: 1.0, visibilityRequirement: 0.85, targetAreaM2: 1600, minAreaM2: 1200, maxAreaM2: 2200, minCount: 1, maxCount: 2, preferredAdjacencies: ['family_seating', 'toilets', 'drinking_water'], avoidAdjacencies: ['service_yard', 'major_road'] },
  { key: 'naturePlay', name: 'Nature Play', primaryUsers: ['children', 'families'], personaIds: ['children', 'parents'], healthScoreKeys: ['playQuality', 'landscapeQuality'], shadeRequirement: 0.7, noiseTolerance: 0.7, accessibilityRequirement: 0.7, visibilityRequirement: 0.7, targetAreaM2: 900, minAreaM2: 500, maxAreaM2: 1500, minCount: 0, maxCount: 1, preferredAdjacencies: ['inclusivePlayground'], avoidAdjacencies: ['major_road'] },
  { key: 'waterPlay', name: 'Water Play', primaryUsers: ['children', 'families'], personaIds: ['children', 'parents'], healthScoreKeys: ['playQuality', 'landscapeQuality'], shadeRequirement: 0.6, noiseTolerance: 0.8, accessibilityRequirement: 0.9, visibilityRequirement: 0.8, targetAreaM2: 400, minAreaM2: 200, maxAreaM2: 800, minCount: 0, maxCount: 1, preferredAdjacencies: ['inclusivePlayground', 'toilets'], avoidAdjacencies: ['service_yard'] },
  { key: 'teenZone', name: 'Teen Zone', primaryUsers: ['teenagers'], personaIds: ['teenagers'], healthScoreKeys: ['playQuality', 'communityActivity'], shadeRequirement: 0.6, noiseTolerance: 0.9, accessibilityRequirement: 0.7, visibilityRequirement: 0.6, targetAreaM2: 700, minAreaM2: 400, maxAreaM2: 1200, minCount: 0, maxCount: 1, preferredAdjacencies: ['sportsCourt'], avoidAdjacencies: ['seniorActivityArea', 'quietGarden'] },
  { key: 'sportsCourt', name: 'Sports Court', primaryUsers: ['teenagers', 'young adults'], personaIds: ['teenagers', 'joggers'], healthScoreKeys: ['playQuality'], shadeRequirement: 0.3, noiseTolerance: 0.9, accessibilityRequirement: 0.6, visibilityRequirement: 0.7, targetAreaM2: 600, minAreaM2: 400, maxAreaM2: 900, minCount: 1, maxCount: 2, preferredAdjacencies: ['teenZone'], avoidAdjacencies: ['quietGarden', 'seniorActivityArea'] },
  { key: 'outdoorFitness', name: 'Outdoor Fitness', primaryUsers: ['young adults', 'working adults'], personaIds: ['joggers', 'cyclists'], healthScoreKeys: ['playQuality', 'walkability'], shadeRequirement: 0.6, noiseTolerance: 0.6, accessibilityRequirement: 0.7, visibilityRequirement: 0.7, targetAreaM2: 350, minAreaM2: 200, maxAreaM2: 600, minCount: 1, maxCount: 2, preferredAdjacencies: ['joggingLoop'], avoidAdjacencies: ['quietGarden'] },
  { key: 'joggingLoop', name: 'Jogging Loop', primaryUsers: ['joggers', 'residents'], personaIds: ['joggers'], healthScoreKeys: ['walkability'], shadeRequirement: 0.7, noiseTolerance: 0.5, accessibilityRequirement: 0.8, visibilityRequirement: 0.6, targetAreaM2: 0, minAreaM2: 0, maxAreaM2: 0, minCount: 1, maxCount: 1, preferredAdjacencies: ['outdoorFitness'], avoidAdjacencies: ['service_yard'] },
  { key: 'walkingCircuit', name: 'Walking Circuit', primaryUsers: ['seniors', 'families', 'residents'], personaIds: ['seniors', 'residents'], healthScoreKeys: ['walkability', 'accessibility'], shadeRequirement: 0.8, noiseTolerance: 0.4, accessibilityRequirement: 1.0, visibilityRequirement: 0.6, targetAreaM2: 0, minAreaM2: 0, maxAreaM2: 0, minCount: 1, maxCount: 1, preferredAdjacencies: ['seniorActivityArea', 'quietGarden'], avoidAdjacencies: ['major_road'] },
  { key: 'communityPlaza', name: 'Community Plaza', primaryUsers: ['weekend social groups', 'families'], personaIds: ['weekendSocial', 'residents'], healthScoreKeys: ['communityActivity'], shadeRequirement: 0.6, noiseTolerance: 0.9, accessibilityRequirement: 0.9, visibilityRequirement: 0.9, targetAreaM2: 1000, minAreaM2: 600, maxAreaM2: 1800, minCount: 1, maxCount: 1, preferredAdjacencies: ['cafe', 'eventLawn'], avoidAdjacencies: ['quietGarden'] },
  { key: 'eventLawn', name: 'Event Lawn', primaryUsers: ['families', 'weekend social groups'], personaIds: ['weekendSocial', 'parents'], healthScoreKeys: ['communityActivity', 'landscapeQuality'], shadeRequirement: 0.4, noiseTolerance: 0.9, accessibilityRequirement: 0.8, visibilityRequirement: 0.8, targetAreaM2: 2000, minAreaM2: 1200, maxAreaM2: 3500, minCount: 1, maxCount: 1, preferredAdjacencies: ['communityPlaza'], avoidAdjacencies: ['quietGarden'] },
  { key: 'picnicArea', name: 'Picnic Area', primaryUsers: ['families'], personaIds: ['parents', 'weekendSocial'], healthScoreKeys: ['familyFriendliness', 'landscapeQuality'], shadeRequirement: 0.9, noiseTolerance: 0.6, accessibilityRequirement: 0.8, visibilityRequirement: 0.6, targetAreaM2: 900, minAreaM2: 500, maxAreaM2: 1500, minCount: 1, maxCount: 2, preferredAdjacencies: ['toilets', 'drinking_water'], avoidAdjacencies: ['sportsCourt'] },
  { key: 'familySeating', name: 'Family Seating', primaryUsers: ['families', 'caregivers'], personaIds: ['parents', 'caregivers'], healthScoreKeys: ['familyFriendliness', 'thermalComfort'], shadeRequirement: 0.9, noiseTolerance: 0.6, accessibilityRequirement: 0.9, visibilityRequirement: 0.7, targetAreaM2: 150, minAreaM2: 80, maxAreaM2: 300, minCount: 2, maxCount: 5, preferredAdjacencies: ['inclusivePlayground'], avoidAdjacencies: ['sportsCourt'] },
  { key: 'quietGarden', name: 'Quiet Garden', primaryUsers: ['older adults', 'working adults'], personaIds: ['seniors'], healthScoreKeys: ['landscapeQuality', 'thermalComfort'], shadeRequirement: 0.85, noiseTolerance: 0.2, accessibilityRequirement: 0.9, visibilityRequirement: 0.4, targetAreaM2: 500, minAreaM2: 250, maxAreaM2: 900, minCount: 1, maxCount: 1, preferredAdjacencies: ['seniorActivityArea'], avoidAdjacencies: ['sportsCourt', 'teenZone', 'eventLawn'] },
  { key: 'sensoryGarden', name: 'Sensory Garden', primaryUsers: ['People of Determination', 'children'], personaIds: ['peopleOfDetermination', 'children'], healthScoreKeys: ['landscapeQuality', 'accessibility'], shadeRequirement: 0.8, noiseTolerance: 0.3, accessibilityRequirement: 1.0, visibilityRequirement: 0.5, targetAreaM2: 400, minAreaM2: 200, maxAreaM2: 700, minCount: 0, maxCount: 1, preferredAdjacencies: ['inclusivePlayground', 'quietGarden'], avoidAdjacencies: ['sportsCourt'] },
  { key: 'therapeuticGarden', name: 'Therapeutic Garden', primaryUsers: ['older adults', 'caregivers'], personaIds: ['seniors', 'caregivers'], healthScoreKeys: ['landscapeQuality', 'safety'], shadeRequirement: 0.85, noiseTolerance: 0.2, accessibilityRequirement: 1.0, visibilityRequirement: 0.4, targetAreaM2: 400, minAreaM2: 200, maxAreaM2: 700, minCount: 0, maxCount: 1, preferredAdjacencies: ['quietGarden'], avoidAdjacencies: ['sportsCourt', 'teenZone'] },
  { key: 'seniorActivityArea', name: 'Senior Activity Area', primaryUsers: ['older adults'], personaIds: ['seniors'], healthScoreKeys: ['safety', 'accessibility'], shadeRequirement: 0.85, noiseTolerance: 0.4, accessibilityRequirement: 1.0, visibilityRequirement: 0.6, targetAreaM2: 350, minAreaM2: 200, maxAreaM2: 600, minCount: 1, maxCount: 1, preferredAdjacencies: ['quietGarden', 'walkingCircuit'], avoidAdjacencies: ['sportsCourt', 'teenZone'] },
  { key: 'cafe', name: 'Café', primaryUsers: ['families', 'working adults', 'weekend social groups'], personaIds: ['weekendSocial', 'residents'], healthScoreKeys: ['amenities', 'communityActivity'], shadeRequirement: 0.7, noiseTolerance: 0.7, accessibilityRequirement: 0.9, visibilityRequirement: 0.9, targetAreaM2: 200, minAreaM2: 100, maxAreaM2: 350, minCount: 0, maxCount: 1, preferredAdjacencies: ['communityPlaza'], avoidAdjacencies: ['quietGarden'] },
  { key: 'retailKiosk', name: 'Retail Kiosk', primaryUsers: ['families', 'residents'], personaIds: ['residents'], healthScoreKeys: ['amenities'], shadeRequirement: 0.5, noiseTolerance: 0.7, accessibilityRequirement: 0.9, visibilityRequirement: 0.9, targetAreaM2: 40, minAreaM2: 15, maxAreaM2: 80, minCount: 0, maxCount: 2, preferredAdjacencies: ['communityPlaza'], avoidAdjacencies: ['quietGarden'] },
  { key: 'prayerSupport', name: 'Prayer-Support Facilities', primaryUsers: ['residents', 'families'], personaIds: ['residents'], healthScoreKeys: ['amenities'], shadeRequirement: 0.9, noiseTolerance: 0.1, accessibilityRequirement: 1.0, visibilityRequirement: 0.4, targetAreaM2: 60, minAreaM2: 30, maxAreaM2: 120, minCount: 0, maxCount: 1, preferredAdjacencies: ['toilets'], avoidAdjacencies: ['sportsCourt', 'eventLawn'] },
  { key: 'toilets', name: 'Toilets', primaryUsers: ['all visitors'], personaIds: [], healthScoreKeys: ['amenities'], shadeRequirement: 0.3, noiseTolerance: 0.5, accessibilityRequirement: 1.0, visibilityRequirement: 0.7, targetAreaM2: 40, minAreaM2: 20, maxAreaM2: 80, minCount: 1, maxCount: 3, preferredAdjacencies: ['inclusivePlayground', 'picnicArea'], avoidAdjacencies: [] },
  { key: 'drinkingFountains', name: 'Drinking Fountains', primaryUsers: ['all visitors'], personaIds: [], healthScoreKeys: ['amenities'], shadeRequirement: 0.5, noiseTolerance: 0.5, accessibilityRequirement: 1.0, visibilityRequirement: 0.6, targetAreaM2: 5, minAreaM2: 2, maxAreaM2: 10, minCount: 2, maxCount: 5, preferredAdjacencies: ['inclusivePlayground', 'joggingLoop'], avoidAdjacencies: [] },
  { key: 'dogArea', name: 'Dog Area', primaryUsers: ['pet owners'], personaIds: ['petOwners'], healthScoreKeys: [], shadeRequirement: 0.6, noiseTolerance: 0.8, accessibilityRequirement: 0.7, visibilityRequirement: 0.6, targetAreaM2: 600, minAreaM2: 300, maxAreaM2: 1000, minCount: 0, maxCount: 1, preferredAdjacencies: [], avoidAdjacencies: ['inclusivePlayground', 'picnicArea'] }
];

export interface ProgramDemand {
  key: string;
  name: string;
  demandScore: number;
  priority: 'Low' | 'Medium' | 'High' | 'Very High';
  primaryUsers: string[];
  populationServed: number;
  evidence: string[];
  confidence: number;
}

export function computeProgramDemand(
  reviews: NLPAnalyzedReview[],
  personas: PersonaStat[],
  healthScore: SubscoreResult[],
  totalPopulation: number
): ProgramDemand[] {
  const totalReviews = reviews.length || 1;

  return PROGRAM_DEFS.map(def => {
    const personaReviewCount = def.personaIds.reduce((s, id) => s + (personas.find(p => p.id === id)?.reviewCount || 0), 0);
    const personaShareScore = normalize((personaReviewCount / totalReviews) * 100, 30);

    const relevantHealthScores = def.healthScoreKeys.map(k => healthScore.find(h => h.key === k)?.score).filter((v): v is number => v !== undefined);
    const healthScoreAvg = relevantHealthScores.length > 0 ? relevantHealthScores.reduce((s, v) => s + v, 0) / relevantHealthScores.length : 50;
    // Demand is HIGH where sentiment on the relevant category is LOW (a gap the program would address).
    const gapScore = 100 - healthScoreAvg;

    const demandScore = Math.round(personaShareScore * 0.55 + gapScore * 0.45);
    const priority: ProgramDemand['priority'] = demandScore >= 75 ? 'Very High' : demandScore >= 50 ? 'High' : demandScore >= 25 ? 'Medium' : 'Low';

    const evidence: string[] = [];
    if (personaReviewCount > 0) evidence.push(`${personaReviewCount} review mention(s) from relevant user personas`);
    if (relevantHealthScores.length > 0) evidence.push(`Relevant sentiment score: ${Math.round(healthScoreAvg)}/100`);
    if (evidence.length === 0) evidence.push('Limited direct evidence -- based on standard program-to-user-group mapping only.');

    return {
      key: def.key,
      name: def.name,
      demandScore,
      priority,
      primaryUsers: def.primaryUsers,
      populationServed: totalPopulation,
      evidence,
      confidence: Math.min(90, 40 + personaReviewCount * 3 + relevantHealthScores.length * 10)
    };
  }).sort((a, b) => b.demandScore - a.demandScore);
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export type CommunityStatusBadge = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH' | 'CRITICAL';

function communityStatusBadge(score: number, invert = false): CommunityStatusBadge {
  const s = invert ? 100 - score : score;
  if (s >= 80) return 'VERY HIGH';
  if (s >= 60) return 'HIGH';
  if (s >= 35) return 'MODERATE';
  if (s >= 15) return 'LOW';
  return 'CRITICAL';
}

export interface CommunityExecutiveSummary {
  studyArea: string;
  populationServed: number;
  dominantCommunityType: string;
  primaryUserGroups: string[];
  schoolsCount: number | null;
  mosquesCount: number | null;
  healthcareFacilitiesCount: number | null;
  communityFacilityAccessStatus: CommunityStatusBadge;
  familyRecreationDemandStatus: CommunityStatusBadge;
  overallCommunityScore: number;
  overallStatusBadge: CommunityStatusBadge;
}

const PERSONA_COMMUNITY_LABELS: Record<string, string> = {
  parents: 'Residential Family Neighborhood',
  children: 'Family & Children-Oriented Community',
  joggers: 'Active / Fitness-Oriented Community',
  cyclists: 'Active / Cycling Community',
  seniors: 'Senior & Long-Term Resident Community',
  petOwners: 'Pet-Owning Residential Community',
  tourists: 'Visitor & Tourist Community',
  residents: 'Local Residential Community',
  teenagers: 'Youth-Oriented Community',
  caregivers: 'Caregiver & Family-Support Community',
  peopleOfDetermination: 'Inclusive-Access Community',
  weekendSocial: 'Social / Gathering-Oriented Community'
};

export function computeCommunityExecutiveSummary(
  kpis: CommunityKPIs,
  facilityStats: FacilityTypeStats[],
  personas: PersonaStat[]
): CommunityExecutiveSummary {
  const dominantPersona = personas[0];
  const dominantCommunityType = dominantPersona ? (PERSONA_COMMUNITY_LABELS[dominantPersona.id] || 'Mixed Community') : 'Insufficient review data';
  const primaryUserGroups = personas.slice(0, 4).map(p => p.label);

  const findCount = (key: string) => facilityStats.find(f => f.key === key)?.count ?? null;
  const clinicsCount = findCount('clinics');
  const hospitalsCount = findCount('hospitals');
  const healthcareFacilitiesCount = clinicsCount !== null && hospitalsCount !== null ? clinicsCount + hospitalsCount : null;

  return {
    studyArea: '5 km Context',
    populationServed: kpis.totalPopulation,
    dominantCommunityType,
    primaryUserGroups: primaryUserGroups.length > 0 ? primaryUserGroups : ['Insufficient review data'],
    schoolsCount: findCount('schools'),
    mosquesCount: findCount('mosques'),
    healthcareFacilitiesCount,
    communityFacilityAccessStatus: communityStatusBadge(kpis.facilityAccessScore),
    familyRecreationDemandStatus: communityStatusBadge(kpis.familyDemandScore),
    overallCommunityScore: kpis.overallCommunityScore,
    overallStatusBadge: communityStatusBadge(kpis.overallCommunityScore)
  };
}

// ---------------------------------------------------------------------------
// Equity / underserved areas
// ---------------------------------------------------------------------------

export interface UnderservedZone {
  compassZone: string;
  population: number;
  avgVulnerabilityScore: number;
  facilitiesMissing: string[];
  avgWalkingTimeMinutes: number | null;
}

export function computeUnderservedZones(hexes: H3Feature[], parkCenter: { lat: number; lng: number }, n = 1): UnderservedZone[] {
  const ranked = [...hexes].sort((a, b) => (hexCommunityVulnerabilityScore(b) * (b.properties.population || 0)) - (hexCommunityVulnerabilityScore(a) * (a.properties.population || 0)));
  const top = ranked.slice(0, Math.max(1, Math.round(hexes.length * 0.05)));
  if (top.length === 0) return [];

  const centroids = top.map(hexCentroid);
  const avgLng = centroids.reduce((s, c) => s + c[0], 0) / centroids.length;
  const avgLat = centroids.reduce((s, c) => s + c[1], 0) / centroids.length;
  const brg = turfBearing([parkCenter.lng, parkCenter.lat], [avgLng, avgLat]);

  const facilitiesMissing: string[] = [];
  if (top.every(h => (h.properties.playground_count || 0) === 0)) facilitiesMissing.push('Playgrounds');
  if (top.every(h => (h.properties.sports_count || 0) === 0)) facilitiesMissing.push('Sports Facilities');
  if (top.every(h => (h.properties.clinic_count || 0) === 0)) facilitiesMissing.push('Clinics');
  if (top.every(h => (h.properties.green_coverage_pct || 0) < 5)) facilitiesMissing.push('Green Space');

  const walkTimes = top.map(h => h.properties.walking_time_to_park_minutes).filter((v): v is number => v !== null && v !== undefined);

  return [{
    compassZone: `${bearingToCompass(brg)} Residential Edge`,
    population: Math.round(top.reduce((s, h) => s + (h.properties.population || 0), 0)),
    avgVulnerabilityScore: Math.round(top.reduce((s, h) => s + hexCommunityVulnerabilityScore(h), 0) / top.length),
    facilitiesMissing,
    avgWalkingTimeMinutes: walkTimes.length > 0 ? Math.round((walkTimes.reduce((s, v) => s + v, 0) / walkTimes.length) * 10) / 10 : null
  }].slice(0, n);
}

// ---------------------------------------------------------------------------
// Top-level report bundle
// ---------------------------------------------------------------------------

export interface CommunityAnalysisReportData {
  executiveSummary: CommunityExecutiveSummary;
  kpis: CommunityKPIs;
  facilityStats: FacilityTypeStats[];
  supermarketCount: number | null;
  catchments: CommunityCatchmentRing[];
  walkingCatchments: WalkingCatchmentBand[];
  ageGroups: AgeGroupDemand[];
  activityPatterns: ActivityPatternBucket[];
  underservedZones: UnderservedZone[];
  personas: PersonaStat[];
  programDemand: ProgramDemand[];
  topOpportunityCells: { h3Id: string; score: number; population: number }[];
}

export function computeCommunityAnalysisReport(
  hexes: H3Feature[],
  reviews: NLPAnalyzedReview[],
  facilities: CommunityFacilityLayers,
  busStops: GeoJsonFeature[],
  parkCenter: { lat: number; lng: number },
  _roadStats: RoadStats | null
): CommunityAnalysisReportData {
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0);

  const facilityStats = computeFacilityTypeStats(facilities, totalAreaKm2, totalPopulation, parkCenter);
  const supermarketCount = computeSupermarketCount(facilities.shops);
  const kpis = computeCommunityKPIs(hexes, facilityStats, reviews);
  const personas = computePersonaAnalytics(reviews);
  const health = computeHealthScore(reviews);
  const executiveSummary = computeCommunityExecutiveSummary(kpis, facilityStats, personas);

  const catchments = computeCommunityCatchments(hexes, parkCenter, facilities, busStops);
  const walkingCatchments = computeWalkingCatchments(hexes);
  const ageGroups = computeAgeGroupDemand(reviews, personas, health.subscores, facilityStats);
  const activityPatterns = computeActivityPatterns(reviews);
  const underservedZones = computeUnderservedZones(hexes, parkCenter, 1);
  const programDemand = computeProgramDemand(reviews, personas, health.subscores, totalPopulation);

  const topOpportunityCells = [...hexes]
    .map(h => ({ h3Id: h.properties.h3_id, score: hexCommunityOpportunityScore(h), population: Math.round(h.properties.population || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return {
    executiveSummary,
    kpis,
    facilityStats,
    supermarketCount,
    catchments,
    walkingCatchments,
    ageGroups,
    activityPatterns,
    underservedZones,
    personas,
    programDemand,
    topOpportunityCells
  };
}
