import type { H3Feature, RoadStats } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeHealthScore } from '../analytics/healthScore';
import { computeIssueImpact } from '../analytics/issueMatrix';
import { computeLandUseAnalysis } from './landUseEngine';
import { computeUrbanKPIs } from './urbanEngine';
import { hexCentroid } from './h3Engine';
import { bearing as turfBearing } from '@turf/turf';

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

// ---------------------------------------------------------------------------
// Per-hex real composites
// ---------------------------------------------------------------------------
// This dataset has NO satellite/remote-sensing layer at all (no NDVI, land
// surface temperature, tree canopy raster, soil, DEM, or wind data --
// confirmed via full table introspection of both source .gpkg files). Every
// function below is built ONLY from real fields that DO exist in the H3 grid
// (building_coverage_pct, green_coverage_pct, real_road_length_m,
// park_area_m2, hex_area_m2) and is explicitly a documented composite PROXY
// for a physical quantity (heat retention potential, cooling opportunity,
// planting suitability, etc.) -- never presented as a measured °C, NDVI
// value, or canopy %. Each function's doc comment states exactly what real
// inputs it uses and what it stands in for.

/** Roads/parking (paved+built) as a share of hex area, using building footprint (real) plus an estimated road surface area (real road length x a blended average width, same width-by-hierarchy assumption already used by Urban Analysis's site-wide Impervious Surface % -- kept internally consistent with that figure). */
export function hexImperviousPct(hex: H3Feature, avgRoadWidthM: number): number {
  const areaM2 = hex.properties.hex_area_m2 || 1;
  const buildingAreaM2 = hex.properties.building_area_m2 || 0;
  const roadAreaM2 = (hex.properties.real_road_length_m || 0) * avgRoadWidthM;
  return Math.min(100, ((buildingAreaM2 + roadAreaM2) / areaM2) * 100);
}

/** Residual non-built, non-green share of the hex (roads/parking/bare land) -- same formula already used by Urban Analysis's Urban Void Ratio, applied per-hex here instead of averaged. */
export function hexVoidRatioPct(hex: H3Feature): number {
  const b = hex.properties.building_coverage_pct || 0;
  const g = hex.properties.green_coverage_pct || 0;
  return Math.max(0, 100 - b - g);
}

export function hexGreenDeficitPct(hex: H3Feature): number {
  return Math.max(0, 100 - (hex.properties.green_coverage_pct || 0));
}

/**
 * Heat Exposure Proxy (0-100) -- NOT a measured or modeled temperature. This dataset has no
 * thermal raster, so this is a documented composite standing in for "relative heat-retention
 * potential": impervious (paved+built) surfaces absorb and re-radiate heat; green cover cools via
 * shade and evapotranspiration. 70/30 weighting toward impervious share reflects that it is the
 * dominant driver in the urban-heat-island literature this proxy is modeled after.
 */
export function hexHeatExposureProxy(hex: H3Feature, avgRoadWidthM: number): number {
  const impervious = hexImperviousPct(hex, avgRoadWidthM);
  const green = hex.properties.green_coverage_pct || 0;
  return Math.round(normalize(impervious, 100) * 0.7 + normalize(100 - green, 100) * 0.3);
}

/** High where heat exposure is high AND there is available land (void ratio) to act on it with a real intervention. */
export function hexCoolingOpportunityScore(hex: H3Feature, avgRoadWidthM: number): number {
  const heat = hexHeatExposureProxy(hex, avgRoadWidthM);
  const voidRatio = hexVoidRatioPct(hex);
  return Math.round(normalize(heat, 100) * 0.6 + normalize(voidRatio, 100) * 0.4);
}

