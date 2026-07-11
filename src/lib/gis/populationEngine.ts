import { distance as turfDistance, bearing as turfBearing } from '@turf/turf';
import type { H3Feature, GeoJsonFeature, RoadStats } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { hexCentroid } from './h3Engine';
import { computePedestrianNetworkQuality } from './accessibilityEngine';
import { computePersonaAnalytics } from '../analytics/personas';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function hexDistanceFromPark(hex: H3Feature, parkCenter: { lat: number; lng: number }): number {
  const [lng, lat] = hexCentroid(hex);
  return turfDistance([parkCenter.lng, parkCenter.lat], [lng, lat], { units: 'meters' });
}

// ---------------------------------------------------------------------------
// Catchment analysis
// ---------------------------------------------------------------------------

export interface CatchmentRing {
  radiusM: number;
  label: string;
  population: number;
  areaKm2: number;
  densityPerKm2: number;
  pctOfTotal: number;
  hexCount: number;
  visitationLabel: string;
  visitationValue: number;
  growthAvailable: false;
}

// Visitation likelihood decays with distance -- a standard urban-parks
// planning assumption (nearby residents visit far more often than distant
// ones), NOT measured visitor counts. Documented explicitly wherever shown.
const CATCHMENT_RING_DEFS: { radiusM: number; label: string; visitationLabel: string; weeklyVisitRate: number }[] = [
  { radiusM: 500, label: '500 m', visitationLabel: 'Expected Daily Visitors', weeklyVisitRate: 0.25 },
  { radiusM: 1000, label: '1 km', visitationLabel: 'Weekly Visitors', weeklyVisitRate: 0.12 },
  { radiusM: 2000, label: '2 km', visitationLabel: 'Primary Service Area', weeklyVisitRate: 0.05 },
  { radiusM: 5000, label: '5 km', visitationLabel: 'Regional Users', weeklyVisitRate: 0.02 }
];

export const VISITATION_METHODOLOGY = 'Visitor estimates use standard urban-park planning assumptions (visitation likelihood decays with distance from the site: ~25%/week within 500m, 12%/week within 1km, 5%/week within 2km, 2%/week within 5km) -- these are planning heuristics, not measured visitation counts.';

export function computeCatchmentAnalysis(hexes: H3Feature[], parkCenter: { lat: number; lng: number }): CatchmentRing[] {
  const distances = hexes.map(h => ({ hex: h, distM: hexDistanceFromPark(h, parkCenter) }));
  const maxRadiusPopulation = distances
    .filter(d => d.distM <= CATCHMENT_RING_DEFS[CATCHMENT_RING_DEFS.length - 1].radiusM)
    .reduce((s, d) => s + (d.hex.properties.population || 0), 0) || 1;

  return CATCHMENT_RING_DEFS.map(def => {
    const inRing = distances.filter(d => d.distM <= def.radiusM);
    const population = inRing.reduce((s, d) => s + (d.hex.properties.population || 0), 0);
    const areaKm2 = Math.PI * (def.radiusM / 1000) ** 2;
    const densityPerKm2 = areaKm2 === 0 ? 0 : population / areaKm2;
    const pctOfTotal = (population / maxRadiusPopulation) * 100;
    const isDaily = def.visitationLabel === 'Expected Daily Visitors';
    const visitationValue = isDaily ? (population * def.weeklyVisitRate) / 7 : population * def.weeklyVisitRate;

    return {
      radiusM: def.radiusM,
      label: def.label,
      population: Math.round(population),
      areaKm2: Math.round(areaKm2 * 100) / 100,
      densityPerKm2: Math.round(densityPerKm2),
      pctOfTotal: Math.round(pctOfTotal * 10) / 10,
      hexCount: inRing.length,
      visitationLabel: def.visitationLabel,
      visitationValue: Math.round(visitationValue),
      growthAvailable: false
    };
  });
}

// ---------------------------------------------------------------------------
// Population KPIs
// ---------------------------------------------------------------------------

export interface PopulationKPIs {
  totalPopulation: number;
  aggregateDensityKm2: number;
  avgDensityPerH3: number;
  maxDensityCell: { h3Id: string; density: number } | null;
  minDensityCell: { h3Id: string; density: number } | null;
  h3CellCount: number;
  residentialCoverageNote: string;
  estimatedDailyUsers: number;
  estimatedWeeklyUsers: number;
}

