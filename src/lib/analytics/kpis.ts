import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { average, sentimentScore, sentimentShare, wordCount, bucketReviewsByTime, computeTrend, TrendDirection } from './shared';
import { computeIssueImpact } from './issueMatrix';

export type KpiId =
  | 'totalReviews'
  | 'parksSelected'
  | 'avgRating'
  | 'sentimentScore'
  | 'positivePct'
  | 'neutralPct'
  | 'negativePct'
  | 'themeCount'
  | 'aiConfidence'
  | 'designOpportunities'
  | 'criticalIssues'
  | 'avgReviewLength';

export interface KPIStat {
  id: KpiId;
  value: number;
  displayValue: string;
  trend: TrendDirection;
  trendPct: number;
  sparkline: number[];
  timeBasis: 'calendar' | 'sequence';
  sampleSize: number;
}

function buildStat(
  id: KpiId,
  overallValue: number,
  buckets: NLPAnalyzedReview[][],
  timeBasis: 'calendar' | 'sequence',
  metric: (b: NLPAnalyzedReview[]) => number,
  formatValue: (v: number) => string
): KPIStat {
  const sparkline = buckets.map(metric);
  const { trend, trendPct } = computeTrend(sparkline);
  return {
    id,
    value: overallValue,
    displayValue: formatValue(overallValue),
    trend,
    trendPct,
    sparkline,
    timeBasis,
    sampleSize: buckets.reduce((a, b) => a + b.length, 0)
  };
}

export function computeKPIs(reviews: NLPAnalyzedReview[], parksSelectedCount: number): KPIStat[] {
  const { buckets, timeBasis } = bucketReviewsByTime(reviews, 8);
  const total = reviews.length;

  const avgRating = average(reviews.map(r => r.rating));
  const sentScore = sentimentScore(reviews);
  const posPct = sentimentShare(reviews, 'POSITIVE') * 100;
  const neuPct = sentimentShare(reviews, 'NEUTRAL') * 100;
  const negPct = sentimentShare(reviews, 'NEGATIVE') * 100;
  const themeCount = new Set(reviews.map(r => r.issueCategory)).size;
  const aiConfidence = average(reviews.map(r => r.categoryConfidence ?? 0.5)) * 100;
  const avgLength = average(reviews.map(r => wordCount(r.reviewText)));

  const overallIssueImpact = computeIssueImpact(reviews);
  const designOpportunities = overallIssueImpact.filter(r => r.priority !== 'Low').length;
  const criticalIssues = overallIssueImpact.filter(r => r.priority === 'High' || r.priority === 'Very High').length;

  return [
    buildStat('totalReviews', total, buckets, timeBasis, b => b.length, v => `${Math.round(v)}`),
    buildStat('parksSelected', parksSelectedCount, buckets, timeBasis, () => parksSelectedCount, v => `${Math.round(v)}`),
    buildStat('avgRating', avgRating, buckets, timeBasis, b => average(b.map(r => r.rating)), v => v.toFixed(2)),
    buildStat('sentimentScore', ((sentScore + 1) / 2) * 100, buckets, timeBasis, b => ((sentimentScore(b) + 1) / 2) * 100, v => `${Math.round(v)}`),
    buildStat('positivePct', posPct, buckets, timeBasis, b => sentimentShare(b, 'POSITIVE') * 100, v => `${Math.round(v)}%`),
    buildStat('neutralPct', neuPct, buckets, timeBasis, b => sentimentShare(b, 'NEUTRAL') * 100, v => `${Math.round(v)}%`),
    buildStat('negativePct', negPct, buckets, timeBasis, b => sentimentShare(b, 'NEGATIVE') * 100, v => `${Math.round(v)}%`),
    buildStat('themeCount', themeCount, buckets, timeBasis, b => new Set(b.map(r => r.issueCategory)).size, v => `${Math.round(v)}`),
    buildStat('aiConfidence', aiConfidence, buckets, timeBasis, b => average(b.map(r => r.categoryConfidence ?? 0.5)) * 100, v => `${Math.round(v)}%`),
    buildStat('designOpportunities', designOpportunities, buckets, timeBasis, b => computeIssueImpact(b).filter(r => r.priority !== 'Low').length, v => `${Math.round(v)}`),
    buildStat('criticalIssues', criticalIssues, buckets, timeBasis, b => computeIssueImpact(b).filter(r => r.priority === 'High' || r.priority === 'Very High').length, v => `${Math.round(v)}`),
    buildStat('avgReviewLength', avgLength, buckets, timeBasis, b => average(b.map(r => wordCount(r.reviewText))), v => `${Math.round(v)}`)
  ];
}
