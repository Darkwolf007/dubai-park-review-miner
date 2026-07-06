import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { average, sentimentScore, sentimentShare, bucketByPeriod, type PeriodGranularity } from './shared';

export type TrendGranularity = PeriodGranularity;
export type TrendMetric = 'avgRating' | 'sentimentScore' | 'reviewVolume' | 'negativeSentimentPct';

export const TREND_METRICS: { id: TrendMetric; label: string }[] = [
  { id: 'avgRating', label: 'Average Rating' },
  { id: 'sentimentScore', label: 'Sentiment Score' },
  { id: 'reviewVolume', label: 'Review Volume' },
  { id: 'negativeSentimentPct', label: 'Negative Sentiment %' }
];

function metricValue(reviews: NLPAnalyzedReview[], metric: TrendMetric): number {
  if (reviews.length === 0) return NaN;
  switch (metric) {
    case 'avgRating': return average(reviews.map(r => r.rating));
    case 'sentimentScore': return ((sentimentScore(reviews) + 1) / 2) * 100;
    case 'reviewVolume': return reviews.length;
    case 'negativeSentimentPct': return sentimentShare(reviews, 'NEGATIVE') * 100;
    default: return NaN;
  }
}

export interface TrendPoint {
  period: string;
  valuesByPark: Record<string, number | null>;
  dubaiAverage: number | null;
}

/**
 * Buckets each park's reviews by real publishedAtDate into periods. Only
 * reviews with a parseable date are included -- no synthetic fallback here,
 * since a genuine calendar axis is the whole point of a trend chart.
 * dubaiAverage is computed from all reviews across all parks combined per
 * period (weighted by volume), not a naive mean-of-per-park-means.
 */
export function computeParkTimeSeries(
  reviewsByPark: Record<string, NLPAnalyzedReview[]>,
  granularity: TrendGranularity,
  metric: TrendMetric
): TrendPoint[] {
  const parkIds = Object.keys(reviewsByPark);
  const allReviews = parkIds.flatMap(id => reviewsByPark[id]);
  const periods = bucketByPeriod(allReviews, r => r.publishedAtDate, granularity);

  return periods.map(({ period, items }) => {
    const byPark = new Map<string, NLPAnalyzedReview[]>();
    items.forEach(r => {
      if (!byPark.has(r.placeId)) byPark.set(r.placeId, []);
      byPark.get(r.placeId)!.push(r);
    });

    const valuesByPark: Record<string, number | null> = {};
    parkIds.forEach(placeId => {
      const value = metricValue(byPark.get(placeId) || [], metric);
      valuesByPark[placeId] = Number.isNaN(value) ? null : value;
    });

    const dubaiValue = metricValue(items, metric);
    return { period, valuesByPark, dubaiAverage: Number.isNaN(dubaiValue) ? null : dubaiValue };
  });
}

export interface TopicEvolutionPoint {
  period: string;
  shares: Record<string, number>;
}

/** Per-period share of each issue category, combined across parks so the stacked chart stays legible. */
export function computeTopicEvolution(reviews: NLPAnalyzedReview[], granularity: TrendGranularity): TopicEvolutionPoint[] {
  const periods = bucketByPeriod(reviews, r => r.publishedAtDate, granularity);

  return periods.map(({ period, items }) => {
    const total = items.length;
    const counts = new Map<string, number>();
    items.forEach(r => counts.set(r.issueCategory, (counts.get(r.issueCategory) || 0) + 1));
    const shares: Record<string, number> = {};
    counts.forEach((count, category) => { shares[category] = total === 0 ? 0 : count / total; });
    return { period, shares };
  });
}
