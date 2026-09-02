import { area as turfArea, centroid as turfCentroid } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { SiteGridCell } from './siteGrid';
import type { OpportunityResult } from './opportunityEngine';
import { toUtm40N } from './grasshopperExportEngine';
import { buildAccessCandidatePackage } from './accessCandidateEngine';
import type { GeoJsonFeature, H3Feature } from './types';
import type { CompiledRuleEdge, UnresolvedApprovedRule } from '../results/approvedRuleCompiler';
import type { AlSafa2ClimateSummary } from '../results/climateData';
import { AL_SAFA_2_COMPETITION_BRIEF } from '../results/competitionBrief';
import type { ZipTextFile } from './exportEngine';
import { buildCanonicalParkDesignPackage } from '../designPackage/canonicalAdapter';
import { serializeParkDesignPackage, validateParkDesignPackage } from '../designPackage/contract';
import { buildAreaReconciliation, coverageTargetPercent, programSpatialMode, type AreaPlanningInputs } from '../designPackage/areaReconciliation';
import { buildApproximateDesignEstimate, type DesignEstimateSettings } from '../designPackage/designEstimate';
import type { PersonaJourneyGroup } from './resultsSynthesisEngine';
import {
  DUNE_TYPES, USER_GROUPS, buildParametricProgramDefinitions, buildParametricRelationships,
  buildUserProgramSuitability, opportunityOntologyInputs, programParametricFields,
  type ParametricProgramDefinition
} from './programOntology';

export interface MasterplanExportSettings extends AreaPlanningInputs, DesignEstimateSettings {
  candidateSpacingM: number;
  accessCatchmentRadiusM: number;
  roadEdgeMaxDistanceM: number;
  allPedestrianRoutesAccessible: boolean;
  allowWalkingJoggingSharing: boolean;
  allowServicePublicPathSharing: boolean;
}

interface BuildParkDesignPackageInput {
  siteName: string;
  siteBoundary: Feature<Polygon>;
  siteGrid: SiteGridCell[];
  opportunities: OpportunityResult[];
  selectedProgramZones: Record<string, string>;
  acceptedRuleEdges: CompiledRuleEdge[];
  unresolvedRules: UnresolvedApprovedRule[];
  h3Catchment: H3Feature[];
  roads: GeoJsonFeature[];
  buildings: GeoJsonFeature[];
  schools: GeoJsonFeature[];
  busStops: GeoJsonFeature[];
  masterplanSettings: MasterplanExportSettings;
  climateSummary: AlSafa2ClimateSummary;
  personaJourneys?: PersonaJourneyGroup[];
  roadEdgeRoles?: Array<{ edge: string; role: string; authority: string }>;
  generationSeed?: number | null;
}

const OVERLAP_COMPATIBILITY = [
  ['flexibleEventLawn', 'multipurposeLawn', 0.95, 'temporal_shared_footprint', 'The same open turf supports daily recreation and scheduled events.'],
  ['flexibleRecreation', 'multipurposeLawn', 0.8, 'temporal_shared_footprint', 'Flexible recreation can occupy the multipurpose lawn outside programmed events.'],
  ['flexibleRecreation', 'flexibleEventLawn', 0.65, 'temporal_shared_footprint', 'Event and recreation demand occur at different times.'],
  ['smallEventZone', 'communityPlaza', 0.75, 'baraha_shared_footprint', 'Small gatherings can occupy a defined part of the community baraha.'],
  ['picnicArea', 'treePlanting', 0.95, 'landscape_overlay', 'Picnic occupation depends on canopy rather than a separate unplanted parcel.'],
  ['picnicArea', 'nativePlanting', 0.75, 'landscape_overlay', 'Native planting can form the enclosure and buffer of picnic pockets.'],
  ['quietGarden', 'sensoryGarden', 0.7, 'distributed_pockets', 'Sensory pockets can form part of a larger quiet garden.'],
  ['sensoryGarden', 'nativePlanting', 0.85, 'landscape_overlay', 'The sensory garden is implemented through climate-adapted planting.'],
  ['naturePlay', 'nativePlanting', 0.9, 'landscape_overlay', 'Nature play and native planting share terrain and vegetation.'],
  ['naturePlay', 'biodiversityHabitat', 0.75, 'landscape_overlay', 'Controlled nature play can overlap robust habitat edges.'],
  ['wellnessZone', 'treePlanting', 0.7, 'landscape_overlay', 'Wellness stations require shaded planted pockets.'],
  ['outdoorFitness', 'treePlanting', 0.55, 'edge_canopy', 'Tree canopy may overlap fitness edges while preserving equipment clearances.'],
  ['inclusivePlayground', 'treePlanting', 0.55, 'edge_canopy', 'Canopy overlaps play edges subject to root and safety review.'],
  ['toddlerPlay', 'treePlanting', 0.6, 'edge_canopy', 'Toddler play requires strong shade with supervised clear zones.'],
  ['olderChildrenPlay', 'treePlanting', 0.55, 'edge_canopy', 'Canopy overlaps play edges subject to activity clearances.'],
  ['communityPlaza', 'treePlanting', 0.45, 'edge_canopy', 'The civic clearing retains a partially planted shaded edge.'],
  ['bioswale', 'nativePlanting', 0.9, 'landscape_overlay', 'The bioswale is a planted water-sensitive landscape system.'],
  ['bioswale', 'biodiversityHabitat', 0.9, 'landscape_overlay', 'Water-sensitive corridors contribute to habitat connectivity.'],
  ['treePlanting', 'nativePlanting', 1, 'landscape_overlay', 'Native planting and canopy systems are nested landscape layers.'],
  ['biodiversityHabitat', 'nativePlanting', 0.95, 'landscape_overlay', 'Habitat is implemented primarily through native planting communities.'],
  ['mainEntrancePlaza', 'treePlanting', 0.35, 'edge_canopy', 'Gateway canopy shades plaza edges while retaining arrival visibility.']
] as const;