export function computePopulationKPIs(hexes: H3Feature[], catchments: CatchmentRing[]): PopulationKPIs {
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0);
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const aggregateDensityKm2 = totalAreaKm2 === 0 ? 0 : totalPopulation / totalAreaKm2;
  const avgDensityPerH3 = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.pop_density_km2 || 0), 0) / hexes.length;

  let maxDensityCell: { h3Id: string; density: number } | null = null;
  let minDensityCell: { h3Id: string; density: number } | null = null;
  hexes.forEach(h => {
    const d = h.properties.pop_density_km2 || 0;
    if (!maxDensityCell || d > maxDensityCell.density) maxDensityCell = { h3Id: h.properties.h3_id, density: Math.round(d) };
    if (!minDensityCell || d < minDensityCell.density) minDensityCell = { h3Id: h.properties.h3_id, density: Math.round(d) };
  });

  const dailyRing = catchments.find(c => c.visitationLabel === 'Expected Daily Visitors');
  const weeklyRing = catchments.find(c => c.visitationLabel === 'Weekly Visitors');

  return {
    totalPopulation: Math.round(totalPopulation),
    aggregateDensityKm2: Math.round(aggregateDensityKm2),
    avgDensityPerH3: Math.round(avgDensityPerH3),
    maxDensityCell,
    minDensityCell,
    h3CellCount: hexes.length,
    residentialCoverageNote: 'Not computable: 96% of buildings in this OSM extract carry only a generic building=yes tag with no residential/commercial breakdown.',
    estimatedDailyUsers: dailyRing?.visitationValue ?? 0,
    estimatedWeeklyUsers: weeklyRing?.visitationValue ?? 0
  };
}

// ---------------------------------------------------------------------------
// Demand assessment
// ---------------------------------------------------------------------------

export type DemandStatus = 'good' | 'watch' | 'critical' | 'unavailable';
export type DemandPriority = 'Low' | 'Medium' | 'High';

export interface DemandMetric {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  unit?: string;
  benchmark?: string;
  status: DemandStatus;
  priority: DemandPriority;
  note?: string;
}

const GREEN_SPACE_BENCHMARK_M2_PER_CAPITA = 9; // commonly cited WHO/UN-Habitat planning benchmark

/** A single per-hex demand score, reused both for the aggregate metric and for ranking hexes by demand (Executive Summary, map). */
export function computeHexDemandScore(hex: H3Feature): number {
  const densityScore = normalize(hex.properties.pop_density_km2 || 0, 20000);
  const greenDeficitScore = normalize(100 - (hex.properties.green_coverage_pct || 0), 100);
  const coverageScore = normalize(hex.properties.building_coverage_pct || 0, 80);
  return Math.round(densityScore * 0.45 + greenDeficitScore * 0.35 + coverageScore * 0.2);
}

export interface DemandAssessmentResult {
  metrics: DemandMetric[];
  parkDemandIndex: number;
}

