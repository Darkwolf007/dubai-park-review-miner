import type { H3Feature, RoadStats } from './types';
import { hexCentroid } from './h3Engine';
import {
  hexHeatExposureProxy, hexCoolingOpportunityScore, hexBiodiversityProxy, hexWaterSensitiveSuitability,
  hexTreePlantingSuitability, hexVoidRatioPct, computeAvgRoadWidthM
} from './environmentalEngine';
import { PROGRAM_DEFS } from './communityEngine';

// ---------------------------------------------------------------------------
// UTM Zone 40N (EPSG:32640) forward projection
// ---------------------------------------------------------------------------
// Dubai (~55.2 deg E) falls in UTM Zone 40N (54-60 deg E, central meridian 57 deg E) -- the CRS
// Grasshopper/Rhino workflows expect for metric X/Y, not raw lat/lng degrees (which would give
// wrong spacing between cells). Implemented directly with the standard WGS84 transverse Mercator
// series (the same formula every UTM library uses) rather than pulling in a projection dependency
// for one conversion -- deterministic, not an approximation of unknown accuracy.
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const UTM_ZONE_40N_CENTRAL_MERIDIAN_DEG = 57;
const UTM_K0 = 0.9996;
const UTM_FALSE_EASTING = 500000;

export function toUtm40N(lng: number, lat: number): { x: number; y: number } {
  const e2 = WGS84_F * (2 - WGS84_F);
  const ePrime2 = e2 / (1 - e2);
  const lon0 = (UTM_ZONE_40N_CENTRAL_MERIDIAN_DEG * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;

  const N = WGS84_A / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ePrime2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lambda - lon0);

  const M = WGS84_A * (
    (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
    ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
    ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
    ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi)
  );

  const x = UTM_K0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5) / 120) + UTM_FALSE_EASTING;
  const y = UTM_K0 * (M + N * Math.tan(phi) * ((A ** 2) / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6) / 720));

  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Grasshopper design-input schema
// ---------------------------------------------------------------------------

/** Threshold for the parks land-use classifier's "dominant park use" call -- reused here so the constraint flag agrees with Urban Analysis' Land Use classification instead of using an independently-chosen number. */
const PARK_AREA_SHARE_CONSTRAINT_THRESHOLD = 0.3;

export interface GrasshopperCell {
  h3_id: string;
  centroid_x: number;
  centroid_y: number;
  centroid_lng: number;
  centroid_lat: number;
  heat_score: number;
  shade_score: number;
  canopy_score: number;
  cooling_score: number;
  wind_score: null;
  biodiversity_score: number;
  water_score: number;
  environmental_constraint_score: number;
  playground_environmental_suitability: number;
  plaza_environmental_suitability: number;
  quiet_garden_suitability: number;
  fitness_environmental_suitability: number;
  jogging_route_suitability: number;
  tree_planting_suitability: number;
  constraint: boolean;
}

export interface GrasshopperExport {
  site: string;
  analysis_crs: string;
  h3_resolution: number;
  generated_at: string;
  cell_count: number;
  methodology: Record<string, string>;
  cells: GrasshopperCell[];
}

