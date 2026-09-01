import {
  deterministicPackageId,
  PARK_DESIGN_PACKAGE_SCHEMA_VERSION,
  slug,
  type DesignObjective,
  type DuneTypology,
  type MovementDemand,
  type PackageJourney,
  type PackageProgramItem,
  type PackageRelationship,
  type ParkDesignPackage
} from './contract';
import type { AreaReconciliation } from './areaReconciliation';

interface CanonicalAdapterInput {
  siteName: string;
  generatedAt: string;
  boundaryUtm: number[][][];
  areaPrograms: any[];
  nodePrograms: any[];
  routePrograms: any[];
  acceptedRuleEdges: any[];
  designerRelationships: any[];
  advisoryRelationships: any[];
  parametricRelationships: any[];
  personaJourneys?: any[];
  userGroups: any[];
  gridCells: any[];
  climateMorphology: Record<string, unknown>;
  plantingStrategy: any;
  movementRequirements: Record<string, unknown>;
  terrainRequirements: Record<string, unknown>;
  masterplanSettings: object;
  unresolvedRules: any[];
  duneTypes: ReadonlyArray<{ id: string; name: string; role: string }>;
  roadEdgeRoles?: Array<{ edge: string; role: string; authority: string }>;
  generationSeed?: number | null;
  briefAreaStatement?: {
    grossSiteAreaM2: number;
    qualifier: string;
    parkArchetype: string;
    neighborhoodParkAreaRangesM2: Record<string, { minimum: number; maximum: number }>;
    maximumLeasableAreaPercent: number;
    authority: string;
    sources: Array<{ document: string; page: number; section: string }>;
  };
  areaReconciliation?: AreaReconciliation;
}

const objectiveNames = [
  'adjacency_satisfaction', 'user_coverage', 'persona_journey_efficiency', 'shade_exposure',
  'thermal_comfort', 'biodiversity', 'commercial_exposure', 'visual_permeability',
  'accessibility', 'safety', 'road_buffering', 'program_area_compliance',
  'maintenance_efficiency', 'water_efficiency', 'circulation_efficiency',
  'experience_richness', 'construction_feasibility', 'budget'
] as const;

function editableObjectives(): Record<string, DesignObjective> {
  return Object.fromEntries(objectiveNames.map(name => [name, {
    weight: null,
    enabled: true,
    authority: 'designer_input_required'
  }]));
}

function siteArea(ring: number[][]): number | null {
  if (ring.length < 3) return null;
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  const area = Math.abs(twiceArea) / 2;
  return Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : null;
}

function programItem(program: any): PackageProgramItem {
  const performance = program.performance_attributes ?? {};
  const duneScores = Object.entries(program.dune_compatibility ?? {}) as Array<[string, number]>;
  const social = numberOrNull(performance.socialIntensity);
  const activity = numberOrNull(performance.activityIntensity);
  return {
    id: String(program.id),
    name: String(program.name || program.id),
    program_class: program.ontology?.program_class === 'PATH' ? 'PATH' : 'SPACE',
    space_class: program.ontology?.space_class ?? null,
    common_class: program.ontology?.common_class ?? null,
    category: String(program.category || ''),
    subcategory: String(program.id),
    geometry_type: String(program.geometry_type || 'area'),
    users: Array.isArray(program.user_group_ids) ? program.user_group_ids : [],
    target_area: numberOrNull(program.target_area_m2),
    min_area: numberOrNull(program.minimum_area_m2),
    max_area: numberOrNull(program.maximum_area_m2),
    priority: numberOrNull(program.priority) ?? 0.5,
    required: program.mandatory !== false,
    area_authority: String(program.area_status || program.decision_authority || 'unresolved'),
    shade_requirement: numberOrNull(performance.shadeDemand),
    visibility_requirement: null,
    biodiversity_requirement: numberOrNull(performance.ecologicalValue),
    commercial_value: numberOrNull(program.commercial?.revenuePotential),
    noise_tolerance: numberOrNull(performance.quietDemand) === null ? null : round(1 - Number(performance.quietDemand)),
    evening_use: numberOrNull(performance.eveningSuitability),
    seasonality: program.seasonal_profile ?? {},
    time_of_day: program.temporal_profile ?? {},
    spatial_behavior: {
      role: String(program.spatial_behavior || ''),
      dwell: null,
      activity: activity === null ? null : activity >= 0.65 ? 'active' : 'passive',
      social_density: social === null ? null : social >= 0.7 ? 'high' : social >= 0.35 ? 'medium' : 'low',
      movement_attraction: activity === null || social === null ? null : round((activity + social) / 2)
    },
    geometry_preferences: {
      compactness: null,
      preferred_aspect_ratio_min: null,
      preferred_aspect_ratio_max: null,
      minimum_width: null
    },
    dune_preferences: duneScores.filter(([, score]) => score >= 0.65).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id),
    suitability_field: program.suitability_field ?? null,
    constraints: Array.isArray(program.constraints) ? program.constraints : [],
    evidence: Array.isArray(program.evidence) ? program.evidence : [],
    provenance: {
      evidence_sources: program.evidence_sources ?? [],
      spatial_mode: program.spatial_mode ?? 'exclusive',
      decision_authority: program.decision_authority ?? null,
      representation_status: program.representation_status ?? null,
      placement_status: program.placement_status ?? null,
      coverage_target_percent: numberOrNull(program.coverage_target_percent),
      route_topology: program.route_topology ?? null
    }
  };
}

