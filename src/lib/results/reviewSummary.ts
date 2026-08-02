import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeKPIs } from '../analytics/kpis';
import { computeIssueImpact, sortIssueImpact } from '../analytics/issueMatrix';
import { computeUserGroupInsights, computePositiveFeatures } from '../gis/reviewNlpSpatialEngine';

export interface ReviewSummaryIssue {
  category: string;
  mentions: number;
  priority: string;
  priorityIndex: number;
  designRequirement: string;
}

export interface ReviewSummaryUserGroup {
  label: string;
  reviewCount: number;
  primaryNeeds: string[];
  likelyVisitTime: string;
  suggestedIntervention: string;
}

export interface ReviewSummaryPositiveFeature {
  category: string;
  mentions: number;
  positiveSharePct: number;
  quote: string;
}

export interface ReviewSummary {
  totalReviews: number;
  avgRating: number;
  overallSentimentScore: number;
  positivePct: number;
  negativePct: number;
  topIssues: ReviewSummaryIssue[];
  userGroups: ReviewSummaryUserGroup[];
  positiveFeatures: ReviewSummaryPositiveFeature[];
}

/**
 * Condenses existing review-analytics engines (already used by Analytics and
 * Playground -> NLP Spatial) into a compact evidence bundle for the Results
 * synthesis prompt -- REVIEW_SUMMARY_JSON. No new NLP logic.
 */
export function buildReviewSummary(reviews: NLPAnalyzedReview[]): ReviewSummary {
  const kpis = computeKPIs(reviews, 1);
  const avgRating = kpis.find(k => k.id === 'avgRating')?.value ?? 0;
  const sentimentScore = kpis.find(k => k.id === 'sentimentScore')?.value ?? 0;
  const positivePct = kpis.find(k => k.id === 'positivePct')?.value ?? 0;
  const negativePct = kpis.find(k => k.id === 'negativePct')?.value ?? 0;

  const topIssues = sortIssueImpact(computeIssueImpact(reviews), 'priority')
    .slice(0, 8)
    .map(row => {
      const example = reviews.find(r => r.issueCategory === row.category);
      return {
        category: row.category,
        mentions: row.mentions,
        priority: row.priority,
        priorityIndex: row.priorityIndex,
        designRequirement: example?.designRequirement || ''
      };
    });

  const userGroups = computeUserGroupInsights(reviews)
    .slice(0, 8)
    .map(g => ({
      label: g.label,
      reviewCount: g.reviewCount,
      primaryNeeds: g.primaryNeeds,
      likelyVisitTime: g.likelyVisitTime,
      suggestedIntervention: g.suggestedIntervention
    }));

  const positiveFeatures = computePositiveFeatures(reviews)
    .slice(0, 6)
    .map(f => ({
      category: f.category,
      mentions: f.mentions,
      positiveSharePct: f.positiveSharePct,
      quote: f.quote
    }));

  return {
    totalReviews: reviews.length,
    avgRating: Math.round(avgRating * 100) / 100,
    overallSentimentScore: Math.round(sentimentScore),
    positivePct: Math.round(positivePct),
    negativePct: Math.round(negativePct),
    topIssues,
    userGroups,
    positiveFeatures
  };
}
