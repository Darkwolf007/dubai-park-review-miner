import type { H3Feature } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeIssueImpact } from '../analytics/issueMatrix';

export interface EnvironmentalAnalysisResult {
  greenCoveragePct: number;
  treeCanopyAvailable: false;
  surfaceTemperatureAvailable: false;
  urbanHeatIslandAvailable: false;
  shadeOpportunityScore: number | null;
  shadeOpportunityNote: string;
}

/**
 * Green coverage is real (H3 grid). Tree canopy / surface temperature /
 * urban heat island have no data source in this build (would need remote-
 * sensing rasters, not present) -- surfaced as unavailable, not computed.
 * Shade Opportunity instead reuses the EXISTING Analytics engine's
 * shade/heat-comfort negative-sentiment share (src/lib/analytics/issueMatrix.ts)
 * -- real evidence, just sourced from reviews rather than remote sensing.
 */
export function computeEnvironmentalAnalysis(hexes: H3Feature[], reviews: NLPAnalyzedReview[]): EnvironmentalAnalysisResult {
  const greenCoveragePct = hexes.length === 0
    ? 0
    : hexes.reduce((s, h) => s + (h.properties.green_coverage_pct || 0), 0) / hexes.length;

  const issueRows = computeIssueImpact(reviews);
  const shadeRow = issueRows.find(r => r.category === 'shade / heat comfort');

  return {
    greenCoveragePct: Math.round(greenCoveragePct * 10) / 10,
    treeCanopyAvailable: false,
    surfaceTemperatureAvailable: false,
    urbanHeatIslandAvailable: false,
    shadeOpportunityScore: shadeRow ? shadeRow.priorityIndex : null,
    shadeOpportunityNote: shadeRow
      ? `Derived from ${shadeRow.mentions} park reviews mentioning shade/heat comfort (${Math.round(shadeRow.negativeSentimentShare * 100)}% negative).`
      : 'No shade/heat-related review evidence available for this park yet.'
  };
}
