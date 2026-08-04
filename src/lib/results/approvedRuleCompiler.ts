import type { OpportunityResult, OpportunityType } from '../gis/opportunityEngine';
import {
  isCompilableApprovedNumericRule,
  type ParkBrainApprovedRule,
  type ParkBrainConflict,
  type ParkBrainNumericProvenance
} from './parkBrain';

export type RelationshipGraphLayer = 'functional' | 'distance' | 'visibility' | 'movement' | 'constraints';
export type MappingMethod = 'exact_type' | 'exact_name' | 'approved_alias';
export type EdgeDecision = 'pending_review' | 'accepted' | 'rejected';

export interface CompiledRuleEdge {
  edge_id: string;
  graph_layer: RelationshipGraphLayer;
  source_node_id: OpportunityType;
  target_node_id: OpportunityType;
  relationship_type: string;
  directed: boolean;
  requirement_level: string;
  mandatory: boolean;
  numeric_constraint: ParkBrainNumericProvenance | null;
  source_rule: {
    rule_id: string;
    version: number;
    document_id: string;
    page: number;
    section: string;
    approved_by: string;
    approved_at: string;
  };
  mapping: {
    source_method: MappingMethod;
    target_method: MappingMethod;
  };
  decision: EdgeDecision;
}

export interface UnresolvedApprovedRule {
  rule_id: string;
  source_entity: string;
  relationship: string;
  target_entity: string;
  reason: 'active_conflict' | 'invalid_numeric_provenance' | 'source_unmapped' | 'source_ambiguous' | 'target_unmapped' | 'target_ambiguous' | 'self_relationship';
  source_candidates: OpportunityType[];
  target_candidates: OpportunityType[];
}

export interface ApprovedRuleCompilation {
  schema_version: '1.0.0';
  compiled_at: string;
  rules_received: number;
  edges: CompiledRuleEdge[];
  unresolved: UnresolvedApprovedRule[];
}

interface EntityMapping {
  candidates: OpportunityType[];
  method: MappingMethod | null;
}

/**
 * Curated vocabulary only. Each alias is intentionally explicit; the compiler does not use fuzzy
 * matching or AI to guess program identity. Multi-target aliases are reported as ambiguous and
 * require a designer decision rather than silently selecting one program.
 */
const ENTITY_ALIASES: Record<string, OpportunityType[]> = {
  'accessible path': ['accessibleRoutes'],
  'accessible paths': ['accessibleRoutes'],
  'accessible pedestrian path': ['accessibleRoutes'],
  'accessible pedestrian paths': ['accessibleRoutes'],
  'accessible route': ['accessibleRoutes'],
  'accessible routes': ['accessibleRoutes'],
  'universal access route': ['accessibleRoutes'],
  'main entrance': ['mainEntrancePlaza'],
  'entrance gateway': ['mainEntrancePlaza'],
  'gateway': ['mainEntrancePlaza'],
  'secondary entrance': ['secondaryEntrances'],
  'drop off': ['dropOffZone'],
  'drop off zone': ['dropOffZone'],
  'caregiver seating': ['familySeatingPlay'],
  'parent seating': ['familySeatingPlay'],
  'family seating': ['familySeatingPlay'],
  'family seating near play': ['familySeatingPlay'],
  'inclusive playground': ['inclusivePlayground'],
  'toddler playground': ['toddlerPlay'],
  'older children playground': ['olderChildrenPlay'],
  'nature playground': ['naturePlay'],
  'playground': ['inclusivePlayground', 'toddlerPlay', 'olderChildrenPlay', 'naturePlay'],
  'play area': ['inclusivePlayground', 'toddlerPlay', 'olderChildrenPlay', 'naturePlay'],
  'children play area': ['inclusivePlayground', 'toddlerPlay', 'olderChildrenPlay', 'naturePlay'],
  'toilet': ['restrooms'],
  'toilets': ['restrooms'],
  'restroom': ['restrooms'],
  'restrooms': ['restrooms'],
  'drinking water': ['drinkingWater'],
  'drinking fountain': ['drinkingWater'],
  'drinking fountains': ['drinkingWater'],
  'water fountain': ['drinkingWater'],
  'shaded seating': ['shadedSeating'],
  'shaded circulation': ['shadedCirculation'],
  'pedestrian shade route': ['shadedCirculation'],
  'service access': ['serviceAccess'],
  'maintenance access': ['serviceAccess'],
  'service yard': ['operationsArea'],
  'operations area': ['operationsArea'],
  'cafe': ['cafeKiosk'],
  'kiosk': ['cafeKiosk'],
  'quiet garden': ['quietGarden'],
  'sensory garden': ['sensoryGarden'],
  'sports court': ['sportsCourt'],
  'event lawn': ['flexibleEventLawn'],
  'community plaza': ['communityPlaza'],
  'picnic area': ['picnicArea'],
  'tree canopy': ['treePlanting'],
  'tree planting': ['treePlanting'],
  'bioswale': ['bioswale'],
  'lighting': ['efficientLighting'],
  'security point': ['safetyPoint'],
  'waste point': ['wastePoints']
};

