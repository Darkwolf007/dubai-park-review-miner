export interface ParkBrainCitation {
  document_id: string;
  title: string;
  page: number;
  section: string;
  source_excerpt: string;
  collection: string;
  mandatory_status: string;
}

export interface ParkBrainNumericProvenance {
  value: number | null;
  unit: string | null;
  parameter: string | null;
  source_type: string;
  document_id: string | null;
  page: number | null;
  section: string | null;
  rule_id: string | null;
  approval_status: string;
  status: string | null;
  reason: string | null;
}

export interface ParkBrainCandidateRule {
  candidate_rule_id: string;
  rule_category: string;
  subject: string;
  relationship: string;
  target: string;
  value: number | null;
  unit: string | null;
  requirement_level: string;
  status: string;
  extraction_confidence: number;
  source: {
    document_id: string;
    page: number;
    section: string;
    source_excerpt: string;
  };
  review_notes: string | null;
}

export interface ParkBrainApprovedRule {
  rule_id: string;
  version: number;
  status: string;
  rule_category: string;
  source_entity_type: string;
  source_entity: string;
  relationship: string;
  target_entity_type: string;
  target_entity: string;
  requirement_level: string;
  numeric_constraint: ParkBrainNumericProvenance | null;
  applicability?: {
    jurisdiction?: string | null;
    project_type?: string | null;
    conditions?: string[];
  };
  source: {
    document_id: string;
    page: number;
    section: string;
  };
  approved_by: string;
  approved_at: string;
}

export interface ParkBrainRegistryResponse {
  rules: ParkBrainApprovedRule[];
  conflicts: ParkBrainConflict[];
  fetched_at: string;
}

export interface ParkBrainConflict {
  conflict_id: string;
  subject: string;
  rules: string[];
  conflict_type: string;
  suggested_precedence: string | null;
  reason: string;
  status: string;
}

export interface ParkBrainQueryResponse {
  answer: string;
  answer_status: string;
  citations: ParkBrainCitation[];
  approved_rules: ParkBrainApprovedRule[];
  candidate_rules: ParkBrainCandidateRule[];
  conflicts: ParkBrainConflict[];
  unresolved: string[];
  query_metadata: {
    documents_searched?: number;
    chunks_retrieved?: number;
    retrieval_method?: string;
    answer_model?: string;
  };
}

export interface ParkBrainQueryInput {
  question: string;
  jurisdiction?: string;
  projectType?: string;
  collections?: string[];
}

/**
 * A numeric rule is eligible for a future deterministic graph compiler only when Park Brain says
 * the rule is active and its numeric value carries complete approved provenance. Candidate rules,
 * citations, and chatbot prose deliberately never pass this gate.
 */
export function isCompilableApprovedNumericRule(rule: ParkBrainApprovedRule): boolean {
  const numeric = rule.numeric_constraint;
  if (!numeric || numeric.value === null) return false;
  return rule.status === 'active'
    && numeric.approval_status === 'approved'
    && numeric.status !== 'requires_input'
    && !!numeric.unit
    && !!numeric.document_id
    && numeric.page !== null
    && !!numeric.section
    && !!numeric.rule_id;
}

export async function queryParkBrain(input: ParkBrainQueryInput): Promise<ParkBrainQueryResponse> {
  const response = await fetch('/api/park-brain/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: input.question,
      jurisdiction: input.jurisdiction ?? 'Dubai',
      projectType: input.projectType ?? 'public_park',
      collections: input.collections
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Park Brain query failed');
  }
  return payload as ParkBrainQueryResponse;
}

export async function fetchParkBrainRegistry(): Promise<ParkBrainRegistryResponse> {
  const response = await fetch('/api/park-brain/registry');
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Park Brain registry request failed');
  }
  return payload as ParkBrainRegistryResponse;
}
