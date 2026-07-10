import type { H3Feature, RoadStats } from './types';
import { computeLandUseAnalysis, type LandUseAnalysisResult } from './landUseEngine';
import { computeUrbanMorphology, type UrbanMorphologyResult } from './urbanMorphologyEngine';

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

/** Per-cell compactness proxy, reused by the map choropleth and the H3 cell inspector. */
export function computeHexUrbanScore(hex: H3Feature): number {
  const buildingDensityPerKm2 = (hex.properties.hex_area_km2 || 0) === 0 ? 0 : (hex.properties.building_count || 0) / (hex.properties.hex_area_km2 || 1);
  return Math.round(normalize(buildingDensityPerKm2, 3000) * 0.5 + normalize(hex.properties.building_coverage_pct || 0, 80) * 0.5);
}

// ---------------------------------------------------------------------------
// Urban KPIs
// ---------------------------------------------------------------------------

export interface UrbanKPIs {
  buildingCount: number;
  totalBuildingFootprintM2: number;
  avgBuildingSizeM2: number;
  buildingCoveragePct: number;
  roadLengthKm: number;
  intersectionCount: number;
  intersectionDensityPerKm2: number;
  streetDensityMPerKm2: number;
  landUseDiversityIndex: number;
  residentialPct: number;
  commercialPct: number;
  institutionalPct: number;
  mixedUsePct: number;
  mixedUseNote: string;
  imperviousSurfacePct: number;
  imperviousSurfaceNote: string;
  openSpacePct: number;
  developmentIntensity: number;
  urbanCompactness: number;
  connectivityScore: number;
}

// Typical road-width-by-classification assumptions (meters), used only to
// estimate paved surface area for the impervious-surface KPI -- the road
// layer has segment length but not width, so this is a documented planning
// assumption, not measured pavement width.
const ROAD_WIDTH_ASSUMPTIONS_M: Record<string, number> = {
  primary: 15, secondary: 10, local: 7, service: 4, pedestrianCycling: 2.5, other: 5
};

export function computeUrbanKPIs(hexes: H3Feature[], roadStats: RoadStats | null, landUse: LandUseAnalysisResult): UrbanKPIs {
  const buildingCount = hexes.reduce((s, h) => s + (h.properties.building_count || 0), 0);
  const totalBuildingFootprintM2 = hexes.reduce((s, h) => s + (h.properties.building_area_m2 || 0), 0);
  const avgBuildingSizeM2 = buildingCount === 0 ? 0 : totalBuildingFootprintM2 / buildingCount;
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const buildingCoveragePct = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.building_coverage_pct || 0), 0) / hexes.length;

  const roadLengthKm = (roadStats?.totalRoadLengthM || 0) / 1000;
  const intersectionCount = roadStats?.intersectionCount || 0;
  const intersectionDensityPerKm2 = totalAreaKm2 === 0 ? 0 : intersectionCount / totalAreaKm2;
  const streetDensityMPerKm2 = roadStats?.roadDensityMPerKm2 || 0;

  const totalAreaM2 = totalAreaKm2 * 1_000_000;
  const roadSurfaceAreaM2 = roadStats
    ? Object.entries(roadStats.hierarchy).reduce((s, [tier, bucket]) => s + bucket.lengthM * (ROAD_WIDTH_ASSUMPTIONS_M[tier] || 5), 0)
    : 0;
  const imperviousSurfacePct = totalAreaM2 === 0 ? 0 : Math.min(100, ((totalBuildingFootprintM2 + roadSurfaceAreaM2) / totalAreaM2) * 100);

  const openSpacePct = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.green_coverage_pct || 0), 0) / hexes.length;

  const avgBuildingDensityPerKm2 = totalAreaKm2 === 0 ? 0 : buildingCount / totalAreaKm2;
  const developmentIntensity = Math.round(normalize(avgBuildingDensityPerKm2, 3000) * 0.5 + normalize(streetDensityMPerKm2, 40000) * 0.5);
  const urbanCompactness = Math.round(normalize(avgBuildingDensityPerKm2, 3000) * 0.6 + (100 - normalize(avgBuildingSizeM2, 500)) * 0.4);
  const connectivityScore = roadStats && roadStats.totalGraphNodes > 0 ? Math.round((intersectionCount / roadStats.totalGraphNodes) * 100) : 0;

  const findPct = (cat: string) => landUse.breakdown.find(b => b.category === cat)?.pct || 0;

  return {
    buildingCount,
    totalBuildingFootprintM2: Math.round(totalBuildingFootprintM2),
    avgBuildingSizeM2: Math.round(avgBuildingSizeM2),
    buildingCoveragePct: Math.round(buildingCoveragePct * 10) / 10,
    roadLengthKm: Math.round(roadLengthKm * 10) / 10,
    intersectionCount,
    intersectionDensityPerKm2: Math.round(intersectionDensityPerKm2 * 10) / 10,
    streetDensityMPerKm2: Math.round(streetDensityMPerKm2),
    landUseDiversityIndex: landUse.diversityIndex,
    residentialPct: findPct('Residential'),
    commercialPct: findPct('Commercial'),
    institutionalPct: findPct('Institutional'),
    mixedUsePct: 0,
    mixedUseNote: 'Not distinguishable from single-use POI-density classification -- would need parcel-level mixed-use tagging.',
    imperviousSurfacePct: Math.round(imperviousSurfacePct * 10) / 10,
    imperviousSurfaceNote: 'Building footprint area + estimated road surface area (using typical width-by-classification assumptions, since road width isn\'t in this dataset) as a share of study area.',
    openSpacePct: Math.round(openSpacePct * 10) / 10,
    developmentIntensity,
    urbanCompactness,
    connectivityScore
  };
}