export function computeGrasshopperExport(hexes: H3Feature[], roadStats: RoadStats | null, siteName = 'Al Safa 2 Park'): GrasshopperExport {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);

  const cells: GrasshopperCell[] = hexes.map(h => {
    const [lng, lat] = hexCentroid(h);
    const { x, y } = toUtm40N(lng, lat);
    const areaM2 = h.properties.hex_area_m2 || 1;

    const heat100 = hexHeatExposureProxy(h, avgRoadWidthM);
    const cooling100 = hexCoolingOpportunityScore(h, avgRoadWidthM);
    const biodiversity100 = hexBiodiversityProxy(h);
    const water100 = hexWaterSensitiveSuitability(h, avgRoadWidthM);
    const treePlanting100 = hexTreePlantingSuitability(h, avgRoadWidthM);
    const voidRatio100 = hexVoidRatioPct(h);
    const green = h.properties.green_coverage_pct || 0;
    const roadDensityScore = Math.max(0, Math.min(100, ((h.properties.real_road_density_m_per_km2 || 0) / 40000) * 100));
    const parkSharePct = ((h.properties.park_area_m2 || 0) / areaM2) * 100;

    // Shade proxy: no real per-cell shade-hours data exists -- blends inverse heat exposure with
    // green coverage (existing vegetation is the only real proxy for existing shade in this dataset).
    const shade100 = Math.round((100 - heat100) * 0.6 + Math.min(100, (green / 30) * 100) * 0.4);
    const canopy100 = Math.min(100, (green / 30) * 100); // green_coverage_pct rarely exceeds ~30% in this dataset; scaled so the sparse real signal isn't compressed near 0

    const environmentalConstraint100 = Math.round(Math.min(100, (parkSharePct / 50) * 100));
    const constraint = (h.properties.park_area_m2 || 0) / areaM2 >= PARK_AREA_SHARE_CONSTRAINT_THRESHOLD;

    const playground100 = Math.round((100 - heat100) * 0.4 + Math.min(100, (green / 30) * 100) * 0.3 + (100 - Math.min(100, roadDensityScore)) * 0.3);
    const plaza100 = Math.round(roadDensityScore * 0.4 + (100 - heat100) * 0.3 + voidRatio100 * 0.3);
    const quietGarden100 = Math.round(Math.min(100, (green / 30) * 100) * 0.4 + (100 - roadDensityScore) * 0.35 + (100 - heat100) * 0.25);
    const fitness100 = Math.round(roadDensityScore * 0.4 + (100 - heat100) * 0.3 + voidRatio100 * 0.3);
    const jogging100 = Math.round(roadDensityScore * 0.5 + (100 - heat100) * 0.5);

    return {
      h3_id: h.properties.h3_id,
      centroid_x: x,
      centroid_y: y,
      centroid_lng: Math.round(lng * 1e6) / 1e6,
      centroid_lat: Math.round(lat * 1e6) / 1e6,
      heat_score: Math.round((heat100 / 100) * 1000) / 1000,
      shade_score: Math.round((shade100 / 100) * 1000) / 1000,
      canopy_score: Math.round((canopy100 / 100) * 1000) / 1000,
      cooling_score: Math.round((cooling100 / 100) * 1000) / 1000,
      wind_score: null,
      biodiversity_score: Math.round((biodiversity100 / 100) * 1000) / 1000,
      water_score: Math.round((water100 / 100) * 1000) / 1000,
      environmental_constraint_score: Math.round((environmentalConstraint100 / 100) * 1000) / 1000,
      playground_environmental_suitability: Math.round((Math.max(0, playground100) / 100) * 1000) / 1000,
      plaza_environmental_suitability: Math.round((Math.max(0, plaza100) / 100) * 1000) / 1000,
      quiet_garden_suitability: Math.round((Math.max(0, quietGarden100) / 100) * 1000) / 1000,
      fitness_environmental_suitability: Math.round((Math.max(0, fitness100) / 100) * 1000) / 1000,
      jogging_route_suitability: Math.round((Math.max(0, jogging100) / 100) * 1000) / 1000,
      tree_planting_suitability: Math.round((treePlanting100 / 100) * 1000) / 1000,
      constraint
    };
  });

  return {
    site: siteName,
    analysis_crs: 'EPSG:32640',
    h3_resolution: 9,
    generated_at: new Date().toISOString(),
    cell_count: cells.length,
    methodology: {
      coordinates: 'centroid_x/centroid_y are real WGS84->UTM Zone 40N (EPSG:32640) forward-projected coordinates in meters, computed directly (standard transverse Mercator series, no external projection library). centroid_lng/centroid_lat are the source WGS84 degrees, included for reference.',
      heat_score: 'Heat Exposure Proxy (0-1): 70% estimated impervious surface (real building footprint + road-length-derived paved area) + 30% green deficit. NOT a measured or modeled temperature -- this dataset has no thermal/satellite raster.',
      shade_score: '60% inverse heat exposure + 40% green coverage (existing vegetation as the only real shade proxy). No per-cell shade-hours data exists -- do not treat as measured shade duration.',
      canopy_score: 'green_coverage_pct scaled against a 30% reference ceiling (this field is sparse OSM landuse tagging, averaging under 1% site-wide -- NOT a tree-canopy raster measurement).',
      cooling_score: '60% heat exposure + 40% available land (void ratio) -- where a cooling intervention would have the most real estate to work with.',
      wind_score: 'Always null -- no wind, weather, or CFD data exists anywhere in this dataset. Included in the schema for structural completeness, not populated.',
      biodiversity_score: '60% park-area share of the cell (real, spatially varying) + 40% green coverage -- a habitat-presence proxy, not a measured species-diversity or connectivity index.',
      water_score: '50% estimated impervious surface (runoff generator) + 50% available land (void ratio) -- a bioswale/rain-garden siting proxy, not a hydrology model.',
      environmental_constraint_score: 'Scaled park-area share of the cell. constraint=true when park-area share >= 30% (the same threshold Land Use Analysis uses to classify a cell as "Parks / Open Space") -- intended as a no-build/protect flag for generative-design constraints.',
      program_suitability: 'playground/plaza/quiet_garden/fitness/jogging_route suitability are composites of heat exposure, green coverage, void ratio, and real road density (as a pedestrian-activity/path-availability proxy). The reference spec weighting also calls for future-shade-potential and wind-comfort inputs, which have no data source here -- their weight is folded into the remaining real components rather than fabricated, and every suitability figure should be read as directional, not precise.',
      tree_planting_suitability: '30% heat exposure + 25% green deficit + 25% available land (void ratio) + 15% pedestrian exposure (real road density) + 5% biodiversity opportunity. Weights are adjustable in the Environmental Opportunity Maps section.'
    },
    cells
  };
}

