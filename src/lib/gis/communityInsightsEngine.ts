export interface CommunityInsightsMetrics {
  overallCommunityScore: number;
  dominantCommunityType: string;
  primaryUserGroups: string[];
  facilityAccessScore: number;
  familyDemandScore: number;
  youthDemandScore: number;
  olderAdultSupportScore: number;
  socialInfrastructureDeficitScore: number;
  underservedZone: string;
  topProgramName: string;
  criticalMetrics: string[];
}

export interface CommunityInsightsIntervention {
  intervention: string;
  evidence: string[];
  priority: 'Low' | 'Medium' | 'High';
  confidence: number;
}

export interface CommunityInsightsResult {
  communityProfile: string;
  primaryUserGroups: string[];
  socialInfrastructure: string[];
  strengths: string[];
  weaknesses: string[];
  equityConcerns: string[];
  designDrivers: string[];
  programPriorities: string[];
  priorityInterventions: CommunityInsightsIntervention[];
  engine: string;
}

/**
 * POSTs real computed Community Analysis evidence to /api/community-insights, which reuses the
 * existing Gemini proxy pattern (server.ts) -- Gemini gets these real numbers in its prompt and
 * is instructed not to invent demographic statistics; the offline fallback assembles the same
 * numbers into sentences without an LLM.
 */
export async function generateCommunityInsights(metrics: CommunityInsightsMetrics): Promise<CommunityInsightsResult> {
  const res = await fetch('/api/community-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('Community insights request failed');
  }
  return res.json();
}
