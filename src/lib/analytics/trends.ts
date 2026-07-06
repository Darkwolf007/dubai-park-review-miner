import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { average, sentimentScore, sentimentShare } from './shared';

export type TrendGranularity = 'month' | 'quarter' | 'year';
export type TrendMetric = 'avgRating' | 'sentimentScore' | 'reviewVolume' | 'negativeSentimentPct';

export const TREND_METRICS: { id: TrendMetric; label: string }[] = [
  { id: 'avgRating', label: 'Average Rating' },
  { id: 'sentimentScore', label: 'Sentiment Score' },
  { id: 'reviewVolume', label: 'Review Volume' },
  { id: 'negativeSentimentPct', label: 'Negative Sentiment %' }
];

function periodKey(dateStr: string, granularity: TrendGranularity): string | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (granularity === 'year') return `${year}`;
  if (granularity === 'quarter') return `${year}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

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
  const periodMap = new Map<string, Record<string, NLPAnalyzedReview[]>>();

  Object.entries(reviewsByPark).forEach(([placeId, reviews]) => {
    reviews.forEach(r => {
      if (!r.publishedAtDate) return;
      const key = periodKey(r.publishedAtDate, granularity);
      if (!key) return;
      if (!periodMap.has(key)) periodMap.set(key, {});
      const byPark = periodMap.get(key)!;
      if (!byPark[placeId]) byPark[placeId] = [];
      byPark[placeId].push(r);
    });
  });

  const periods = [...periodMap.keys()].sort();
  const parkIds = Object.keys(reviewsByPark);

  return periods.map(period => {
    const byPark = periodMap.get(period)!;
    const valuesByPark: Record<string, number | null> = {};
    parkIds.forEach(placeId => {
      const value = metricValue(byPark[placeId] || [], metric);
      valuesByPark[placeId] = Number.isNaN(value) ? null : value;
    });

    const allReviewsThisPeriod = Object.values(byPark).flat();
    const dubaiValue = metricValue(allReviewsThisPeriod, metric);

    return { period, valuesByPark, dubaiAverage: Number.isNaN(dubaiValue) ? null : dubaiValue };
  });
}

export interface TopicEvolutionPoint {
  period: string;
  shares: Record<string, number>;
}

/** Per-period share of each issue category, combined across parks so the stacked chart stays legible. */
export function computeTopicEvolution(reviews: NLPAnalyzedReview[], granularity: TrendGranularity): TopicEvolutionPoint[] {
  const periodMap = new Map<string, NLPAnalyzedReview[]>();
  reviews.forEach(r => {
    if (!r.publishedAtDate) return;
    const key = periodKey(r.publishedAtDate, granularity);
    if (!key) return;
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(r);
  });

  const periods = [...periodMap.keys()].sort();

  return periods.map(period => {
    const periodReviews = periodMap.get(period)!;
    const total = periodReviews.length;
    const counts = new Map<string, number>();
    periodReviews.forEach(r => counts.set(r.issueCategory, (counts.get(r.issueCategory) || 0) + 1));
    const shares: Record<string, number> = {};
    counts.forEach((count, category) => { shares[category] = total === 0 ? 0 : count / total; });
    return { period, shares };
  });
}