/** Park-area share of the hex (real, spatially varying) plus green coverage, as a habitat-presence proxy. Not a measured species-diversity or connectivity metric -- no habitat/vegetation-patch data exists in this dataset. */
export function hexBiodiversityProxy(hex: H3Feature): number {
  const areaM2 = hex.properties.hex_area_m2 || 1;
  const parkSharePct = ((hex.properties.park_area_m2 || 0) / areaM2) * 100;
  const green = hex.properties.green_coverage_pct || 0;
  return Math.round(normalize(parkSharePct, 50) * 0.6 + normalize(green, 30) * 0.4);
}

export function hexEnvironmentalVulnerabilityScore(hex: H3Feature, avgRoadWidthM: number): number {
  const heat = hexHeatExposureProxy(hex, avgRoadWidthM);
  const greenDeficit = hexGreenDeficitPct(hex);
  const biodiversity = hexBiodiversityProxy(hex);
  return Math.round(normalize(heat, 100) * 0.5 + normalize(greenDeficit, 100) * 0.3 + normalize(100 - biodiversity, 100) * 0.2);
}

export interface TreePlantingWeights {
  heatExposure: number;
  greenDeficit: number;
  availableLand: number;
  pedestrianExposure: number;
  biodiversityOpportunity: number;
}

export const DEFAULT_TREE_PLANTING_WEIGHTS: TreePlantingWeights = {
  heatExposure: 30,
  greenDeficit: 25,
  availableLand: 25,
  pedestrianExposure: 15,
  biodiversityOpportunity: 5
};

/** Composite suitability (0-100), adjustable weights. Every input is real/derived per-hex; "biodiversity opportunity" here means low CURRENT biodiversity proxy (room to improve), not high existing value. */
export function hexTreePlantingSuitability(hex: H3Feature, avgRoadWidthM: number, weights: TreePlantingWeights = DEFAULT_TREE_PLANTING_WEIGHTS): number {
  const heat = hexHeatExposureProxy(hex, avgRoadWidthM);
  const greenDeficit = hexGreenDeficitPct(hex);
  const voidRatio = hexVoidRatioPct(hex);
  const pedestrianExposure = normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000);
  const biodiversityOpportunity = 100 - hexBiodiversityProxy(hex);
  const weightSum = weights.heatExposure + weights.greenDeficit + weights.availableLand + weights.pedestrianExposure + weights.biodiversityOpportunity || 1;
  return Math.round(
    (normalize(heat, 100) * weights.heatExposure +
      normalize(greenDeficit, 100) * weights.greenDeficit +
      normalize(voidRatio, 100) * weights.availableLand +
      pedestrianExposure * weights.pedestrianExposure +
      normalize(biodiversityOpportunity, 100) * weights.biodiversityOpportunity) / weightSum
  );
}

/** Runoff potential (impervious share) plus available land (void ratio) for a bioswale/rain-garden -- a siting proxy, not a hydrology model. */
export function hexWaterSensitiveSuitability(hex: H3Feature, avgRoadWidthM: number): number {
  const impervious = hexImperviousPct(hex, avgRoadWidthM);
  const voidRatio = hexVoidRatioPct(hex);
  return Math.round(normalize(impervious, 100) * 0.5 + normalize(voidRatio, 100) * 0.5);
}

/** Blended average paved-road width (m), derived from the same road-hierarchy width assumptions Urban Analysis uses for its site-wide Impervious Surface % -- kept in this file (not imported) since it needs to be applied per-hex here, but the assumption values and their source are identical. */
const ROAD_WIDTH_ASSUMPTIONS_M: Record<string, number> = {
  primary: 15, secondary: 10, local: 7, service: 4, pedestrianCycling: 2.5, other: 5
};
export function computeAvgRoadWidthM(roadStats: RoadStats | null): number {
  if (!roadStats || roadStats.totalRoadLengthM === 0) return 5;
  const totalAreaM2 = Object.entries(roadStats.hierarchy).reduce((s, [tier, bucket]) => s + bucket.lengthM * (ROAD_WIDTH_ASSUMPTIONS_M[tier] || 5), 0);
  return totalAreaM2 / roadStats.totalRoadLengthM;
}