// ---------------------------------------------------------------------------
// Road network analysis
// ---------------------------------------------------------------------------

export interface RoadHierarchyRow {
  tier: string;
  label: string;
  count: number;
  lengthKm: number;
  pctOfTotal: number;
}

export interface RoadNetworkAnalysisResult {
  hierarchy: RoadHierarchyRow[];
  intersectionCount: number;
  intersectionDensityPerKm2: number;
  deadEndCount: number;
  avgBlockSizeM2: number | null;
  blockCountEstimate: number | null;
  blockEstimateMethodology: string | null;
  streetConnectivityScore: number;
  roadDensityMPerKm2: number;
  methodology: string;
}

const HIERARCHY_LABELS: Record<string, string> = {
  primary: 'Primary Roads', secondary: 'Secondary Roads', local: 'Local Roads',
  service: 'Service / Parking Aisles', pedestrianCycling: 'Pedestrian & Cycling', other: 'Other'
};

export function computeRoadNetworkAnalysis(roadStats: RoadStats | null, totalAreaKm2: number): RoadNetworkAnalysisResult {
  if (!roadStats) {
    return {
      hierarchy: [], intersectionCount: 0, intersectionDensityPerKm2: 0, deadEndCount: 0,
      avgBlockSizeM2: null, blockCountEstimate: null, blockEstimateMethodology: null,
      streetConnectivityScore: 0, roadDensityMPerKm2: 0, methodology: 'No road data available.'
    };
  }

  const totalLengthM = roadStats.totalRoadLengthM || 1;
  const hierarchy: RoadHierarchyRow[] = Object.entries(roadStats.hierarchy)
    .map(([tier, bucket]) => ({
      tier,
      label: HIERARCHY_LABELS[tier] || tier,
      count: bucket.count,
      lengthKm: Math.round(bucket.lengthM / 100) / 10,
      pctOfTotal: Math.round((bucket.lengthM / totalLengthM) * 1000) / 10
    }))
    .filter(h => h.count > 0);

  const intersectionDensityPerKm2 = totalAreaKm2 === 0 ? 0 : roadStats.intersectionCount / totalAreaKm2;
  const streetConnectivityScore = roadStats.totalGraphNodes > 0 ? Math.round((roadStats.intersectionCount / roadStats.totalGraphNodes) * 100) : 0;

  return {
    hierarchy,
    intersectionCount: roadStats.intersectionCount,
    intersectionDensityPerKm2: Math.round(intersectionDensityPerKm2 * 10) / 10,
    deadEndCount: roadStats.deadEndCount,
    avgBlockSizeM2: roadStats.avgBlockSizeKm2 ? Math.round(roadStats.avgBlockSizeKm2 * 1_000_000) : null,
    blockCountEstimate: roadStats.blockCountEstimate ?? null,
    blockEstimateMethodology: roadStats.blockEstimateMethodology ?? null,
    streetConnectivityScore,
    roadDensityMPerKm2: Math.round(roadStats.roadDensityMPerKm2),
    methodology: roadStats.methodology
  };
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export interface UrbanExecutiveSummary {
  studyArea: string;
  urbanCharacter: string;
  buildingCoveragePct: number;
  roadConnectivity: 'Low' | 'Medium' | 'High';
  dominantLandUse: string;
  developmentPressure: 'Low' | 'Medium' | 'High';
  overallUrbanScore: number;
}

function connectivityLabel(score: number): 'Low' | 'Medium' | 'High' {
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}
function pressureLabel(intensity: number): 'Low' | 'Medium' | 'High' {
  if (intensity >= 65) return 'High';
  if (intensity >= 35) return 'Medium';
  return 'Low';
}
function urbanCharacterLabel(buildingCoverage: number, dominantLandUse: string): string {
  const densityWord = buildingCoverage > 35 ? 'High Density' : buildingCoverage > 18 ? 'Medium Density' : 'Low Density';
  return `${densityWord} ${dominantLandUse}`;
}

export function computeUrbanExecutiveSummary(kpis: UrbanKPIs, landUse: LandUseAnalysisResult): UrbanExecutiveSummary {
  const overallUrbanScore = Math.round(kpis.developmentIntensity * 0.35 + kpis.connectivityScore * 0.35 + normalize(kpis.landUseDiversityIndex, 100) * 0.3);
  return {
    studyArea: '5 km Catchment',
    urbanCharacter: urbanCharacterLabel(kpis.buildingCoveragePct, landUse.dominantLandUse),
    buildingCoveragePct: kpis.buildingCoveragePct,
    roadConnectivity: connectivityLabel(kpis.connectivityScore),
    dominantLandUse: landUse.dominantLandUse,
    developmentPressure: pressureLabel(kpis.developmentIntensity),
    overallUrbanScore
  };
}

// ---------------------------------------------------------------------------
// Top-level report bundle
// ---------------------------------------------------------------------------

export interface UrbanAnalysisReportData {
  executiveSummary: UrbanExecutiveSummary;
  kpis: UrbanKPIs;
  roadNetwork: RoadNetworkAnalysisResult;
  landUse: LandUseAnalysisResult;
  morphology: UrbanMorphologyResult;
  topCellsByBuildingDensity: { h3Id: string; buildingCount: number; coveragePct: number }[];
  topCellsByRoadDensity: { h3Id: string; roadLengthM: number; densityMPerKm2: number }[];
  buildingCoverageHistogram: { bucket: string; count: number }[];
  floorAreaRatioAvailable: false;
}

export function computeUrbanAnalysisReport(hexes: H3Feature[], roadStats: RoadStats | null): UrbanAnalysisReportData {
  const totalAreaKm2 = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0);
  const landUse = computeLandUseAnalysis(hexes);
  const kpis = computeUrbanKPIs(hexes, roadStats, landUse);
  const roadNetwork = computeRoadNetworkAnalysis(roadStats, totalAreaKm2);
  const morphology = computeUrbanMorphology(hexes, roadStats);
  const executiveSummary = computeUrbanExecutiveSummary(kpis, landUse);

  const topCellsByBuildingDensity = [...hexes]
    .sort((a, b) => (b.properties.building_count || 0) - (a.properties.building_count || 0))
    .slice(0, 20)
    .map(h => ({ h3Id: h.properties.h3_id, buildingCount: h.properties.building_count || 0, coveragePct: Math.round((h.properties.building_coverage_pct || 0) * 10) / 10 }));

  const topCellsByRoadDensity = [...hexes]
    .sort((a, b) => (b.properties.real_road_density_m_per_km2 || 0) - (a.properties.real_road_density_m_per_km2 || 0))
    .slice(0, 20)
    .map(h => ({ h3Id: h.properties.h3_id, roadLengthM: Math.round(h.properties.real_road_length_m || 0), densityMPerKm2: Math.round(h.properties.real_road_density_m_per_km2 || 0) }));

  const buildingCoverageHistogram = bucketHistogram(hexes.map(h => h.properties.building_coverage_pct || 0), 8);

  return {
    executiveSummary,
    kpis,
    roadNetwork,
    landUse,
    morphology,
    topCellsByBuildingDensity,
    topCellsByRoadDensity,
    buildingCoverageHistogram,
    floorAreaRatioAvailable: false
  };
}
