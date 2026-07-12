/**
 * Unified Opportunity Analysis (v1) -- combines the existing Population, Urban, Accessibility,
 * Environmental, Community, and NLP Spatial engines into a single decision layer answering:
 * what intervention, where, why, and how it feeds Grasshopper later. Deliberately does NOT
 * introduce a new independent scoring system -- every input below is a direct call into an
 * existing, already-reviewed hex-level function (or the existing PROGRAM_DEFS catalogue for
 * area/adjacency/user data). Deterministic and local: no network calls, no backend tables.
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
  computeHexWalkabilityScore, computeHexParkAccessScore, computeHexBarrierSeverityScore
} from './accessibilityEngine';
import {
  hexHeatExposureProxy, hexVoidRatioPct, hexBiodiversityProxy, hexTreePlantingSuitability,
  computeAvgRoadWidthM
} from './environmentalEngine';
import {
  hexFamilyDemandScore, hexYouthDemandScore, hexOlderAdultDemandScore, hexFacilityAccessScore,
  hexCommunityDiversityScore, hexGreenSpaceDeficitScore, PROGRAM_DEFS, type ProgramDef
} from './communityEngine';
import { computeHexReviewOpportunity } from './reviewNlpSpatialEngine';
import { computeIssueImpact } from '../analytics/issueMatrix';

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpportunityType =
  | 'treePlanting' | 'inclusivePlayground' | 'cafeKiosk' | 'drinkingWater' | 'sportsFitness'
  | 'quietGarden' | 'plazaEventLawn' | 'entrances' | 'joggingLoop' | 'shadedSeating';

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
}

export interface OpportunityResult {
  type: OpportunityType;
  name: string;
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
  topCells: OpportunityCellScore[];
}

interface EngineContext {
  avgRoadWidthM: number;
  totalPopulation: number;
}

// ---------------------------------------------------------------------------
// Per-hex demand / suitability / feasibility / avoid functions, one row per opportunity type.
// Every function calls straight into an existing engine -- see file header.
// ---------------------------------------------------------------------------

interface OpportunityDef {
  type: OpportunityType;
  name: string;
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
  {
    type: 'treePlanting',
    name: 'Tree Planting',
    programKeys: [],
    nlpCategory: 'landscape / greenery',
    primaryUsersFallback: ['All visitors', 'Pedestrians'],
    demand: (hex, ctx, nlp) => clamp100(0.4 * hexGreenSpaceDeficitScore(hex) + 0.3 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.3 * nlp),
    suitability: (hex, ctx) => hexTreePlantingSuitability(hex, ctx.avgRoadWidthM),
    feasibility: (hex) => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 8 ? 'Less than 8% void ratio -- effectively no unbuilt land in this cell.' : null),
    suitabilityField: 'tree_planting_suitability',
    attractors: ['Heat exposure', 'Green-space deficit', 'Available land (void ratio)'],
    repellers: ['High building coverage', 'Already-high green coverage']
  },
  {
    type: 'inclusivePlayground',
    name: 'Inclusive Playground',
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
    type: 'cafeKiosk',
    name: 'Cafe / Kiosk',
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
    type: 'drinkingWater',
    name: 'Drinking Water',
    programKeys: ['drinkingFountains'],
    nlpCategory: 'water features',
    primaryUsersFallback: ['All visitors'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * normalize(hex.properties.pop_density_km2 || 0, 20000) + 0.5 * nlp),
    suitability: hex => computeHexWalkabilityScore(hex),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 20)),
    avoided: () => null,
    suitabilityField: 'water_score',
    attractors: ['Pedestrian path density', 'Population density'],
    repellers: []
  },
  {
    type: 'sportsFitness',
    name: 'Sports / Fitness',
    programKeys: ['sportsCourt', 'outdoorFitness'],
    nlpCategory: 'sports facilities',
    primaryUsersFallback: ['Teenagers', 'Young adults', 'Joggers'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexYouthDemandScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM)) + 0.5 * computeHexWalkabilityScore(hex)),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 60)),
    avoided: hex => (hexVoidRatioPct(hex) < 15 ? 'Less than 15% void ratio -- insufficient contiguous land for a court/fitness area.' : null),
    suitabilityField: 'jogging_route_suitability',
    attractors: ['Youth demand', 'Available land', 'Low heat exposure'],
    repellers: ['High heat exposure', 'Low void ratio']
  },
  {
    type: 'quietGarden',
    name: 'Quiet Garden',
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
    type: 'plazaEventLawn',
    name: 'Plaza / Event Lawn',
    programKeys: ['communityPlaza', 'eventLawn'],
    nlpCategory: 'crowding',
    nlpCategoryNote: 'No review category maps directly to "plaza / event lawn" -- crowding complaints are used as a proxy for unmet demand for open gathering space.',
    primaryUsersFallback: ['Families', 'Weekend social groups'],
    demand: (hex, ctx, nlp) => clamp100(0.6 * hexCommunityDiversityScore(hex) + 0.4 * nlp),
    suitability: (hex, ctx) => clamp100(0.5 * computeHexWalkabilityScore(hex) + 0.5 * (100 - hexHeatExposureProxy(hex, ctx.avgRoadWidthM))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 70)),
    avoided: hex => (hexVoidRatioPct(hex) < 20 ? 'Less than 20% void ratio -- insufficient contiguous open land for a plaza or event lawn.' : null),
    suitabilityField: 'plaza_environmental_suitability',
    attractors: ['Walkability / accessibility', 'Community diversity', 'Available contiguous land'],
    repellers: ['High heat exposure', 'Low void ratio']
  },
  {
    type: 'entrances',
    name: 'Entrances',
    programKeys: [],
    nlpCategory: 'accessibility',
    primaryUsersFallback: ['All visitors', 'Nearby residents'],
    demand: hex => clamp100(0.5 * computeHexDemandScore(hex) + 0.5 * (100 - computeHexParkAccessScore(hex))),
    suitability: hex => clamp100(0.4 * computeHexWalkabilityScore(hex) + 0.3 * (100 - computeHexBarrierSeverityScore(hex)) + 0.3 * normalize(hex.properties.real_road_density_m_per_km2 || 0, 40000)),
    feasibility: hex => {
      const areaM2 = hex.properties.hex_area_m2 || 1;
      const parkShare = (hex.properties.park_area_m2 || 0) / areaM2;
      return parkShare > 0 && parkShare < 0.7 ? 100 : 30;
    },
    avoided: hex => {
      const areaM2 = hex.properties.hex_area_m2 || 1;
      const parkShare = (hex.properties.park_area_m2 || 0) / areaM2;
      if (parkShare === 0) return 'No park area in this cell -- not park-adjacent.';
      if (parkShare >= 0.95) return 'Deep interior of the park (95%+ park-area share) -- not a boundary cell.';
      return null;
    },
    suitabilityField: 'environmental_constraint_score',
    attractors: ['Population demand', 'Currently underserved by the single known entrance', 'Street connectivity'],
    repellers: ['High barrier severity', 'Deep park interior (not a boundary cell)']
  },
  {
    type: 'joggingLoop',
    name: 'Jogging Loop',
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
    type: 'shadedSeating',
    name: 'Shaded Seating',
    programKeys: ['familySeating'],
    nlpCategory: 'shade / heat comfort',
    primaryUsersFallback: ['Families', 'Older adults', 'Caregivers'],
    demand: (hex, ctx, nlp) => clamp100(0.5 * hexHeatExposureProxy(hex, ctx.avgRoadWidthM) + 0.5 * nlp),
    suitability: hex => clamp100(0.6 * computeHexWalkabilityScore(hex) + 0.4 * (100 - normalize(hex.properties.building_coverage_pct || 0, 80))),
    feasibility: hex => clamp100(normalize(hexVoidRatioPct(hex), 20)),
    avoided: hex => (hexVoidRatioPct(hex) < 5 ? 'Less than 5% void ratio.' : null),
    suitabilityField: 'shade_score',
    attractors: ['Heat exposure (where relief is most needed)', 'Path proximity'],
    repellers: ['High building coverage']
  }
];

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

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
  hexes: H3Feature[],
  reviews: NLPAnalyzedReview[],
  roadStats: RoadStats | null
): OpportunityResult {
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
  const recommendedAreaM2 = averageProgramArea(programDefs);

  const evidence: string[] = [];
  evidence.push(`Population-weighted demand score: ${demandScore}/100 across ${hexes.length} H3 cells.`);
  if (def.nlpCategory) {
    evidence.push(
      reviewMentions > 0
        ? `${reviewMentions} review mention(s) of "${def.nlpCategory}" (${Math.round((issueRow?.negativeSentimentShare ?? 0) * 100)}% negative sentiment) -- population-weighted REDISTRIBUTION across cells, not measured per-cell review activity.`
        : `No review mentions found for "${def.nlpCategory}" in this run -- demand here is population-driven only.`
    );
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
      adjacencyRules: { preferred: adjacencyNeeds, avoid: avoidAdjacency }
    },
    topCells
  };
}

export function computeAllOpportunities(hexes: H3Feature[], reviews: NLPAnalyzedReview[], roadStats: RoadStats | null): OpportunityResult[] {
  return OPPORTUNITY_DEFS
    .map(def => computeOpportunity(def.type, hexes, reviews, roadStats))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}