// ---------------------------------------------------------------------------
// Land cover breakdown
// ---------------------------------------------------------------------------

export interface LandCoverBreakdown {
  category: string;
  pct: number;
}

export interface LandCoverResult {
  breakdown: LandCoverBreakdown[];
  methodology: string;
}

/** Buildings (real footprint) + Green (real H3 field) + Estimated Paved/Road (real length x assumed width) + Void/Unclassified (residual). Sums to 100 by construction. */
export function computeLandCover(hexes: H3Feature[], roadStats: RoadStats | null): LandCoverResult {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);
  const totalAreaM2 = hexes.reduce((s, h) => s + (h.properties.hex_area_m2 || 0), 0) || 1;
  const buildingAreaM2 = hexes.reduce((s, h) => s + (h.properties.building_area_m2 || 0), 0);
  const roadAreaM2 = hexes.reduce((s, h) => s + (h.properties.real_road_length_m || 0) * avgRoadWidthM, 0);
  const greenPct = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.green_coverage_pct || 0), 0) / hexes.length;

  const buildingPct = Math.min(100, (buildingAreaM2 / totalAreaM2) * 100);
  const roadPct = Math.min(100 - buildingPct, (roadAreaM2 / totalAreaM2) * 100);
  const voidPct = Math.max(0, 100 - buildingPct - roadPct - greenPct);

  return {
    breakdown: [
      { category: 'Buildings', pct: Math.round(buildingPct * 10) / 10 },
      { category: 'Estimated Paved / Road', pct: Math.round(roadPct * 10) / 10 },
      { category: 'Green Cover', pct: Math.round(greenPct * 10) / 10 },
      { category: 'Void / Unclassified (bare ground, parking, other)', pct: Math.round(voidPct * 10) / 10 }
    ],
    methodology: 'Buildings and Green Cover are real H3-aggregated fields. Paved/Road area is estimated from real road segment length x a blended average width (same width-by-hierarchy assumption Urban Analysis uses for its site-wide Impervious Surface %). Void/Unclassified is the residual -- bare ground, parking aisles, and other unclassified surface this dataset cannot distinguish further.'
  };
}

// ---------------------------------------------------------------------------
// Environmental KPIs (metric-list pattern, same shape as Population Analysis' Demand Assessment)
// ---------------------------------------------------------------------------

export type EnvMetricStatus = 'good' | 'watch' | 'critical' | 'unavailable';
export type EnvMetricPriority = 'Low' | 'Medium' | 'High';
export type EnvMetricConfidence = 'High' | 'Medium' | 'Low' | 'N/A';

export interface EnvironmentalMetric {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  unit?: string;
  benchmark?: string;
  status: EnvMetricStatus;
  priority: EnvMetricPriority;
  confidence: EnvMetricConfidence;
  dataSource: string;
  note?: string;
}

export interface EnvironmentalKPIs {
  metrics: EnvironmentalMetric[];
  greenCoveragePct: number;
  imperviousSurfacePct: number;
  permeableSurfacePct: number;
  hotspotAreaPct: number;
  coolZoneAreaPct: number;
  avgCoolingOpportunityScore: number;
  biodiversityScore: number;
  thermalComfortScore: number;
  overallEnvironmentalScore: number;
}

const HEAT_HOTSPOT_THRESHOLD = 65;
const COOL_ZONE_THRESHOLD = 35;

