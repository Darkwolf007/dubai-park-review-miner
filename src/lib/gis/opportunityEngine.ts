/**
 * Unified Opportunity Analysis -- combines the existing Population, Urban, Accessibility,
 * Environmental, Community, and NLP Spatial engines into a single decision layer answering:
 * what intervention, where, why, and how it feeds Grasshopper later. Deliberately does NOT
 * introduce a new independent scoring system -- every input below is a direct call into an
 * existing, already-reviewed hex-level function (or the existing PROGRAM_DEFS catalogue for
 * area/adjacency/user data). Deterministic and local: no network calls, no backend tables.
 *
 * Covers the 43 program elements implied by the Dubai Municipality AI Park Scope of Work,
 * grouped into 8 categories (Arrival/Access, Movement, Play, Sports/Wellness, Community/Social,
 * Landscape/Environment, Comfort/Amenities, Smart/Operations). Many entries deliberately reuse
 * the same underlying scoring primitives (e.g. every point-amenity type reuses walkability +
 * void-ratio feasibility) -- shared formulas, but each still carries its own label, users, area,
 * adjacency, and Grasshopper metadata, per the modeling brief.
 *
 * Modeling rules enforced throughout:
 * - demandScore (need) and suitabilityScore (site fitness) are computed from disjoint input sets
 *   -- demand draws from population/persona/NLP/facility-deficit signals, suitability from
 *   site-condition signals (heat, noise, safety, walkability, edge-detection).
 * - avoidConditions are explicit hard constraints (booleans), never folded silently into a score.
 * - Every NLP-derived number is population-weighted REDISTRIBUTION of a single park-level rate
 *   (via reviewNlpSpatialEngine's computeHexReviewOpportunity) -- never presented as per-cell
 *   measured review activity. See evidence[] wording for the disclosure on every opportunity.
 * - confidenceScore reflects how much real evidence backs the number (review mention counts,
 *   whether road/facility data loaded) -- NOT how desirable or high-scoring the opportunity is.
 */
import type { H3Feature, RoadStats } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeHexDemandScore } from './populationEngine';
import {
  computeHexWalkabilityScore, computeHexParkAccessScore, computeHexBarrierSeverityScore, computeHexTransitAccessibilityScore
} from './accessibilityEngine';
import {
  hexHeatExposureProxy, hexVoidRatioPct, hexBiodiversityProxy, hexTreePlantingSuitability,
  hexWaterSensitiveSuitability, computeAvgRoadWidthM
} from './environmentalEngine';
import {
  hexFamilyDemandScore, hexYouthDemandScore, hexOlderAdultDemandScore, hexFacilityAccessScore,
  hexCommunityDiversityScore, hexGreenSpaceDeficitScore, hexCommunityVulnerabilityScore, PROGRAM_DEFS, type ProgramDef
} from './communityEngine';
import { computeHexReviewOpportunity } from './reviewNlpSpatialEngine';
import { computeIssueImpact } from '../analytics/issueMatrix';

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

// Matches siteGrid.ts's CELL_SIZE_M (10m nominal cell = 100 m²) -- not imported directly to avoid
// coupling this general-purpose engine to the site-grid module; boundary-detection logic (used by
// the arrival/access types) only makes sense when the input is site-grid cells, documented below.
const NOMINAL_SITE_CELL_AREA_M2 = 100;

