export interface LandsDesignProgramInput {
  id: string;
  name: string;
  category?: string;
  geometry_type?: string;
  route_topology?: string | null;
  target_width_m?: number | null;
  target_length_m?: number | null;
  spatial_mode?: string;
  coverage_target_percent?: number | null;
  decision_authority?: string;
}

export interface LandsDesignHydrozoneInput {
  id: string;
  name: string;
  water_demand: string;
  morphology: string;
}

export interface LandsDesignHandoffInput {
  projectName: string;
  crs: string;
  units: string;
  routePrograms: LandsDesignProgramInput[];
  nodePrograms: LandsDesignProgramInput[];
  landscapeSystems: LandsDesignProgramInput[];
  hydrozones: LandsDesignHydrozoneInput[];
  plantSourceFile?: string;
  plantSourceAuthority?: string;
  plantAutomationPolicy?: string;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Describes how planning outputs should be converted after Grasshopper has generated
 * their final Rhino geometry. It intentionally does not claim to create proprietary
 * Lands Design objects or assign unverified plant species.
 */
export function buildLandsDesignHandoff(input: LandsDesignHandoffInput) {
  return {
    schema_version: '1.0.0',
    target_application: 'Lands Design for Rhino',
    project_name: input.projectName,
    handoff_stage: 'detail_design_input',
    coordinate_system: { crs: input.crs, units: input.units, north: 'up' },
    geometry_policy: {
      source: 'Park Design Space Planner Grasshopper outputs',
      authority: 'designer-reviewed generated geometry',
      native_object_creation: 'deferred_to_lands_design',
      note: 'This file maps generated Rhino geometry and parameters to intended Lands Design object classes; it does not fabricate proprietary Lands objects.'
    },
    rhino_parameter_schema: [
      { name: 'ParkDesignId', category: 'Park Design', data_type: 'text', required: true },
      { name: 'ParkDesignClass', category: 'Park Design', data_type: 'text', required: true },
      { name: 'ParkDesignAuthority', category: 'Park Design', data_type: 'text', required: true },
      { name: 'ParkDesignStatus', category: 'Park Design', data_type: 'text', required: true },
      { name: 'LandsDesignTargetType', category: 'Interoperability', data_type: 'text', required: true },
      { name: 'HydrozoneId', category: 'Planting', data_type: 'text', required: false },
      { name: 'SpeciesCode', category: 'Planting', data_type: 'text', required: false },
      { name: 'WaterDemand', category: 'Planting', data_type: 'text', required: false },
      { name: 'TargetWidthM', category: 'Geometry', data_type: 'number', required: false },
      { name: 'SurfaceCode', category: 'Materials', data_type: 'text', required: false }
    ],
    object_mappings: {
      terrain: {
        source_output: 'DuneTerrain.Proposed Mesh',
        source_geometry: 'mesh',
        lands_design_target_type: 'terrain',
        status: 'runtime_geometry_required',
        preserve: ['existing/proposed distinction', 'vertical datum', 'cut/fill metrics']
      },
      paths: input.routePrograms.map(program => ({
        id: program.id,
        name: program.name,
        source_output: 'ParkBubbles.Routes',
        source_geometry: 'curve',
        lands_design_target_type: 'path',
        topology: program.route_topology ?? 'unresolved',
        target_width_m: finitePositive(program.target_width_m),
        target_length_m: finitePositive(program.target_length_m),
        surface_code: null,
        edge_detail_code: null,
        authority: program.decision_authority || 'design_package',
        status: finitePositive(program.target_width_m) === null ? 'width_decision_required' : 'geometry_generation_required'
      })),
      planting_zones: input.hydrozones.map(zone => ({
        id: zone.id,
        name: zone.name,
        source_output: 'future PlantingDetail.Zone Boundaries',
        source_geometry: 'closed_curve',
        lands_design_target_type: 'forest_or_groundcover_zone',
        water_demand: zone.water_demand,
        morphology: zone.morphology,
        species_code: null,
        density: null,
        status: 'zone_geometry_and_species_decision_required'
      })),
      individual_plants: {
        source_output: 'future PlantingDetail.Plant Points',
        source_geometry: 'point',
        lands_design_target_type: 'plant_from_points',
        source_file: input.plantSourceFile || null,
        source_authority: input.plantSourceAuthority || 'unverified',
        automation_policy: input.plantAutomationPolicy || 'candidate_generation_only',
        status: 'blocked_until_horticultural_review'
      },
      landscape_zones: input.landscapeSystems.map(system => ({
        id: system.id,
        name: system.name,
        source_output: 'ParkBubbles.Landscape Overlays',
        source_geometry: 'closed_curve',
        lands_design_target_type: system.id.toLowerCase().includes('bioswale') ? 'terrain_cut_fill_or_zone' : 'zone',
        spatial_mode: system.spatial_mode || 'overlay',
        coverage_target_percent: system.coverage_target_percent ?? null,
        status: 'planning_proxy_requires_detail_boundary'
      })),
      point_assets: input.nodePrograms.map(program => ({
        id: program.id,
        name: program.name,
        source_output: 'ParkBubbles.Nodes',
        source_geometry: 'point',
        lands_design_target_type: 'urban_furniture_or_library_block',
        category: program.category || null,
        asset_code: null,
        status: 'asset_family_decision_required'
      }))
    },
    detailing_workstreams: [
      { order: 1, id: 'PATH_ASSEMBLIES', status: 'ready', decisions: ['surface_code', 'edge_detail_code', 'crossfall', 'drainage_interface'] },
      { order: 2, id: 'PLANTING_HYDROZONES', status: 'geometry_required', decisions: ['zone boundaries', 'species palette', 'density', 'planting size'] },
      { order: 3, id: 'IRRIGATION', status: 'depends_on_planting', decisions: ['water source', 'valve zones', 'pipe routes', 'emitters'] },
      { order: 4, id: 'FURNITURE_LIGHTING', status: 'asset_selection_required', decisions: ['families', 'spacing', 'power routes', 'foundation zones'] },
      { order: 5, id: 'SCHEDULES_DOCUMENTATION', status: 'depends_on_conversion', decisions: ['plant schedule', 'materials schedule', 'setting out references'] }
    ],
    unresolved_design_decisions: [
      'Plant species and quantities require horticultural and nursery-availability review.',
      'Path surface, edge, crossfall and construction build-up are not yet approved.',
      'Irrigation source, pressure, zoning and emitter selection are not yet supplied.',
      'Furniture and lighting asset families are not yet selected.',
      'Generated planning proxies require designer review before conversion to Lands Design objects.'
    ]
  };
}
