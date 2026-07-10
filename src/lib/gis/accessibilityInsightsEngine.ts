export interface AccessibilityInsightsMetrics {
  overallAccessibilityScore: number;
  walkabilityScore: number;
  transitAccessibility: string;
  mostUnderservedZone: string;
  pop15MinWalkPct: number;
  avgWalkingTimeMinutes: number;
  deadEndCount: number;
  barrierExposureLabel: string;
  criticalMetrics: string[];
}

export interface AccessibilityInsightsIntervention {
  intervention: string;
  evidence: string[];
  priority: 'Low' | 'Medium' | 'High';
  confidence: number;
}

export interface AccessibilityInsightsResult {
  accessibilityProfile: string;
  strengths: string[];
  weaknesses: string[];
  criticalBarriers: string[];
  underservedCommunities: string[];
  pedestrianDesignDrivers: string[];
  priorityInterventions: AccessibilityInsightsIntervention[];
  engine: string;
}

/**
 * POSTs real computed Accessibility Analysis evidence to /api/accessibility-insights, which
 * reuses the existing Gemini proxy pattern (server.ts) -- Gemini gets these real numbers in
 * its prompt and is instructed not to invent new ones; the offline fallback assembles the
 * same numbers into sentences without an LLM.
 */
export async function generateAccessibilityInsights(metrics: AccessibilityInsightsMetrics): Promise<AccessibilityInsightsResult> {
  const res = await fetch('/api/accessibility-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics })
  });
  if (!res.ok) {
    throw new Error('Accessibility insights request failed');
  }
  return res.json();
}
