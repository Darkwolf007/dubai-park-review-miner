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
  | 'walkingPromenade' | 'joggingLoop' | 'exerciseCyclingLoop' | 'shadedCirculation' | 'serviceAccess'
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

/** Where a program's inclusion/weighting is actually justified from. Multiple tags per program are
 * normal (e.g. brief-required AND review-driven). Never presented as a single authoritative source --
 * see evidence[] and the metric methodology registry for the full disclosure per tag. */
export type EvidenceSource =
  | 'brief-required' | 'brief-optional' | 'review-driven' | 'population-driven' | 'community-driven'
  | 'accessibility-driven' | 'environment-driven' | 'movement-driven' | 'operations-driven'
  | 'user-experience-driven' | 'designer-assumption';

export interface OpportunityCellScore {
  h3Id: string;
  opportunityScore: number;
  demandScore: number;
  suitabilityScore: number;
  feasibilityScore: number;
  avoided: boolean;
  /** Why avoided() returned non-null for this cell, or null if not avoided/constrained. */
  avoidReason: string | null;
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
  adjacencyRules: { preferred: string[]; avoid: string[]; service: string[]; movement: string[] };
  geometryType: GeometryType;
  scale: Scale;
}

export interface OpportunityResult {
  type: OpportunityType;
  name: string;
  category: OpportunityCategory;
  geometryType: GeometryType;
  scale: Scale;
  source: EvidenceSource[];
  opportunityScore: number;
  demandScore: number;
  suitabilityScore: number;
  feasibilityScore: number;
  confidenceScore: number;
  /** 0-100 completeness of the Grasshopper-facing data for this program (attractors, repellers,
   * adjacency, recommended area each contribute 25) -- a data-readiness signal, not a design score. */
  grasshopperReadinessScore: number;
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
  /** Evidence tags for this program's inclusion/weighting -- see EvidenceSource. Every program is
   * drawn from the AI Park Scope of Work, so all carry brief-required or brief-optional plus
   * whichever real signal sources actually feed its demand/suitability formulas below. */
  source: EvidenceSource[];
  demand: (hex: H3Feature, ctx: EngineContext, nlpOpportunity: number) => number;
  suitability: (hex: H3Feature, ctx: EngineContext) => number;
  feasibility: (hex: H3Feature, ctx: EngineContext) => number;
  avoided: (hex: H3Feature, ctx: EngineContext) => string | null;
  suitabilityField: string;
  attractors: string[];
  repellers: string[];
  /** Adjacency authored directly against OpportunityType, independent of the older PROGRAM_DEFS
   * catalogue (communityEngine.ts) -- this is what the full program network graph renders. */
  adjacencyPreferred: OpportunityType[];
  adjacencyAvoid: OpportunityType[];
  adjacencyService?: OpportunityType[];
  adjacencyMovement?: OpportunityType[];
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
    source: ['brief-required', 'accessibility-driven', 'movement-driven'],
    demand: hex => clamp100(0.5 * computeHexDemandScore(hex) + 0.5 * (100 - computeHexParkAccessScore(hex))),
    suitability: hex => clamp100(0.4 * computeHexWalkabilityScore(hex) + 0.3 * (100 - computeHexBarrierSeverityScore(hex)) + 0.3 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)),
    feasibility: hex => (boundaryRatio(hex) < 0.9 ? 100 : 30),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- not a boundary/gateway candidate.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population demand', 'Street connectivity', 'Boundary/edge location'],
    repellers: ['High barrier severity', 'Full interior cell'],
    adjacencyPreferred: ['wayfindingNodes', 'dropOffZone', 'communityPlaza'],
    adjacencyAvoid: ['quietGarden', 'sensoryGarden'],
    adjacencyMovement: ['walkingPromenade', 'accessibleRoutes']
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
    source: ['brief-required', 'accessibility-driven', 'population-driven'],
    demand: hex => clamp100(0.6 * (100 - computeHexParkAccessScore(hex)) + 0.4 * computeHexDemandScore(hex)),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => (boundaryRatio(hex) < 0.9 ? 100 : 20),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- not a boundary candidate.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Underserved population', 'Boundary/edge location'],
    repellers: ['High barrier severity', 'Full interior cell'],
    adjacencyPreferred: ['wayfindingNodes', 'accessibleRoutes'],
    adjacencyAvoid: ['quietGarden'],
    adjacencyMovement: ['walkingPromenade']
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
    source: ['brief-required', 'accessibility-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * (100 - computeHexParkAccessScore(hex)) + 0.5 * nlp),
    suitability: hex => clamp100(0.45 * computeHexWalkabilityScore(hex) + 0.35 * (100 - computeHexBarrierSeverityScore(hex)) + 0.2 * normalize(hexVoidRatioPct(hex), 60)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: NO_AVOID,
    suitabilityField: 'route_directness_ratio',
    attractors: ['Accessibility deficit', 'Low barrier severity', 'Program-space connections'],
    repellers: ['High barrier severity', 'Inaccessible terrain'],
    adjacencyPreferred: ['mainEntrancePlaza', 'secondaryEntrances', 'wayfindingNodes'],
    adjacencyAvoid: [],
    adjacencyMovement: ['walkingPromenade', 'shadedCirculation', 'joggingLoop']
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
    source: ['brief-optional', 'movement-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    // Distinct from other point amenities: favors boundary/edge + road-connected cells (arrival
    // infrastructure), not generic walkability -- keeps it off interior/quiet cells by construction.
    suitability: hex => clamp100(0.5 * boundaryRatio(hex) * 100 + 0.5 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population density', 'Boundary/edge location', 'Road connectivity'],
    repellers: [],
    adjacencyPreferred: ['mainEntrancePlaza', 'secondaryEntrances', 'dropOffZone'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-required', 'movement-driven', 'population-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * computeHexDemandScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => (boundaryRatio(hex) < 0.9 ? 90 : 25),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- not adjacent to the street.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Street connectivity', 'Boundary/edge location'],
    repellers: ['Full interior cell'],
    adjacencyPreferred: ['mainEntrancePlaza', 'bicycleParking'],
    adjacencyAvoid: ['quietGarden', 'sensoryGarden']
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
    source: ['brief-required', 'movement-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexCommunityDiversityScore(hex) + 0.6 * nlp),
    // Distinct from generic point amenities: weighted toward path/route intersections (where
    // wayfinding actually matters), not general walkability + facility access.
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * computeHexWalkabilityScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Path intersections', 'Facility diversity'],
    repellers: [],
    adjacencyPreferred: ['mainEntrancePlaza', 'secondaryEntrances', 'communityPlaza'],
    adjacencyAvoid: [],
    adjacencyMovement: ['walkingPromenade', 'joggingLoop', 'shadedCirculation']
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
    source: ['brief-required', 'movement-driven', 'population-driven'],
    demand: hex => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * (100 - hexCommunityVulnerabilityScore(hex))),
    suitability: (hex, ctx) => clamp100(0.35 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.35 * (100 - computeHexBarrierSeverityScore(hex)) + 0.3 * normalize(hexVoidRatioPct(hex), 60)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: NO_AVOID,
    suitabilityField: 'route_directness_ratio',
    attractors: ['Program-space anchors', 'Low heat exposure', 'Low barrier severity'],
    repellers: ['High heat exposure', 'Program-space conflicts'],
    adjacencyPreferred: ['accessibleRoutes', 'shadedCirculation'],
    adjacencyAvoid: [],
    adjacencyMovement: ['joggingLoop', 'exerciseCyclingLoop', 'accessibleRoutes', 'shadedCirculation', 'mainEntrancePlaza']
  },
  {
    type: 'joggingLoop',
    name: 'Jogging Loop',
    category: 'Movement',
    geometryType: 'linear',
    scale: 'route',
    programKeys: ['joggingLoop'],
    nlpCategory: 'sports facilities',
    nlpCategoryNote: 'No review category maps directly to "jogging loop" -- sports-facilities mentions are used as the closest available proxy.',
    primaryUsersFallback: ['Joggers', 'Residents'],
    source: ['brief-required', 'movement-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    // Distinct from Walking Promenade / Shaded Circulation: a loop needs perimeter/boundary
    // continuity to run a route around the site, not just any path -- weighted toward edge cells
    // instead of green coverage, which is what actually separates "loop" from "promenade" spatially.
    suitability: hex => clamp100(0.55 * boundaryRatio(hex) * 100
      + 0.25 * normalize(hexVoidRatioPct(hex), 60)
      + 0.2 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: NO_AVOID,
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Perimeter/boundary continuity', 'Low barrier severity', 'Outdoor fitness access'],
    repellers: ['Broken loop continuity', 'Program-space conflicts'],
    adjacencyPreferred: ['outdoorFitness', 'walkingPromenade'],
    adjacencyAvoid: [],
    adjacencyMovement: ['walkingPromenade', 'exerciseCyclingLoop', 'shadedCirculation', 'accessibleRoutes']
  },
  {
    type: 'exerciseCyclingLoop',
    name: 'Exercise Cycling Loop',
    category: 'Movement',
    geometryType: 'linear',
    scale: 'route',
    programKeys: [],
    nlpCategory: 'sports facilities',
    nlpCategoryNote: 'Sports-facilities mentions are only a demand proxy. Terrain slope, curvature, width, and mode-sharing feasibility are evaluated later in Rhino from an authoritative mesh and approved requirements.',
    primaryUsersFallback: ['Exercise cyclists', 'Adults', 'Residents'],
    source: ['brief-optional', 'movement-driven', 'designer-assumption'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.4 * nlp),
    // Cycling uses the outermost continuous band. It deliberately weights boundary continuity
    // more heavily than the jogging loop; the two modes must not inherit identical cell rankings.
    suitability: hex => clamp100(0.65 * boundaryRatio(hex) * 100
      + 0.2 * normalize(hexVoidRatioPct(hex), 60)
      + 0.15 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: NO_AVOID,
    suitabilityField: 'exercise_cycling_route_suitability',
    attractors: ['Both public entrances', 'Perimeter continuity', 'Low slope from Rhino terrain mesh'],
    repellers: ['High slope', 'Tight curvature', 'High pedestrian conflict'],
    adjacencyPreferred: ['outdoorFitness', 'walkingPromenade'],
    adjacencyAvoid: ['toddlerPlay', 'quietGarden'],
    adjacencyMovement: ['mainEntrancePlaza', 'secondaryEntrances', 'walkingPromenade', 'joggingLoop']
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
    source: ['brief-required', 'environment-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexHeatExposureProxy(hex, ctx.avgRoadWidthM) + 0.5 * nlp),
    suitability: hex => clamp100(0.4 * normalize(hex.properties.green_coverage_pct || 0, 30) + 0.35 * normalize(hexVoidRatioPct(hex), 60) + 0.25 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: NO_AVOID,
    suitabilityField: 'shade_score',
    attractors: ['Heat exposure', 'Walking-network demand', 'Green coverage'],
    repellers: ['Unshadeable conflicts'],
    adjacencyPreferred: ['treePlanting', 'walkingPromenade'],
    adjacencyAvoid: [],
    adjacencyMovement: ['walkingPromenade', 'joggingLoop', 'exerciseCyclingLoop', 'accessibleRoutes']
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
    source: ['brief-required', 'operations-driven', 'designer-assumption'],
    demand: hex => clamp100(50 + 0.5 * (hex.properties.building_coverage_pct || 0)),
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * boundaryRatio(hex) * 100),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 10000)),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- service access needs a boundary/edge connection.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Boundary/edge location', 'Existing path network'],
    repellers: ['Full interior cell'],
    adjacencyPreferred: ['operationsArea', 'wastePoints'],
    adjacencyAvoid: ['quietGarden', 'communityPlaza', 'sensoryGarden'],
    adjacencyService: ['operationsArea']
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
    source: ['brief-required', 'population-driven', 'review-driven', 'community-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexFamilyDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.3 * computeHexWalkabilityScore(hex) + 0.3 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio -- insufficient open land for play equipment.' : null),
    suitabilityField: 'playground_environmental_suitability',
    attractors: ['Family demand', 'Shade availability', 'Low barrier exposure'],
    repellers: ['High heat exposure', 'High barrier severity (major roads)'],
    adjacencyPreferred: ['familySeatingPlay', 'restrooms', 'drinkingWater', 'shadedSeating'],
    adjacencyAvoid: ['serviceAccess', 'sportsCourt', 'operationsArea']
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
    source: ['brief-required', 'population-driven', 'community-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.7 * hexFamilyDemandScore(hex) + 0.3 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * (100 - computeHexBarrierSeverityScore(hex))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio -- insufficient enclosed open land.' : null),
    suitabilityField: 'playground_environmental_suitability',
    attractors: ['Family demand', 'Shade availability', 'Low barrier exposure'],
    repellers: ['High heat exposure', 'High barrier severity'],
    adjacencyPreferred: ['inclusivePlayground', 'familySeatingPlay'],
    adjacencyAvoid: ['sportsCourt', 'serviceAccess']
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
    source: ['brief-required', 'population-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * computeHexWalkabilityScore(hex) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.3 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 50)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio -- insufficient open land.' : null),
    suitabilityField: 'playground_environmental_suitability',
    attractors: ['Youth demand', 'Walkability', 'Green coverage'],
    repellers: ['High heat exposure'],
    adjacencyPreferred: ['inclusivePlayground', 'sportsCourt'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-optional', 'environment-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexFamilyDemandScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * hexBiodiversityProxy(hex) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Existing greenery/biodiversity', 'Family demand'],
    repellers: ['Low green coverage'],
    adjacencyPreferred: ['biodiversityHabitat', 'treePlanting'],
    adjacencyAvoid: ['sportsCourt']
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
    source: ['brief-required', 'community-driven', 'user-experience-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexFamilyDemandScore(hex) + 0.4 * nlp),
    // Weighted more toward comfort (heat relief) than general walkability -- distinct from Shaded
    // Seating, which is weighted toward walkability + building shade, not family demand.
    suitability: (hex, ctx) => clamp100(0.6 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.4 * computeHexWalkabilityScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'shade_score',
    attractors: ['Family demand', 'Shade availability', 'Path proximity'],
    repellers: ['High heat exposure'],
    adjacencyPreferred: ['inclusivePlayground', 'toddlerPlay'],
    adjacencyAvoid: ['sportsCourt']
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
    source: ['brief-required', 'population-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * computeHexWalkabilityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Youth demand', 'Low heat exposure', 'Walkability'],
    repellers: ['High heat exposure'],
    adjacencyPreferred: ['joggingLoop', 'sportsCourt'],
    adjacencyAvoid: ['quietGarden', 'sensoryGarden']
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
    source: ['brief-optional', 'population-driven', 'community-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexYouthDemandScore(hex) + 0.5 * nlp),
    // Weighted toward accessibility over raw open land -- distinct from Sports Court, which
    // prioritizes contiguous void ratio over walkability (a dedicated court vs. general flex space).
    suitability: hex => clamp100(0.6 * computeHexWalkabilityScore(hex) + 0.4 * hexVoidRatioPct(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 55)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient flexible open land.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Available flexible land', 'Walkability'],
    repellers: ['Low void ratio'],
    adjacencyPreferred: ['sportsCourt', 'multipurposeLawn'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-required', 'population-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    // Weighted toward contiguous open land over walkability -- a fixed-footprint court needs the
    // land more than it needs path proximity, distinct from Flexible Recreation above.
    suitability: hex => clamp100(0.65 * hexVoidRatioPct(hex) + 0.35 * computeHexWalkabilityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient contiguous land for a court.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Youth demand', 'Available land'],
    repellers: ['Low void ratio'],
    adjacencyPreferred: ['outdoorFitness', 'flexibleRecreation'],
    adjacencyAvoid: ['quietGarden', 'wellnessZone', 'sensoryGarden']
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
    source: ['brief-optional', 'community-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 70)),
    avoided: hex => (hexVoidRatioPct(hex) < 20 ? 'Less than 20% void ratio -- insufficient contiguous open land for a lawn.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Available contiguous land', 'Green coverage'],
    repellers: ['High heat exposure', 'Low void ratio'],
    adjacencyPreferred: ['flexibleEventLawn', 'communityPlaza'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-required', 'population-driven', 'environment-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexOlderAdultDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 30)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio.' : null),
    suitabilityField: 'quiet_garden_suitability',
    attractors: ['Older-adult demand', 'Low heat exposure', 'Low traffic noise'],
    repellers: ['High heat exposure', 'High road density'],
    adjacencyPreferred: ['quietGarden', 'sensoryGarden'],
    adjacencyAvoid: ['sportsCourt', 'flexibleRecreation']
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
    source: ['brief-required', 'community-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexCommunityDiversityScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient contiguous open land for a plaza.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability / accessibility', 'Community diversity'],
    repellers: ['High heat exposure', 'Low void ratio'],
    adjacencyPreferred: ['cafeKiosk', 'mainEntrancePlaza', 'flexibleEventLawn'],
    adjacencyAvoid: ['quietGarden', 'sensoryGarden']
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
    source: ['brief-optional', 'community-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 70)),
    avoided: hex => (hexVoidRatioPct(hex) < 20 ? 'Less than 20% void ratio -- insufficient contiguous open land for an event lawn.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability / accessibility', 'Available contiguous land'],
    repellers: ['High heat exposure', 'Low void ratio'],
    adjacencyPreferred: ['communityPlaza', 'multipurposeLawn'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-required', 'community-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexFamilyDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'shade_score',
    attractors: ['Family demand', 'Shade availability', 'Green coverage'],
    repellers: ['High heat exposure'],
    adjacencyPreferred: ['restrooms', 'drinkingWater', 'shadedSeating'],
    adjacencyAvoid: ['sportsCourt']
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
    source: ['brief-optional', 'community-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    // Distinct from other point amenities: weighted toward available open space (void ratio) rather
    // than road-density-driven walkability, so it doesn't converge on the same cells as the
    // route/entrance-oriented Smart/Operations point types.
    suitability: hex => clamp100(0.55 * hexVoidRatioPct(hex) + 0.45 * computeHexWalkabilityScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Foot traffic / walkability', 'Available open space'],
    repellers: [],
    adjacencyPreferred: ['communityPlaza', 'cafeKiosk'],
    adjacencyAvoid: []
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
    source: ['brief-optional', 'community-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexVoidRatioPct(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 35)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability', 'Available land'],
    repellers: [],
    adjacencyPreferred: ['communityPlaza'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-required', 'environment-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexGreenSpaceDeficitScore(hex) + 0.3 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.3 * nlp),
    suitability: (hex, ctx) => hexTreePlantingSuitability(hex, ctx.avgRoadWidthM),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio -- effectively no unbuilt land in this cell.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Heat exposure', 'Green-space deficit', 'Available land (void ratio)'],
    repellers: ['High building coverage', 'Already-high green coverage'],
    adjacencyPreferred: ['nativePlanting', 'biodiversityHabitat'],
    adjacencyAvoid: []
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
    source: ['brief-optional', 'environment-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexGreenSpaceDeficitScore(hex) + 0.6 * nlp),
    suitability: hex => clamp100(0.6 * hexBiodiversityProxy(hex) + 0.4 * hexVoidRatioPct(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 50)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Green-space deficit', 'Available land', 'Existing biodiversity'],
    repellers: ['High building coverage'],
    adjacencyPreferred: ['treePlanting', 'biodiversityHabitat'],
    adjacencyAvoid: []
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
    source: ['brief-optional', 'environment-driven', 'designer-assumption'],
    demand: hex => clamp100(0.5 * (100 - hexBiodiversityProxy(hex)) + 0.5 * hexGreenSpaceDeficitScore(hex)),
    suitability: hex => clamp100(0.5 * hexBiodiversityProxy(hex) + 0.5 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 50)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) > 40000 ? 'Road density exceeds 40,000 m/km² -- too disturbed for habitat value.' : hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'biodiversity_score',
    attractors: ['Existing biodiversity', 'Low disturbance', 'Available land'],
    repellers: ['High road density', 'Low void ratio'],
    adjacencyPreferred: ['nativePlanting', 'quietGarden'],
    adjacencyAvoid: ['sportsCourt']
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
    source: ['brief-required', 'accessibility-driven', 'user-experience-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexFamilyDemandScore(hex) + 0.5 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)) + 0.3 * hexBiodiversityProxy(hex) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 35)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio.' : null),
    suitabilityField: 'quiet_garden_suitability',
    attractors: ['Low traffic noise', 'Existing biodiversity', 'Accessibility demand'],
    repellers: ['High road density', 'High heat exposure'],
    adjacencyPreferred: ['quietGarden', 'wellnessZone'],
    adjacencyAvoid: ['sportsCourt', 'cafeKiosk']
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
    source: ['brief-required', 'environment-driven', 'user-experience-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexOlderAdultDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.4 * (100 - normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)) + 0.3 * hexBiodiversityProxy(hex) + 0.3 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) > 30000 ? 'Road density exceeds 30,000 m/km² -- too much traffic noise for a quiet garden.' : hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'quiet_garden_suitability',
    attractors: ['Low traffic noise', 'Existing biodiversity', 'Low heat exposure'],
    repellers: ['High road density', 'High heat exposure'],
    adjacencyPreferred: ['sensoryGarden', 'wellnessZone', 'viewingPoints'],
    adjacencyAvoid: ['sportsCourt', 'communityPlaza', 'flexibleEventLawn', 'cafeKiosk', 'smallEventZone']
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
    source: ['brief-required', 'environment-driven'],
    demand: hex => clamp100(0.5 * normalize(hex.properties.building_coverage_pct || 0, 80) + 0.5 * hexGreenSpaceDeficitScore(hex)),
    suitability: (hex, ctx) => hexWaterSensitiveSuitability(hex, ctx.avgRoadWidthM),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'water_score',
    attractors: ['Impervious surface (runoff)', 'Available land'],
    repellers: ['Low void ratio'],
    adjacencyPreferred: ['treePlanting', 'nativePlanting'],
    adjacencyAvoid: ['communityPlaza', 'flexibleEventLawn']
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
    source: ['brief-required', 'operations-driven', 'environment-driven'],
    demand: hex => clamp100(normalize(hex.properties.green_coverage_pct || 0, 30)),
    suitability: hex => clamp100(normalize(hex.properties.green_coverage_pct || 0, 30)),
    feasibility: () => 100,
    avoided: NO_AVOID,
    suitabilityField: 'green_coverage_pct',
    attractors: ['Existing green/irrigated coverage'],
    repellers: [],
    adjacencyPreferred: ['treePlanting', 'bioswale'],
    adjacencyAvoid: [],
    adjacencyService: ['operationsArea']
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
    source: ['brief-required', 'environment-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexHeatExposureProxy(hex, ctx.avgRoadWidthM) + 0.5 * nlp),
    suitability: hex => clamp100(0.6 * computeHexWalkabilityScore(hex) + 0.4 * (100 - normalize(hex.properties.building_coverage_pct || 0, 80))),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'shade_score',
    attractors: ['Heat exposure (where relief is most needed)', 'Path proximity'],
    repellers: ['High building coverage'],
    adjacencyPreferred: ['inclusivePlayground', 'picnicArea', 'walkingPromenade'],
    adjacencyAvoid: []
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
    source: ['brief-required', 'population-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    // Weighted toward developed/active-use cells (building presence dominant), not generic
    // walkability -- restrooms belong near where people already gather (play/sports/plaza), and the
    // Phase A spatial-conflict pass keeps them off the quiet-garden core specifically. Building
    // coverage is real per-site-grid-cell data (unlike facility access, which this dataset only has
    // at the single-parent-hex resolution), so it's the dominant term rather than a tie-breaker.
    suitability: hex => clamp100(0.5 * normalize(hex.properties.building_coverage_pct || 0, 40) + 0.35 * computeHexWalkabilityScore(hex) + 0.15 * hexFacilityAccessScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population density', 'Facility access', 'Proximity to active-use nodes'],
    repellers: ['Quiet-garden-like conditions'],
    adjacencyPreferred: ['inclusivePlayground', 'sportsCourt', 'communityPlaza', 'picnicArea'],
    adjacencyAvoid: ['quietGarden', 'sensoryGarden']
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
    source: ['brief-required', 'population-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    // Distinct from Restrooms: blends population density directly into suitability (a purely
    // hydration-driven node, not tied to a "developed cell" proxy the way restrooms are).
    suitability: hex => clamp100(0.4 * computeHexWalkabilityScore(hex) + 0.3 * hexFacilityAccessScore(hex) + 0.3 * normalize(hex.properties.pop_density_km2 || 0, 20000)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 20)),
    avoided: NO_AVOID,
    suitabilityField: 'water_score',
    attractors: ['Pedestrian path density', 'Population density'],
    repellers: [],
    adjacencyPreferred: ['inclusivePlayground', 'joggingLoop', 'sportsCourt'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-optional', 'review-driven', 'movement-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * (100 - hexFacilityAccessScore(hex)) + 0.5 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexCommunityDiversityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (hexVoidRatioPct(hex) < 5 ? 'Less than 5% void ratio -- no room for a structure.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Foot traffic / walkability', 'Mixed-use vibrancy', 'Low existing facility access'],
    repellers: ['Quiet / low-footfall cells'],
    adjacencyPreferred: ['communityPlaza', 'mainEntrancePlaza', 'walkingPromenade'],
    adjacencyAvoid: ['quietGarden', 'sensoryGarden']
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
    source: ['brief-required', 'review-driven', 'operations-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.6 * nlp),
    // Distinct from Restrooms/Drinking Fountains: weighted toward facility access + developed-cell
    // presence (food/plaza nodes generate the most waste), not generic walkability.
    suitability: hex => clamp100(0.5 * hexFacilityAccessScore(hex) + 0.5 * normalize(hex.properties.building_coverage_pct || 0, 40)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Facility access', 'Food/plaza proximity'],
    repellers: ['Quiet-garden-like conditions'],
    adjacencyPreferred: ['cafeKiosk', 'picnicArea', 'communityPlaza'],
    adjacencyAvoid: ['quietGarden'],
    adjacencyService: ['operationsArea', 'serviceAccess']
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
    source: ['brief-optional', 'environment-driven', 'user-experience-driven'],
    demand: hex => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * normalize(hex.properties.green_coverage_pct || 0, 30)),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * hexBiodiversityProxy(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'biodiversity_score',
    attractors: ['Green coverage / biodiversity', 'Walkability'],
    repellers: [],
    adjacencyPreferred: ['quietGarden', 'naturePlay'],
    adjacencyAvoid: []
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
    source: ['brief-required', 'operations-driven', 'designer-assumption'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * computeHexBarrierSeverityScore(hex) + 0.6 * nlp),
    // Distinct from Safety Point and Digital Experience Zone: weighted toward route/entrance
    // coverage (road density + boundary proximity), not generic walkability -- a monitoring point
    // belongs at circulation nodes and edges, not interior gathering spaces.
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * boundaryRatio(hex) * 100),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Safety concern density', 'Route/entrance coverage'],
    repellers: [],
    adjacencyPreferred: ['mainEntrancePlaza', 'wayfindingNodes', 'communityPlaza'],
    adjacencyAvoid: []
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
    source: ['brief-optional', 'population-driven', 'designer-assumption'],
    demand: hex => clamp100(0.5 * hexYouthDemandScore(hex) + 0.5 * hexCommunityDiversityScore(hex)),
    // Distinct from other point amenities: weighted toward community diversity (mixed-use vibrancy)
    // instead of facility access, matching its social/gathering-node siting logic.
    suitability: hex => clamp100(0.5 * hexCommunityDiversityScore(hex) + 0.5 * computeHexWalkabilityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 25)),
    avoided: NO_AVOID,
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Youth demand', 'Foot traffic'],
    repellers: [],
    adjacencyPreferred: ['communityPlaza', 'cafeKiosk'],
    adjacencyAvoid: ['quietGarden']
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
    source: ['brief-required', 'operations-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.6 * nlp),
    suitability: hex => normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000),
    feasibility: hex => clamp100(normalize(hex.properties.real_road_density_m_per_km2 || 0, 15000)),
    avoided: hex => ((hex.properties.real_road_density_m_per_km2 || 0) < 1000 ? 'Under 1,000 m/km² real path density -- no existing circulation to light.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Existing path network', 'Evening safety demand'],
    repellers: ['Sparse path network'],
    adjacencyPreferred: ['walkingPromenade', 'joggingLoop', 'mainEntrancePlaza'],
    adjacencyAvoid: [],
    adjacencyMovement: ['walkingPromenade', 'joggingLoop', 'shadedCirculation']
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
    source: ['brief-required', 'operations-driven', 'review-driven'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * computeHexBarrierSeverityScore(hex) + 0.6 * nlp),
    suitability: hex => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * computeHexTransitAccessibilityScore(hex)),
    feasibility: smallFootprintFeasibility,
    avoided: NO_AVOID,
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Safety concern density', 'Path intersections / visibility'],
    repellers: [],
    adjacencyPreferred: ['mainEntrancePlaza', 'wayfindingNodes', 'communityPlaza'],
    adjacencyAvoid: []
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
    source: ['brief-required', 'operations-driven'],
    demand: (hex, ctx, nlp) => clamp100(50 + 0.5 * nlp),
    suitability: hex => clamp100(0.6 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000) + 0.4 * boundaryRatio(hex) * 100),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 40)),
    avoided: hex => (boundaryRatio(hex) >= 0.98 ? 'Full interior cell -- operations area needs a boundary/service connection.' : hexVoidRatioPct(hex) < 10 ? 'Less than 10% void ratio.' : null),
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Boundary/edge location', 'Service access', 'Available land'],
    repellers: ['Full interior cell'],
    adjacencyPreferred: ['serviceAccess', 'wastePoints'],
    adjacencyAvoid: ['quietGarden', 'communityPlaza'],
    adjacencyService: ['serviceAccess']
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

/** Fallback only -- reads the older PROGRAM_DEFS (communityEngine.ts) adjacency union, used solely
 * for a def whose own adjacencyPreferred/adjacencyAvoid (authored directly against OpportunityType,
 * see OPPORTUNITY_DEFS above) is empty. Every def currently declares its own, so this is a safety
 * net, not the primary path. */
function collectLegacyAdjacency(defs: ProgramDef[], key: 'preferredAdjacencies' | 'avoidAdjacencies'): string[] {
  const set = new Set<string>();
  defs.forEach(d => d[key].forEach(a => set.add(a)));
  return [...set];
}

/** Declarative table of program pairs that spatially repel each other beyond what any single
 * per-cell formula can express -- a cell can't know it's "near a quiet garden" without knowing
 * where the quiet garden's best cells actually are. Applied as a bounded, cell-level-only penalty
 * (see applySpatialConflicts) after every program's base scores are computed independently. */
const SPATIAL_CONFLICTS: { attractor: OpportunityType; repelled: OpportunityType[] }[] = [
  { attractor: 'quietGarden', repelled: ['restrooms', 'drinkingWater', 'cafeKiosk', 'smallEventZone', 'sportsCourt', 'wastePoints'] },
  { attractor: 'sensoryGarden', repelled: ['cafeKiosk', 'sportsCourt', 'wastePoints'] },
  { attractor: 'sportsCourt', repelled: ['quietGarden', 'wellnessZone', 'sensoryGarden'] }
];
const CONFLICT_ATTRACTOR_TOP_SHARE = 0.1; // top ~10% of an attractor's own cells define its "core"
const CONFLICT_PENALTY = 25; // bounded suitability penalty applied to a repelled program's cells inside that core

/** Second pass over already-computed results: pushes each repelled program's suitability/opportunity
 * down (bounded, cell-level only) inside the attractor program's own top-suitability core. Never
 * touches the population-weighted headline demand/suitability/opportunity scores shown in the
 * summary tiles -- only the per-cell allCells/topCells that drive the suitability map and top-cells
 * table, so the aggregate numbers stay exactly as rigorously (population-weighted) computed. */
function applySpatialConflicts(results: OpportunityResult[]): OpportunityResult[] {
  const byType = new Map(results.map(r => [r.type, r]));
  const coreByAttractor = new Map<OpportunityType, Set<string>>();
  SPATIAL_CONFLICTS.forEach(({ attractor }) => {
    const attractorResult = byType.get(attractor);
    if (!attractorResult) return;
    const coreCount = Math.max(1, Math.round(attractorResult.allCells.length * CONFLICT_ATTRACTOR_TOP_SHARE));
    const core = [...attractorResult.allCells]
      .filter(c => !c.avoided)
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
      .slice(0, coreCount)
      .map(c => c.h3Id);
    coreByAttractor.set(attractor, new Set(core));
  });

  return results.map(result => {
    const conflictingCores = SPATIAL_CONFLICTS
      .filter(c => c.repelled.includes(result.type))
      .map(c => coreByAttractor.get(c.attractor))
      .filter((s): s is Set<string> => !!s && s.size > 0);
    if (conflictingCores.length === 0) return result;

    const inAnyCore = (h3Id: string) => conflictingCores.some(core => core.has(h3Id));
    let touched = false;
    const adjustedCells = result.allCells.map(c => {
      if (c.avoided || !inAnyCore(c.h3Id)) return c;
      touched = true;
      const suitabilityScore = clamp100(c.suitabilityScore - CONFLICT_PENALTY);
      const opportunityScore = clamp100(c.demandScore * 0.4 + suitabilityScore * 0.35 + c.feasibilityScore * 0.25);
      return { ...c, suitabilityScore, opportunityScore };
    });
    if (!touched) return result;

    const topCells = [...adjustedCells].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 15);
    return { ...result, allCells: adjustedCells, topCells };
  });
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
    return { h3Id: hex.properties.h3_id, opportunityScore, demandScore, suitabilityScore, feasibilityScore, avoided: !!avoidReason, avoidReason };
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
  // Adjacency is authored directly per OpportunityType above; the legacy PROGRAM_DEFS union is only
  // consulted if a def somehow left its own arrays empty (defensive fallback, not the primary path).
  const adjacencyNeeds: string[] = def.adjacencyPreferred.length > 0
    ? def.adjacencyPreferred
    : (programDefs.length > 0 ? collectLegacyAdjacency(programDefs, 'preferredAdjacencies') : []);
  const avoidAdjacency: string[] = def.adjacencyAvoid.length > 0
    ? def.adjacencyAvoid
    : (programDefs.length > 0 ? collectLegacyAdjacency(programDefs, 'avoidAdjacencies') : []);
  const serviceAdjacency: string[] = def.adjacencyService ?? [];
  const movementAdjacency: string[] = def.adjacencyMovement ?? [];
  const recommendedAreaM2 = def.geometryType === 'area' ? averageProgramArea(programDefs) : null;
  const grasshopperReadinessScore = clamp100(
    (def.attractors.length > 0 ? 25 : 0) +
    (def.repellers.length > 0 ? 25 : 0) +
    (adjacencyNeeds.length > 0 || avoidAdjacency.length > 0 ? 25 : 0) +
    (recommendedAreaM2 ? 25 : 0)
  );

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
    source: def.source,
    opportunityScore,
    demandScore,
    suitabilityScore,
    feasibilityScore,
    confidenceScore,
    grasshopperReadinessScore,
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
      adjacencyRules: { preferred: adjacencyNeeds, avoid: avoidAdjacency, service: serviceAdjacency, movement: movementAdjacency },
      geometryType: def.geometryType,
      scale: def.scale
    },
    topCells,
    allCells: cellScores
  };
}

export function computeAllOpportunities(hexes: H3Feature[], reviews: NLPAnalyzedReview[], roadStats: RoadStats | null): OpportunityResult[] {
  const base = OPPORTUNITY_DEFS.map(def => computeOpportunity(def.type, hexes, reviews, roadStats));
  return applySpatialConflicts(base).sort((a, b) => b.opportunityScore - a.opportunityScore);
}
