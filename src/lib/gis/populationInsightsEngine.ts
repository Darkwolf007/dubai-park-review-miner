export interface PopulationInsightsMetrics {
  primaryCommunity: string;
  overallDemandLevel: string;
  highestDemandZone: string;
  aggregateDensityKm2: number;
  greenSpaceDeficitPct: number;
  accessibilityScore: number;
  pressureScore: number;
  criticalMetrics: string[];
}

export interface PopulationInsightsRecommendation {
  recommendation: string;
  evidence: string[];
  priority: 'Low' | 'Medium' | 'High';
  confidence: number;
}

export interface PopulationInsightsResult {
  communityProfile: string;
  strengths: string[];
  weaknesses: string[];
  keyFindings: string[];
  designDrivers: string[];
  constraints: string[];
  opportunities: string[];
  priorityRecommendations: PopulationInsightsRecommendation[];
  engine: string;
}

/**
 * POSTs real computed Population Analysis evidence to /api/population-insights,
 * which reuses the existing Gemini proxy pattern (server.ts) -- Gemini gets
 * these real numbers in its prompt and is instructed not to invent new ones;
 * the offline fallback assembles the same numbers into sentences without an LLM.
 */
export async function generatePopulationInsights(metrics: PopulationInsightsMetrics): Promise<PopulationInsightsResult> {
  const res = await fetch('/api/population-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('Population insights request failed');
  }
  return res.json();
}
