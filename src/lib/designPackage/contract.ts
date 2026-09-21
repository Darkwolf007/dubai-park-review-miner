export const PARK_DESIGN_PACKAGE_SCHEMA_VERSION = '1.4.0' as const;

export type ProgramClass = 'PATH' | 'SPACE';
export type SpaceClass = 'USER_SPECIFIC' | 'COMMON' | 'UTILITY' | null;
export type CommonClass = 'GENERAL' | 'COMMERCIAL' | 'EXPERIENCE' | null;

export interface PackageProject {
  id: string;
  name: string;
  total_site_area_m2: number | null;
  competition?: string | null;
}

export interface PackageSite {
  crs: string;
  units: string;
  north: 'up' | string;
  area_m2: number | null;
  boundary: { type: 'Polygon'; coordinates: number[][][] } | null;
  road_edge_roles: Array<{ edge: string; role: string; authority: string }>;
  registered_objects: Record<string, string[]>;
  boundary_segments?: BoundarySegmentRule[];
  placement_zones?: PlacementZone[];
}

export interface BoundarySegmentRule {
  id: string;
  roles: string[];
  authority: string;
  coordinates?: number[][];
}

export interface PlacementZone {
  id: string;
  type: 'candidate_zone' | string;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  priority: number;
  authority?: string;
}

export type CrossingPolicy = 'forbidden' | 'destination_only' | 'controlled_only' | 'allowed' | 'preferred';

export interface PlacementRules {
  hard?: {
    must_touch_boundary?: boolean;
    allowed_boundary_segment_ids?: string[];
    allowed_boundary_roles?: string[];
    allowed_zone_ids?: string[];
    must_be_adjacent_to?: string[];
    maximum_boundary_setback_m?: number | null;
    maximum_adjacency_gap_m?: number | null;
    minimum_shared_edge_m?: number | null;
  };
  soft?: {
    preferred_entrance_id?: string | null;
    minimize_distance_to_entrance?: boolean;
    minimize_service_route_length?: boolean;
    avoid_public_arrival?: boolean;
    orientation?: 'either' | 'parallel_to_boundary' | 'perpendicular_to_boundary' | string;
    zone_scores?: Record<string, number>;
  };
}

export interface CirculationProfile {
  walking?: { crossing_policy: CrossingPolicy; designer_score?: number | null; minimum_clear_width_m?: number | null };
  cycling?: { crossing_policy: CrossingPolicy; designer_score?: number | null; minimum_clear_width_m?: number | null; minimum_turning_radius_m?: number | null };
  service?: { crossing_policy: CrossingPolicy; minimum_clear_width_m?: number | null };
}

export interface PackagePersona {
  id: string;
  name: string;
  age_group?: string;
  demand_weight?: number;
  needs?: Record<string, number>;
  peak_periods?: string[];
  seasonal_sensitivity?: Record<string, number>;
  evidence?: string[];
}

export interface PackageProgramItem {
  id: string;
  name: string;
  program_class: ProgramClass;
  space_class: SpaceClass;
  common_class: CommonClass;
  category: string;
  subcategory: string;
  geometry_type: string;
  users: string[];
  target_area: number | null;
  min_area: number | null;
  max_area: number | null;
  priority: number;
  required: boolean;
  area_authority: string;
  shade_requirement: number | null;
  visibility_requirement: number | null;
  biodiversity_requirement: number | null;
  commercial_value: number | null;
  noise_tolerance: number | null;
  evening_use: number | null;
  seasonality: Record<string, number>;
  time_of_day: Record<string, number>;
  spatial_behavior: {
    role: string;
    dwell: string | null;
    activity: string | null;
    social_density: string | null;
    movement_attraction: number | null;
  };
  geometry_preferences: {
    compactness: number | null;
    preferred_aspect_ratio_min: number | null;
    preferred_aspect_ratio_max: number | null;
    minimum_width: number | null;
  };
  dune_preferences: string[];
  suitability_field?: string | null;
  constraints?: string[];
  evidence?: string[];
  provenance?: Record<string, unknown>;
  placement_rules?: PlacementRules;
  circulation_profile?: CirculationProfile;
  target_usable_area_m2?: number | null;
}

export interface PackageRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number | null;
  minimum_distance: number | null;
  maximum_distance: number | null;
  requires_visibility: boolean;
  mandatory: boolean;
  authority: string;
  provenance: Record<string, unknown>;
}

