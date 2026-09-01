import type { GeometryType, OpportunityCategory, OpportunityResult, Scale } from './opportunityEngine';

export type SpatialBehavior = 'NODE' | 'EDGE' | 'FIELD' | 'OBJECT';
export type ProgramClass = 'PATH' | 'SPACE';
export type SpaceClass = 'USER_SPECIFIC' | 'COMMON' | 'UTILITY';
export type CommonClass = 'GENERAL' | 'COMMERCIAL' | 'EXPERIENCE';

export interface ProgramOntologyInput {
  id: string;
  name: string;
  category: OpportunityCategory | string;
  geometryType: GeometryType | string;
  scale: Scale | string;
  primaryUsers: string[];
  minimumAreaM2?: number | null;
  targetAreaM2?: number | null;
  maximumAreaM2?: number | null;
  priority?: number;
  adjacency?: { preferred?: string[]; avoid?: string[]; service?: string[]; movement?: string[] };
}

export interface UserGroupDefinition {
  id: string;
  name: string;
  aliases: string[];
  needs: Record<string, number>;
  peakPeriods: string[];
  seasonalSensitivity: Record<string, number>;
}

export interface ParametricProgramDefinition {
  id: string;
  ontology: {
    programClass: ProgramClass;
    spaceClass: SpaceClass | null;
    commonClass: CommonClass | null;
  };
  spatialBehavior: SpatialBehavior;
  userGroupIds: string[];
  temporalProfile: Record<string, number>;
  seasonalProfile: Record<string, number>;
  performanceAttributes: Record<string, number>;
  commercial: { applicability: number; revenuePotential: number; spendingPowerSensitivity: number };
  duneCompatibility: Record<string, number>;
  pathDuneOperations: string[];
  areaRangeM2: { minimum: number | null; target: number | null; maximum: number | null };
}

export interface UserProgramSuitability {
  userGroupId: string;
  programId: string;
  weight: number;
  components: Record<string, number>;
  reason: string;
}

export interface ParametricRelationship {
  id: string;
  source: string;
  target: string;
  score: number;
  type: 'attract' | 'neutral' | 'repel';
  components: Record<string, number>;
  reason: string;
  authority: 'computed_advisory';
}

export const DUNE_TYPES = [
  { id: 'D0', name: 'Flat datum', role: 'courts, lawns and universally accessible clear ground' },
  { id: 'D1', name: 'Earth dune', role: 'grading, enclosure, screening and movement guidance' },
  { id: 'D2', name: 'Planted dune', role: 'shade, habitat, dust filtering and thermal buffering' },
  { id: 'D3', name: 'Seating dune', role: 'terraces, benches, steps and inhabitable edges' },
  { id: 'D4', name: 'Shade dune', role: 'lightweight solar-responsive canopy' },
  { id: 'D5', name: 'Play dune', role: 'integrated slopes, climbing, sliding and sensory play' },
  { id: 'D6', name: 'Cooling dune', role: 'protected canopy-rich microclimate hollow' },
  { id: 'D7', name: 'Architectural dune', role: 'gateway, pavilion, cafe or landmark' },
  { id: 'D8', name: 'Sikka valley', role: 'shaded primary movement corridor between ridges' },
  { id: 'D9', name: 'Baraha clearing', role: 'social clearing at movement convergence' },
  { id: 'D10', name: 'Ecological swale', role: 'drainage, hydrozone and biodiversity corridor' }
] as const;

const needs = (shade: number, access: number, safety: number, social: number, activity: number, quiet: number, affordability: number) =>
  ({ shade, accessibility: access, safety, social, activity, quiet, affordability });