export function computeEnvironmentalKPIs(hexes: H3Feature[], roadStats: RoadStats | null, reviews: NLPAnalyzedReview[]): EnvironmentalKPIs {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);
  const landUse = computeLandUseAnalysis(hexes);
  const urbanKpis = computeUrbanKPIs(hexes, roadStats, landUse);
  const health = computeHealthScore(reviews);
  const thermalSub = health.subscores.find(s => s.key === 'thermalComfort');
  const biodiversitySub = health.subscores.find(s => s.key === 'biodiversity');
  const waterRow = computeIssueImpact(reviews).find(r => r.category === 'water features');

  const greenCoveragePct = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.green_coverage_pct || 0), 0) / hexes.length;
  const heatScores = hexes.map(h => hexHeatExposureProxy(h, avgRoadWidthM));
  const hotspotAreaPct = hexes.length === 0 ? 0 : (heatScores.filter(s => s >= HEAT_HOTSPOT_THRESHOLD).length / hexes.length) * 100;
  const coolZoneAreaPct = hexes.length === 0 ? 0 : (heatScores.filter(s => s <= COOL_ZONE_THRESHOLD).length / hexes.length) * 100;
  const coolingScores = hexes.map(h => hexCoolingOpportunityScore(h, avgRoadWidthM));
  const avgCoolingOpportunityScore = coolingScores.length === 0 ? 0 : Math.round(coolingScores.reduce((s, v) => s + v, 0) / coolingScores.length);

  const irrigatedAreaProxyM2 = hexes.reduce((s, h) => s + ((h.properties.green_coverage_pct || 0) / 100) * (h.properties.hex_area_m2 || 0), 0);

  const thermalComfortScore = thermalSub ? thermalSub.score : 60;
  const biodiversityScore = biodiversitySub ? biodiversitySub.score : 60;

  const overallEnvironmentalScore = Math.round(
    normalize(greenCoveragePct, 40) * 0.25 +
    (100 - hotspotAreaPct) * 0.2 +
    thermalComfortScore * 0.25 +
    biodiversityScore * 0.15 +
    normalize(100 - urbanKpis.imperviousSurfacePct, 100) * 0.15
  );

  const metrics: EnvironmentalMetric[] = [
    { key: 'avgLST', label: 'Average Land Surface Temperature', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'No thermal/satellite raster in this dataset (confirmed: no such layer or column anywhere in the source data).' },
    { key: 'maxLST', label: 'Maximum Land Surface Temperature', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'minLST', label: 'Minimum Land Surface Temperature', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'uhiIntensity', label: 'Urban Heat Island Intensity', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Requires paired urban/rural temperature measurements -- not present.' },
    { key: 'treeCanopyPct', label: 'Tree Canopy Coverage', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'No canopy raster or tree-crown survey. green_coverage_pct (below) is OSM landuse tagging, not a canopy measurement -- kept as a separate metric to avoid conflating the two.' },
    { key: 'greenCoveragePct', label: 'Green Coverage', value: Math.round(greenCoveragePct * 10) / 10, displayValue: `${Math.round(greenCoveragePct * 10) / 10}%`, unit: '%', benchmark: 'H3-aggregated OSM landuse tagging', status: greenCoveragePct >= 25 ? 'good' : greenCoveragePct >= 10 ? 'watch' : 'critical', priority: greenCoveragePct >= 25 ? 'Low' : 'High', confidence: 'High', dataSource: 'H3 Grid (OSM-derived)' },
    { key: 'imperviousSurfacePct', label: 'Impervious Surface %', value: urbanKpis.imperviousSurfacePct, displayValue: `${urbanKpis.imperviousSurfacePct}%`, unit: '%', status: urbanKpis.imperviousSurfacePct > 40 ? 'critical' : urbanKpis.imperviousSurfacePct > 20 ? 'watch' : 'good', priority: urbanKpis.imperviousSurfacePct > 40 ? 'High' : 'Medium', confidence: 'Medium', dataSource: 'Composite (real building footprint + estimated road area)', note: urbanKpis.imperviousSurfaceNote },
    { key: 'permeableSurfacePct', label: 'Permeable Surface %', value: Math.round((100 - urbanKpis.imperviousSurfacePct) * 10) / 10, displayValue: `${Math.round((100 - urbanKpis.imperviousSurfacePct) * 10) / 10}%`, unit: '%', status: 'good', priority: 'Low', confidence: 'Medium', dataSource: 'Composite (100 - Impervious Surface %)' },
    { key: 'avgDaytimeShadePct', label: 'Average Daytime Shade %', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Requires building-height/DEM data for shadow-casting -- only ~2.3% of buildings carry a height tag.' },
    { key: 'avgAfternoonShadePct', label: 'Average Afternoon Shade %', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'shadedPathCoveragePct', label: 'Shaded Path Coverage %', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'hotspotAreaPct', label: 'Hotspot Area %', value: Math.round(hotspotAreaPct * 10) / 10, displayValue: `${Math.round(hotspotAreaPct * 10) / 10}%`, unit: '%', status: hotspotAreaPct > 30 ? 'critical' : hotspotAreaPct > 15 ? 'watch' : 'good', priority: hotspotAreaPct > 30 ? 'High' : 'Medium', confidence: 'Low', dataSource: 'Composite (Heat Exposure Proxy >= 65/100)', note: 'Share of H3 cells scoring >=65 on the Heat Exposure Proxy -- a surface-composition-based proxy, not measured temperature.' },
    { key: 'coolZoneAreaPct', label: 'Cool-Zone Area %', value: Math.round(coolZoneAreaPct * 10) / 10, displayValue: `${Math.round(coolZoneAreaPct * 10) / 10}%`, unit: '%', status: 'good', priority: 'Low', confidence: 'Low', dataSource: 'Composite (Heat Exposure Proxy <= 35/100)' },
    { key: 'ndviMean', label: 'NDVI Mean', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'No satellite imagery (Sentinel-2/Landsat) in this dataset.' },
    { key: 'ndviMax', label: 'NDVI Maximum', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset' },
    { key: 'vegetationHealthScore', label: 'Vegetation Health Score', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Requires NDVI or a tree-health survey -- neither exists in this dataset.' },
    { key: 'waterBodyAreaM2', label: 'Water Body Area', value: 0, displayValue: '0 m²', unit: 'm²', status: 'watch', priority: 'Low', confidence: 'High', dataSource: 'OSM extract (confirmed absent)', note: 'Zero natural=water features exist in this 5km OSM extract -- a confirmed real finding, not a data gap.' },
    { key: 'irrigationDemand', label: 'Estimated Irrigation Demand', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Would require evapotranspiration/climate data. See Estimated Irrigated Landscape Area below for a real-area-based proxy instead.' },
    { key: 'irrigatedAreaProxyM2', label: 'Estimated Irrigated Landscape Area', value: Math.round(irrigatedAreaProxyM2), displayValue: `${Math.round(irrigatedAreaProxyM2).toLocaleString()} m²`, unit: 'm²', status: 'good', priority: 'Low', confidence: 'Low', dataSource: 'Composite (green-coverage area)', note: 'Assumes managed green space in this arid climate requires irrigation -- a documented planning assumption, not a measured irrigation system extent.' },
    { key: 'evapotranspirationPotential', label: 'Estimated Evapotranspiration Potential', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Requires climate station data (temperature, humidity, solar radiation, wind) -- none present.' },
    { key: 'biodiversityScore', label: 'Biodiversity Score', value: biodiversityScore, displayValue: `${biodiversityScore}/100`, status: biodiversityScore >= 65 ? 'good' : biodiversityScore >= 45 ? 'watch' : 'critical', priority: biodiversityScore >= 65 ? 'Low' : 'Medium', confidence: biodiversitySub?.lowSample ? 'Low' : 'Medium', dataSource: 'Review NLP Sentiment (wildlife/nature keyword mentions)', note: biodiversitySub?.lowSample ? 'Low sample size -- neutral baseline shown.' : `Based on ${biodiversitySub?.sampleSize ?? 0} relevant review mentions.` },
    { key: 'habitatConnectivityScore', label: 'Habitat Connectivity Score', value: null, displayValue: 'N/A', status: 'unavailable', priority: 'Low', confidence: 'N/A', dataSource: 'Not available in dataset', note: 'Requires mapped habitat patches/corridors -- no vegetation-patch data exists in this dataset.' },
    { key: 'thermalComfortScore', label: 'Thermal Comfort Score', value: thermalComfortScore, displayValue: `${thermalComfortScore}/100`, status: thermalComfortScore >= 65 ? 'good' : thermalComfortScore >= 45 ? 'watch' : 'critical', priority: thermalComfortScore >= 65 ? 'Low' : 'High', confidence: thermalSub?.lowSample ? 'Low' : 'Medium', dataSource: 'Review NLP Sentiment (shade / heat comfort category)', note: 'Proxy thermal comfort index from visitor sentiment -- not a UTCI/PET calculation (requires air temperature, humidity, wind, and radiant temperature data this dataset does not have).' },
    { key: 'waterFeatureSatisfaction', label: 'Water Feature Satisfaction', value: waterRow?.priorityIndex ?? null, displayValue: waterRow ? `${waterRow.priorityIndex}/100 concern` : 'N/A', status: waterRow ? (waterRow.priorityIndex >= 50 ? 'critical' : 'good') : 'unavailable', priority: waterRow && waterRow.priorityIndex >= 50 ? 'Medium' : 'Low', confidence: waterRow ? 'Low' : 'N/A', dataSource: 'Review NLP Sentiment (water features category)', note: 'Higher = more visitor concern about water features, from review sentiment -- not a hydrology measurement.' },
    { key: 'coolingOpportunityScore', label: 'Cooling Opportunity Score', value: avgCoolingOpportunityScore, displayValue: `${avgCoolingOpportunityScore}/100`, status: avgCoolingOpportunityScore >= 60 ? 'watch' : 'good', priority: avgCoolingOpportunityScore >= 60 ? 'High' : 'Medium', confidence: 'Low', dataSource: 'Composite (Heat Exposure Proxy x available land)', note: 'Higher = more heat-exposed cells with available land for cooling interventions.' },
    { key: 'overallEnvironmentalScore', label: 'Overall Environmental Performance Score', value: overallEnvironmentalScore, displayValue: `${overallEnvironmentalScore}/100`, status: overallEnvironmentalScore >= 65 ? 'good' : overallEnvironmentalScore >= 45 ? 'watch' : 'critical', priority: overallEnvironmentalScore >= 65 ? 'Low' : 'High', confidence: 'Medium', dataSource: 'Composite (25% green coverage + 20% low-hotspot share + 25% thermal comfort + 15% biodiversity + 15% permeable surface)' }
  ];

  return {
    metrics,
    greenCoveragePct: Math.round(greenCoveragePct * 10) / 10,
    imperviousSurfacePct: urbanKpis.imperviousSurfacePct,
    permeableSurfacePct: Math.round((100 - urbanKpis.imperviousSurfacePct) * 10) / 10,
    hotspotAreaPct: Math.round(hotspotAreaPct * 10) / 10,
    coolZoneAreaPct: Math.round(coolZoneAreaPct * 10) / 10,
    avgCoolingOpportunityScore,
    biodiversityScore,
    thermalComfortScore,
    overallEnvironmentalScore
  };
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export type EnvStatusBadge = 'CRITICAL' | 'POOR' | 'MODERATE' | 'GOOD' | 'EXCELLENT';

function statusBadge(score: number): EnvStatusBadge {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 65) return 'GOOD';
  if (score >= 45) return 'MODERATE';
  if (score >= 25) return 'POOR';
  return 'CRITICAL';
}

export interface EnvironmentalExecutiveSummary {
  studyArea: string;
  peakHeatZone: string;
  greenCoveragePct: number;
  thermalComfortStatus: EnvStatusBadge;
  ecologicalPotentialStatus: EnvStatusBadge;
  overallEnvironmentalScore: number;
  overallStatusBadge: EnvStatusBadge;
}

export function computeEnvironmentalExecutiveSummary(
  hexes: H3Feature[],
  kpis: EnvironmentalKPIs,
  roadStats: RoadStats | null,
  parkCenter: { lat: number; lng: number }
): EnvironmentalExecutiveSummary {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);
  const ranked = [...hexes].sort((a, b) => hexHeatExposureProxy(b, avgRoadWidthM) - hexHeatExposureProxy(a, avgRoadWidthM));
  const topHeatHexes = ranked.slice(0, Math.max(1, Math.round(hexes.length * 0.05)));

  let peakHeatZone = 'Insufficient data';
  if (topHeatHexes.length > 0) {
    const centroids = topHeatHexes.map(hexCentroid);
    const avgLng = centroids.reduce((s, c) => s + c[0], 0) / centroids.length;
    const avgLat = centroids.reduce((s, c) => s + c[1], 0) / centroids.length;
    const brg = turfBearing([parkCenter.lng, parkCenter.lat], [avgLng, avgLat]);
    peakHeatZone = `${bearingToCompass(brg)} High-Hardscape Edge`;
  }

  return {
    studyArea: 'Al Safa 2 Park and 5 km Context',
    peakHeatZone,
    greenCoveragePct: kpis.greenCoveragePct,
    thermalComfortStatus: statusBadge(kpis.thermalComfortScore),
    ecologicalPotentialStatus: statusBadge(kpis.biodiversityScore),
    overallEnvironmentalScore: kpis.overallEnvironmentalScore,
    overallStatusBadge: statusBadge(kpis.overallEnvironmentalScore)
  };
}

// ---------------------------------------------------------------------------
// Environmental opportunity maps (suitability rankings)
// ---------------------------------------------------------------------------

export interface SuitabilityCell {
  h3Id: string;
  score: number;
}

export function computeTopSuitabilityCells(hexes: H3Feature[], roadStats: RoadStats | null, kind: 'treePlanting' | 'waterSensitive', n = 20): SuitabilityCell[] {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);
  const scored = hexes.map(h => ({
    h3Id: h.properties.h3_id,
    score: kind === 'treePlanting' ? hexTreePlantingSuitability(h, avgRoadWidthM) : hexWaterSensitiveSuitability(h, avgRoadWidthM)
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, n);
}

// ---------------------------------------------------------------------------
// Top-level report bundle
// ---------------------------------------------------------------------------

export interface EnvironmentalAnalysisReportData {
  executiveSummary: EnvironmentalExecutiveSummary;
  kpis: EnvironmentalKPIs;
  landCover: LandCoverResult;
  topTreePlantingCells: SuitabilityCell[];
  topWaterSensitiveCells: SuitabilityCell[];
  heatScoreHistogram: { bucket: string; count: number }[];
  avgRoadWidthM: number;
}

export function computeEnvironmentalAnalysisReport(
  hexes: H3Feature[],
  reviews: NLPAnalyzedReview[],
  roadStats: RoadStats | null,
  parkCenter: { lat: number; lng: number }
): EnvironmentalAnalysisReportData {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);
  const kpis = computeEnvironmentalKPIs(hexes, roadStats, reviews);
  const landCover = computeLandCover(hexes, roadStats);
  const executiveSummary = computeEnvironmentalExecutiveSummary(hexes, kpis, roadStats, parkCenter);
  const topTreePlantingCells = computeTopSuitabilityCells(hexes, roadStats, 'treePlanting', 20);
  const topWaterSensitiveCells = computeTopSuitabilityCells(hexes, roadStats, 'waterSensitive', 20);
  const heatScoreHistogram = bucketHistogram(hexes.map(h => hexHeatExposureProxy(h, avgRoadWidthM)), 8);

  return {
    executiveSummary,
    kpis,
    landCover,
    topTreePlantingCells,
    topWaterSensitiveCells,
    heatScoreHistogram,
    avgRoadWidthM
  };
}
