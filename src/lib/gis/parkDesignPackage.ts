import { centroid as turfCentroid } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { SiteGridCell } from './siteGrid';
import type { OpportunityResult } from './opportunityEngine';
import { toUtm40N } from './grasshopperExportEngine';
import { buildAccessCandidatePackage } from './accessCandidateEngine';
import type { GeoJsonFeature, H3Feature } from './types';
import type { CompiledRuleEdge, UnresolvedApprovedRule } from '../results/approvedRuleCompiler';
import type { ZipTextFile } from './exportEngine';

export interface MasterplanExportSettings {
  operationsAreaM2: number | null;
  dropOffAreaM2: number | null;
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

function baseProgram(opportunity: OpportunityResult, selected: Set<string>) {
  return {
    id: opportunity.type,
    name: opportunity.name,
    category: opportunity.category,
    geometry_type: opportunity.geometryType,
    scale: opportunity.scale,
    selected: true,
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
    constraints: opportunity.grasshopperInputs.constraints
  };
}

export function buildParkDesignPackageFiles(input: BuildParkDesignPackageInput): ZipTextFile[] {
  const generatedAt = new Date().toISOString();
  const selected = new Set(Object.keys(input.selectedProgramZones));
  const areaPrograms = input.opportunities
    .filter(opportunity => opportunity.geometryType === 'area')
    .map(opportunity => {
      const designerArea = opportunity.type === 'operationsArea'
        ? input.masterplanSettings.operationsAreaM2
        : opportunity.type === 'dropOffZone'
          ? input.masterplanSettings.dropOffAreaM2
          : null;
      return {
        ...baseProgram(opportunity, selected),
        minimum_area_m2: opportunity.recommendedAreaM2?.minimum ?? null,
        target_area_m2: designerArea ?? opportunity.recommendedAreaM2?.target ?? null,
        maximum_area_m2: opportunity.recommendedAreaM2?.maximum ?? null,
        area_status: designerArea !== null
          ? 'designer_input'
          : opportunity.recommendedAreaM2
            ? 'system_recommendation_requires_designer_approval'
            : 'unresolved',
        location_zone: input.selectedProgramZones[opportunity.type] ?? null
      };
    });
  const nodePrograms = input.opportunities
    .filter(opportunity => opportunity.geometryType === 'point')
    .map(opportunity => ({
      ...baseProgram(opportunity, selected),
      placement_status: 'unresolved_until_area_layout',
      target_area_m2: null
    }));
  const routePrograms = input.opportunities
    .filter(opportunity => opportunity.geometryType === 'linear' || opportunity.geometryType === 'network')
    .map(opportunity => ({
      ...baseProgram(opportunity, selected),
      placement_status: 'generate_after_area_layout',
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
      overlap_policy: program.id === 'bioswale' ? 'may_cross_compatible_landscape_regions' : 'may_overlap_program_areas',
      suitability_field: program.suitability_field,
      authority: 'unresolved_requires_designer_or_approved_standard',
      objective: 'grow_contiguous_high_suitability_regions'
    }));

  const movementRequirements = {
    schema_version: '1.1.0',
    public_entrances: {
      count: 2,
      eligible_edges: 'road_facing_only',
      school_facing_edges: 'hard_exclusion',
      building_facing_edges: 'hard_exclusion'
    },
    loops_connect_both_public_entrances: true,
    walking: {
      accessibility_scope: input.masterplanSettings.allPedestrianRoutesAccessible ? 'all_pedestrian_routes' : 'primary_accessible_network',
      may_share_with_jogging: input.masterplanSettings.allowWalkingJoggingSharing,
      width_m: null,
      maximum_slope_percent: null,
      requirement_authority: 'unresolved_pending_park_brain_or_designer_approval'
    },
    jogging: {
      route_type: 'closed_loop',
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
      length_objective: 'maximize_feasible_useful_length',
      target_length_m: null,
      pedestrian_sharing: 'conditional_on_terrain_slope_curvature_width_and_conflict',
      width_m: null,
      maximum_slope_percent: null,
      minimum_turning_radius_m: null,
      requirement_authority: 'unresolved_pending_park_brain_or_designer_approval'
    },
    service: {
      entrance_count: 1,
      eligible_edges: 'road_facing_only',
      must_connect_program_id: 'operationsArea',
      may_share_public_paths: input.masterplanSettings.allowServicePublicPathSharing
    }
  };

  const terrainRequirements = {
    schema_version: '1.1.0',
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
  const manifest = {
    schema_version: '1.1.0',
    package_type: 'park_design_grasshopper',
    generated_at: generatedAt,
    project: { site_name: input.siteName },
    coordinate_system: { crs: 'EPSG:32640', units: 'meters', source_crs: 'EPSG:4326' },
    files: {
      site: 'site.json',
      area_programs: 'area_programs.json',
      node_programs: 'node_programs.json',
      route_programs: 'route_programs.json',
      landscape_systems: 'landscape_systems.json',
      access_candidates: 'access_candidates.json',
      access_pair_metrics: 'access_pair_metrics.json',
      movement_requirements: 'movement_requirements.json',
      terrain_requirements: 'terrain_requirements.json',
      masterplan_settings: 'masterplan_settings.json',
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
      unresolved_rules: input.unresolvedRules.length
    },
    safety_policy: {
      numeric_constraints: 'Only accepted Park Brain edges with approved provenance are authoritative.',
      advisory_relationships: 'Opportunity catalog relationships are exported separately and never treated as accepted constraints.',
      program_areas: 'Canonical Opportunity Lab recommendations require explicit designer approval before final optimization.'
    }
  };

  return [
    jsonFile('manifest.json', manifest),
    jsonFile('site.json', {
      site_name: input.siteName,
      crs: 'EPSG:32640',
      boundary_utm: { type: 'Polygon', coordinates: boundaryUtm },
      boundary_wgs84: input.siteBoundary.geometry
    }),
    jsonFile('area_programs.json', { schema_version: '1.1.0', programs: areaPrograms }),
    jsonFile('node_programs.json', { schema_version: '1.1.0', programs: nodePrograms }),
    jsonFile('route_programs.json', { schema_version: '1.1.0', programs: routePrograms }),
    jsonFile('landscape_systems.json', { schema_version: '1.1.0', systems: landscapeSystems }),
    jsonFile('access_candidates.json', { schema_version: '1.1.0', summary: access.summary, candidates: access.candidates }),
    jsonFile('access_pair_metrics.json', { schema_version: '1.1.0', pairs: access.pairs }),
    jsonFile('movement_requirements.json', movementRequirements),
    jsonFile('terrain_requirements.json', terrainRequirements),
    jsonFile('masterplan_settings.json', { schema_version: '1.1.0', ...input.masterplanSettings }),
    jsonFile('grid.json', { schema_version: '1.1.0', cells }),
    jsonFile('relationships.json', {
      schema_version: '1.1.0',
      accepted_rule_edges: input.acceptedRuleEdges,
      advisory_relationships: advisoryRelationships
    }),
    jsonFile('unresolved.json', {
      schema_version: '1.1.0',
      rules: input.unresolvedRules,
      area_programs_without_recommendation: areaPrograms.filter(program => program.target_area_m2 === null).map(program => program.id)
    }),
    {
      path: 'README.txt',
      content: [
        'Park Design Grasshopper Package v1.1',
        '',
        'Use the ZIP directly in the ParkBubbles component.',
        'Area programs, landscape systems, point nodes, and routes are separated by geometry role.',
        'Access candidates and pair metrics are evidence inputs for Grasshopper/Wallacei optimization.',
        'Terrain is supplied as an authoritative Rhino mesh; cut/fill metrics compare existing and proposed meshes.',
        'Only accepted_rule_edges may become authoritative constraints.',
        'Advisory relationships and system-recommended areas require designer review.'
      ].join('\r\n')
    }
  ];
}