export const USER_GROUPS: UserGroupDefinition[] = [
  { id: 'young_children', name: 'Young children', aliases: ['children', 'toddlers', 'young children'], needs: needs(1, .9, 1, .65, .8, .35, .8), peakPeriods: ['weekday_afternoon', 'weekend_morning'], seasonalSensitivity: { summer: 1, transition: .8, winter: .3 } },
  { id: 'older_children', name: 'Older children', aliases: ['older children'], needs: needs(.85, .75, .9, .75, 1, .2, .75), peakPeriods: ['weekday_afternoon', 'weekend_afternoon'], seasonalSensitivity: { summer: .95, transition: .75, winter: .25 } },
  { id: 'teenagers', name: 'Teenagers', aliases: ['teenagers', 'youth'], needs: needs(.75, .65, .7, .9, .9, .2, .8), peakPeriods: ['weekday_evening', 'weekend_evening'], seasonalSensitivity: { summer: .8, transition: .7, winter: .2 } },
  { id: 'young_adults', name: 'Young adults', aliases: ['young adults', 'adults'], needs: needs(.7, .65, .65, .75, .9, .3, .65), peakPeriods: ['weekday_evening', 'weekend_evening'], seasonalSensitivity: { summer: .8, transition: .65, winter: .2 } },
  { id: 'families', name: 'Families', aliases: ['families', 'family'], needs: needs(1, .9, .95, .9, .65, .45, .85), peakPeriods: ['weekend_morning', 'weekend_evening'], seasonalSensitivity: { summer: 1, transition: .85, winter: .3 } },
  { id: 'working_adults', name: 'Working adults', aliases: ['working adults'], needs: needs(.8, .7, .7, .55, .7, .65, .65), peakPeriods: ['weekday_early_morning', 'weekday_evening'], seasonalSensitivity: { summer: .85, transition: .7, winter: .2 } },
  { id: 'older_adults', name: 'Older adults', aliases: ['older adults', 'seniors'], needs: needs(1, 1, .95, .6, .45, .85, .85), peakPeriods: ['weekday_morning', 'weekend_morning'], seasonalSensitivity: { summer: 1, transition: .9, winter: .35 } },
  { id: 'people_of_determination', name: 'People of Determination', aliases: ['people of determination', 'pod'], needs: needs(.95, 1, 1, .55, .45, .7, .9), peakPeriods: ['weekday_morning', 'weekend_morning'], seasonalSensitivity: { summer: 1, transition: .9, winter: .35 } },
  { id: 'caregivers', name: 'Caregivers', aliases: ['caregivers'], needs: needs(1, .95, 1, .7, .35, .6, .85), peakPeriods: ['weekday_afternoon', 'weekend_morning'], seasonalSensitivity: { summer: 1, transition: .85, winter: .3 } },
  { id: 'active_users', name: 'Active users', aliases: ['joggers', 'exercise cyclists', 'cyclists', 'pedestrians'], needs: needs(.7, .7, .65, .35, 1, .25, .7), peakPeriods: ['weekday_early_morning', 'weekday_evening'], seasonalSensitivity: { summer: .85, transition: .7, winter: .2 } },
  { id: 'social_groups', name: 'Social and event groups', aliases: ['weekend social groups', 'residents', 'nearby residents', 'evening users'], needs: needs(.85, .75, .75, 1, .45, .25, .75), peakPeriods: ['weekend_evening', 'weekday_evening'], seasonalSensitivity: { summer: .9, transition: .75, winter: .25 } },
  { id: 'operations_staff', name: 'Operations and security staff', aliases: ['operations / maintenance staff', 'operations / security staff'], needs: needs(.55, .75, .8, .2, .6, .25, .4), peakPeriods: ['all_day'], seasonalSensitivity: { summer: .7, transition: .5, winter: .2 } },
  { id: 'all_visitors', name: 'All visitors', aliases: ['all visitors'], needs: needs(.9, .85, .85, .65, .55, .55, .8), peakPeriods: ['weekday_evening', 'weekend_evening'], seasonalSensitivity: { summer: .95, transition: .8, winter: .3 } },
  { id: 'ecology', name: 'Ecological beneficiaries', aliases: ['wildlife'], needs: { shade: .5, accessibility: 0, safety: .3, social: 0, activity: 0, quiet: 1, affordability: .5 }, peakPeriods: ['all_day'], seasonalSensitivity: { summer: .8, transition: .7, winter: .4 } }
];

const clamp = (value: number) => Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
const contains = (value: string, words: string[]) => words.some(word => value.toLowerCase().includes(word));

export function normalizeUserGroups(rawUsers: string[]): string[] {
  const normalized = new Set<string>();
  for (const raw of rawUsers) {
    const value = raw.trim().toLowerCase();
    const exact = USER_GROUPS.filter(group => group.aliases.some(alias => value === alias));
    const matches = exact.length ? exact : USER_GROUPS.filter(group => group.aliases.some(alias => alias.length >= 6 && value.includes(alias)));
    if (matches.length) matches.forEach(group => normalized.add(group.id));
    else normalized.add('all_visitors');
  }
  return [...normalized];
}

