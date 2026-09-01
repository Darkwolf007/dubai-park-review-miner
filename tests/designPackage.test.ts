import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalParkDesignPackage, aggregateMovementDemands } from '../src/lib/designPackage/canonicalAdapter';
import {
  serializeParkDesignPackage,
  validateParkDesignPackage,
  type PackageJourney,
  type ParkDesignPackage
} from '../src/lib/designPackage/contract';
import { buildAreaReconciliation } from '../src/lib/designPackage/areaReconciliation';
import type { OpportunityResult } from '../src/lib/gis/opportunityEngine';

function rawProgram(id: string, target = 100) {
  return {
    id,
    name: id,
    category: 'Play',
    geometry_type: 'area',
    mandatory: true,
    priority: 0.8,
    target_area_m2: target,
    minimum_area_m2: 80,
    maximum_area_m2: 120,
    area_status: 'designer_input',
    suitability_field: `${id}_suitability`,
    ontology: { program_class: 'SPACE', space_class: 'USER_SPECIFIC', common_class: null },
    spatial_behavior: 'OBJECT',
    user_group_ids: ['families'],
    temporal_profile: { weekend_morning: 0.9 },
    seasonal_profile: { summer: 0.8 },
    performance_attributes: { shadeDemand: 0.8, ecologicalValue: 0.3, quietDemand: 0.2, eveningSuitability: 0.5, socialIntensity: 0.7, activityIntensity: 0.9 },
    commercial: { revenuePotential: 0.1 },
    dune_compatibility: { D0: 0.2, D5: 1 },
    constraints: ['inside_site'],
    evidence: ['test evidence'],
    evidence_sources: ['designer-assumption'],
    spatial_mode: 'exclusive'
  };
}

function packageFixture(): ParkDesignPackage {
  return buildCanonicalParkDesignPackage({
    siteName: 'Test Park',
    generatedAt: '2026-09-01T00:00:00.000Z',
    boundaryUtm: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]],
    areaPrograms: [rawProgram('ENTRY'), rawProgram('PLAY')],
    nodePrograms: [],
    routePrograms: [],
    acceptedRuleEdges: [{ edge_id: 'RULE_1', source_node_id: 'ENTRY', target_node_id: 'PLAY', relationship_type: 'maximum_distance', mandatory: true, decision: 'accepted', numeric_constraint: { value: 50, unit: 'm', parameter: 'maximum_distance', document_id: 'DOC_1', page: 4, section: 'Access', rule_id: 'RULE_1', approval_status: 'approved' }, source_rule: { rule_id: 'RULE_1', document_id: 'DOC_1', page: 4, section: 'Access' } }, { edge_id: 'RULE_REJECTED', decision: 'rejected', source_node_id: 'ENTRY', target_node_id: 'PLAY' }],
    designerRelationships: [],
    advisoryRelationships: [],
    parametricRelationships: [],
    personaJourneys: [{ archetypeKey: 'family', archetype: 'Family', ageGroup: 'Adults', demandScore: 80, journeys: [{ journeyId: 'J1', timeOfDay: 'EVENING', season: 'SUMMER', steps: [{ spaceId: 'ENTRY' }, { spaceId: 'PLAY' }] }] }],
    userGroups: [],
    gridCells: [],
    climateMorphology: {},
    plantingStrategy: { hydrozones: [] },
    movementRequirements: {},
    terrainRequirements: {},
    masterplanSettings: {},
    unresolvedRules: [],
    duneTypes: [{ id: 'D5', name: 'Play dune', role: 'play' }],
    generationSeed: 42
  });
}

test('canonical adapter preserves approved numeric provenance and excludes rejected rules', () => {
  const pkg = packageFixture();
  assert.equal(pkg.relationships.length, 1);
  assert.equal(pkg.relationships[0].maximum_distance, 50);
  assert.equal((pkg.relationships[0].provenance.source_rule as any).document_id, 'DOC_1');
  assert.equal(pkg.generation.seed, 42);
});

test('valid package serializes deterministically and aggregates persona movement', () => {
  const first = packageFixture();
  const second = packageFixture();
  assert.equal(first.package_id, second.package_id);
  assert.equal(serializeParkDesignPackage(first), serializeParkDesignPackage(second));
  assert.deepEqual(first.movement_demands, [{ origin: 'ENTRY', destination: 'PLAY', weight: 0.8, journey_ids: ['J1'], persona_ids: ['family'] }]);
  assert.equal(validateParkDesignPackage(first).valid, true);
});

test('validator reports duplicate ids, invalid areas, missing relationship and journey references', () => {
  const pkg = packageFixture();
  pkg.program.push({ ...structuredClone(pkg.program[1]), min_area: 130, target_area: 125, max_area: 120 });
  pkg.relationships.push({ id: 'BROKEN', source: 'PLAY', target: 'MISSING', type: 'adjacency', weight: 2, minimum_distance: 20, maximum_distance: 10, requires_visibility: false, mandatory: false, authority: 'test', provenance: {} });
  pkg.journeys.push({ ...structuredClone(pkg.journeys[0]), id: 'J2', sequence: ['ENTRY', 'MISSING'] });
  const result = validateParkDesignPackage(pkg);
  const codes = new Set(result.errors.map(error => error.code));
  assert.equal(result.valid, false);
  for (const code of ['PROGRAM_ID_DUPLICATE', 'PROGRAM_AREA_RANGE_INVALID', 'PROGRAM_TARGET_BELOW_MINIMUM', 'RELATIONSHIP_TARGET_MISSING', 'RELATIONSHIP_WEIGHT_INVALID', 'RELATIONSHIP_DISTANCE_CONFLICT', 'JOURNEY_PROGRAM_MISSING']) assert.ok(codes.has(code), code);
});

