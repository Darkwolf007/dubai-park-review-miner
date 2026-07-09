export interface DesignStrategyIssue {
  category: string;
  mentions: number;
  priorityIndex: number;
  priority: string;
  designRequirement?: string;
}

export interface DesignStrategyMetrics {
  population: number;
  popDensityKm2: number;
  buildingCoveragePct: number;
  greenCoveragePct: number;
  roadDensityMPerKm2: number;
  amenityTotal: number;
  topIssues: DesignStrategyIssue[];
}

export interface DesignStrategyResult {
  siteSummary: string;
  keyProblems: string[];
  designOpportunities: string[];
  recommendedInterventions: string[];
  priorityScore: number;
  supportingEvidence: string[];
  aiConfidenceScore: number;
  engine: string;
}

/**
 * POSTs the real computed metrics bundle to /api/design-strategy, which
 * reuses the existing Gemini proxy pattern from /api/nlp-analyze (server.ts)
 * -- Gemini path gets these real numbers in its prompt and is instructed not
 * to invent new ones; the offline fallback assembles the same numbers into
 * sentences without an LLM. Either way the output is grounded in evidence
 * computed here, not fabricated.
 */
export async function generateDesignStrategy(metrics: DesignStrategyMetrics): Promise<DesignStrategyResult> {
  const res = await fetch('/api/design-strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('Design strategy request failed');
  }
  return res.json();
}