function classify(program: ProgramOntologyInput) {
  const programClass: ProgramClass = ['linear', 'network'].includes(program.geometryType) ? 'PATH' : 'SPACE';
  if (programClass === 'PATH') return { programClass, spaceClass: null, commonClass: null };
  if (program.category === 'Smart / Operations' || contains(program.name, ['restroom', 'waste', 'drinking', 'parking', 'drop-off']))
    return { programClass, spaceClass: 'UTILITY' as const, commonClass: null };
  if (contains(program.name, ['play', 'fitness', 'wellness', 'sensory', 'quiet', 'sports']))
    return { programClass, spaceClass: 'USER_SPECIFIC' as const, commonClass: null };
  if (contains(program.name, ['cafe', 'kiosk'])) return { programClass, spaceClass: 'COMMON' as const, commonClass: 'COMMERCIAL' as const };
  if (contains(program.name, ['digital', 'viewing', 'event'])) return { programClass, spaceClass: 'COMMON' as const, commonClass: 'EXPERIENCE' as const };
  return { programClass, spaceClass: 'COMMON' as const, commonClass: 'GENERAL' as const };
}

function behavior(program: ProgramOntologyInput): SpatialBehavior {
  if (['linear', 'network'].includes(program.geometryType)) return 'EDGE';
  if (program.geometryType === 'point' || program.scale === 'node') return 'NODE';
  if (program.category === 'Landscape / Environment' || contains(program.name, ['lawn', 'planting', 'habitat', 'bioswale'])) return 'FIELD';
  return 'OBJECT';
}

function performance(program: ProgramOntologyInput): Record<string, number> {
  const n = program.name.toLowerCase();
  const landscape = program.category === 'Landscape / Environment';
  const movement = program.category === 'Movement' || ['linear', 'network'].includes(program.geometryType);
  const play = program.category === 'Play';
  const social = program.category === 'Community / Social';
  const utility = classify(program).spaceClass === 'UTILITY';
  return {
    shadeDemand: clamp(contains(n, ['shade', 'quiet', 'sensory', 'picnic', 'play', 'seating', 'wellness']) ? .9 : movement ? .75 : .55),
    accessibilityDemand: clamp(contains(n, ['accessible', 'entrance', 'wayfinding', 'restroom', 'playground']) ? 1 : movement ? .85 : .65),
    safetySensitivity: clamp(play ? 1 : contains(n, ['cycling', 'service', 'drop-off', 'security']) ? .9 : .65),
    socialIntensity: clamp(social ? .9 : contains(n, ['plaza', 'cafe', 'play', 'lawn']) ? .75 : contains(n, ['quiet', 'habitat', 'operations']) ? .15 : .45),
    activityIntensity: clamp(program.category === 'Sports / Wellness' || movement || play ? .9 : .35),
    quietDemand: clamp(contains(n, ['quiet', 'sensory', 'habitat']) ? 1 : contains(n, ['event', 'sports', 'fitness', 'play']) ? .15 : .45),
    ecologicalValue: clamp(landscape ? .9 : contains(n, ['nature', 'tree', 'bioswale']) ? .8 : .2),
    waterDemand: clamp(contains(n, ['lawn', 'sensory', 'bioswale', 'tree']) ? .75 : landscape ? .45 : .2),
    heatMitigationValue: clamp(contains(n, ['tree', 'shade', 'bioswale', 'planting']) ? .95 : landscape ? .75 : .25),
    operationalLoad: clamp(utility ? .8 : contains(n, ['cafe', 'event', 'digital', 'play', 'sports']) ? .65 : .35),
    flexibility: clamp(contains(n, ['flexible', 'multipurpose', 'plaza', 'lawn']) ? 1 : behavior(program) === 'FIELD' ? .7 : .35),
    eveningSuitability: clamp(contains(n, ['lighting', 'event', 'plaza', 'cafe', 'jogging', 'walking']) ? .9 : .5)
  };
}