export function computeDemandAssessment(
  hexes: H3Feature[],
  busStops: GeoJsonFeature[],
  parkCenter: { lat: number; lng: number },
  roadStats: RoadStats | null
): DemandAssessmentResult {
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0);
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const totalPlaygrounds = hexes.reduce((s, h) => s + (h.properties.playground_count || 0), 0);
  const totalGreenM2 = hexes.reduce((s, h) => s + ((h.properties.green_coverage_pct || 0) / 100) * (h.properties.hex_area_m2 || 0), 0);
  const avgDensityKm2 = totalAreaKm2 === 0 ? 0 : totalPopulation / totalAreaKm2;

  const parkDemandIndex = hexes.length === 0 ? 0 : Math.round(hexes.reduce((s, h) => s + computeHexDemandScore(h), 0) / hexes.length);

  const pedestrianQuality = computePedestrianNetworkQuality(hexes, roadStats);

  const greenM2PerCapita = totalPopulation === 0 ? 0 : totalGreenM2 / totalPopulation;
  const greenDeficitPct = Math.max(0, ((GREEN_SPACE_BENCHMARK_M2_PER_CAPITA - greenM2PerCapita) / GREEN_SPACE_BENCHMARK_M2_PER_CAPITA) * 100);

  const statusFor = (score: number, invert = false): DemandStatus => {
    const s = invert ? 100 - score : score;
    if (s >= 70) return 'critical';
    if (s >= 40) return 'watch';
    return 'good';
  };
  const priorityFor = (status: DemandStatus): DemandPriority => (status === 'critical' ? 'High' : status === 'watch' ? 'Medium' : 'Low');

  const metrics: DemandMetric[] = [];

  metrics.push({
    key: 'parkDemandIndex', label: 'Park Demand Index', value: parkDemandIndex, displayValue: `${parkDemandIndex}/100`,
    benchmark: '0-100 composite', status: statusFor(parkDemandIndex), priority: priorityFor(statusFor(parkDemandIndex)),
    note: 'Composite: 45% population density + 35% green-space deficit + 20% building coverage.'
  });

  const residentsPerHa = totalAreaKm2 === 0 ? 0 : totalPopulation / (totalAreaKm2 * 100);
  metrics.push({
    key: 'residentsPerHectare', label: 'Residents per Hectare', value: Math.round(residentsPerHa * 10) / 10, displayValue: `${(Math.round(residentsPerHa * 10) / 10).toLocaleString()}`,
    unit: 'residents/ha', status: statusFor(normalize(residentsPerHa, 300)), priority: priorityFor(statusFor(normalize(residentsPerHa, 300)))
  });

  const residentsPerH3 = hexes.length === 0 ? 0 : totalPopulation / hexes.length;
  metrics.push({
    key: 'residentsPerH3', label: 'Residents per H3 Cell', value: Math.round(residentsPerH3), displayValue: Math.round(residentsPerH3).toLocaleString(),
    unit: 'residents/cell', status: 'good', priority: 'Low'
  });

  metrics.push({
    key: 'popPerEntrance', label: 'Population per Entrance', value: null, displayValue: 'N/A',
    status: 'unavailable', priority: 'Low', note: 'No park entrance point data captured in this dataset.'
  });

  if (totalPlaygrounds > 0) {
    const popPerPlayground = totalPopulation / totalPlaygrounds;
    metrics.push({
      key: 'popPerPlayground', label: 'Population per Playground', value: Math.round(popPerPlayground), displayValue: Math.round(popPerPlayground).toLocaleString(),
      unit: 'residents/playground', status: statusFor(normalize(popPerPlayground, 20000)), priority: priorityFor(statusFor(normalize(popPerPlayground, 20000)))
    });
  } else {
    metrics.push({ key: 'popPerPlayground', label: 'Population per Playground', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', note: 'No playgrounds counted in this area.' });
  }

  metrics.push({
    key: 'popPerSeating', label: 'Population per Seating Area', value: null, displayValue: 'N/A',
    status: 'unavailable', priority: 'Low', note: 'No seating-area point data captured in this dataset.'
  });

  metrics.push({
    key: 'popPerTree', label: 'Population per Tree', value: null, displayValue: 'N/A',
    status: 'unavailable', priority: 'Low', note: 'No tree inventory in this dataset.'
  });

  metrics.push({
    key: 'popPerGreenM2', label: 'Population per m² Green Space', value: Math.round(1 / (greenM2PerCapita || 1) * 100) / 100, displayValue: greenM2PerCapita > 0 ? (1 / greenM2PerCapita).toFixed(2) : 'N/A',
    unit: 'residents/m²', status: statusFor(greenDeficitPct), priority: priorityFor(statusFor(greenDeficitPct)),
    note: `Actual: ${greenM2PerCapita.toFixed(1)} m² green space per capita.`
  });

  metrics.push({
    key: 'accessibilityScore', label: 'Population Accessibility Score', value: pedestrianQuality.walkabilityScore, displayValue: `${pedestrianQuality.walkabilityScore}/100`,
    status: statusFor(pedestrianQuality.walkabilityScore, true), priority: priorityFor(statusFor(pedestrianQuality.walkabilityScore, true)),
    note: 'Reuses the Accessibility Analysis walkability composite (connectivity + intersection density + route directness + transit access + amenity access + sidewalk coverage).'
  });

  const pressureScore = Math.round(normalize(avgDensityKm2, 20000));
  metrics.push({
    key: 'pressureScore', label: 'Population Pressure Score', value: pressureScore, displayValue: `${pressureScore}/100`,
    status: statusFor(pressureScore), priority: priorityFor(statusFor(pressureScore)),
    note: 'Normalized average population density relative to a dense-urban reference (20,000/km²).'
  });

  metrics.push({
    key: 'greenSpaceDeficit', label: 'Green Space Deficit', value: Math.round(greenDeficitPct), displayValue: `${Math.round(greenDeficitPct)}%`,
    benchmark: `${GREEN_SPACE_BENCHMARK_M2_PER_CAPITA} m²/person (WHO/UN-Habitat planning benchmark)`,
    status: statusFor(greenDeficitPct), priority: priorityFor(statusFor(greenDeficitPct))
  });

  metrics.push({
    key: 'vulnerabilityIndex', label: 'Population Vulnerability Index', value: null, displayValue: 'N/A',
    status: 'unavailable', priority: 'Low', note: 'No demographic (age/income) data available in this dataset.'
  });

  return { metrics, parkDemandIndex };
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export interface ExecutiveSummary {
  studyArea: string;
  populationServed: number;
  avgDensityKm2: number;
  primaryCommunity: string;
  highestDemandZone: string;
  overallDemandLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
  overallDemandScore: number;
}

const PERSONA_COMMUNITY_LABELS: Record<string, string> = {
  parents: 'Residential Families',
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

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function bearingToCompass(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  return COMPASS_LABELS[Math.round(normalized / 45) % 8];
}

function demandLevel(score: number): { level: ExecutiveSummary['overallDemandLevel'] } {
  if (score >= 75) return { level: 'VERY HIGH' };
  if (score >= 50) return { level: 'HIGH' };
  if (score >= 25) return { level: 'MEDIUM' };
  return { level: 'LOW' };
}

export function computeExecutiveSummary(
  hexes: H3Feature[],
  kpis: PopulationKPIs,
  parkDemandIndex: number,
  parkCenter: { lat: number; lng: number },
  reviews: NLPAnalyzedReview[]
): ExecutiveSummary {
  const personas = computePersonaAnalytics(reviews);
  const dominantPersona = personas[0];
  const primaryCommunity = dominantPersona ? (PERSONA_COMMUNITY_LABELS[dominantPersona.id] || 'Mixed Community') : 'Insufficient review data';

  const rankedByDemand = [...hexes].sort((a, b) => computeHexDemandScore(b) - computeHexDemandScore(a));
  const topDemandHexes = rankedByDemand.slice(0, Math.max(1, Math.round(hexes.length * 0.05)));

  let highestDemandZone = 'Insufficient data';
  if (topDemandHexes.length > 0) {
    const centroids = topDemandHexes.map(hexCentroid);
    const avgLng = centroids.reduce((s, c) => s + c[0], 0) / centroids.length;
    const avgLat = centroids.reduce((s, c) => s + c[1], 0) / centroids.length;
    const brg = turfBearing([parkCenter.lng, parkCenter.lat], [avgLng, avgLat]);
    const compass = bearingToCompass(brg);
    const avgBuildingCoverage = topDemandHexes.reduce((s, h) => s + (h.properties.building_coverage_pct || 0), 0) / topDemandHexes.length;
    const zoneType = avgBuildingCoverage > 30 ? 'Residential Corridor' : 'Mixed-Use Area';
    highestDemandZone = `${compass} ${zoneType}`;
  }

  const { level } = demandLevel(parkDemandIndex);

  return {
    studyArea: '5 km Catchment',
    populationServed: kpis.totalPopulation,
    avgDensityKm2: kpis.aggregateDensityKm2,
    primaryCommunity,
    highestDemandZone,
    overallDemandLevel: level,
    overallDemandScore: parkDemandIndex
  };
}

// ---------------------------------------------------------------------------
// Chart-ready data
// ---------------------------------------------------------------------------

export function computeTopH3CellsByPopulation(hexes: H3Feature[], n = 20): { h3Id: string; population: number; density: number }[] {
  return [...hexes]
    .sort((a, b) => (b.properties.population || 0) - (a.properties.population || 0))
    .slice(0, n)
    .map(h => ({ h3Id: h.properties.h3_id, population: Math.round(h.properties.population || 0), density: Math.round(h.properties.pop_density_km2 || 0) }));
}

export function computeDensityHistogram(hexes: H3Feature[], bucketCount = 10): { bucket: string; count: number }[] {
  const values = hexes.map(h => h.properties.pop_density_km2 || 0);
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const size = (max - min) / bucketCount || 1;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: `${Math.round(min + i * size)}`,
    count: 0
  }));
  values.forEach(v => {
    const idx = Math.min(bucketCount - 1, Math.floor((v - min) / size));
    buckets[idx].count++;
  });
  return buckets;
}