export function grasshopperExportToCsv(exportData: GrasshopperExport): string {
  if (exportData.cells.length === 0) return '';
  const cols = Object.keys(exportData.cells[0]) as (keyof GrasshopperCell)[];
  const header = cols.join(',');
  const rows = exportData.cells.map(c => cols.map(col => String(c[col] ?? '')).join(','));
  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Community program inputs (Grasshopper Program Export)
// ---------------------------------------------------------------------------

export interface CommunityGrasshopperCell {
  h3_id: string;
  centroid_x: number;
  centroid_y: number;
  family_demand: number;
  child_demand: number;
  youth_demand: number;
  older_adult_demand: number;
  community_activity: number;
  facility_access: number;
  playground_deficit: number;
  sports_deficit: number;
  green_space_deficit: number;
  community_vulnerability: number;
  community_opportunity: number;
  social_interaction_potential: number;
  quiet_space_demand: number;
  event_space_demand: number;
}

export interface CommunityGrasshopperProgram {
  name: string;
  target_area_m2: number;
  minimum_area_m2: number;
  maximum_area_m2: number;
  priority: number;
  minimum_count: number;
  maximum_count: number;
  primary_users: string[];
  shade_requirement: number;
  noise_tolerance: number;
  accessibility_requirement: number;
  visibility_requirement: number;
  preferred_adjacencies: string[];
  avoid_adjacencies: string[];
  community_demand_score: number;
}

export interface CommunityGrasshopperExport {
  site: string;
  analysis_crs: string;
  h3_resolution: number;
  generated_at: string;
  methodology: Record<string, string>;
  cells: CommunityGrasshopperCell[];
  programs: CommunityGrasshopperProgram[];
}

/**
 * Builds the community-program Grasshopper export. Takes the already-computed per-hex community
 * functions and program-demand list as arguments (rather than importing communityEngine.ts's full
 * report bundle) to keep this a pure formatting/projection step -- callers pass in what
 * computeCommunityAnalysisReport already produced.
 */
export function computeCommunityGrasshopperExport(
  hexes: H3Feature[],
  hexScores: {
    familyDemand: (h: H3Feature) => number;
    youthDemand: (h: H3Feature) => number;
    olderAdultDemand: (h: H3Feature) => number;
    facilityAccess: (h: H3Feature) => number;
    playgroundDeficit: (h: H3Feature) => number;
    sportsDeficit: (h: H3Feature) => number;
    greenSpaceDeficit: (h: H3Feature) => number;
    vulnerability: (h: H3Feature) => number;
    opportunity: (h: H3Feature) => number;
    diversity: (h: H3Feature) => number;
  },
  programDemand: { key: string; name: string; demandScore: number; primaryUsers: string[] }[],
  programDefs: { key: string; name: string; primaryUsers: string[]; shadeRequirement: number; noiseTolerance: number; accessibilityRequirement: number; visibilityRequirement: number; targetAreaM2: number; minAreaM2: number; maxAreaM2: number; minCount: number; maxCount: number; preferredAdjacencies: string[]; avoidAdjacencies: string[] }[],
  siteName = 'Al Safa 2 Park'
): CommunityGrasshopperExport {
  const cells: CommunityGrasshopperCell[] = hexes.map(h => {
    const [lng, lat] = hexCentroid(h);
    const { x, y } = toUtm40N(lng, lat);
    const familyDemand = hexScores.familyDemand(h);
    const facilityAccess = hexScores.facilityAccess(h);
    const diversity = hexScores.diversity(h);
    // Child demand reuses the family-demand composite (school/playground presence + density) --
    // this dataset has no age-band split, so child and family demand share the same real inputs.
    const childDemand = familyDemand;
    // Social-interaction potential and quiet-space/event-space demand are directional composites
    // built only from real fields already computed elsewhere (diversity, vulnerability, facility
    // access) -- not independently measured signals.
    const socialInteractionPotential = Math.round((diversity + facilityAccess) / 2);
    const quietSpaceDemand = Math.max(0, 100 - socialInteractionPotential);
    const eventSpaceDemand = Math.round((diversity * 0.5 + familyDemand * 0.5));

    return {
      h3_id: h.properties.h3_id,
      centroid_x: x,
      centroid_y: y,
      family_demand: Math.round((familyDemand / 100) * 1000) / 1000,
      child_demand: Math.round((childDemand / 100) * 1000) / 1000,
      youth_demand: Math.round((hexScores.youthDemand(h) / 100) * 1000) / 1000,
      older_adult_demand: Math.round((hexScores.olderAdultDemand(h) / 100) * 1000) / 1000,
      community_activity: Math.round((diversity / 100) * 1000) / 1000,
      facility_access: Math.round((facilityAccess / 100) * 1000) / 1000,
      playground_deficit: Math.round((hexScores.playgroundDeficit(h) / 100) * 1000) / 1000,
      sports_deficit: Math.round((hexScores.sportsDeficit(h) / 100) * 1000) / 1000,
      green_space_deficit: Math.round((hexScores.greenSpaceDeficit(h) / 100) * 1000) / 1000,
      community_vulnerability: Math.round((hexScores.vulnerability(h) / 100) * 1000) / 1000,
      community_opportunity: Math.round((hexScores.opportunity(h) / 100) * 1000) / 1000,
      social_interaction_potential: Math.round((socialInteractionPotential / 100) * 1000) / 1000,
      quiet_space_demand: Math.round((quietSpaceDemand / 100) * 1000) / 1000,
      event_space_demand: Math.round((eventSpaceDemand / 100) * 1000) / 1000
    };
  });

  const programs: CommunityGrasshopperProgram[] = programDefs.map(def => {
    const demand = programDemand.find(p => p.key === def.key);
    return {
      name: def.name,
      target_area_m2: def.targetAreaM2,
      minimum_area_m2: def.minAreaM2,
      maximum_area_m2: def.maxAreaM2,
      priority: Math.round(((demand?.demandScore ?? 50) / 100) * 100) / 100,
      minimum_count: def.minCount,
      maximum_count: def.maxCount,
      primary_users: def.primaryUsers,
      shade_requirement: def.shadeRequirement,
      noise_tolerance: def.noiseTolerance,
      accessibility_requirement: def.accessibilityRequirement,
      visibility_requirement: def.visibilityRequirement,
      preferred_adjacencies: def.preferredAdjacencies,
      avoid_adjacencies: def.avoidAdjacencies,
      community_demand_score: Math.round(((demand?.demandScore ?? 50) / 100) * 1000) / 1000
    };
  });

  return {
    site: siteName,
    analysis_crs: 'EPSG:32640',
    h3_resolution: 9,
    generated_at: new Date().toISOString(),
    methodology: {
      coordinates: 'centroid_x/centroid_y are real WGS84->UTM Zone 40N (EPSG:32640) forward-projected coordinates in meters (same projection used by the Environmental Analysis Grasshopper export).',
      demand_scores: 'family/child/youth/older_adult demand are per-hex composites of real school/mosque/clinic/sports/playground presence signals and population density -- this dataset has no age-band population split, so child_demand reuses the family_demand composite rather than fabricating an independent age curve.',
      facility_access_and_diversity: 'facility_access is normalized H3 amenity-presence density; community_activity reuses the same facility-type-diversity composite (share of 9 facility types present per cell).',
      deficits: 'playground_deficit/sports_deficit are high where population is dense AND no playground/sports presence signal exists in the cell (not a literal distance-to-nearest-facility calculation). green_space_deficit is 100 - green_coverage_pct.',
      vulnerability_and_opportunity: 'community_vulnerability blends population pressure, green deficit, real network walking-time-to-park (where routable), and facility deficit. community_opportunity is vulnerability weighted by available land (void ratio) -- where an intervention would have the most impact and the most room to work with.',
      social_and_program_demand: 'social_interaction_potential, quiet_space_demand, and event_space_demand are directional composites built only from the real fields above (diversity, facility access, family demand) -- not independently measured indices.',
      programs: 'target/minimum/maximum area ranges and shade/noise/accessibility/visibility requirement scores are standard public-park landscape-architecture planning benchmarks (not measurements of this specific site). priority and community_demand_score come from the real per-program demand formula: 55% relevant-persona review-mention share + 45% gap in the relevant Park Health Score sentiment subscore(s) -- see the Community Analysis -- Program Demand Analysis section for the full per-program breakdown.'
    },
    cells,
    programs
  };
}

export function communityGrasshopperExportToCsv(exportData: CommunityGrasshopperExport): string {
  if (exportData.cells.length === 0) return '';
  const cols = Object.keys(exportData.cells[0]) as (keyof CommunityGrasshopperCell)[];
  const header = cols.join(',');
  const rows = exportData.cells.map(c => cols.map(col => String(c[col] ?? '')).join(','));
  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// NLP design inputs (Grasshopper Design Inputs -- NLP Spatial Analysis)
// ---------------------------------------------------------------------------

export interface NlpGrasshopperCell {
  h3_id: string;
  centroid_x: number;
  centroid_y: number;
  shade_demand: number;
  playground_demand: number;
  seating_demand: number;
  toilet_demand: number;
  water_demand: number;
  sports_demand: number;
  quiet_space_demand: number;
  event_space_demand: number;
  accessibility_demand: number;
  family_demand: number;
  youth_demand: number;
  older_adult_demand: number;
  maintenance_priority: number;
  safety_priority: number;
  positive_identity_value: number;
  community_satisfaction: number;
}

export interface NlpGrasshopperProgram {
  name: string;
  demand_score: number;
  primary_users: string[];
  evidence_count: number;
  shade_requirement: number;
  accessibility_requirement: number;
  visibility_requirement: number;
  recommended_area_m2: { minimum: number; target: number; maximum: number };
  priority: 'very_high' | 'high' | 'medium' | 'low';
  confidence: number;
}

export interface NlpGrasshopperExport {
  site: string;
  analysis_crs: string;
  h3_resolution: number;
  generated_at: string;
  review_analysis: { total_reviews: number; overall_sentiment: number };
  methodology: Record<string, string>;
  cells: NlpGrasshopperCell[];
  programs: NlpGrasshopperProgram[];
}

/** Maps community program keys onto the NLP topic category whose real mention/sentiment data should drive that program's demand -- undefined where no direct topic mapping exists (a neutral baseline is used instead, disclosed in methodology). */
const PROGRAM_KEY_TO_TOPIC: Partial<Record<string, string>> = {
  inclusivePlayground: 'playground', naturePlay: 'landscape / greenery', waterPlay: 'water features',
  sportsCourt: 'sports facilities', outdoorFitness: 'sports facilities', joggingLoop: 'sports facilities',
  walkingCircuit: 'accessibility', picnicArea: 'seating', familySeating: 'seating',
  sensoryGarden: 'accessibility', cafe: 'food / cafe', retailKiosk: 'food / cafe',
  toilets: 'toilets', drinkingFountains: 'water features', dogArea: 'pets'
};

export interface NlpTopicRate {
  category: string;
  mentionShare: number; // 0-1
  positiveSharePct: number; // 0-100
  negativeSharePct: number; // 0-100
  mentions: number;
}

/**
 * Reviews have no per-review location (confirmed: every raw review shares the single park-level
 * coordinate) -- every per-cell field here is a population-weighted REDISTRIBUTION of the one real
 * park-level topic rate, not measured per-cell review activity. Same disclosed-proxy pattern as
 * the Environmental and Community Grasshopper exports' own composite fields.
 */
export function computeNlpGrasshopperExport(
  hexes: H3Feature[],
  totalReviews: number,
  overallSentimentScore0to100: number,
  topicRates: NlpTopicRate[],
  siteName = 'Al Safa 2 Park'
): NlpGrasshopperExport {
  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0) || 1;
  const findRate = (category: string) => topicRates.find(t => t.category === category);

  const rateFor = (category: string): number => {
    const r = findRate(category);
    if (!r) return 0;
    return Math.min(1, r.mentionShare * 0.5 + (r.negativeSharePct / 100) * 0.5);
  };

  const cells: NlpGrasshopperCell[] = hexes.map(h => {
    const [lng, lat] = hexCentroid(h);
    const { x, y } = toUtm40N(lng, lat);
    const popShare = (h.properties.population || 0) / totalPopulation;
    const weight = Math.min(1, popShare * hexes.length);

    const scoreFor = (category: string) => Math.round(rateFor(category) * weight * 1000) / 1000;

    return {
      h3_id: h.properties.h3_id,
      centroid_x: x,
      centroid_y: y,
      shade_demand: scoreFor('shade / heat comfort'),
      playground_demand: scoreFor('playground'),
      seating_demand: scoreFor('seating'),
      toilet_demand: scoreFor('toilets'),
      water_demand: scoreFor('water features'),
      sports_demand: scoreFor('sports facilities'),
      quiet_space_demand: scoreFor('crowding'),
      event_space_demand: Math.round(((findRate('crowding')?.mentionShare || 0) * weight) * 1000) / 1000,
      accessibility_demand: scoreFor('accessibility'),
      family_demand: scoreFor('playground'),
      youth_demand: scoreFor('sports facilities'),
      older_adult_demand: scoreFor('safety'),
      maintenance_priority: scoreFor('maintenance'),
      safety_priority: scoreFor('safety'),
      positive_identity_value: Math.round(weight * ((findRate('landscape / greenery')?.positiveSharePct || 0) / 100) * 1000) / 1000,
      community_satisfaction: Math.round((overallSentimentScore0to100 / 100) * weight * 1000) / 1000
    };
  });

  const programs: NlpGrasshopperProgram[] = PROGRAM_DEFS.map(def => {
    const topicKey = PROGRAM_KEY_TO_TOPIC[def.key];
    const rate = topicKey ? findRate(topicKey) : undefined;
    const demandScore = rate ? Math.min(100, Math.round(Math.min(1, rate.mentionShare * 3) * 50 + rate.negativeSharePct * 0.5)) : 30;
    const priority: NlpGrasshopperProgram['priority'] = demandScore >= 75 ? 'very_high' : demandScore >= 50 ? 'high' : demandScore >= 25 ? 'medium' : 'low';

    return {
      name: def.name,
      demand_score: Math.round((demandScore / 100) * 1000) / 1000,
      primary_users: def.primaryUsers,
      evidence_count: rate?.mentions || 0,
      shade_requirement: def.shadeRequirement,
      accessibility_requirement: def.accessibilityRequirement,
      visibility_requirement: def.visibilityRequirement,
      recommended_area_m2: { minimum: def.minAreaM2, target: def.targetAreaM2, maximum: def.maxAreaM2 },
      priority,
      confidence: Math.round(Math.min(95, 35 + (rate?.mentions || 0) * 3)) / 100
    };
  });

  return {
    site: siteName,
    analysis_crs: 'EPSG:32640',
    h3_resolution: 9,
    generated_at: new Date().toISOString(),
    review_analysis: { total_reviews: totalReviews, overall_sentiment: Math.round((overallSentimentScore0to100 / 100) * 1000) / 1000 },
    methodology: {
      coordinates: 'centroid_x/centroid_y are real WGS84->UTM Zone 40N (EPSG:32640) forward-projected coordinates in meters.',
      spatial_disclosure: 'Reviews carry NO per-review location -- every raw review shares the identical single park-level coordinate. Every per-cell demand field is a population-weighted REDISTRIBUTION of the one real park-level topic rate (mention share blended with negative-sentiment share for that topic), not measured per-cell review activity.',
      demand_fields: 'Each *_demand/*_priority field maps to a specific real review topic (see PROGRAM_KEY_TO_TOPIC-style mapping): shade->"shade / heat comfort", playground/family->"playground", seating->"seating", toilet->"toilets", water->"water features", sports/youth->"sports facilities", quiet/event->"crowding", accessibility->"accessibility", maintenance/safety/older_adult->"maintenance"/"safety". Cells with no population get 0, not an estimate.',
      positive_identity_value: 'Population-weighted allocation of the site-wide positive sentiment share for the "landscape / greenery" topic -- a proxy for which areas might carry the park\'s identity-defining qualities, not a measured landmark/character survey.',
      community_satisfaction: 'Population-weighted allocation of the single site-wide Overall Sentiment Score -- identical methodology figure redistributed by population share, not independently measured per cell.',
      programs: 'Program list and area ranges reuse Community Analysis\'s PROGRAM_DEFS (standard landscape-architecture planning benchmarks, not site measurements). demand_score/priority here are computed from real NLP review-topic evidence (mention share + negative sentiment share) specifically, not persona review counts -- programs with no direct topic mapping receive a neutral baseline demand_score of 0.3 rather than a fabricated figure.'
    },
    cells,
    programs
  };
}

export function nlpGrasshopperExportToCsv(exportData: NlpGrasshopperExport): string {
  if (exportData.cells.length === 0) return '';
  const cols = Object.keys(exportData.cells[0]) as (keyof NlpGrasshopperCell)[];
  const header = cols.join(',');
  const rows = exportData.cells.map(c => cols.map(col => String(c[col] ?? '')).join(','));
  return [header, ...rows].join('\n');
}
