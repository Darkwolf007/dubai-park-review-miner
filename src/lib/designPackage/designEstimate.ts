import type { ParkDesignPackage } from './contract';
import type { AreaReconciliation } from './areaReconciliation';
import type { AestheticMateriality } from '../results/competitionBrief';

export interface DesignEstimateSettings {
  budgetTargetAed: number | null;
  costContingencyPercent: number | null;
  walkingPathLengthM: number | null;
  walkingPathWidthM: number | null;
  joggingPathWidthM: number | null;
  cyclingPathWidthM: number | null;
  servicePathLengthM: number | null;
  servicePathWidthM: number | null;
  treeCanopyAreaPerTreeM2: number | null;
  treeUnitCostAed: number | null;
  plantingCostAedPerM2: number | null;
}

const round = (value: number) => Math.round(value * 100) / 100;
const valid = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

function materialityForProgram(id: string, name: string): AestheticMateriality {
  const value = `${id} ${name}`.toLowerCase();
  if (value.includes('play') || value.includes('sensory')) return 'EPDM_RUBBER';
  if (['plaza', 'court', 'fitness', 'event'].some(token => value.includes(token))) return 'HIGH_ALBEDO_PAVING';
  if (['garden', 'planting', 'nature', 'habitat', 'bioswale'].some(token => value.includes(token))) return 'NATURAL_GRAVEL';
  return 'TURF';
}