function principalAxisAzimuthFromNorth(ring: number[][]): number {
  const points = ring.length > 1 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1] ? ring.slice(0, -1) : ring;
  const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const xx = points.reduce((sum, point) => sum + (point[0] - meanX) ** 2, 0);
  const yy = points.reduce((sum, point) => sum + (point[1] - meanY) ** 2, 0);
  const xy = points.reduce((sum, point) => sum + (point[0] - meanX) * (point[1] - meanY), 0);
  const angleFromEast = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  return Math.round((((90 - angleFromEast) % 180) + 180) % 180 * 10) / 10;
}

function routeTopology(id: string): string {
  if (id === 'walkingPromenade') return 'program_connector_network';
  if (id === 'joggingLoop' || id === 'exerciseCyclingLoop') return 'closed_loop';
  if (id === 'accessibleRoutes' || id === 'shadedCirculation') return 'walking_network_attribute';
  if (id === 'serviceAccess') return 'entrance_to_operations_spur';
  return 'route_pending_topology';
}

function ringPerimeterM(ring: number[][]): number {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < ring.length; index++) total += Math.hypot(ring[index][0] - ring[index - 1][0], ring[index][1] - ring[index - 1][1]);
  if (ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1]) total += Math.hypot(ring[0][0] - ring.at(-1)![0], ring[0][1] - ring.at(-1)![1]);
  return Math.round(total * 100) / 100;
}

function jsonFile(path: string, data: unknown): ZipTextFile {
  return { path, content: JSON.stringify(data, null, 2) };
}

function utmRing(ring: number[][]): number[][] {
  return ring.map(([lng, lat]) => {
    const point = toUtm40N(lng, lat);
    return [point.x, point.y];
  });
}

function baseProgram(opportunity: OpportunityResult, selected: Set<string>, parametric: ParametricProgramDefinition) {
  return {
    id: opportunity.type,
    name: opportunity.name,
    category: opportunity.category,
    geometry_type: opportunity.geometryType,
    scale: opportunity.scale,
    selected: true,
    mandatory: true,
    decision_authority: 'competition_scope_and_designer_confirmation',
    spatial_mode: programSpatialMode(opportunity.type),
    fragmentation_policy: programSpatialMode(opportunity.type) === 'overlay' ? 'may_fragment_and_overlap' : programSpatialMode(opportunity.type) === 'shared' ? 'may_split_or_share_compatible_territory' : 'single_primary_territory',
    synthesis_selected: selected.has(opportunity.type),
    priority: Math.round((opportunity.opportunityScore / 100) * 1000) / 1000,
    scores: {
      opportunity: opportunity.opportunityScore,
      demand: opportunity.demandScore,
      suitability: opportunity.suitabilityScore,
      feasibility: opportunity.feasibilityScore,
      confidence: opportunity.confidenceScore,
      grasshopper_readiness: opportunity.grasshopperReadinessScore
    },
    primary_users: opportunity.primaryUsers,
    evidence_sources: opportunity.source,
    evidence: opportunity.evidence,
    suitability_field: opportunity.grasshopperInputs.suitabilityField,
    attractors: opportunity.grasshopperInputs.attractors,
    repellers: opportunity.grasshopperInputs.repellers,
    constraints: opportunity.grasshopperInputs.constraints,
    ...programParametricFields(parametric)
  };
}