export function computePopulationPercentiles(hexes: H3Feature[]): { percentile: string; density: number }[] {
  const sorted = [...hexes].map(h => h.properties.pop_density_km2 || 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return [10, 25, 50, 75, 90, 95, 99].map(p => ({ percentile: `P${p}`, density: Math.round(at(p)) }));
}

// ---------------------------------------------------------------------------
// Top-level report bundle
// ---------------------------------------------------------------------------

export interface PopulationAnalysisReportData {
  executiveSummary: ExecutiveSummary;
  kpis: PopulationKPIs;
  catchments: CatchmentRing[];
  demand: DemandAssessmentResult;
  topCells: { h3Id: string; population: number; density: number }[];
  densityHistogram: { bucket: string; count: number }[];
  percentiles: { percentile: string; density: number }[];
}

export function computePopulationAnalysisReport(
  hexes: H3Feature[],
  busStops: GeoJsonFeature[],
  reviews: NLPAnalyzedReview[],
  parkCenter: { lat: number; lng: number },
  roadStats: RoadStats | null
): PopulationAnalysisReportData {
  const catchments = computeCatchmentAnalysis(hexes, parkCenter);
  const kpis = computePopulationKPIs(hexes, catchments);
  const demand = computeDemandAssessment(hexes, busStops, parkCenter, roadStats);
  const executiveSummary = computeExecutiveSummary(hexes, kpis, demand.parkDemandIndex, parkCenter, reviews);

  return {
    executiveSummary,
    kpis,
    catchments,
    demand,
    topCells: computeTopH3CellsByPopulation(hexes, 20),
    densityHistogram: computeDensityHistogram(hexes),
    percentiles: computePopulationPercentiles(hexes)
  };
}