test('validator rejects exclusive target area above site area', () => {
  const pkg = packageFixture();
  pkg.site.area_m2 = 150;
  pkg.project.total_site_area_m2 = 150;
  const result = validateParkDesignPackage(pkg);
  assert.ok(result.errors.some(error => error.code === 'PROGRAM_AREA_EXCEEDS_SITE'));
});

test('OD aggregation is stable and combines repeated journey legs', () => {
  const journeys: PackageJourney[] = [
    { id: 'A', persona_id: 'p1', weight: 0.4, sequence: ['X', 'Y', 'Z'], time_of_day: null, season: null, frequency: null, dwell_time_minutes: null, mobility_requirements: [], accessibility_requirements: [], comfort_sensitivity: null, spending_behavior: null, provenance: {} },
    { id: 'B', persona_id: 'p2', weight: 0.6, sequence: ['X', 'Y'], time_of_day: null, season: null, frequency: null, dwell_time_minutes: null, mobility_requirements: [], accessibility_requirements: [], comfort_sensitivity: null, spending_behavior: null, provenance: {} }
  ];
  assert.deepEqual(aggregateMovementDemands(journeys), [
    { origin: 'X', destination: 'Y', weight: 1, journey_ids: ['A', 'B'], persona_ids: ['p1', 'p2'] },
    { origin: 'Y', destination: 'Z', weight: 0.4, journey_ids: ['A'], persona_ids: ['p1'] }
  ]);
});

test('brief area statement remains distinct from measured boundary and program subtotal', () => {
  const pkg = buildCanonicalParkDesignPackage({
    siteName: 'Al Safa 2 Neighborhood Park',
    generatedAt: '2026-09-01T00:00:00.000Z',
    boundaryUtm: [[[0, 0], [100, 0], [100, 90], [0, 90], [0, 0]]],
    areaPrograms: [rawProgram('PLAY', 1000)], nodePrograms: [], routePrograms: [],
    acceptedRuleEdges: [], designerRelationships: [], advisoryRelationships: [], parametricRelationships: [],
    userGroups: [], gridCells: [], climateMorphology: {}, plantingStrategy: { hydrozones: [] },
    movementRequirements: {}, terrainRequirements: {}, masterplanSettings: {}, unresolvedRules: [], duneTypes: [],
    briefAreaStatement: {
      grossSiteAreaM2: 15000, qualifier: 'approximately', parkArchetype: 'neighborhood_park',
      neighborhoodParkAreaRangesM2: {}, maximumLeasableAreaPercent: 15,
      authority: 'competition_brief', sources: []
    }
  });
  const result = validateParkDesignPackage(pkg);
  assert.equal(pkg.project.total_site_area_m2, 15000);
  assert.equal(pkg.site.area_m2, 9000);
  assert.equal(result.metrics.brief_site_area_m2, 15000);
  assert.equal(result.metrics.measured_boundary_area_m2, 9000);
  assert.equal(result.metrics.exclusive_unallocated_area_m2, 8000);
});

test('area reconciliation separates exclusive, shared and overlay commitments', () => {
  const opportunity = (type: string, target: number | null): OpportunityResult => ({
    type,
    geometryType: 'area',
    recommendedAreaM2: target === null ? undefined : { minimum: target, target, maximum: target }
  } as unknown as OpportunityResult);
  const reconciliation = buildAreaReconciliation({
    briefGrossAreaM2: 15000,
    measuredBoundaryAreaM2: 14736.99,
    maximumLeasableAreaPercent: 15,
    opportunities: [
      opportunity('inclusivePlayground', 1600),
      opportunity('operationsArea', null),
      opportunity('dropOffZone', null),
      opportunity('multipurposeLawn', 2000),
      opportunity('treePlanting', null)
    ],
    settings: {
      operationsAreaM2: 300,
      dropOffAreaM2: 200,
      circulationAreaM2: 2500,
      treeCanopyCoveragePercent: 40,
      nativePlantingCoveragePercent: null,
      habitatCoveragePercent: null,
      bioswaleCoveragePercent: null
    }
  });
  assert.equal(reconciliation.status, 'complete');
  assert.equal(reconciliation.exclusive_program_area_m2, 1600);
  assert.equal(reconciliation.exclusive_committed_area_m2, 4600);
  assert.equal(reconciliation.remaining_area_m2, 10136.99);
  assert.equal(reconciliation.shared_demand_area_m2, 2000);
  assert.equal(reconciliation.coverage_targets.find(target => target.program_id === 'treePlanting')?.equivalent_area_m2, 5894.8);
  assert.equal(reconciliation.maximum_leasable_area_m2, 2250);
});
