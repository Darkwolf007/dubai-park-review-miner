import type { ReviewSummary } from '../results/reviewSummary';
import type { GisSummary } from '../results/gisSummary';
import type { AlSafa2ClimateSummary } from '../results/climateData';
import type { AlSafa2CompetitionBrief, AestheticMateriality } from '../results/competitionBrief';

export interface ResultsSynthesisInput {
  reviewSummary: ReviewSummary;
  gisSummary: GisSummary;
  climateSummary: AlSafa2ClimateSummary;
  competitionBrief: AlSafa2CompetitionBrief;
}

export type AgeGroupTier = 'Kids' | 'Teens' | 'Adults' | 'Old';
export type LocationZone = 'INNER_BUFFER' | 'PERIMETER_LOOP' | 'ACTIVE_EDGE' | 'GATEWAY_NODE';
export type PeakUsageWindow = 'MORNING' | 'MIDDAY' | 'EVENING' | 'NIGHT';

export interface ProjectMetadata {
  site_name: string;
  total_site_area_m2: number;
  total_budget_cap_aed: number;
  calculated_total_cost_aed: number;
  budget_status: 'WITHIN_BUDGET' | 'EXCEEDS_BUDGET';
  crs_projection: string;
  synthesis_timestamp: string;
}

export type SpatialScoreBand = 'Low' | 'Medium' | 'High';

export interface ArchetypeExperienceRow {
  tier_1_age_group: AgeGroupTier;
  tier_2_archetype: string;
  tier_3_activities: string[];
  tier_4_desired_experience: string;
  /** Short categorical label for this row's experience (e.g. "Active & Energetic") -- derived
   * deterministically server-side from the assigned opportunity's category, never AI-invented.
   * Exists alongside tier_4_desired_experience's free text specifically so the flow diagram has a
   * clean node to route through between Activities and Space. */
  tier_4_experience_tag: string;
  tier_5_assigned_space: {
    space_id: string;
    space_name: string;
    target_area_m2: number;
    /** The `type` key of the matching entry in gisSummary.opportunities -- the Results matrix
     * assigns real Opportunity Lab spaces rather than inventing space names, so every row is
     * traceable back to the same program catalog Opportunity Lab renders. */
    opportunity_type: string;
  };
  tier_6_spatial_properties_and_scores: {
    preferred_location_zone: LocationZone;
    active_shade_score: number;
    passive_shade_score: number;
    biodiversity_score: number;
    aesthetic_materiality: AestheticMateriality;
    cost_rate_aed_per_m2: number;
    peak_usage_window: PeakUsageWindow;
    /** 1-10. How many distinct archetypes converge on this same space -- computed deterministically
     * server-side (never AI-estimated), never from a single row in isolation. See shared_priority_spaces. */
    overlap_priority_score: number;
    /** 1-10 average of active_shade_score, passive_shade_score, biodiversity_score, and
     * overlap_priority_score -- a single terminal "spatial score" node for the flow diagram. */
    composite_spatial_score: number;
    spatial_score_band: SpatialScoreBand;
  };
}

export interface SharedPrioritySpace {
  space_name: string;
  opportunity_type: string;
  archetypes: string[];
  combined_priority_score: number;
  overlap_note: string;
}

export interface GrasshopperProgramSpace {
  space_id: string;
  space_name: string;
  target_area_m2: number;
  location_zone: LocationZone;
  active_shade_weight: number;
  passive_shade_weight: number;
  attractors: string[];
  repellers: string[];
}

export interface GrasshopperExportManifest {
  units: 'meters';
  projection: string;
  program_spaces: GrasshopperProgramSpace[];
}

export type Season = 'SUMMER' | 'WINTER' | 'SPRING' | 'AUTUMN';
export type JourneyStepRole = 'entry' | 'circulation' | 'primary_activity' | 'amenity';

export interface SpaceGraphNode {
  id: string;
  name: string;
  category: string;
  geometryType: string;
  scale: string;
  scores: {
    opportunityScore: number;
    demandScore: number;
    suitabilityScore: number;
    feasibilityScore: number;
    confidenceScore: number;
    grasshopperReadinessScore: number;
  };
  priority: string;
  recommendedAreaM2: { minimum: number; target: number; maximum: number } | null;
  cost: { aestheticMateriality: AestheticMateriality; costRateAedPerM2: number };
  activeShadeScore: number;
  passiveShadeScore: number;
  biodiversityScore: number;
  primaryUsers: string[];
  evidence: string;
  adjacency: { preferred: string[]; avoid: string[]; service: string[]; movement: string[] };
  /** How many persona_journeys' steps (not just as final destination) pass through this space --
   * "the more a space is crossed, the higher its priority." */
  journeyTraversalCount: number;
  journeyPriorityScore: number;
}

export interface JourneyStep {
  spaceId: string;
  spaceName: string;
  role: JourneyStepRole;
  category: string;
}

export interface Journey {
  journeyId: string;
  label: string;
  destinationSpaceId: string;
  timeOfDay: PeakUsageWindow;
  season: Season;
  seasonContext: string;
  /** Deterministic narrative grounded in real review evidence, the competition brief, and GIS/
   * community context -- never invented prose. */
  story: string;
  steps: JourneyStep[];
}

export interface PersonaJourneyGroup {
  archetypeKey: string;
  archetype: string;
  ageGroup: AgeGroupTier;
  demandScore: number;
  journeys: Journey[];
}

export interface ResultsSynthesisResult {
  project_metadata: ProjectMetadata;
  archetype_experience_matrix: ArchetypeExperienceRow[];
  grasshopper_export_manifest: GrasshopperExportManifest;
  /** Spaces used by 2+ archetypes, ranked by combined_priority_score -- the "multiple story
   * experience" view: where different personas' priorities overlap onto the same real space. */
  shared_priority_spaces: SharedPrioritySpace[];
  /** All 43 Opportunity Lab spaces as graph nodes with full scores/adjacency/cost, plus every
   * archetype's exhaustive set of real user journeys through them. */
  space_graph: SpaceGraphNode[];
  persona_journeys: PersonaJourneyGroup[];
  engine: string;
}

/**
 * POSTs the condensed review/GIS/climate evidence and the competition brief
 * to /api/results-synthesis, which reuses the repo's existing Gemini-with-
 * template-fallback pattern (server.ts) -- Gemini gets real computed evidence
 * and is instructed not to invent numbers; the offline fallback assembles a
 * deterministic matrix from the same evidence.
 */
export async function generateResultsSynthesis(input: ResultsSynthesisInput): Promise<ResultsSynthesisResult> {
  const res = await fetch('/api/results-synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    throw new Error('Results synthesis request failed');
  }
  return res.json();
}