function acceptedRelationship(edge: any): PackageRelationship {
  const parameter = String(edge.numeric_constraint?.parameter || '').toLowerCase();
  const value = numberOrNull(edge.numeric_constraint?.value);
  return {
    id: String(edge.edge_id || edge.id),
    source: String(edge.source_node_id || edge.source),
    target: String(edge.target_node_id || edge.target),
    type: String(edge.relationship_type || edge.type || 'preferred_adjacency'),
    weight: null,
    minimum_distance: parameter.includes('minimum') && parameter.includes('distance') ? value : null,
    maximum_distance: parameter.includes('maximum') && parameter.includes('distance') ? value : null,
    requires_visibility: String(edge.relationship_type || '').toLowerCase().includes('visibility'),
    mandatory: edge.mandatory === true,
    authority: 'park_brain_approved_rule',
    provenance: { source_rule: edge.source_rule ?? null, numeric_constraint: edge.numeric_constraint ?? null, mapping: edge.mapping ?? null }
  };
}

function generalRelationship(edge: any, authority: string): PackageRelationship {
  return {
    id: String(edge.id || edge.edge_id),
    source: String(edge.source || edge.source_node_id),
    target: String(edge.target || edge.target_node_id),
    type: String(edge.type || edge.relationship_type),
    weight: numberOrNull(edge.compatibility_score ?? edge.confidence),
    minimum_distance: null,
    maximum_distance: null,
    requires_visibility: String(edge.type || '').toLowerCase().includes('visibility'),
    mandatory: edge.mandatory === true,
    authority,
    provenance: { reason: edge.reason ?? null, source_provenance: edge.source_provenance ?? null, overlap_mode: edge.overlap_mode ?? null }
  };
}

function computedRelationship(edge: any): PackageRelationship {
  const score = numberOrNull(edge.score) ?? 0;
  return {
    id: String(edge.id),
    source: String(edge.source),
    target: String(edge.target),
    type: score > 0 ? 'preferred_adjacency' : score < 0 ? 'avoidance' : 'neutral',
    weight: Math.abs(score),
    minimum_distance: null,
    maximum_distance: null,
    requires_visibility: false,
    mandatory: false,
    authority: 'computed_advisory',
    provenance: { reason: edge.reason ?? null, components: edge.components ?? {} }
  };
}

function buildJourneys(groups: any[] = []): PackageJourney[] {
  return groups.flatMap(group => (group.journeys ?? []).map((journey: any) => ({
    id: String(journey.journeyId),
    persona_id: String(group.archetypeKey),
    weight: clamp01((numberOrNull(group.demandScore) ?? 0) / 100),
    sequence: (journey.steps ?? []).map((step: any) => String(step.spaceId)),
    time_of_day: journey.timeOfDay ?? null,
    season: journey.season ?? null,
    frequency: null,
    dwell_time_minutes: null,
    mobility_requirements: [],
    accessibility_requirements: [],
    comfort_sensitivity: null,
    spending_behavior: null,
    provenance: { label: journey.label ?? null, story: journey.story ?? null, season_context: journey.seasonContext ?? null }
  })));
}

export function aggregateMovementDemands(journeys: PackageJourney[]): MovementDemand[] {
  const demands = new Map<string, MovementDemand>();
  for (const journey of journeys) {
    for (let index = 0; index < journey.sequence.length - 1; index++) {
      const origin = journey.sequence[index];
      const destination = journey.sequence[index + 1];
      if (origin === destination) continue;
      const key = `${origin}\u0000${destination}`;
      const demand = demands.get(key) ?? { origin, destination, weight: 0, journey_ids: [], persona_ids: [] };
      demand.weight = round(demand.weight + journey.weight);
      if (!demand.journey_ids.includes(journey.id)) demand.journey_ids.push(journey.id);
      if (!demand.persona_ids.includes(journey.persona_id)) demand.persona_ids.push(journey.persona_id);
      demands.set(key, demand);
    }
  }
  return [...demands.values()].sort((a, b) => b.weight - a.weight || a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination));
}