function duneScores(program: ProgramOntologyInput, p: Record<string, number>): Record<string, number> {
  const n = program.name.toLowerCase();
  const scores: Record<string, number> = { D0: .25, D1: .35, D2: .35, D3: .25, D4: p.shadeDemand, D5: .05, D6: (p.shadeDemand + p.heatMitigationValue) / 2, D7: .1, D8: .1, D9: .1, D10: .05 };
  if (contains(n, ['court', 'lawn', 'drop-off', 'operations'])) scores.D0 = .95;
  if (contains(n, ['play'])) Object.assign(scores, { D1: .7, D2: .75, D3: .65, D5: 1, D6: .9 });
  if (contains(n, ['seating', 'viewing'])) scores.D3 = 1;
  if (contains(n, ['entrance', 'cafe', 'kiosk'])) scores.D7 = .95;
  if (program.category === 'Community / Social') scores.D9 = .9;
  if (['linear', 'network'].includes(program.geometryType)) Object.assign(scores, { D8: 1, D1: .7, D2: .65 });
  if (contains(n, ['bioswale', 'irrigation', 'habitat', 'native'])) scores.D10 = 1;
  if (contains(n, ['tree', 'planting'])) scores.D2 = 1;
  return Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, clamp(value)]));
}

function temporal(program: ProgramOntologyInput) {
  const n = program.name.toLowerCase();
  const event = contains(n, ['event', 'plaza', 'cafe']);
  const active = program.category === 'Sports / Wellness' || program.category === 'Movement';
  return {
    weekday_early_morning: active ? .9 : .3,
    weekday_day: contains(n, ['operations', 'planting', 'habitat']) ? .8 : .35,
    weekday_evening: event || active || contains(n, ['play', 'seating']) ? .9 : .55,
    weekend_morning: contains(n, ['play', 'picnic', 'fitness', 'garden']) ? .9 : .55,
    weekend_evening: event || contains(n, ['play', 'picnic', 'lawn']) ? 1 : .6
  };
}

export function buildParametricProgramDefinitions(programs: ProgramOntologyInput[]): ParametricProgramDefinition[] {
  return programs.map(program => {
    const p = performance(program);
    const commercial = contains(program.name, ['cafe', 'kiosk']) ? 1 : contains(program.name, ['event', 'plaza', 'sports']) ? .55 : .1;
    return {
      id: program.id,
      ontology: classify(program),
      spatialBehavior: behavior(program),
      userGroupIds: normalizeUserGroups(program.primaryUsers),
      temporalProfile: temporal(program),
      seasonalProfile: { summer: clamp((p.shadeDemand + p.eveningSuitability) / 2), transition: clamp(.65 + p.flexibility * .25), winter: clamp(.65 + p.activityIntensity * .25) },
      performanceAttributes: p,
      commercial: { applicability: commercial, revenuePotential: clamp(commercial * (p.socialIntensity + p.eveningSuitability) / 2), spendingPowerSensitivity: clamp(commercial * .8) },
      duneCompatibility: duneScores(program, p),
      pathDuneOperations: behavior(program) === 'EDGE' ? ['follow_valley', 'cut_ridge_at_saddle', 'widen_at_baraha', 'increase_shade_on_summer_segments', 'preserve_accessible_gradient'] : [],
      areaRangeM2: { minimum: program.minimumAreaM2 ?? null, target: program.targetAreaM2 ?? null, maximum: program.maximumAreaM2 ?? null }
    };
  });
}

export function buildUserProgramSuitability(definitions: ParametricProgramDefinition[]): UserProgramSuitability[] {
  return USER_GROUPS.flatMap(user => definitions.map(program => {
    const p = program.performanceAttributes;
    const direct = program.userGroupIds.includes(user.id) ? 1 : program.userGroupIds.includes('all_visitors') ? .72 : .25;
    const needFit = (user.needs.shade * p.shadeDemand + user.needs.accessibility * p.accessibilityDemand + user.needs.safety * p.safetySensitivity + user.needs.social * p.socialIntensity + user.needs.activity * p.activityIntensity + user.needs.quiet * p.quietDemand) /
      Math.max(.001, user.needs.shade + user.needs.accessibility + user.needs.safety + user.needs.social + user.needs.activity + user.needs.quiet);
    const summerFit = 1 - Math.abs(user.seasonalSensitivity.summer - program.seasonalProfile.summer);
    const weight = clamp(.55 * direct + .3 * needFit + .15 * summerFit);
    return { userGroupId: user.id, programId: program.id, weight, components: { directUserMatch: direct, needFit: clamp(needFit), summerFit: clamp(summerFit) }, reason: direct === 1 ? 'Explicit primary-user match, adjusted by needs and seasonal usability.' : 'Inferred secondary suitability from needs and seasonal usability; designer review required.' };
  }));
}

