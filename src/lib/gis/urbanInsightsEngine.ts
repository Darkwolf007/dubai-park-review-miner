export interface UrbanInsightsMetrics {
  urbanCharacter: string;
  roadConnectivity: string;
  dominantLandUse: string;
  developmentPressure: string;
  buildingCoveragePct: number;
  connectivityScore: number;
  landUseDiversityIndex: number;
  criticalMetrics: string[];
}

export interface UrbanInsightsIntervention {
  intervention: string;
  evidence: string[];
  priority: 'Low' | 'Medium' | 'High';
  confidence: number;
}

export interface UrbanInsightsResult {
  urbanCharacter: string;
  strengths: string[];
  weaknesses: string[];
  constraints: string[];
  developmentOpportunities: string[];
  designDrivers: string[];
  priorityInterventions: UrbanInsightsIntervention[];
  engine: string;
}

/**
 * POSTs real computed Urban Analysis evidence to /api/urban-insights, which
 * reuses the existing Gemini proxy pattern (server.ts) -- Gemini gets these
 * real numbers in its prompt and is instructed not to invent new ones; the
 * offline fallback assembles the same numbers into sentences without an LLM.
 */
export async function generateUrbanInsights(metrics: UrbanInsightsMetrics): Promise<UrbanInsightsResult> {
  const res = await fetch('/api/urban-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('Urban insights request failed');
  }
  return res.json();
}