function duneTypologies(types: CanonicalAdapterInput['duneTypes']): DuneTypology[] {
  return types.map(type => ({
    id: type.id,
    name: type.name,
    inputs: [],
    parameters: {},
    suitable_programs: [],
    behavioral_effects: [],
    climate_effects: [],
    cost_class: null,
    construction_method: null,
    geometry_strategy: null,
    role: type.role
  }));
}

export function buildCanonicalParkDesignPackage(input: CanonicalAdapterInput): ParkDesignPackage {
  const program = [...input.areaPrograms, ...input.nodePrograms, ...input.routePrograms].map(programItem);
  const relationships = [
    ...input.acceptedRuleEdges.filter(edge => edge.decision === 'accepted').map(acceptedRelationship),
    ...input.designerRelationships.map(edge => generalRelationship(edge, 'designer_approved_competition_input')),
    ...input.advisoryRelationships.map(edge => generalRelationship(edge, 'opportunity_catalog_advisory')),
    ...input.parametricRelationships.map(computedRelationship)
  ];
  const journeys = buildJourneys(input.personaJourneys);
  const projectId = slug(input.siteName);
  const version = '1';
  const area = siteArea(input.boundaryUtm[0] ?? []);
  const briefArea = numberOrNull(input.briefAreaStatement?.grossSiteAreaM2);
  const payloadForId = { program, relationships, journeys, boundary: input.boundaryUtm, settings: input.masterplanSettings, seed: input.generationSeed ?? null };
  const pkg: ParkDesignPackage = {
    package_id: deterministicPackageId(projectId, version, payloadForId),
    schema_version: PARK_DESIGN_PACKAGE_SCHEMA_VERSION,
    version,
    project: { id: projectId, name: input.siteName, total_site_area_m2: briefArea ?? area, competition: null },
    site: {
      crs: 'EPSG:32640', units: 'meters', north: 'up', area_m2: area,
      boundary: { type: 'Polygon', coordinates: input.boundaryUtm },
      road_edge_roles: input.roadEdgeRoles ?? [],
      registered_objects: {}
    },
    personas: (input.personaJourneys?.length ? input.personaJourneys.map(group => ({ id: String(group.archetypeKey), name: String(group.archetype), age_group: group.ageGroup, demand_weight: clamp01((numberOrNull(group.demandScore) ?? 0) / 100) })) : input.userGroups.map(group => ({ id: group.id, name: group.name, needs: group.needs, peak_periods: group.peakPeriods, seasonal_sensitivity: group.seasonalSensitivity }))),
    program,
    relationships,
    journeys,
    movement_demands: aggregateMovementDemands(journeys),
    site_fields: { grid: { crs: 'EPSG:32640', cells: input.gridCells } },
    design_objectives: editableObjectives(),
    constraints: {
      area_statement: input.briefAreaStatement ? {
        ...input.briefAreaStatement,
        measuredBoundaryAreaM2: area,
        measuredToBriefVarianceM2: area === null || briefArea === null ? null : round(area - briefArea),
        allocationPolicy: 'Gross brief area is the authoritative project statement; measured boundary area governs geometric containment. Program recommendations do not replace the brief area statement.'
      } : null,
      area_reconciliation: input.areaReconciliation ?? null,
      movement: input.movementRequirements,
      terrain: input.terrainRequirements,
      approved_rules: input.acceptedRuleEdges.filter(edge => edge.decision === 'accepted')
    },
    planting_requirements: (input.plantingStrategy?.hydrozones ?? []).map((zone: any) => ({ ...zone, source: 'planting_strategy', program_id: null, canopy_target: null, shade_target: null, biodiversity_target: null, visibility_requirement: null })),
    dune_typologies: duneTypologies(input.duneTypes),
    evidence: { climate_morphology: input.climateMorphology, user_groups: input.userGroups, unresolved_rules: input.unresolvedRules },
    provenance: {
      generated_by: 'Park Reviewer',
      contract_adapter: 'canonical-v1.4',
      numeric_rule_policy: 'approved_park_brain_rules_only',
      area_authority: input.briefAreaStatement?.authority ?? 'measured_boundary_only'
    },
    generation: { seed: input.generationSeed ?? null, settings: input.masterplanSettings as Record<string, unknown> },
    generated_at: input.generatedAt
  };
  return pkg;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  return round(Math.max(0, Math.min(1, value)));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