export function buildApproximateDesignEstimate(input: {
  pkg: ParkDesignPackage;
  areaReconciliation: AreaReconciliation;
  sitePerimeterM: number;
  budgetCapAed: number;
  costRatesAedPerM2: Record<AestheticMateriality, number>;
  settings: DesignEstimateSettings;
}) {
  const areaPrograms = input.pkg.program.filter(program => program.program_class === 'SPACE' && program.geometry_type === 'area');
  const exclusivePrograms = areaPrograms.filter(program => String(program.provenance?.spatial_mode) === 'exclusive');
  const quantifiedExclusive = exclusivePrograms.filter(program => valid(program.target_area) !== null);
  const spacesCost = quantifiedExclusive.reduce((sum, program) => {
    const material = materialityForProgram(program.id, program.name);
    return sum + (valid(program.target_area) ?? 0) * input.costRatesAedPerM2[material];
  }, 0);

  const pathRate = input.costRatesAedPerM2.HIGH_ALBEDO_PAVING;
  const pathInputs = [
    { id: 'walkingPromenade', count: 1, role: 'weighted_program_network', length: valid(input.settings.walkingPathLengthM), width: valid(input.settings.walkingPathWidthM), source: 'designer_assumption_required' },
    { id: 'joggingLoop', count: 1, role: 'closed_loop', length: 1000, width: valid(input.settings.joggingPathWidthM), source: 'competition_brief_approximate_1_km' },
    { id: 'exerciseCyclingLoop', count: 1, role: 'distinct_closed_loop', length: round(input.sitePerimeterM), width: valid(input.settings.cyclingPathWidthM), source: 'measured_site_perimeter_proxy' },
    { id: 'serviceAccess', count: { minimum: 1, maximum: 2 }, role: 'entrance_to_operations_spur', length: valid(input.settings.servicePathLengthM), width: valid(input.settings.servicePathWidthM), source: 'designer_assumption_required' }
  ].map(path => {
    const surfaceArea = path.length === null || path.width === null ? null : round(path.length * path.width);
    return { ...path, approximate_area_m2: surfaceArea, approximate_cost_aed: surfaceArea === null ? null : round(surfaceArea * pathRate), cost_rate_aed_per_m2: pathRate };
  });
  const knownPathCosts = pathInputs.map(path => path.approximate_cost_aed).filter((value): value is number => value !== null);

  const treeCoverage = input.areaReconciliation.coverage_targets.find(target => target.program_id === 'treePlanting')?.equivalent_area_m2 ?? null;
  const nativeCoverage = input.areaReconciliation.coverage_targets.find(target => target.program_id === 'nativePlanting')?.equivalent_area_m2 ?? null;
  const canopyPerTree = valid(input.settings.treeCanopyAreaPerTreeM2);
  const treeCount = treeCoverage === null || !canopyPerTree ? null : Math.ceil(treeCoverage / canopyPerTree);
  const treeCost = treeCount === null || valid(input.settings.treeUnitCostAed) === null ? null : round(treeCount * Number(input.settings.treeUnitCostAed));
  const plantingCost = nativeCoverage === null || valid(input.settings.plantingCostAedPerM2) === null ? null : round(nativeCoverage * Number(input.settings.plantingCostAedPerM2));

  const relationshipsWithWeight = input.pkg.relationships.filter(relationship => valid(relationship.weight) !== null).length;
  const spacesScore = exclusivePrograms.length ? round(100 * quantifiedExclusive.length / exclusivePrograms.length) : 0;
  const pathsScore = round(100 * pathInputs.filter(path => path.length !== null && path.width !== null).length / pathInputs.length);
  const adjacencyScore = input.pkg.relationships.length ? round(100 * relationshipsWithWeight / input.pkg.relationships.length) : 0;
  const plantInputs = [treeCoverage, nativeCoverage, canopyPerTree, valid(input.settings.treeUnitCostAed), valid(input.settings.plantingCostAedPerM2)];
  const plantsScore = round(100 * plantInputs.filter(value => value !== null).length / plantInputs.length);

  const knownBaseCost = spacesCost + knownPathCosts.reduce((sum, value) => sum + value, 0) + (treeCost ?? 0) + (plantingCost ?? 0);
  const contingencyPercent = valid(input.settings.costContingencyPercent) ?? 0;
  const knownCostWithContingency = round(knownBaseCost * (1 + contingencyPercent / 100));
  const budgetTarget = valid(input.settings.budgetTargetAed) ?? input.budgetCapAed;
  const estimateComplete = knownPathCosts.length === pathInputs.length && treeCost !== null && plantingCost !== null;

  return {
    schema_version: '0.1.0',
    estimate_nature: 'early_stage_approximation_not_bill_of_quantities',
    scores_0_to_100: {
      spaces: spacesScore,
      paths: pathsScore,
      adjacency: adjacencyScore,
      plants: plantsScore,
      overall_readiness: round((spacesScore + pathsScore + adjacencyScore + plantsScore) / 4)
    },
    spaces: {
      required_exclusive_count: exclusivePrograms.length,
      quantified_exclusive_count: quantifiedExclusive.length,
      approximate_exclusive_area_m2: input.areaReconciliation.exclusive_committed_area_m2,
      shared_nominal_area_m2: input.areaReconciliation.shared_demand_area_m2,
      approximate_cost_aed: round(spacesCost),
      cost_scope: 'quantified_exclusive_program_targets_only',
      cost_method: 'target_area_times_competition_brief_material_rate_guidance'
    },
    paths: {
      physical_system_count: 4,
      modifier_layer_count: 2,
      systems: pathInputs,
      known_approximate_length_m: round(pathInputs.reduce((sum, path) => sum + (path.length ?? 0), 0)),
      approximate_cost_aed: knownPathCosts.length ? round(knownPathCosts.reduce((sum, value) => sum + value, 0)) : null,
      unresolved_system_ids: pathInputs.filter(path => path.length === null || path.width === null).map(path => path.id)
    },
    adjacency: {
      relationship_count: input.pkg.relationships.length,
      weighted_relationship_count: relationshipsWithWeight,
      mandatory_relationship_count: input.pkg.relationships.filter(relationship => relationship.mandatory).length,
      status: 'scores_are_definition_completeness_until_geometry_exists'
    },
    plants: {
      planting_zone_count: input.pkg.planting_requirements.length,
      tree_canopy_area_m2: treeCoverage,
      native_planting_area_m2: nativeCoverage,
      approximate_tree_count: treeCount,
      approximate_tree_cost_aed: treeCost,
      approximate_native_planting_cost_aed: plantingCost,
      count_method: 'tree_canopy_coverage_area_divided_by_designer_canopy_area_per_tree'
    },
    budget: {
      competition_cap_aed: input.budgetCapAed,
      scenario_target_aed: budgetTarget,
      scenario_factor_of_cap: round(budgetTarget / input.budgetCapAed),
      contingency_percent: contingencyPercent,
      known_cost_subtotal_aed: round(knownBaseCost),
      known_cost_with_contingency_aed: knownCostWithContingency,
      estimate_status: estimateComplete ? 'complete_approximation' : 'partial_lower_bound',
      target_status: knownCostWithContingency <= budgetTarget ? (estimateComplete ? 'within_target' : 'known_cost_within_target_incomplete') : 'known_cost_exceeds_target'
    },
    caveats: [
      'Accessible coverage and shade priority are attributes on the walking network, not additional physical path counts.',
      'Shared program areas and planting overlays may overlap and are not blindly summed into construction area.',
      'Unknown dimensions or unit rates remain null; the estimator does not invent missing standards.'
    ]
  };
}