function boundaryRatio(hex: H3Feature): number {
  return (hex.properties.hex_area_m2 || 0) / NOMINAL_SITE_CELL_AREA_M2;
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Restricts the H3 grid to cells that actually touch Al Safa 2 Park's own boundary
 * (park_area_m2 > 0), not the full 5km surrounding urban catchment the rest of this dataset
 * covers. Kept as a defensive fallback for callers that pass raw H3 hexes instead of the 10m
 * site grid (buildSiteGrid()) that Opportunity Lab actually uses -- on site-grid cells, every
 * cell already satisfies this by construction, so it's a no-op there.
 */
export function filterParkSiteHexes(hexes: H3Feature[]): H3Feature[] {
  return hexes.filter(h => (h.properties.park_area_m2 || 0) > 0);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpportunityCategory =
  | 'Arrival / Access' | 'Movement' | 'Play' | 'Sports / Wellness' | 'Community / Social'
  | 'Landscape / Environment' | 'Comfort / Amenities' | 'Smart / Operations';

export type GeometryType = 'point' | 'area' | 'linear' | 'network';
export type Scale = 'site-wide' | 'zone' | 'node' | 'route';

export type OpportunityType =
  // Arrival / Access
  | 'mainEntrancePlaza' | 'secondaryEntrances' | 'accessibleRoutes' | 'bicycleParking' | 'dropOffZone' | 'wayfindingNodes'
  // Movement
  | 'walkingPromenade' | 'joggingLoop' | 'shadedCirculation' | 'serviceAccess'
  // Play
  | 'inclusivePlayground' | 'toddlerPlay' | 'olderChildrenPlay' | 'naturePlay' | 'familySeatingPlay'
  // Sports / Wellness
  | 'outdoorFitness' | 'flexibleRecreation' | 'sportsCourt' | 'multipurposeLawn' | 'wellnessZone'
  // Community / Social
  | 'communityPlaza' | 'flexibleEventLawn' | 'picnicArea' | 'socialSeating' | 'smallEventZone'
  // Landscape / Environment
  | 'treePlanting' | 'nativePlanting' | 'biodiversityHabitat' | 'sensoryGarden' | 'quietGarden' | 'bioswale' | 'irrigationEfficiency'
  // Comfort / Amenities
  | 'shadedSeating' | 'restrooms' | 'drinkingWater' | 'cafeKiosk' | 'wastePoints' | 'viewingPoints'
  // Smart / Operations
  | 'smartMonitoring' | 'digitalExperience' | 'efficientLighting' | 'safetyPoint' | 'operationsArea';

export type OpportunityPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface OpportunityCellScore {
  h3Id: string;
  opportunityScore: number;
  demandScore: number;
  suitabilityScore: number;
  feasibilityScore: number;
  avoided: boolean;
}

export interface RecommendedArea {
  minimum: number;
  target: number;
  maximum: number;
}

export interface GrasshopperReadiness {
  suitabilityField: string;
  attractors: string[];
  repellers: string[];
  constraints: string[];
  recommendedAreaM2: RecommendedArea | null;
  adjacencyRules: { preferred: string[]; avoid: string[] };
  geometryType: GeometryType;
  scale: Scale;
}

export interface OpportunityResult {
  type: OpportunityType;
  name: string;
  category: OpportunityCategory;
  geometryType: GeometryType;
  scale: Scale;
  opportunityScore: number;
  demandScore: number;
  suitabilityScore: number;
  feasibilityScore: number;
  confidenceScore: number;
  priority: OpportunityPriority;
  recommendedAreaM2: RecommendedArea | null;
  primaryUsers: string[];
  evidence: string[];
  adjacencyNeeds: string[];
  avoidConditions: string[];
  grasshopperInputs: GrasshopperReadiness;
  /** Top 15 cells, ranked -- for the ranked table. */
  topCells: OpportunityCellScore[];
  /** Every scored cell (including avoided ones) -- for the suitability map, which needs to color
   * the whole grid, not just the top-ranked candidates. */
  allCells: OpportunityCellScore[];
}

interface EngineContext {
  avgRoadWidthM: number;
  totalPopulation: number;
}

// ---------------------------------------------------------------------------
// Shared scoring primitives -- reused across multiple program types below so each def stays a
// short composition of existing hex-level functions rather than a bespoke formula per type.
// ---------------------------------------------------------------------------

/** Generic small point-amenity suitability: reachable on foot, not stuck deep in an empty zone. */
function pointAmenitySuitability(hex: H3Feature): number {
  return clamp100(0.6 * computeHexWalkabilityScore(hex) + 0.4 * hexFacilityAccessScore(hex));
}

/** Generic small point-amenity feasibility: needs almost no contiguous land. */
function smallFootprintFeasibility(hex: H3Feature): number {
  return clamp100(normalize(hexVoidRatioPct(hex), 15));
}

const NO_AVOID = () => null;

// ---------------------------------------------------------------------------
// Per-hex demand / suitability / feasibility / avoid functions, one row per program type.
// Every function calls straight into an existing engine -- see file header.
// ---------------------------------------------------------------------------

interface OpportunityDef {
  type: OpportunityType;
  name: string;
  category: OpportunityCategory;
  geometryType: GeometryType;
  scale: Scale;
  programKeys: string[];
  nlpCategory: string | null;
  nlpCategoryNote?: string;
  primaryUsersFallback: string[];
  demand: (hex: H3Feature, ctx: EngineContext, nlpOpportunity: number) => number;
  suitability: (hex: H3Feature, ctx: EngineContext) => number;
  feasibility: (hex: H3Feature, ctx: EngineContext) => number;
  avoided: (hex: H3Feature, ctx: EngineContext) => string | null;
  suitabilityField: string;
  attractors: string[];
  repellers: string[];
}

const OPPORTUNITY_DEFS: OpportunityDef[] = [
  // ===========================================================================================
  // Arrival / Access
  // ===========================================================================================
  {
    type: 'mainEntrancePlaza',
    name: 'Main Entrance Plaza / Gateway',
    category: 'Arrival / Access',
    geometryType: 'area',
    scale: 'node',
    programKeys: ['communityPlaza'],
    nlpCategory: 'accessibility',
    primaryUsersFallback: ['All visitors', 'Nearby residents'],
    demand: hex => clamp100(0.5 * computeHexDemandScore(hex) + 0.5 * (100 - computeHexParkAccessScore(hex))),
    suitability: hex => clamp100(0.4 * computeHexWalkabilityScore(hex) + 0.3 * (100 - computeHexBarrierSeverityScore(hex)) + 0.3 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)),
    feasibility: hex => (boundaryRatio(hex) < 0.9 ? 100 : 30),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- not a boundary/gateway candidate.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population demand', 'Street connectivity', 'Boundary/edge location'],
    repellers: ['High barrier severity', 'Full interior cell']
  },
  {
    type: 'secondaryEntrances',
    name: 'Secondary Entrances',
    category: 'Arrival / Access',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'accessibility',
    primaryUsersFallback: ['Nearby residents', 'Pedestrians'],
    demand: hex => clamp100(0.6 * (100 - computeHexParkAccessScore(hex)) + 0.4 * computeHexDemandScore(hex)),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => (boundaryRatio(hex) < 0.9 ? 100 : 20),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- not a boundary candidate.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Underserved population', 'Boundary/edge location'],
    repellers: ['High barrier severity', 'Full interior cell']
  },
  {
    type: 'accessibleRoutes',
    name: 'Universal Accessible Routes',
    category: 'Arrival / Access',
    geometryType: 'linear',
    scale: 'route',
    programKeys: ['walkingCircuit'],
    nlpCategory: 'accessibility',
    primaryUsersFallback: ['People of Determination', 'Older adults', 'Caregivers'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * (100 - computeHexParkAccessScore(hex)) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 15000)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) < 1000 ? 'Under 1,000 m/km² real path density -- no existing circulation to build an accessible route from.' : null),
    suitabilityField: 'route_directness_ratio',
    attractors: ['Accessibility deficit', 'Low barrier severity', 'Existing path network'],
    repellers: ['High barrier severity', 'Sparse path network']
  },
  {
    type: 'bicycleParking',
    name: 'Bicycle Parking',
    category: 'Arrival / Access',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'parking',
    primaryUsersFallback: ['Cyclists', 'All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    suitability: pointAmenitySuitability,
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population density', 'Path/road connectivity'],
    repellers: []
  },
  {
    type: 'dropOffZone',
    name: 'Drop-off / Arrival Zone',
    category: 'Arrival / Access',
    geometryType: 'area',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'parking',
    primaryUsersFallback: ['Families', 'All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * computeHexDemandScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => (boundaryRatio(hex) < 0.9 ? 90 : 25),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- not adjacent to the street.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Street connectivity', 'Boundary/edge location'],
    repellers: ['Full interior cell']
  },
  {
    type: 'wayfindingNodes',
    name: 'Wayfinding Nodes',
    category: 'Arrival / Access',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'wayfinding / signage',
    primaryUsersFallback: ['All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexCommunityDiversityScore(hex) + 0.6 * nlp),
    suitability: pointAmenitySuitability,
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Path intersections', 'Facility diversity'],
    repellers: []
  },

  // ===========================================================================================
  // Movement
  // ===========================================================================================
  {
    type: 'walkingPromenade',
    name: 'Walking Promenade',
    category: 'Movement',
    geometryType: 'linear',
    scale: 'route',
    programKeys: ['walkingCircuit'],
    nlpCategory: null,
    primaryUsersFallback: ['Seniors', 'Families', 'Residents'],
    demand: hex => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * (100 - hexCommunityVulnerabilityScore(hex))),
    suitability: (hex, ctx) => clamp100(0.4 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.3 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 15000)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) < 1000 ? 'Under 1,000 m/km² real path density -- no existing circulation to build a promenade from.' : null),
    suitabilityField: 'route_directness_ratio',
    attractors: ['Existing path network', 'Low heat exposure', 'Low barrier severity'],
    repellers: ['Sparse path network', 'High heat exposure']
  },
  {
    type: 'joggingLoop',
    name: 'Jogging Loop (~1 km)',
    category: 'Movement',
    geometryType: 'linear',
    scale: 'route',
    programKeys: ['joggingLoop'],
    nlpCategory: 'sports facilities',
    nlpCategoryNote: 'No review category maps directly to "jogging loop" -- sports-facilities mentions are used as the closest available proxy.',
    primaryUsersFallback: ['Joggers', 'Residents'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    suitability: hex => clamp100(0.4 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.3 * (100 - computeHexBarrierSeverityScore(hex)) + 0.3 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 20000)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) < 2000 ? 'Under 2,000 m/km² real road density -- effectively no path infrastructure to route a loop through.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Path / road density', 'Green coverage (route pleasantness)', 'Low barrier severity'],
    repellers: ['Sparse path network']
  },
  {
    type: 'shadedCirculation',
    name: 'Shaded Internal Circulation',
    category: 'Movement',
    geometryType: 'linear',
    scale: 'route',
    programKeys: [],
    nlpCategory: 'shade / heat comfort',
    primaryUsersFallback: ['All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexHeatExposureProxy(hex, ctx.avgRoadWidthM) + 0.5 * nlp),
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 15000)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) < 1000 ? 'Under 1,000 m/km² real path density -- no existing circulation to shade.' : null),
    suitabilityField: 'shade_score',
    attractors: ['Heat exposure', 'Existing path network', 'Green coverage'],
    repellers: ['Sparse path network']
  },
  {
    type: 'serviceAccess',
    name: 'Service / Maintenance Access',
    category: 'Movement',
    geometryType: 'linear',
    scale: 'route',
    programKeys: [],
    nlpCategory: null,
    primaryUsersFallback: ['Operations / maintenance staff'],
    demand: hex => clamp100(50 + 0.5 * (hex.properties.building_coverage_pct || 0)),
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * boundaryRatio(hex) * 100),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 10000)),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- service access needs a boundary/edge connection.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Boundary/edge location', 'Existing path network'],
    repellers: ['Full interior cell'],
  },

  // ===========================================================================================
  // Play
  // ===========================================================================================
  {
    type: 'inclusivePlayground',
    name: 'Inclusive Playground',
    category: 'Play',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['inclusivePlayground'],
    nlpCategory: 'playground',
    primaryUsersFallback: ['Children', 'Families', 'People of Determination'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexFamilyDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.3 * computeHexWalkabilityScore(hex) + 0.3 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio -- insufficient open land for play equipment.' : null),
    suitabilityField: 'playground_environmental_suitability',
    attractors: ['Family demand', 'Shade availability', 'Low barrier exposure'],
    repellers: ['High heat exposure', 'High barrier severity (major roads)']
  },
  {
    type: 'toddlerPlay',
    name: 'Toddler Play',
    category: 'Play',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['inclusivePlayground', 'familySeating'],
    nlpCategory: 'playground',
    nlpCategoryNote: 'Toddler-specific demand has no distinct review category -- general playground mentions are used, weighted toward family/caregiver demand.',
    primaryUsersFallback: ['Toddlers', 'Caregivers', 'Parents'],
    demand: (hex, ctx, nlp) => clamp100(0.7 * hexFamilyDemandScore(hex) + 0.3 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio -- insufficient enclosed open land.' : null),
    suitabilityField: 'playground_environmental_suitability',
    attractors: ['Family demand', 'Shade availability', 'Low barrier exposure'],
    repellers: ['High heat exposure', 'High barrier severity']
  },
  {
    type: 'olderChildrenPlay',
    name: 'Older Children Play',
    category: 'Play',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['inclusivePlayground'],
    nlpCategory: 'playground',
    primaryUsersFallback: ['Older children', 'Teenagers'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * computeHexWalkabilityScore(hex) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.3 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 50)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio -- insufficient open land.' : null),
    suitabilityField: 'playground_environmental_suitability',
    attractors: ['Youth demand', 'Walkability', 'Green coverage'],
    repellers: ['High heat exposure']
  },
  {
    type: 'naturePlay',
    name: 'Nature / Interactive Play',
    category: 'Play',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['naturePlay'],
    nlpCategory: 'landscape / greenery',
    primaryUsersFallback: ['Children', 'Families'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexFamilyDemandScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * hexBiodiversityProxy(hex) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Existing greenery/biodiversity', 'Family demand'],
    repellers: ['Low green coverage']
  },
  {
    type: 'familySeatingPlay',
    name: 'Family Seating Near Play',
    category: 'Play',
    geometryType: 'point',
    scale: 'node',
    programKeys: ['familySeating'],
    nlpCategory: 'seating',
    primaryUsersFallback: ['Families', 'Caregivers'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexFamilyDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * computeHexWalkabilityScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'shade_score',
    attractors: ['Family demand', 'Shade availability', 'Path proximity'],
    repellers: ['High heat exposure']
  },

  // ===========================================================================================
  // Sports / Wellness
  // ===========================================================================================
  {
    type: 'outdoorFitness',
    name: 'Outdoor Fitness',
    category: 'Sports / Wellness',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['outdoorFitness'],
    nlpCategory: 'sports facilities',
    primaryUsersFallback: ['Young adults', 'Working adults'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * computeHexWalkabilityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Youth demand', 'Low heat exposure', 'Walkability'],
    repellers: ['High heat exposure']
  },
  {
    type: 'flexibleRecreation',
    name: 'Flexible Recreation Zone',
    category: 'Sports / Wellness',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['outdoorFitness', 'sportsCourt'],
    nlpCategory: 'sports facilities',
    primaryUsersFallback: ['All age groups'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexYouthDemandScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexVoidRatioPct(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 55)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient flexible open land.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Available flexible land', 'Walkability'],
    repellers: ['Low void ratio']
  },
  {
    type: 'sportsCourt',
    name: 'Sports Court / Multipurpose Court',
    category: 'Sports / Wellness',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['sportsCourt'],
    nlpCategory: 'sports facilities',
    primaryUsersFallback: ['Teenagers', 'Young adults'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    suitability: hex => clamp100(0.5 * hexVoidRatioPct(hex) + 0.5 * computeHexWalkabilityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient contiguous land for a court.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Youth demand', 'Available land'],
    repellers: ['Low void ratio']
  },
  {
    type: 'multipurposeLawn',
    name: 'Multipurpose Lawn',
    category: 'Sports / Wellness',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['eventLawn'],
    nlpCategory: 'crowding',
    nlpCategoryNote: 'No review category maps directly to "multipurpose lawn" -- crowding complaints are used as a proxy for unmet demand for open space.',
    primaryUsersFallback: ['Families', 'Weekend social groups', 'All age groups'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 70)),
    avoided: hex => (hexVoidRatioPct(hex) < 20 ? 'Less than 20% void ratio -- insufficient contiguous open land for a lawn.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Available contiguous land', 'Green coverage'],
    repellers: ['High heat exposure', 'Low void ratio']
  },
  {
    type: 'wellnessZone',
    name: 'Wellness / Stretching Zone',
    category: 'Sports / Wellness',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['seniorActivityArea'],
    nlpCategory: 'shade / heat comfort',
    nlpCategoryNote: 'No review category maps directly to "wellness zone" -- shade/heat-comfort mentions are used as a proxy, since comfort is the dominant siting concern for this program.',
    primaryUsersFallback: ['Older adults', 'Working adults'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexOlderAdultDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 30)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio.' : null),
    suitabilityField: 'quiet_garden_suitability',
    attractors: ['Older-adult demand', 'Low heat exposure', 'Low traffic noise'],
    repellers: ['High heat exposure', 'High road density']
  },

  // ===========================================================================================
  // Community / Social
  // ===========================================================================================
  {
    type: 'communityPlaza',
    name: 'Community Plaza',
    category: 'Community / Social',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['communityPlaza'],
    nlpCategory: 'crowding',
    nlpCategoryNote: 'No review category maps directly to "community plaza" -- crowding complaints are used as a proxy for unmet demand for gathering space.',
    primaryUsersFallback: ['Weekend social groups', 'Families', 'Residents'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexCommunityDiversityScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient contiguous open land for a plaza.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability / accessibility', 'Community diversity'],
    repellers: ['High heat exposure', 'Low void ratio']
  },
  {
    type: 'flexibleEventLawn',
    name: 'Flexible Event Lawn',
    category: 'Community / Social',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['eventLawn'],
    nlpCategory: 'crowding',
    nlpCategoryNote: 'No review category maps directly to "event lawn" -- crowding complaints are used as a proxy for unmet demand for open gathering space.',
    primaryUsersFallback: ['Families', 'Weekend social groups'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 70)),
    avoided: hex => (hexVoidRatioPct(hex) < 20 ? 'Less than 20% void ratio -- insufficient contiguous open land for an event lawn.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability / accessibility', 'Available contiguous land'],
    repellers: ['High heat exposure', 'Low void ratio']
  },
  {
    type: 'picnicArea',
    name: 'Picnic Area',
    category: 'Community / Social',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['picnicArea'],
    nlpCategory: 'seating',
    primaryUsersFallback: ['Families', 'Weekend social groups'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexFamilyDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'shade_score',
    attractors: ['Family demand', 'Shade availability', 'Green coverage'],
    repellers: ['High heat exposure']
  },
  {
    type: 'socialSeating',
    name: 'Social Seating Area',
    category: 'Community / Social',
    geometryType: 'point',
    scale: 'node',
    programKeys: ['familySeating'],
    nlpCategory: 'seating',
    primaryUsersFallback: ['All visitors', 'Weekend social groups'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: pointAmenitySuitability,
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Foot traffic / walkability', 'Facility diversity'],
    repellers: []
  },
  {
    type: 'smallEventZone',
    name: 'Small Event / Gathering Zone',
    category: 'Community / Social',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['communityPlaza'],
    nlpCategory: 'crowding',
    primaryUsersFallback: ['Residents', 'Weekend social groups'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexVoidRatioPct(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 35)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability', 'Available land'],
    repellers: []
  },

  // ===========================================================================================
  // Landscape / Environment
  // ===========================================================================================
  {
    type: 'treePlanting',
    name: 'Tree Planting / Canopy',
    category: 'Landscape / Environment',
    geometryType: 'area',
    scale: 'zone',
    programKeys: [],
    nlpCategory: 'landscape / greenery',
    primaryUsersFallback: ['All visitors', 'Pedestrians'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexGreenSpaceDeficitScore(hex) + 0.3 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.3 * nlp),
    suitability: (hex, ctx) => hexTreePlantingSuitability(hex, ctx.avgRoadWidthM),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio -- effectively no unbuilt land in this cell.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Heat exposure', 'Green-space deficit', 'Available land (void ratio)'],
    repellers: ['High building coverage', 'Already-high green coverage']
  },
  {
    type: 'nativePlanting',
    name: 'Native / Climate-Adapted Planting',
    category: 'Landscape / Environment',
    geometryType: 'area',
    scale: 'zone',
    programKeys: [],
    nlpCategory: 'landscape / greenery',
    primaryUsersFallback: ['All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexGreenSpaceDeficitScore(hex) + 0.6 * nlp),
    suitability: hex => clamp100(0.6 * hexBiodiversityProxy(hex) + 0.4 * hexVoidRatioPct(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 50)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Green-space deficit', 'Available land', 'Existing biodiversity'],
    repellers: ['High building coverage']
  },
  {
    type: 'biodiversityHabitat',
    name: 'Biodiversity Habitat',
    category: 'Landscape / Environment',
    geometryType: 'area',
    scale: 'zone',
    programKeys: [],
    nlpCategory: 'landscape / greenery',
    nlpCategoryNote: 'No review category maps directly to "biodiversity habitat" -- landscape/greenery mentions are used as the closest available proxy.',
    primaryUsersFallback: ['All visitors', 'Wildlife'],
    demand: hex => clamp100(0.5 * (100 - hexBiodiversityProxy(hex)) + 0.5 * hexGreenSpaceDeficitScore(hex)),
    suitability: hex => clamp100(0.5 * hexBiodiversityProxy(hex) + 0.5 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 50)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) > 40000 ? 'Road density exceeds 40,000 m/km² -- too disturbed for habitat value.' : hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'biodiversity_score',
    attractors: ['Existing biodiversity', 'Low disturbance', 'Available land'],
    repellers: ['High road density', 'Low void ratio']
  },
  {
    type: 'sensoryGarden',
    name: 'Sensory / Therapeutic Garden',
    category: 'Landscape / Environment',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['sensoryGarden', 'therapeuticGarden'],
    nlpCategory: 'accessibility',
    nlpCategoryNote: 'No review category maps directly to "sensory garden" -- accessibility mentions are used as a proxy given the People-of-Determination-focused user group.',
    primaryUsersFallback: ['People of Determination', 'Children', 'Older adults'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexFamilyDemandScore(hex) + 0.5 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)) + 0.3 * hexBiodiversityProxy(hex) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 35)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio.' : null),
    suitabilityField: 'quiet_garden_suitability',
    attractors: ['Low traffic noise', 'Existing biodiversity', 'Accessibility demand'],
    repellers: ['High road density', 'High heat exposure']
  },
  {
    type: 'quietGarden',
    name: 'Quiet Garden',
    category: 'Landscape / Environment',
    geometryType: 'area',
    scale: 'zone',
    programKeys: ['quietGarden'],
    nlpCategory: 'landscape / greenery',
    nlpCategoryNote: 'No review category maps directly to "quiet garden" -- landscape/greenery mentions are used as the closest available proxy for garden-quality interest.',
    primaryUsersFallback: ['Older adults', 'Working adults'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexOlderAdultDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)) + 0.3 * hexBiodiversityProxy(hex) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) > 30000 ? 'Road density exceeds 30,000 m/km² -- too much traffic noise for a quiet garden.' : hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'quiet_garden_suitability',
    attractors: ['Low traffic noise', 'Existing biodiversity', 'Low heat exposure'],
    repellers: ['High road density', 'High heat exposure']
  },
  {
    type: 'bioswale',
    name: 'Water-Sensitive Landscape / Bioswale',
    category: 'Landscape / Environment',
    geometryType: 'area',
    scale: 'zone',
    programKeys: [],
    nlpCategory: 'water features',
    primaryUsersFallback: ['All visitors'],
    demand: hex => clamp100(0.5 * normalize(hex.properties.building_coverage_pct || 0, 80) + 0.5 * hexGreenSpaceDeficitScore(hex)),
    suitability: (hex, ctx) => hexWaterSensitiveSuitability(hex, ctx.avgRoadWidthM),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'water_score',
    attractors: ['Impervious surface (runoff)', 'Available land'],
    repellers: ['Low void ratio']
  },
  {
    type: 'irrigationEfficiency',
    name: 'Irrigation / Water Efficiency Zone',
    category: 'Landscape / Environment',
    geometryType: 'network',
    scale: 'site-wide',
    programKeys: [],
    nlpCategory: null,
    primaryUsersFallback: ['Operations / maintenance staff'],
    demand: hex => clamp100(normalize(hex.properties.green_coverage_pct || 0, 30)),
    suitability: hex => clamp100(normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: () => 100,
    avoided: NO_AVOID,
    suitabilityField: 'green_coverage_pct',
    attractors: ['Existing green/irrigated coverage'],
    repellers: []
  },

  // ===========================================================================================
  // Comfort / Amenities
  // ===========================================================================================
  {
    type: 'shadedSeating',
    name: 'Shaded Seating',
    category: 'Comfort / Amenities',
    geometryType: 'point',
    scale: 'node',
    programKeys: ['familySeating'],
    nlpCategory: 'shade / heat comfort',
    primaryUsersFallback: ['Families', 'Older adults', 'Caregivers'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexHeatExposureProxy(hex, ctx.avgRoadWidthM) + 0.5 * nlp),
    suitability: hex => clamp100(0.6 * computeHexWalkabilityScore(hex) + 0.4 * (100 - normalize(hex.properties.building_coverage_pct || 0, 80))),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'shade_score',
    attractors: ['Heat exposure (where relief is most needed)', 'Path proximity'],
    repellers: ['High building coverage']
  },
  {
    type: 'restrooms',
    name: 'Restrooms',
    category: 'Comfort / Amenities',
    geometryType: 'point',
    scale: 'node',
    programKeys: ['toilets'],
    nlpCategory: 'toilets',
    primaryUsersFallback: ['All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    suitability: pointAmenitySuitability,
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population density', 'Facility access / walkability'],
    repellers: []
  },
  {
    type: 'drinkingWater',
    name: 'Drinking Fountains',
    category: 'Comfort / Amenities',
    geometryType: 'point',
    scale: 'node',
    programKeys: ['drinkingFountains'],
    nlpCategory: 'water features',
    primaryUsersFallback: ['All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    suitability: hex => computeHexWalkabilityScore(hex),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 20)),
    avoided: NO_AVOID,
    suitabilityField: 'water_score',
    attractors: ['Pedestrian path density', 'Population density'],
    repellers: []
  },
  {
    type: 'cafeKiosk',
    name: 'Cafe / Kiosk',
    category: 'Comfort / Amenities',
    geometryType: 'point',
    scale: 'node',
    programKeys: ['cafe', 'retailKiosk'],
    nlpCategory: 'food / cafe',
    primaryUsersFallback: ['Families', 'Working adults', 'Weekend social groups'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * (100 - hexFacilityAccessScore(hex)) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexCommunityDiversityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 5 ? 'Less than 5% void ratio -- no room for a structure.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Foot traffic / walkability', 'Mixed-use vibrancy', 'Low existing facility access'],
    repellers: ['Quiet / low-footfall cells']
  },
  {
    type: 'wastePoints',
    name: 'Waste / Recycling Points',
    category: 'Comfort / Amenities',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'cleanliness',
    primaryUsersFallback: ['All visitors', 'Operations / maintenance staff'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.6 * nlp),
    suitability: pointAmenitySuitability,
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population density', 'Facility access / walkability'],
    repellers: []
  },
  {
    type: 'viewingPoints',
    name: 'Viewing / Resting Points',
    category: 'Comfort / Amenities',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: null,
    primaryUsersFallback: ['All visitors'],
    demand: hex => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexBiodiversityProxy(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'biodiversity_score',
    attractors: ['Green coverage / biodiversity', 'Walkability'],
    repellers: []
  },

  // ===========================================================================================
  // Smart / Operations
  // ===========================================================================================
  {
    type: 'smartMonitoring',
    name: 'Smart Monitoring Point',
    category: 'Smart / Operations',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'safety',
    primaryUsersFallback: ['Operations / security staff'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * computeHexBarrierSeverityScore(hex) + 0.6 * nlp),
    suitability: pointAmenitySuitability,
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Safety concern density', 'Path intersections'],
    repellers: []
  },
  {
    type: 'digitalExperience',
    name: 'Interactive / Digital Experience Zone',
    category: 'Smart / Operations',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: null,
    primaryUsersFallback: ['Children', 'Teenagers', 'Families'],
    demand: hex => clamp100(0.5 * hexYouthDemandScore(hex) + 0.5 * hexCommunityDiversityScore(hex)),
    suitability: pointAmenitySuitability,
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 25)),
    avoided: NO_AVOID,
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Youth demand', 'Foot traffic'],
    repellers: []
  },
  {
    type: 'efficientLighting',
    name: 'Efficient Lighting Zone',
    category: 'Smart / Operations',
    geometryType: 'network',
    scale: 'route',
    programKeys: [],
    nlpCategory: 'lighting',
    primaryUsersFallback: ['All visitors', 'Evening users'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.6 * nlp),
    suitability: hex => normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 15000)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) < 1000 ? 'Under 1,000 m/km² real path density -- no existing circulation to light.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Existing path network', 'Evening safety demand'],
    repellers: ['Sparse path network']
  },
  {
    type: 'safetyPoint',
    name: 'Safety / Security Point',
    category: 'Smart / Operations',
    geometryType: 'point',
    scale: 'node',
    programKeys: [],
    nlpCategory: 'safety',
    primaryUsersFallback: ['All visitors', 'Operations / security staff'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * computeHexBarrierSeverityScore(hex) + 0.6 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * computeHexTransitAccessibilityScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Safety concern density', 'Path intersections / visibility'],
    repellers: []
  },
  {
    type: 'operationsArea',
    name: 'Operations / Maintenance Area',
    category: 'Smart / Operations',
    geometryType: 'area',
    scale: 'zone',
    programKeys: [],
    nlpCategory: 'maintenance',
    primaryUsersFallback: ['Operations / maintenance staff'],
    demand: (hex, ctx, nlp) => clamp100(50 + 0.5 * nlp),
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * boundaryRatio(hex) * 100),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- operations area needs a boundary/service connection.' : hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Boundary/edge location', 'Service access', 'Available land'],
    repellers: ['Full interior cell']
  }
];

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

export const OPPORTUNITY_CATEGORIES: OpportunityCategory[] = [
  'Arrival / Access', 'Movement', 'Play', 'Sports / Wellness', 'Community / Social',
  'Landscape / Environment', 'Comfort / Amenities', 'Smart / Operations'
];

export function opportunityDefsByCategory(category: OpportunityCategory): { type: OpportunityType; name: string }[] {
  return OPPORTUNITY_DEFS.filter(d => d.category === category).map(d => ({ type: d.type, name: d.name }));
}

function priorityFromScore(score: number): OpportunityPriority {
  if (score >= 75) return 'Critical';
  if (score >= 55) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

function averageProgramArea(defs: ProgramDef[]): RecommendedArea | null {
  if (defs.length === 0) return null;
  const minimum = Math.round(defs.reduce((s, d) => s + d.minAreaM2, 0) / defs.length);
  const target = Math.round(defs.reduce((s, d) => s + d.targetAreaM2, 0) / defs.length);
  const maximum = Math.round(defs.reduce((s, d) => s + d.maxAreaM2, 0) / defs.length);
  if (minimum === 0 && target === 0 && maximum === 0) return null;
  return { minimum, target, maximum };
}

function collectAdjacency(defs: ProgramDef[], key: 'preferredAdjacencies' | 'avoidAdjacencies'): string[] {
  const set = new Set<string>();
  defs.forEach(d => d[key].forEach(a => set.add(a)));
  return [...set];
}

export function computeOpportunity(
  type: OpportunityType,
  allHexes: H3Feature[],
  reviews: NLPAnalyzedReview[],
  roadStats: RoadStats | null
): OpportunityResult {
  // Restricted to the park's own cells -- see filterParkSiteHexes(). NLP redistribution and
  // population-weighted aggregates below are computed only across this set, so a review-topic
  // rate or population share is a share OF THE PARK SITE, not diluted across the full 5km grid.
  const hexes = filterParkSiteHexes(allHexes);
  const def = OPPORTUNITY_DEFS.find(d => d.type === type)!;
  const ctx: EngineContext = {
    avgRoadWidthM: computeAvgRoadWidthM(roadStats),
    totalPopulation: hexes.reduce((s, h) => s + (h.properties.population || 0), 0)
  };

  const nlpByHex = def.nlpCategory ? computeHexReviewOpportunity(hexes, def.nlpCategory, reviews) : null;
  const nlpMap = new Map((nlpByHex || []).map(r => [r.h3Id, r.reviewOpportunityScore]));

  const cellScores: OpportunityCellScore[] = hexes.map(hex => {
    const nlp = nlpMap.get(hex.properties.h3_id) ?? 0;
    const avoidReason = def.avoided(hex, ctx);
    const demandScore = clamp100(def.demand(hex, ctx, nlp));
    const suitabilityScore = clamp100(def.suitability(hex, ctx));
    const feasibilityScore = avoidReason ? 0 : clamp100(def.feasibility(hex, ctx));
    const opportunityScore = clamp100(demandScore * 0.4 + suitabilityScore * 0.35 + feasibilityScore * 0.25);
    return { h3Id: hex.properties.h3_id, opportunityScore, demandScore, suitabilityScore, feasibilityScore, avoided: !!avoidReason };
  });

  const eligible = cellScores.filter(c => !c.avoided);
  // Weighted by population *among eligible cells only* -- weighting by total site-wide population
  // (including hexes excluded by a hard constraint) would silently crush every aggregate score
  // whenever a constraint excludes a large population share, which misrepresents the eligible
  // area's real characteristics rather than reflecting them.
  const eligiblePop = hexes.reduce((s, hex, i) => (cellScores[i].avoided ? s : s + (hex.properties.population || 0)), 0);
  const popWeightedAvg = (field: 'demandScore' | 'suitabilityScore' | 'feasibilityScore' | 'opportunityScore') => {
    if (eligible.length === 0) return 0;
    if (eligiblePop <= 1) return Math.round(eligible.reduce((s, c) => s + c[field], 0) / eligible.length);
    const sum = hexes.reduce((s, hex, i) => {
      const c = cellScores[i];
      if (c.avoided) return s;
      return s + c[field] * (hex.properties.population || 0);
    }, 0);
    return Math.round(sum / eligiblePop);
  };

  const demandScore = popWeightedAvg('demandScore');
  const suitabilityScore = popWeightedAvg('suitabilityScore');
  const feasibilityScore = popWeightedAvg('feasibilityScore');
  const opportunityScore = clamp100(demandScore * 0.4 + suitabilityScore * 0.35 + feasibilityScore * 0.25);

  const issueRow = def.nlpCategory ? computeIssueImpact(reviews).find(r => r.category === def.nlpCategory) : undefined;
  const reviewMentions = issueRow?.mentions ?? 0;
  const confidenceScore = clamp100(
    45 +
    (hexes.length > 0 ? 15 : 0) +
    (roadStats ? 10 : 0) +
    Math.min(20, reviewMentions * 2) +
    (eligible.length > hexes.length * 0.3 ? 10 : 0)
  );

  const programDefs = def.programKeys.map(k => PROGRAM_DEFS.find(p => p.key === k)).filter((p): p is ProgramDef => !!p);
  const primaryUsers = programDefs.length > 0 ? [...new Set(programDefs.flatMap(p => p.primaryUsers))] : def.primaryUsersFallback;
  const adjacencyNeeds = programDefs.length > 0 ? collectAdjacency(programDefs, 'preferredAdjacencies') : [];
  const avoidAdjacency = programDefs.length > 0 ? collectAdjacency(programDefs, 'avoidAdjacencies') : [];
  const recommendedAreaM2 = def.geometryType === 'area' ? averageProgramArea(programDefs) : null;

  const evidence: string[] = [];
  evidence.push(`Population-weighted demand score: ${demandScore}/100 across ${hexes.length} H3 cells.`);
  if (def.nlpCategory) {
    evidence.push(
      reviewMentions > 0
        ? `${reviewMentions} review mention(s) of "${def.nlpCategory}" (${Math.round((issueRow?.negativeSentimentShare ?? 0) * 100)}% negative sentiment) -- population-weighted REDISTRIBUTION across cells, not measured per-cell review activity.`
        : `No review mentions found for "${def.nlpCategory}" in this run -- demand here is population-driven only.`
    );
  } else {
    evidence.push('No review category applies to this program type -- demand is population/site-signal driven only.');
  }
  if (def.nlpCategoryNote) evidence.push(def.nlpCategoryNote);
  evidence.push(`Site suitability score: ${suitabilityScore}/100 (heat, safety, walkability, and site-condition factors -- see Score Breakdown).`);
  evidence.push(`${eligible.length} of ${hexes.length} cells pass hard constraints; feasibility score: ${feasibilityScore}/100 among eligible cells.`);

  // The distinct set of avoid-condition messages actually triggered anywhere in this run.
  const triggeredAvoidReasons = new Set<string>();
  hexes.forEach(hex => {
    const reason = def.avoided(hex, ctx);
    if (reason) triggeredAvoidReasons.add(reason);
  });
  const finalAvoidConditions = [...triggeredAvoidReasons];

  const topCells = [...cellScores].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 15);

  return {
    type,
    name: def.name,
    category: def.category,
    geometryType: def.geometryType,
    scale: def.scale,
    opportunityScore,
    demandScore,
    suitabilityScore,
    feasibilityScore,
    confidenceScore,
    priority: priorityFromScore(opportunityScore),
    recommendedAreaM2,
    primaryUsers,
    evidence,
    adjacencyNeeds,
    avoidConditions: finalAvoidConditions.length > 0 ? finalAvoidConditions : ['No hard constraints triggered for this opportunity in this run.'],
    grasshopperInputs: {
      suitabilityField: def.suitabilityField,
      attractors: def.attractors,
      repellers: def.repellers,
      constraints: finalAvoidConditions,
      recommendedAreaM2,
      adjacencyRules: { preferred: adjacencyNeeds, avoid: avoidAdjacency },
      geometryType: def.geometryType,
      scale: def.scale
    },
    topCells,
    allCells: cellScores
  };
}

export function computeAllOpportunities(hexes: H3Feature[], reviews: NLPAnalyzedReview[], roadStats: RoadStats | null): OpportunityResult[] {
  return OPPORTUNITY_DEFS
    .map(def => computeOpportunity(def.type, hexes, reviews, roadStats))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}
