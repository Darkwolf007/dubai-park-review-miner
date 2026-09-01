import type { OpportunityResult } from '../gis/opportunityEngine';

export type AreaReconciliationStatus = 'complete' | 'incomplete' | 'overallocated';
export type ProgramSpatialMode = 'exclusive' | 'shared' | 'overlay';

export interface AreaPlanningInputs {
  operationsAreaM2: number | null;
  dropOffAreaM2: number | null;
  circulationAreaM2: number | null;
  treeCanopyCoveragePercent: number | null;
  nativePlantingCoveragePercent: number | null;
  habitatCoveragePercent: number | null;
  bioswaleCoveragePercent: number | null;
}

export interface CoverageTarget {
  program_id: string;
  label: string;
  percent: number | null;
  equivalent_area_m2: number | null;
}

export interface AreaReconciliation {
  status: AreaReconciliationStatus;
  brief_gross_area_m2: number;
  measured_boundary_area_m2: number | null;
  measured_to_brief_variance_m2: number | null;
  exclusive_program_area_m2: number;
  operations_area_m2: number | null;
  drop_off_area_m2: number | null;
  circulation_area_m2: number | null;
  exclusive_committed_area_m2: number;
  remaining_area_m2: number | null;
  shared_demand_area_m2: number;
  overlay_target_area_m2: number;
  maximum_leasable_area_m2: number;
  maximum_leasable_area_percent: number;
  unresolved_exclusive_program_ids: string[];
  unresolved_coverage_program_ids: string[];
  coverage_targets: CoverageTarget[];
  notes: string[];
}

const OVERLAY_IDS = new Set(['biodiversityHabitat', 'nativePlanting', 'treePlanting', 'bioswale']);
const SHARED_IDS = new Set(['flexibleEventLawn', 'multipurposeLawn', 'flexibleRecreation', 'smallEventZone', 'sensoryGarden', 'picnicArea', 'naturePlay', 'wellnessZone']);

export function programSpatialMode(id: string): ProgramSpatialMode {
  if (OVERLAY_IDS.has(id)) return 'overlay';
  if (SHARED_IDS.has(id)) return 'shared';
  return 'exclusive';
}

export function coverageTargetPercent(id: string, settings: AreaPlanningInputs): number | null {
  if (id === 'treePlanting') return settings.treeCanopyCoveragePercent;
  if (id === 'nativePlanting') return settings.nativePlantingCoveragePercent;
  if (id === 'biodiversityHabitat') return settings.habitatCoveragePercent;
  if (id === 'bioswale') return settings.bioswaleCoveragePercent;
  return null;
}

function targetArea(opportunity: OpportunityResult, settings: AreaPlanningInputs): number | null {
  if (opportunity.type === 'operationsArea') return settings.operationsAreaM2;
  if (opportunity.type === 'dropOffZone') return settings.dropOffAreaM2;
  const target = opportunity.recommendedAreaM2?.target;
  return typeof target === 'number' && Number.isFinite(target) && target >= 0 ? target : null;
}

function validPercent(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildAreaReconciliation(input: {
  briefGrossAreaM2: number;
  measuredBoundaryAreaM2: number | null;
  maximumLeasableAreaPercent: number;
  opportunities: OpportunityResult[];
  settings: AreaPlanningInputs;
}): AreaReconciliation {
  const areaPrograms = input.opportunities.filter(opportunity => opportunity.geometryType === 'area');
  const unresolvedExclusiveProgramIds: string[] = [];
  let exclusiveProgramAreaM2 = 0;
  let sharedDemandAreaM2 = 0;
  let overlayTargetAreaM2 = 0;

  for (const opportunity of areaPrograms) {
    const mode = programSpatialMode(opportunity.type);
    const target = targetArea(opportunity, input.settings);
    if (mode === 'exclusive') {
      if (target === null) unresolvedExclusiveProgramIds.push(opportunity.type);
      else if (!['operationsArea', 'dropOffZone'].includes(opportunity.type)) exclusiveProgramAreaM2 += target;
    } else if (mode === 'shared') {
      sharedDemandAreaM2 += target ?? 0;
    } else {
      overlayTargetAreaM2 += target ?? 0;
    }
  }

  const coverageLabels: Record<string, string> = {
    treePlanting: 'Tree canopy',
    nativePlanting: 'Native planting',
    biodiversityHabitat: 'Biodiversity habitat',
    bioswale: 'Bioswale'
  };
  const measured = input.measuredBoundaryAreaM2;
  const coverageTargets = Object.entries(coverageLabels).map(([id, label]) => {
    const percent = validPercent(coverageTargetPercent(id, input.settings));
    return {
      program_id: id,
      label,
      percent,
      equivalent_area_m2: percent === null || measured === null ? null : round(measured * percent / 100)
    };
  });
  const unresolvedCoverageProgramIds = coverageTargets.filter(target => target.percent === null).map(target => target.program_id);
  const operations = input.settings.operationsAreaM2;
  const dropOff = input.settings.dropOffAreaM2;
  const circulation = input.settings.circulationAreaM2;
  const exclusiveCommitted = exclusiveProgramAreaM2 + (operations ?? 0) + (dropOff ?? 0) + (circulation ?? 0);
  const remaining = measured === null ? null : round(measured - exclusiveCommitted);
  const status: AreaReconciliationStatus = remaining !== null && remaining < 0
    ? 'overallocated'
    : unresolvedExclusiveProgramIds.length || circulation === null
      ? 'incomplete'
      : 'complete';

  return {
    status,
    brief_gross_area_m2: round(input.briefGrossAreaM2),
    measured_boundary_area_m2: measured === null ? null : round(measured),
    measured_to_brief_variance_m2: measured === null ? null : round(measured - input.briefGrossAreaM2),
    exclusive_program_area_m2: round(exclusiveProgramAreaM2),
    operations_area_m2: operations,
    drop_off_area_m2: dropOff,
    circulation_area_m2: circulation,
    exclusive_committed_area_m2: round(exclusiveCommitted),
    remaining_area_m2: remaining,
    shared_demand_area_m2: round(sharedDemandAreaM2),
    overlay_target_area_m2: round(overlayTargetAreaM2),
    maximum_leasable_area_m2: round(input.briefGrossAreaM2 * input.maximumLeasableAreaPercent / 100),
    maximum_leasable_area_percent: input.maximumLeasableAreaPercent,
    unresolved_exclusive_program_ids: unresolvedExclusiveProgramIds.sort(),
    unresolved_coverage_program_ids: unresolvedCoverageProgramIds,
    coverage_targets: coverageTargets,
    notes: [
      'Measured boundary area governs geometric containment; the brief gross area remains the authoritative project statement.',
      'Shared-space demand is nominal and may overlap compatible territories; it is not added to exclusive committed area.',
      'Landscape coverage targets overlap program territories and are not subtracted from remaining area.'
    ]
  };
}