export function buildParkDesignPackageFiles(input: BuildParkDesignPackageInput): ZipTextFile[] {
  const generatedAt = new Date().toISOString();
  const selected = new Set(Object.keys(input.selectedProgramZones));
  const ontologyInputs = opportunityOntologyInputs(input.opportunities);
  const parametricPrograms = buildParametricProgramDefinitions(ontologyInputs);
  const parametricById = new Map(parametricPrograms.map(program => [program.id, program]));
  const userProgramSuitability = buildUserProgramSuitability(parametricPrograms);
  const parametricRelationships = buildParametricRelationships(ontologyInputs, parametricPrograms);
  const areaPrograms = input.opportunities
    .filter(opportunity => opportunity.geometryType === 'area')
    .map(opportunity => {
      const designerArea = opportunity.type === 'operationsArea'
        ? input.masterplanSettings.operationsAreaM2
        : opportunity.type === 'dropOffZone'
          ? input.masterplanSettings.dropOffAreaM2
          : null;
      const targetArea = designerArea ?? opportunity.recommendedAreaM2?.target ?? null;
      const mode = programSpatialMode(opportunity.type);
      const coverageTarget = mode === 'overlay' ? coverageTargetPercent(opportunity.type, input.masterplanSettings) : null;
      return {
        ...baseProgram(opportunity, selected, parametricById.get(opportunity.type)!),
        minimum_area_m2: opportunity.recommendedAreaM2?.minimum ?? null,
        target_area_m2: targetArea,
        maximum_area_m2: opportunity.recommendedAreaM2?.maximum ?? null,
        coverage_target_percent: coverageTarget,
        area_status: designerArea !== null
          ? 'designer_input'
          : opportunity.recommendedAreaM2
            ? 'system_recommendation_requires_designer_approval'
            : mode === 'overlay' ? 'coverage_target_pending' : 'designer_extent_pending',
        representation_status: targetArea !== null && targetArea > 0
          ? 'quantified_area'
          : mode === 'overlay' ? 'landscape_overlay_intent' : 'area_intent_anchor',
        placement_status: targetArea !== null && targetArea > 0
          ? 'place_as_area_territory'
          : mode === 'overlay' ? 'represent_as_overlapping_landscape_system' : 'represent_as_ranked_intent_anchor',
        location_zone: input.selectedProgramZones[opportunity.type] ?? null
      };
    });
  const nodePrograms = input.opportunities
    .filter(opportunity => opportunity.geometryType === 'point')
    .map(opportunity => ({
      ...baseProgram(opportunity, selected, parametricById.get(opportunity.type)!),
      placement_status: 'unresolved_until_area_layout',
      target_area_m2: null
    }));
  const routePrograms = input.opportunities
    .filter(opportunity => opportunity.geometryType === 'linear' || opportunity.geometryType === 'network')
    .map(opportunity => ({
      ...baseProgram(opportunity, selected, parametricById.get(opportunity.type)!),
      placement_status: 'generate_after_area_layout',
      route_topology: routeTopology(opportunity.type),
      target_length_m: null,
      target_width_m: null
    }));

  const access = buildAccessCandidatePackage({
    siteBoundary: input.siteBoundary,
    h3Catchment: input.h3Catchment,
    roads: input.roads,
    buildings: input.buildings,
    schools: input.schools,
    busStops: input.busStops,
    settings: {
      candidateSpacingM: input.masterplanSettings.candidateSpacingM,
      catchmentRadiusM: input.masterplanSettings.accessCatchmentRadiusM,
      roadEdgeMaxDistanceM: input.masterplanSettings.roadEdgeMaxDistanceM
    }
  });

  const landscapeSystemIds = new Set(['biodiversityHabitat', 'nativePlanting', 'treePlanting', 'bioswale']);
  const landscapeSystems = areaPrograms
    .filter(program => landscapeSystemIds.has(program.id))
    .map(program => ({
      id: program.id,
      name: program.name,
      geometry_role: program.id === 'bioswale' ? 'environmental_network_region' : 'overlay_region',
      measurement: program.id === 'treePlanting' ? 'canopy_coverage_percent' : 'coverage_area_or_percent',
      target: null,
      mandatory: true,
      representation_status: 'landscape_overlay_system',
      extent_status: 'designer_coverage_target_pending',
      overlap_policy: program.id === 'bioswale' ? 'may_cross_compatible_landscape_regions' : 'may_overlap_program_areas',
      suitability_field: program.suitability_field,
      authority: 'unresolved_requires_designer_or_approved_standard',
      objective: 'grow_contiguous_high_suitability_regions'
    }));

  const movementRequirements = {
    schema_version: '1.4.0',
    generation_order: [
      'place_program_spaces',
      'build_weighted_walking_connector_network_from_persona_od',
      'designate_accessible_and_shade_priority_segments',
      'generate_distinct_jogging_loop',
      'generate_distinct_cycling_loop',
      'generate_service_spur',
      'resolve_crossings_and_shared_segments'
    ],
    public_entrances: {
      count: 2,
      eligible_edges: 'road_facing_only',
      school_facing_edges: 'hard_exclusion',
      building_facing_edges: 'hard_exclusion'
    },
    loops_connect_both_public_entrances: true,
    walking: {
      route_type: 'weighted_program_connector_network',
      anchor_source: 'program_centroids_entrances_and_persona_od_matrix',
      edge_weight_source: 'movement_demands_plus_accessibility_shade_and_conflict_costs',
      must_connect_program_spaces: true,
      perimeter_loop_required: false,
      accessibility_scope: input.masterplanSettings.allPedestrianRoutesAccessible ? 'all_pedestrian_routes' : 'primary_accessible_network',
      may_share_with_jogging: input.masterplanSettings.allowWalkingJoggingSharing,
      width_m: null,
      maximum_slope_percent: null,
      requirement_authority: 'unresolved_pending_park_brain_or_designer_approval'
    },
    jogging: {
      route_type: 'closed_loop',
      distinct_alignment_required: true,
      full_coincidence_with_walking_forbidden: true,
      length_objective: 'maximize_feasible_useful_length',
      target_length_m: null,
      may_share_with_walking: input.masterplanSettings.allowWalkingJoggingSharing,
      width_m: null,
      maximum_slope_percent: null,
      requirement_authority: 'unresolved_pending_park_brain_or_designer_approval'
    },
    exercise_cycling: {
      program_id: 'exerciseCyclingLoop',
      route_type: 'closed_loop',
      distinct_alignment_required: true,
      full_coincidence_with_walking_or_jogging_forbidden: true,
      alignment_policy: 'separate_alignment_except_controlled_crossings_or_explicitly_approved_short_shared_segments',
      length_objective: 'maximize_feasible_useful_length',
      target_length_m: null,
      pedestrian_sharing: 'conditional_on_terrain_slope_curvature_width_and_conflict',
      width_m: null,
      maximum_slope_percent: null,
      minimum_turning_radius_m: null,
      requirement_authority: 'unresolved_pending_park_brain_or_designer_approval'
    },
    accessible_network: {
      route_type: 'designation_on_walking_network',
      independent_parallel_path_required: false,
      must_connect: ['public_entrances', 'required_program_spaces', 'amenities'],
      geometry_constraints: ['approved_width', 'approved_slope', 'continuous_barrier_free_route']
    },
    shaded_network: {
      route_type: 'performance_attribute_on_walking_and_dwell_connections',
      independent_parallel_path_required: false,
      prioritization: 'persona_demand_times_heat_exposure_times_dwell_and_route_frequency'
    },
    service: {
      route_type: 'entrance_to_operations_spur',
      entrance_count: input.masterplanSettings.serviceAccessCount,
      eligible_edges: 'road_facing_only',
      must_connect_program_id: 'operationsArea',
      may_share_public_paths: input.masterplanSettings.allowServicePublicPathSharing,
      full_coincidence_with_public_network_forbidden: !input.masterplanSettings.allowServicePublicPathSharing
    },
    route_conflict_rules: {
      all_routes_on_one_alignment_forbidden: true,
      jogging_and_cycling_require_distinct_closed_loops: true,
      cycling_pedestrian_intersections: 'controlled_crossings_only',
      accessible_and_shaded_are_network_attributes_not_duplicate_centerlines: true,
      shared_segments_require_explicit_mode_compatibility: true
    }
  };

  const terrainRequirements = {
    schema_version: '1.2.0',
    authoritative_input: 'rhino_mesh',
    horizontal_crs: 'EPSG:32640',
    horizontal_units: 'meters',
    vertical_units: 'meters',
    vertical_datum: null,
    optimizer_may_modify_terrain: true,
    required_comparison: ['cut_volume_m3', 'fill_volume_m3', 'net_volume_m3', 'total_earthwork_m3', 'disturbed_area_m2', 'maximum_cut_depth_m', 'maximum_fill_depth_m', 'balance_ratio'],
    external_optional_inputs: {
      existing_trees: 'points_with_optional_canopy_radius',
      existing_buildings: 'closed_curves_or_meshes',
      drainage: 'curves',
      utilities: 'points_with_optional_exclusion_radius'
    }
  };

  const opportunityById = new Map(input.opportunities.map(opportunity => [opportunity.type, opportunity]));
  const advisoryRelationships = input.opportunities.flatMap(opportunity => {
    const adjacency = opportunity.grasshopperInputs.adjacencyRules;
    const typed = [
      ...adjacency.preferred.map(target => ({ target, type: 'preferred' })),
      ...adjacency.avoid.map(target => ({ target, type: 'avoid' })),
      ...adjacency.service.map(target => ({ target, type: 'service' })),
      ...adjacency.movement.map(target => ({ target, type: 'movement' }))
    ];
    return typed
      .filter(item => opportunityById.has(item.target as any))
      .map(item => ({
        id: `advisory:${opportunity.type}:${item.type}:${item.target}`,
        source: opportunity.type,
        target: item.target,
        type: item.type,
        mandatory: false,
        accepted: false,
        authority: 'opportunity_catalog_advisory'
      }));
  });

  const knownProgramIds = new Set(input.opportunities.map(opportunity => opportunity.type));
  const designerRelationships = OVERLAP_COMPATIBILITY
    .filter(([source, target]) => knownProgramIds.has(source as any) && knownProgramIds.has(target as any))
    .map(([source, target, compatibilityScore, overlapMode, reason]) => ({
      id: `designer:overlap:${source}:${target}`,
      source,
      target,
      type: 'overlap_compatible',
      graph_layer: 'territory_overlap',
      mandatory: false,
      accepted: true,
      directed: false,
      authority: 'designer_approved_competition_input',
      compatibility_score: compatibilityScore,
      overlap_mode: overlapMode,
      reason,
      source_provenance: 'Competition scope + designer-confirmed mandatory program; compatibility scored by the design system for human review.'
    }));

  const cells = input.siteGrid.map(cell => {
    const [lng, lat] = turfCentroid(cell as any).geometry.coordinates as [number, number];
    const point = toUtm40N(lng, lat);
    const scores: Record<string, number | null> = {};
    const program_constraints: Record<string, string> = {};
    for (const opportunity of input.opportunities) {
      const score = opportunity.allCells.find(item => item.h3Id === cell.properties.h3_id);
      if (!score) continue;
      scores[`${opportunity.type}_opportunity`] = score.opportunityScore / 100;
      scores[`${opportunity.type}_demand`] = score.demandScore / 100;
      scores[`${opportunity.type}_suitability`] = score.suitabilityScore / 100;
      scores[`${opportunity.type}_feasibility`] = score.feasibilityScore / 100;
      if (score.avoided && score.avoidReason) program_constraints[opportunity.type] = score.avoidReason;
    }
    return {
      id: cell.properties.h3_id,
      parent_h3_id: cell.properties.parentH3Id,
      x: point.x,
      y: point.y,
      longitude: lng,
      latitude: lat,
      area_m2: cell.properties.hex_area_m2,
      building_coverage_pct: cell.properties.building_coverage_pct,
      road_density_m_per_km2: cell.properties.real_road_density_m_per_km2,
      constraint: false,
      program_constraints,
      scores,
      polygon_wgs84: cell.geometry.coordinates
    };
  });

  const boundaryWgs84 = input.siteBoundary.geometry.coordinates;
  const boundaryUtm = boundaryWgs84.map(ring => utmRing(ring as number[][]));
  const principalAxisAzimuthDeg = principalAxisAzimuthFromNorth(boundaryUtm[0]);
  const climateMorphology = {
    schema_version: '1.2.0',
    authority: 'designer_approved_competition_input',
    source_lineage: {
      regional_weather: input.climateSummary.regionalEpw,
      site_microclimate: {
        source: input.climateSummary.source,
        evidence_nature: input.climateSummary.evidenceNature,
        heat_island_extreme: input.climateSummary.heatIslandExtreme,
        natural_ventilation: input.climateSummary.naturalVentilation,
        year_round_comfort: input.climateSummary.yearRoundComfort
      },
      review_and_user_evidence: 'Program-level evidence_sources, evidence, primary_users, and scores remain embedded in area/node/route program records.'
    },
    site_axes: {
      principal_long_axis_azimuth_deg_from_north: principalAxisAzimuthDeg,
      primary_sikka: {
        id: 'primary_sikka',
        role: 'ventilated_accessible_valley',
        azimuth_deg_from_north: principalAxisAzimuthDeg,
        offset_m: 0,
        basis: 'site_long_axis_plus_southerly_epw_wind'
      },
      ventilation_cuts: [
        { id: 'west_east_ventilation_cut', role: 'wind_erosion_passage', azimuth_deg_from_north: 90, offset_m: -18, basis: 'westerly_epw_wind' },
        { id: 'northwest_southeast_ventilation_cut', role: 'wind_erosion_passage', azimuth_deg_from_north: 135, offset_m: 18, basis: 'northwesterly_epw_wind' }
      ]
    },
    baraha_rules: {
      generator: 'movement_route_intersection',
      minimum_distinct_routes: 2,
      cluster_distance_m: 6,
      minimum_radius_m: 6,
      maximum_radius_m: 14,
      social_program_ids: ['communityPlaza', 'smallEventZone', 'flexibleEventLawn', 'mainEntrancePlaza'],
      score_components: ['distinct_route_count', 'social_program_proximity', 'shade_priority'],
      designer_review_required: true
    },
    terrain_rules: {
      existing_ground_character: 'nearly_flat',
      observed_relief_m: 1.372,
      observed_triangle_slope_percent: { median: 1.7, p95: 3.19, maximum: 4.28 },
      preferred_landscape_ridge_height_m: { minimum: 0.6, maximum: 1.8 },
      architectural_ridge_height_m: { minimum: 2.5, maximum: 4 },
      hollow_policy: 'retain_near_existing_grade_and_form_protection_with_surrounding_ridges',
      cut_fill_balance_required: true
    },
    coordinate_transform: {
      obj_axis_convention: 'rhino_y_up',
      utm_easting: 'obj_x',
      utm_northing: '-obj_z',
      elevation: 'obj_y'
    }
  };

  const plantingStrategy = {
    schema_version: '1.2.0',
    source_file: 'UAE_MiddleEast_200_Plant_Database_Simulation.csv',
    source_authority: 'simulation_dataset_competition_design_support_only',
    automation_policy: 'candidate_generation_only_until_horticultural_safety_verification',
    hydrozones: [
      { id: 'HZ-CREST', name: 'Desert Crest', water_demand: 'very_low', morphology: 'exposed_ridges_and_boundaries' },
      { id: 'HZ-SLOPE', name: 'Stabilized Slope', water_demand: 'low', morphology: 'dune_slopes_and_buffers' },
      { id: 'HZ-HOLLOW', name: 'Shaded Hollow', water_demand: 'moderate', morphology: 'play_picnic_quiet_and_social_oases' },
      { id: 'HZ-WATER', name: 'Specialized Water', water_demand: 'specialized_or_high', morphology: 'bioswale_or_exception_only' }
    ],
    optimization_objectives: ['minimize_irrigation_pipe_length', 'minimize_hardscape_crossings', 'minimize_hydrozone_fragmentation', 'minimize_water_demand', 'meet_canopy_shade_targets', 'avoid_root_conflicts'],
    required_unverified_fields: ['thorn_hazard', 'toxicity_risk', 'allergen_risk', 'fruit_litter_risk', 'fragrance', 'uae_nursery_availability', 'establishment_period_months']
  };
  const manifest = {
    schema_version: '1.4.0',
    package_type: 'park_design_grasshopper',
    generated_at: generatedAt,
    project: { site_name: input.siteName },
    coordinate_system: { crs: 'EPSG:32640', units: 'meters', source_crs: 'EPSG:4326' },
    files: {
      site: 'site.json',
      park_design_package: 'park_design_package.json',
      validation: 'validation.json',
      area_programs: 'area_programs.json',
      node_programs: 'node_programs.json',
      route_programs: 'route_programs.json',
      landscape_systems: 'landscape_systems.json',
      access_candidates: 'access_candidates.json',
      access_pair_metrics: 'access_pair_metrics.json',
      movement_requirements: 'movement_requirements.json',
      terrain_requirements: 'terrain_requirements.json',
      climate_morphology: 'climate_morphology.json',
      planting_strategy: 'planting_strategy.json',
      program_ontology: 'program_ontology.json',
      user_program_suitability: 'user_program_suitability.json',
      parametric_relationships: 'parametric_relationships.json',
      masterplan_settings: 'masterplan_settings.json',
      area_reconciliation: 'area_reconciliation.json',
      design_estimate: 'design_estimate.json',
      grid: 'grid.json',
      relationships: 'relationships.json',
      unresolved: 'unresolved.json'
    },
    counts: {
      area_programs: areaPrograms.length,
      selected_area_programs: areaPrograms.filter(program => program.selected).length,
      node_programs: nodePrograms.length,
      route_programs: routePrograms.length,
      landscape_systems: landscapeSystems.length,
      access_candidates: access.candidates.length,
      access_candidate_pairs: access.pairs.length,
      grid_cells: cells.length,
      accepted_rule_edges: input.acceptedRuleEdges.length,
      advisory_relationships: advisoryRelationships.length,
      designer_relationships: designerRelationships.length,
      user_groups: USER_GROUPS.length,
      user_program_suitability: userProgramSuitability.length,
      parametric_relationships: parametricRelationships.length,
      unresolved_rules: input.unresolvedRules.length
    },
    safety_policy: {
      numeric_constraints: 'Only accepted Park Brain edges with approved provenance are authoritative.',
      advisory_relationships: 'Opportunity catalog relationships are exported separately and never treated as accepted constraints.',
      program_areas: 'Canonical Opportunity Lab recommendations require explicit designer approval before final optimization.',
      unresolved_extents: 'Mandatory programs without approved extents remain represented as landscape overlays or area intent anchors; they are never treated as omitted.'
    }
  };

  const areaReconciliation = buildAreaReconciliation({
    briefGrossAreaM2: AL_SAFA_2_COMPETITION_BRIEF.areaStatement.grossSiteAreaM2,
    measuredBoundaryAreaM2: Math.round(turfArea(input.siteBoundary) * 100) / 100,
    maximumLeasableAreaPercent: AL_SAFA_2_COMPETITION_BRIEF.areaStatement.maximumLeasableAreaPercent,
    opportunities: input.opportunities,
    settings: input.masterplanSettings
  });
  const canonicalPackage = buildCanonicalParkDesignPackage({
    siteName: input.siteName,
    generatedAt,
    boundaryUtm,
    areaPrograms,
    nodePrograms,
    routePrograms,
    acceptedRuleEdges: input.acceptedRuleEdges,
    designerRelationships,
    advisoryRelationships,
    parametricRelationships,
    personaJourneys: input.personaJourneys,
    userGroups: USER_GROUPS,
    gridCells: cells,
    climateMorphology,
    plantingStrategy,
    movementRequirements,
    terrainRequirements,
    masterplanSettings: input.masterplanSettings,
    unresolvedRules: input.unresolvedRules,
    duneTypes: DUNE_TYPES,
    roadEdgeRoles: input.roadEdgeRoles,
    generationSeed: input.generationSeed,
    briefAreaStatement: AL_SAFA_2_COMPETITION_BRIEF.areaStatement,
    areaReconciliation
  });
  const designEstimate = buildApproximateDesignEstimate({
    pkg: canonicalPackage,
    areaReconciliation,
    sitePerimeterM: ringPerimeterM(boundaryUtm[0] ?? []),
    budgetCapAed: AL_SAFA_2_COMPETITION_BRIEF.totalBudgetCapAed,
    costRatesAedPerM2: AL_SAFA_2_COMPETITION_BRIEF.costRateGuidanceAedPerM2,
    settings: input.masterplanSettings
  });
  canonicalPackage.constraints.design_estimate = designEstimate;
  const canonicalValidation = validateParkDesignPackage(canonicalPackage);

  return [
    jsonFile('manifest.json', manifest),
    { path: 'park_design_package.json', content: serializeParkDesignPackage(canonicalPackage) },
    jsonFile('validation.json', canonicalValidation),
    jsonFile('site.json', {
      site_name: input.siteName,
      crs: 'EPSG:32640',
      boundary_utm: { type: 'Polygon', coordinates: boundaryUtm },
      boundary_wgs84: input.siteBoundary.geometry
    }),
    jsonFile('area_programs.json', { schema_version: '1.3.0', programs: areaPrograms }),
    jsonFile('node_programs.json', { schema_version: '1.3.0', programs: nodePrograms }),
    jsonFile('route_programs.json', { schema_version: '1.3.0', programs: routePrograms }),
    jsonFile('landscape_systems.json', { schema_version: '1.2.0', systems: landscapeSystems }),
    jsonFile('access_candidates.json', { schema_version: '1.2.0', summary: access.summary, candidates: access.candidates }),
    jsonFile('access_pair_metrics.json', { schema_version: '1.2.0', pairs: access.pairs }),
    jsonFile('movement_requirements.json', movementRequirements),
    jsonFile('terrain_requirements.json', terrainRequirements),
    jsonFile('climate_morphology.json', climateMorphology),
    jsonFile('planting_strategy.json', plantingStrategy),
    jsonFile('program_ontology.json', { schema_version: '1.3.0', dune_types: DUNE_TYPES, programs: parametricPrograms }),
    jsonFile('user_program_suitability.json', { schema_version: '1.3.0', user_groups: USER_GROUPS, suitability: userProgramSuitability }),
    jsonFile('parametric_relationships.json', { schema_version: '1.3.0', scale: '-1_repulsion_to_1_attraction', authority: 'computed_advisory', relationships: parametricRelationships }),
    jsonFile('masterplan_settings.json', { schema_version: '1.3.0', ...input.masterplanSettings }),
    jsonFile('area_reconciliation.json', canonicalPackage.constraints.area_reconciliation),
    jsonFile('design_estimate.json', designEstimate),
    jsonFile('grid.json', { schema_version: '1.2.0', cells }),
    jsonFile('relationships.json', {
      schema_version: '1.3.0',
      accepted_rule_edges: input.acceptedRuleEdges,
      designer_relationships: designerRelationships,
      advisory_relationships: advisoryRelationships
    }),
    jsonFile('unresolved.json', {
      schema_version: '1.2.0',
      rules: input.unresolvedRules,
      area_programs_without_recommendation: areaPrograms.filter(program => program.target_area_m2 === null).map(program => program.id)
    }),
    {
      path: 'README.txt',
      content: [
        'Park Design Grasshopper Package v1.4',
        '',
        'Use the ZIP directly in the ParkBubbles component.',
        'park_design_package.json is the canonical machine-readable contract; role-specific files remain compatibility views for the current Grasshopper loader.',
        'Area programs, landscape systems, point nodes, and routes are separated by geometry role.',
        'area_reconciliation.json distinguishes brief gross area, measured boundary, exclusive commitments, shared demand, circulation, and landscape coverage overlays.',
        'design_estimate.json provides early-stage readiness scores, approximate counts/areas/lengths, and scenario-budget cost estimates with explicit unresolved assumptions.',
        'Access candidates and pair metrics are evidence inputs for Grasshopper/Wallacei optimization.',
        'Terrain is supplied as an authoritative Rhino mesh; cut/fill metrics compare existing and proposed meshes.',
        'Climate morphology carries the EPW/CFD lineage, primary sikka axis, ventilation cuts, terrain rules, and baraha-generation settings.',
        'Designer-approved overlap relationships permit compatible programs to share territory without deleting mandatory scope items.',
        'Mandatory programs without approved extents are explicitly represented as landscape overlays or area intent anchors; they are not omitted.',
        'Planting strategy defines governed hydrozones; the source plant simulation remains blocked from automatic placement until horticultural safety review.',
        'Program ontology, canonical users, time/season demand, D0-D10 compatibility, and the full computed relationship matrix are exported as advisory parametric inputs.',
        'Only accepted_rule_edges may become authoritative constraints.',
        'Advisory relationships and system-recommended areas require designer review.'
      ].join('\r\n')
    }
  ];
}