export function buildParametricRelationships(programs: ProgramOntologyInput[], definitions: ParametricProgramDefinition[]): ParametricRelationship[] {
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  const results: ParametricRelationship[] = [];
  for (let i = 0; i < programs.length; i++) for (let j = i + 1; j < programs.length; j++) {
    const a = programs[i], b = programs[j], da = byId.get(a.id)!, db = byId.get(b.id)!;
    const preferred = a.adjacency?.preferred?.includes(b.id) || b.adjacency?.preferred?.includes(a.id) ? 1 : 0;
    const movement = a.adjacency?.movement?.includes(b.id) || b.adjacency?.movement?.includes(a.id) ? .8 : 0;
    const service = a.adjacency?.service?.includes(b.id) || b.adjacency?.service?.includes(a.id) ? .65 : 0;
    const avoid = a.adjacency?.avoid?.includes(b.id) || b.adjacency?.avoid?.includes(a.id) ? 1 : 0;
    const sharedUsers = da.userGroupIds.filter(id => db.userGroupIds.includes(id)).length / Math.max(1, new Set([...da.userGroupIds, ...db.userGroupIds]).size);
    const activityConflict = Math.abs(da.performanceAttributes.activityIntensity - db.performanceAttributes.activityIntensity) * Math.min(da.performanceAttributes.quietDemand, db.performanceAttributes.quietDemand);
    const score = clampSigned(.5 * preferred + .25 * movement + .15 * service + .25 * sharedUsers - .8 * avoid - .35 * activityConflict);
    const type = score > .15 ? 'attract' : score < -.15 ? 'repel' : 'neutral';
    results.push({ id: `computed:${a.id}:${b.id}`, source: a.id, target: b.id, score, type, components: { approvedPreference: preferred, movementDependency: movement, serviceDependency: service, sharedUsers: clamp(sharedUsers), explicitAvoidance: avoid, activityQuietConflict: clamp(activityConflict) }, reason: avoid ? 'Explicit avoidance dominates the computed relationship.' : preferred || movement || service ? 'Catalog adjacency/dependency reinforced by user compatibility.' : sharedUsers > .2 ? 'Shared users create a weak attraction; no accepted constraint is implied.' : 'No strong evidence of attraction or repulsion.', authority: 'computed_advisory' });
  }
  return results;
}

const clampSigned = (value: number) => Math.max(-1, Math.min(1, Math.round(value * 1000) / 1000));

export function opportunityOntologyInputs(opportunities: OpportunityResult[]): ProgramOntologyInput[] {
  return opportunities.map(opportunity => ({
    id: opportunity.type, name: opportunity.name, category: opportunity.category, geometryType: opportunity.geometryType,
    scale: opportunity.scale, primaryUsers: opportunity.primaryUsers,
    minimumAreaM2: opportunity.recommendedAreaM2?.minimum, targetAreaM2: opportunity.recommendedAreaM2?.target,
    maximumAreaM2: opportunity.recommendedAreaM2?.maximum, priority: opportunity.opportunityScore / 100,
    adjacency: opportunity.grasshopperInputs.adjacencyRules
  }));
}

export function programParametricFields(definition: ParametricProgramDefinition) {
  return {
    ontology: {
      program_class: definition.ontology.programClass,
      space_class: definition.ontology.spaceClass,
      common_class: definition.ontology.commonClass
    },
    spatial_behavior: definition.spatialBehavior,
    user_group_ids: definition.userGroupIds,
    temporal_profile: definition.temporalProfile,
    seasonal_profile: definition.seasonalProfile,
    performance_attributes: definition.performanceAttributes,
    commercial: definition.commercial,
    dune_compatibility: definition.duneCompatibility,
    path_dune_operations: definition.pathDuneOperations
  };
}
