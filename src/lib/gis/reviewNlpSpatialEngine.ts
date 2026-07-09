import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeIssueImpact, sortIssueImpact, type PriorityLevel } from '../analytics/issueMatrix';

export interface NlpSpatialAnalysisResult {
  parkCenter: { lat: number; lng: number };
  overallSentimentScore: number;
  topComplaintCategories: { category: string; mentions: number; priority: PriorityLevel }[];
  shadeIssueMentions: number;
  playgroundDemandMentions: number;
  maintenanceIssueMentions: number;
  note: string;
}

/**
 * Thin wrapper around the existing Phase 1-3 Analytics engine. Reviews are
 * only geocoded to the park centroid (confirmed back in Phase 1 -- there is
 * no per-review lat/lng), so this is deliberately a single-marker summary
 * with a real issue-category/sentiment breakdown, not a spatial heatmap or
 * cluster map, which would need per-review location data that doesn't exist.
 */
export function computeNlpSpatialAnalysis(reviews: NLPAnalyzedReview[], parkCenter: { lat: number; lng: number }): NlpSpatialAnalysisResult {
  const issueRows = sortIssueImpact(computeIssueImpact(reviews), 'priority');
  const findMentions = (category: string) => issueRows.find(r => r.category === category)?.mentions || 0;

  const posCount = reviews.filter(r => r.sentiment === 'POSITIVE').length;
  const negCount = reviews.filter(r => r.sentiment === 'NEGATIVE').length;
  const overallSentimentScore = reviews.length === 0 ? 50 : Math.round(((posCount - negCount) / reviews.length + 1) * 50);

  return {
    parkCenter,
    overallSentimentScore,
    topComplaintCategories: issueRows.slice(0, 5).map(r => ({ category: r.category, mentions: r.mentions, priority: r.priority })),
    shadeIssueMentions: findMentions('shade / heat comfort'),
    playgroundDemandMentions: findMentions('playground'),
    maintenanceIssueMentions: findMentions('maintenance'),
    note: 'Reviews are only geocoded to the park centroid, not individual locations -- shown as a single marker with a real issue-category breakdown, not a spatial heatmap or cluster map.'
  };
}
