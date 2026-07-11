export interface EnvironmentalInsightsMetrics {
  overallEnvironmentalScore: number;
  greenCoveragePct: number;
  imperviousSurfacePct: number;
  thermalComfortScore: number;
  biodiversityScore: number;
  hotspotAreaPct: number;
  peakHeatZone: string;
  coolingOpportunityScore: number;
  waterFeatureConcernScore: number;
  criticalMetrics: string[];
}

export interface EnvironmentalInsightsIntervention {
  intervention: string;
  evidence: string[];
  priority: 'Low' | 'Medium' | 'High';
  confidence: number;
}

export interface EnvironmentalInsightsResult {
  environmentalProfile: string;
  strengths: string[];
  weaknesses: string[];
  constraints: string[];
  ecologicalOpportunities: string[];
  designDrivers: string[];
  priorityInterventions: EnvironmentalInsightsIntervention[];
  engine: string;
}

/**
 * POSTs real computed Environmental Analysis evidence to /api/environmental-insights, which
 * reuses the existing Gemini proxy pattern (server.ts) -- Gemini gets these real numbers in its
 * prompt and is instructed not to invent new ones or describe proxies as measurements; the
 * offline fallback assembles the same numbers into sentences without an LLM.
 */
export async function generateEnvironmentalInsights(metrics: EnvironmentalInsightsMetrics): Promise<EnvironmentalInsightsResult> {
  const res = await fetch('/api/environmental-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('Environmental insights request failed');
  }
  return res.json();
}