export interface PackageJourney {
  id: string;
  persona_id: string;
  weight: number;
  sequence: string[];
  time_of_day: string | null;
  season: string | null;
  frequency: number | null;
  dwell_time_minutes: number | null;
  mobility_requirements: string[];
  accessibility_requirements: string[];
  comfort_sensitivity: number | null;
  spending_behavior: string | null;
  provenance: Record<string, unknown>;
}

export interface MovementDemand {
  origin: string;
  destination: string;
  weight: number;
  journey_ids: string[];
  persona_ids: string[];
}

export interface DesignObjective {
  weight: number | null;
  enabled: boolean;
  authority: string;
}

export interface DuneTypology {
  id: string;
  name: string;
  inputs: string[];
  parameters: Record<string, unknown>;
  suitable_programs: string[];
  behavioral_effects: string[];
  climate_effects: string[];
  cost_class: string | null;
  construction_method: string | null;
  geometry_strategy: string | null;
  role?: string;
}

export interface ParkDesignPackage {
  package_id: string;
  schema_version: typeof PARK_DESIGN_PACKAGE_SCHEMA_VERSION | string;
  version: string;
  project: PackageProject;
  site: PackageSite;
  personas: PackagePersona[];
  program: PackageProgramItem[];
  relationships: PackageRelationship[];
  journeys: PackageJourney[];
  movement_demands: MovementDemand[];
  site_fields: Record<string, unknown>;
  design_objectives: Record<string, DesignObjective>;
  constraints: Record<string, unknown>;
  planting_requirements: Array<Record<string, unknown>>;
  dune_typologies: DuneTypology[];
  evidence: Record<string, unknown>;
  provenance: Record<string, unknown>;
  generation: { seed: number | null; settings: Record<string, unknown> };
  generated_at: string;
}

export type ValidationSeverity = 'error' | 'warning';

export interface PackageValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: ValidationSeverity;
  related_ids?: string[];
}

export interface PackageValidationResult {
  valid: boolean;
  errors: PackageValidationIssue[];
  warnings: PackageValidationIssue[];
  metrics: {
    program_count: number;
    relationship_count: number;
    journey_count: number;
    movement_demand_count: number;
    target_area_m2: number;
    exclusive_target_area_m2: number;
    shared_target_area_m2: number;
    overlay_target_area_m2: number;
    site_area_m2: number | null;
    brief_site_area_m2: number | null;
    measured_boundary_area_m2: number | null;
    exclusive_unallocated_area_m2: number | null;
    target_area_ratio: number | null;
    orphan_program_count: number;
  };
}

const allowedProgramClasses = new Set<ProgramClass>(['PATH', 'SPACE']);
const allowedSpaceClasses = new Set<Exclude<SpaceClass, null>>(['USER_SPECIFIC', 'COMMON', 'UTILITY']);
const allowedCommonClasses = new Set<Exclude<CommonClass, null>>(['GENERAL', 'COMMERCIAL', 'EXPERIENCE']);

function issue(severity: ValidationSeverity, code: string, path: string, message: string, related_ids?: string[]): PackageValidationIssue {
  return { code, path, message, severity, ...(related_ids?.length ? { related_ids } : {}) };
}

function validWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateParkDesignPackage(pkg: ParkDesignPackage): PackageValidationResult {
  const errors: PackageValidationIssue[] = [];
  const warnings: PackageValidationIssue[] = [];
  const add = (entry: PackageValidationIssue) => (entry.severity === 'error' ? errors : warnings).push(entry);
  const programs = Array.isArray(pkg?.program) ? pkg.program : [];
  const relationships = Array.isArray(pkg?.relationships) ? pkg.relationships : [];
  const journeys = Array.isArray(pkg?.journeys) ? pkg.journeys : [];
  const movementDemands = Array.isArray(pkg?.movement_demands) ? pkg.movement_demands : [];
  const siteArea = finitePositive(pkg?.site?.area_m2) ?? finitePositive(pkg?.project?.total_site_area_m2);

  if (!pkg || typeof pkg !== 'object') {
    add(issue('error', 'PACKAGE_MALFORMED', '$', 'The design package must be an object.'));
  }
  if (!pkg?.schema_version) add(issue('error', 'SCHEMA_VERSION_MISSING', 'schema_version', 'schema_version is required.'));
  if (!pkg?.project?.id || !pkg?.project?.name) add(issue('error', 'PROJECT_MISSING', 'project', 'project.id and project.name are required.'));
  if (!pkg?.site?.crs || !pkg?.site?.units) add(issue('error', 'SITE_REFERENCE_MISSING', 'site', 'site.crs and site.units are required.'));
  if (!siteArea) add(issue('warning', 'SITE_AREA_MISSING', 'site.area_m2', 'A positive site area is required before area compliance can be evaluated.'));

  const counts = new Map<string, number>();
  for (const program of programs) counts.set(program.id, (counts.get(program.id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (!id.trim() || count > 1) add(issue('error', 'PROGRAM_ID_DUPLICATE', 'program', `Program id '${id}' is blank or duplicated.`, [id]));
  }
  const programIds = new Set(programs.map(program => program.id));

  programs.forEach((program, index) => {
    const path = `program[${index}]`;
    if (!allowedProgramClasses.has(program.program_class)) add(issue('error', 'PROGRAM_CLASS_INVALID', `${path}.program_class`, `Unsupported program class '${program.program_class}'.`, [program.id]));
    if (program.program_class === 'SPACE' && (!program.space_class || !allowedSpaceClasses.has(program.space_class))) add(issue('error', 'SPACE_CLASS_INVALID', `${path}.space_class`, 'SPACE programs require USER_SPECIFIC, COMMON, or UTILITY classification.', [program.id]));
    if (program.space_class === 'COMMON' && (!program.common_class || !allowedCommonClasses.has(program.common_class))) add(issue('error', 'COMMON_CLASS_INVALID', `${path}.common_class`, 'COMMON spaces require GENERAL, COMMERCIAL, or EXPERIENCE classification.', [program.id]));
    if (!validWeight(program.priority)) add(issue('error', 'PROGRAM_PRIORITY_INVALID', `${path}.priority`, 'Program priority must be between 0 and 1.', [program.id]));

    const min = finiteNonNegative(program.min_area);
    const target = finiteNonNegative(program.target_area);
    const max = finiteNonNegative(program.max_area);
    for (const [field, raw] of [['min_area', program.min_area], ['target_area', program.target_area], ['max_area', program.max_area]] as const) {
      if (raw !== null && finiteNonNegative(raw) === null) add(issue('error', 'PROGRAM_AREA_INVALID', `${path}.${field}`, `${field} must be a finite non-negative number or null.`, [program.id]));
    }
    if (program.program_class === 'SPACE' && program.geometry_type === 'area' && program.required && target === null) {
      const spatialMode = String(program.provenance?.spatial_mode ?? 'exclusive');
      if (spatialMode === 'overlay') {
        const coverage = finiteNonNegative(program.provenance?.coverage_target_percent);
        if (coverage === null) add(issue('warning', 'PROGRAM_COVERAGE_TARGET_MISSING', `${path}.provenance.coverage_target_percent`, 'Required landscape overlay has no designer-approved coverage target.', [program.id]));
        else if (coverage > 100) add(issue('error', 'PROGRAM_COVERAGE_TARGET_INVALID', `${path}.provenance.coverage_target_percent`, 'Coverage target must be between 0 and 100 percent.', [program.id]));
      } else {
        add(issue('warning', 'PROGRAM_AREA_MISSING', `${path}.target_area`, 'Required exclusive/shared area program has no approved target area and must remain an intent proxy.', [program.id]));
      }
    }
    if (min !== null && max !== null && min > max) add(issue('error', 'PROGRAM_AREA_RANGE_INVALID', path, 'min_area cannot exceed max_area.', [program.id]));
    if (target !== null && min !== null && target < min) add(issue('error', 'PROGRAM_TARGET_BELOW_MINIMUM', `${path}.target_area`, 'target_area is below min_area.', [program.id]));
    if (target !== null && max !== null && target > max) add(issue('error', 'PROGRAM_TARGET_ABOVE_MAXIMUM', `${path}.target_area`, 'target_area exceeds max_area.', [program.id]));

    const geometry = program.geometry_preferences;
    if (!geometry) {
      add(issue('warning', 'GEOMETRY_PREFERENCES_MISSING', `${path}.geometry_preferences`, 'Spatial program has no geometry preference object.', [program.id]));
    } else {
      const ratioMin = finitePositive(geometry.preferred_aspect_ratio_min);
      const ratioMax = finitePositive(geometry.preferred_aspect_ratio_max);
      if (ratioMin !== null && ratioMax !== null && ratioMin > ratioMax) add(issue('error', 'GEOMETRY_ASPECT_RATIO_INVALID', `${path}.geometry_preferences`, 'Minimum aspect ratio cannot exceed maximum aspect ratio.', [program.id]));
      if (geometry.compactness !== null && !validWeight(geometry.compactness)) add(issue('error', 'GEOMETRY_COMPACTNESS_INVALID', `${path}.geometry_preferences.compactness`, 'Compactness must be between 0 and 1.', [program.id]));
      if (geometry.minimum_width !== null && finitePositive(geometry.minimum_width) === null) add(issue('error', 'GEOMETRY_MINIMUM_WIDTH_INVALID', `${path}.geometry_preferences.minimum_width`, 'Minimum width must be positive.', [program.id]));
    }
    if (program.required && !program.suitability_field && !(program.constraints?.length) && program.program_class === 'SPACE') {
      add(issue('warning', 'PROGRAM_SPATIAL_RULES_MISSING', path, 'Required space has neither a suitability field nor explicit spatial constraints.', [program.id]));
    }
  });

  relationships.forEach((relationship, index) => {
    const path = `relationships[${index}]`;
    if (!programIds.has(relationship.source)) add(issue('error', 'RELATIONSHIP_SOURCE_MISSING', `${path}.source`, `Unknown source program '${relationship.source}'.`, [relationship.id, relationship.source]));
    if (!programIds.has(relationship.target)) add(issue('error', 'RELATIONSHIP_TARGET_MISSING', `${path}.target`, `Unknown target program '${relationship.target}'.`, [relationship.id, relationship.target]));
    if (relationship.weight !== null && !validWeight(relationship.weight)) add(issue('error', 'RELATIONSHIP_WEIGHT_INVALID', `${path}.weight`, 'Relationship weight must be between 0 and 1.', [relationship.id]));
    const min = finiteNonNegative(relationship.minimum_distance);
    const max = finiteNonNegative(relationship.maximum_distance);
    if (min !== null && max !== null && min > max) add(issue('error', 'RELATIONSHIP_DISTANCE_CONFLICT', path, 'minimum_distance cannot exceed maximum_distance.', [relationship.id]));
  });

  const relationshipKinds = new Map<string, Set<string>>();
  for (const relationship of relationships.filter(item => item.mandatory)) {
    const pair = [relationship.source, relationship.target].sort().join('\u0000');
    const kinds = relationshipKinds.get(pair) ?? new Set<string>();
    kinds.add(relationship.type.toLowerCase());
    relationshipKinds.set(pair, kinds);
  }
  for (const [pair, kinds] of relationshipKinds) {
    const attractive = [...kinds].some(kind => ['adjacency', 'preferred_adjacency', 'preferred', 'supervision', 'shared_edge'].includes(kind));
    const repulsive = [...kinds].some(kind => ['avoid', 'avoidance', 'acoustic_separation'].includes(kind));
    if (attractive && repulsive) {
      const ids = pair.split('\u0000');
      add(issue('error', 'RELATIONSHIP_CONSTRAINT_CONFLICT', 'relationships', `Mandatory attractive and avoidance constraints conflict for '${ids[0]}' and '${ids[1]}'.`, ids));
    }
  }

  journeys.forEach((journey, index) => {
    const path = `journeys[${index}]`;
    if (!validWeight(journey.weight)) add(issue('error', 'JOURNEY_WEIGHT_INVALID', `${path}.weight`, 'Journey weight must be between 0 and 1.', [journey.id]));
    for (const spaceId of journey.sequence) {
      if (!programIds.has(spaceId)) add(issue('error', 'JOURNEY_PROGRAM_MISSING', `${path}.sequence`, `Journey references unknown program '${spaceId}'.`, [journey.id, spaceId]));
    }
  });

  for (const [name, objective] of Object.entries(pkg?.design_objectives ?? {})) {
    if (objective.weight !== null && !validWeight(objective.weight)) add(issue('error', 'OBJECTIVE_WEIGHT_INVALID', `design_objectives.${name}.weight`, 'Objective weight must be between 0 and 1.'));
  }
  movementDemands.forEach((demand, index) => {
    if (!programIds.has(demand.origin) || !programIds.has(demand.destination)) add(issue('error', 'MOVEMENT_DEMAND_PROGRAM_MISSING', `movement_demands[${index}]`, 'Movement demand references an unknown program.', [demand.origin, demand.destination]));
    if (!Number.isFinite(demand.weight) || demand.weight < 0) add(issue('error', 'MOVEMENT_DEMAND_WEIGHT_INVALID', `movement_demands[${index}].weight`, 'Movement demand weight must be non-negative.'));
  });

  const linked = new Set<string>();
  relationships.forEach(r => { linked.add(r.source); linked.add(r.target); });
  journeys.forEach(j => j.sequence.forEach(id => linked.add(id)));
  const orphans = programs.filter(program => !linked.has(program.id));
  if (orphans.length) add(issue('warning', 'ORPHAN_PROGRAMS', 'program', `${orphans.length} programs have no relationship or journey connection.`, orphans.map(program => program.id)));

  const targetArea = programs.reduce((sum, program) => sum + (finiteNonNegative(program.target_area) ?? 0), 0);
  const exclusiveTargetArea = programs.reduce((sum, program) => sum + (program.program_class === 'SPACE' && !['shared', 'overlay'].includes(String(program.provenance?.spatial_mode)) ? (finiteNonNegative(program.target_area) ?? 0) : 0), 0);
  const sharedTargetArea = programs.reduce((sum, program) => sum + (program.program_class === 'SPACE' && String(program.provenance?.spatial_mode) === 'shared' ? (finiteNonNegative(program.target_area) ?? 0) : 0), 0);
  const overlayTargetArea = programs.reduce((sum, program) => sum + (program.program_class === 'SPACE' && String(program.provenance?.spatial_mode) === 'overlay' ? (finiteNonNegative(program.target_area) ?? 0) : 0), 0);
  const briefSiteArea = finitePositive(pkg?.project?.total_site_area_m2);
  const measuredBoundaryArea = finitePositive(pkg?.site?.area_m2);
  if (siteArea !== null && exclusiveTargetArea > siteArea) add(issue('error', 'PROGRAM_AREA_EXCEEDS_SITE', 'program', `Exclusive target area ${exclusiveTargetArea.toFixed(2)} m² exceeds site area ${siteArea.toFixed(2)} m².`));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      program_count: programs.length,
      relationship_count: relationships.length,
      journey_count: journeys.length,
      movement_demand_count: movementDemands.length,
      target_area_m2: round(targetArea),
      exclusive_target_area_m2: round(exclusiveTargetArea),
      shared_target_area_m2: round(sharedTargetArea),
      overlay_target_area_m2: round(overlayTargetArea),
      site_area_m2: siteArea,
      brief_site_area_m2: briefSiteArea,
      measured_boundary_area_m2: measuredBoundaryArea,
      exclusive_unallocated_area_m2: siteArea === null ? null : round(siteArea - exclusiveTargetArea),
      target_area_ratio: siteArea ? round(exclusiveTargetArea / siteArea) : null,
      orphan_program_count: orphans.length
    }
  };
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

export function serializeParkDesignPackage(pkg: ParkDesignPackage, space = 2): string {
  return JSON.stringify(sortJson(pkg), null, space);
}

export function deterministicPackageId(projectId: string, version: string, payload: unknown): string {
  const text = JSON.stringify(sortJson({ projectId, version, payload }));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${slug(projectId)}-${version}-${hash.toString(16).padStart(8, '0')}`;
}

export function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'park-project';
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function parkDesignPackageToCsv(pkg: ParkDesignPackage, section: 'program' | 'relationships'): string {
  const rows: Record<string, unknown>[] = section === 'program'
    ? pkg.program.map(item => ({ id: item.id, name: item.name, program_class: item.program_class, space_class: item.space_class, common_class: item.common_class, category: item.category, subcategory: item.subcategory, geometry_type: item.geometry_type, users: item.users, min_area: item.min_area, target_area: item.target_area, max_area: item.max_area, priority: item.priority, required: item.required, dune_preferences: item.dune_preferences }))
    : pkg.relationships.map(item => ({ id: item.id, source: item.source, target: item.target, type: item.type, weight: item.weight, minimum_distance: item.minimum_distance, maximum_distance: item.maximum_distance, requires_visibility: item.requires_visibility, mandatory: item.mandatory, authority: item.authority }));
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return [headers.map(csvCell).join(','), ...rows.map(row => headers.map(header => csvCell(row[header])).join(','))].join('\r\n');
}