function normalizeEntity(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function mapEntity(entity: string, opportunities: OpportunityResult[]): EntityMapping {
  const normalized = normalizeEntity(entity);
  const exactType = opportunities.find(opportunity => normalizeEntity(opportunity.type) === normalized);
  if (exactType) return { candidates: [exactType.type], method: 'exact_type' };

  const exactName = opportunities.find(opportunity => normalizeEntity(opportunity.name) === normalized);
  if (exactName) return { candidates: [exactName.type], method: 'exact_name' };

  const aliases = (ENTITY_ALIASES[normalized] || []).filter(type => opportunities.some(opportunity => opportunity.type === type));
  return { candidates: aliases, method: aliases.length ? 'approved_alias' : null };
}

function graphLayerFor(rule: ParkBrainApprovedRule): RelationshipGraphLayer {
  const text = normalizeEntity(`${rule.rule_category} ${rule.relationship} ${rule.numeric_constraint?.parameter || ''}`);
  if (/visibility|sightline|supervision|overlook/.test(text)) return 'visibility';
  if (/distance|setback|separation|buffer|proximity/.test(text)) return 'distance';
  if (/avoid|prohibit|constraint|exclusion/.test(text)) return 'constraints';
  if (/movement|circulation|route|sequence|access|connectivity/.test(text)) return 'movement';
  return 'functional';
}

function isDirected(rule: ParkBrainApprovedRule, layer: RelationshipGraphLayer): boolean {
  if (layer === 'visibility' || layer === 'movement') return true;
  const relationship = normalizeEntity(rule.relationship);
  return /depends|serves|provides|leads|feeds|requires/.test(relationship);
}

function conflictRuleIds(conflicts: ParkBrainConflict[]): Set<string> {
  return new Set(
    conflicts
      .filter(conflict => conflict.status === 'requires_human_resolution')
      .flatMap(conflict => conflict.rules)
  );
}

export function compileApprovedRules(
  rules: ParkBrainApprovedRule[],
  conflicts: ParkBrainConflict[],
  opportunities: OpportunityResult[]
): ApprovedRuleCompilation {
  const blockedRuleIds = conflictRuleIds(conflicts);
  const edges: CompiledRuleEdge[] = [];
  const unresolved: UnresolvedApprovedRule[] = [];

  for (const rule of rules.filter(item => item.status === 'active')) {
    const source = mapEntity(rule.source_entity, opportunities);
    const target = mapEntity(rule.target_entity, opportunities);
    const unresolvedBase = {
      rule_id: rule.rule_id,
      source_entity: rule.source_entity,
      relationship: rule.relationship,
      target_entity: rule.target_entity,
      source_candidates: source.candidates,
      target_candidates: target.candidates
    };

    if (blockedRuleIds.has(rule.rule_id)) {
      unresolved.push({ ...unresolvedBase, reason: 'active_conflict' });
      continue;
    }
    if (rule.numeric_constraint && !isCompilableApprovedNumericRule(rule)) {
      unresolved.push({ ...unresolvedBase, reason: 'invalid_numeric_provenance' });
      continue;
    }
    if (source.candidates.length === 0) {
      unresolved.push({ ...unresolvedBase, reason: 'source_unmapped' });
      continue;
    }
    if (source.candidates.length > 1) {
      unresolved.push({ ...unresolvedBase, reason: 'source_ambiguous' });
      continue;
    }
    if (target.candidates.length === 0) {
      unresolved.push({ ...unresolvedBase, reason: 'target_unmapped' });
      continue;
    }
    if (target.candidates.length > 1) {
      unresolved.push({ ...unresolvedBase, reason: 'target_ambiguous' });
      continue;
    }
    if (source.candidates[0] === target.candidates[0]) {
      unresolved.push({ ...unresolvedBase, reason: 'self_relationship' });
      continue;
    }

    const layer = graphLayerFor(rule);
    edges.push({
      edge_id: `edge:${rule.rule_id}:${source.candidates[0]}:${target.candidates[0]}`,
      graph_layer: layer,
      source_node_id: source.candidates[0],
      target_node_id: target.candidates[0],
      relationship_type: rule.relationship,
      directed: isDirected(rule, layer),
      requirement_level: rule.requirement_level,
      mandatory: rule.requirement_level === 'mandatory',
      numeric_constraint: rule.numeric_constraint,
      source_rule: {
        rule_id: rule.rule_id,
        version: rule.version,
        document_id: rule.source.document_id,
        page: rule.source.page,
        section: rule.source.section,
        approved_by: rule.approved_by,
        approved_at: rule.approved_at
      },
      mapping: {
        source_method: source.method!,
        target_method: target.method!
      },
      decision: 'pending_review'
    });
  }

  return {
    schema_version: '1.0.0',
    compiled_at: new Date().toISOString(),
    rules_received: rules.length,
    edges,
    unresolved
  };
}
