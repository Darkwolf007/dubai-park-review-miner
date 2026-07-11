export interface NlpSpatialInsightsMetrics {
  overallSentimentScore: number;
  topPositiveTopic: string;
  topNegativeTopic: string;
  mostRequestedImprovement: string;
  mostMentionedUserGroup: string;
  criticalIssueCluster: string;
  avgHeatExposureProxy: number | null;
  avgGreenCoveragePct: number | null;
  criticalMetrics: string[];
}

export interface NlpSpatialInsightsRecommendation {
  intervention: string;
  evidence: string[];
  priority: 'Low' | 'Medium' | 'High' | 'Very High';
  confidence: number;
}

export interface NlpSpatialInsightsResult {
  overallCommunityPerception: string;
  mostValuedFeatures: string[];
  mostCriticalProblems: string[];
  emergingIssues: string[];
  userGroupNeeds: string[];
  spatialHotspots: string[];
  retainAndProtect: string[];
  improveAndExpand: string[];
  removeOrRedesign: string[];
  designDrivers: string[];
  priorityRecommendations: NlpSpatialInsightsRecommendation[];
  engine: string;
}

/**
 * POSTs real computed NLP Spatial Analysis evidence to /api/nlp-spatial-insights, which reuses the
 * existing Gemini proxy pattern (server.ts) -- Gemini gets these real topics/scores in its prompt
 * and is instructed not to invent statistics or quotes; the offline fallback assembles the same
 * evidence into sentences without an LLM.
 */
export async function generateNlpSpatialInsights(metrics: NlpSpatialInsightsMetrics): Promise<NlpSpatialInsightsResult> {
  const res = await fetch('/api/nlp-spatial-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('NLP spatial insights request failed');
  }
  return res.json();
}
