import type { NLPAnalyzedReview } from '../nlpPlaceholders';

export type TrendDirection = 'up' | 'down' | 'flat';

export function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function wordCount(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

/** -1..1, where +1 = all POSITIVE, -1 = all NEGATIVE. */
export function sentimentScore(reviews: NLPAnalyzedReview[]): number {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => acc + (r.sentiment === 'POSITIVE' ? 1 : r.sentiment === 'NEGATIVE' ? -1 : 0), 0);
  return sum / reviews.length;
}

export function sentimentShare(reviews: NLPAnalyzedReview[], sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'): number {
  if (reviews.length === 0) return 0;
  return reviews.filter(r => r.sentiment === sentiment).length / reviews.length;
}

export function textMatchesAny(text: string, keywords: string[]): boolean {
  const lower = (text || '').toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

export interface TimeBucketResult {
  buckets: NLPAnalyzedReview[][];
  timeBasis: 'calendar' | 'sequence';
}

/**
 * Buckets reviews into N ordered chunks for sparklines/trends.
 * Uses real publishedAtDate ordering when at least 80% of reviews have a
 * parseable date; otherwise falls back to stable array order (labeled
 * 'sequence' so the UI can disclose it isn't calendar time).
 */
export function bucketReviewsByTime(reviews: NLPAnalyzedReview[], numBuckets = 8): TimeBucketResult {
  if (reviews.length === 0) {
    return { buckets: Array.from({ length: numBuckets }, () => []), timeBasis: 'sequence' };
  }
  const parseableCount = reviews.filter(r => r.publishedAtDate && !isNaN(Date.parse(r.publishedAtDate))).length;
  const useCalendar = parseableCount / reviews.length >= 0.8;
  const ordered = useCalendar
    ? [...reviews].sort((a, b) => Date.parse(a.publishedAtDate || '') - Date.parse(b.publishedAtDate || ''))
    : reviews;
  const bucketSize = Math.max(1, Math.ceil(ordered.length / numBuckets));
  const buckets: NLPAnalyzedReview[][] = [];
  for (let i = 0; i < numBuckets; i++) {
    buckets.push(ordered.slice(i * bucketSize, (i + 1) * bucketSize));
  }
  return { buckets, timeBasis: useCalendar ? 'calendar' : 'sequence' };
}

/** Penalizes quotes that are too short to carry context or too long for a card. */
function quoteLengthPenalty(text: string): number {
  const len = (text || '').length;
  if (len < 40) return 0.4;
  if (len > 220) return 0.25;
  return 0;
}

/** Picks the highest-confidence, card-length-appropriate review to quote as representative. */
export function pickRepresentativeQuote(reviews: NLPAnalyzedReview[]): NLPAnalyzedReview | undefined {
  if (reviews.length === 0) return undefined;
  const ranked = [...reviews].sort((a, b) => {
    const aScore = (a.categoryConfidence ?? 0.5) - quoteLengthPenalty(a.reviewText);
    const bScore = (b.categoryConfidence ?? 0.5) - quoteLengthPenalty(b.reviewText);
    return bScore - aScore;
  });
  return ranked[0];
}

export type PeriodGranularity = 'month' | 'quarter' | 'year';

/** Formats a date into a sortable period key: "2026", "2026-Q1", or "2026-03". */
export function periodKey(dateStr: string, granularity: PeriodGranularity): string | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (granularity === 'year') return `${year}`;
  if (granularity === 'quarter') return `${year}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Groups arbitrary items into chronologically-sorted periods by a date field.
 * Items without a parseable date are dropped rather than mis-bucketed --
 * callers that need a real calendar axis (trends, keyword-over-time) should
 * not fabricate a period for undated data.
 */
export function bucketByPeriod<T>(items: T[], dateAccessor: (item: T) => string | undefined, granularity: PeriodGranularity): { period: string; items: T[] }[] {
  const periodMap = new Map<string, T[]>();
  items.forEach(item => {
    const dateStr = dateAccessor(item);
    if (!dateStr) return;
    const key = periodKey(dateStr, granularity);
    if (!key) return;
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(item);
  });
  return [...periodMap.keys()].sort().map(period => ({ period, items: periodMap.get(period)! }));
}

/** Compares the mean of the earlier half of bucket values against the later half. */
export function computeTrend(bucketValues: number[]): { trend: TrendDirection; trendPct: number } {
  if (bucketValues.length === 0) return { trend: 'flat', trendPct: 0 };
  const half = Math.max(1, Math.floor(bucketValues.length / 2));
  const earlyAvg = average(bucketValues.slice(0, half));
  const recentAvg = average(bucketValues.slice(bucketValues.length - half));
  const trendPct = earlyAvg === 0 ? (recentAvg === 0 ? 0 : 100) : ((recentAvg - earlyAvg) / Math.abs(earlyAvg)) * 100;
  const trend: TrendDirection = trendPct > 2 ? 'up' : trendPct < -2 ? 'down' : 'flat';
  return { trend, trendPct: Math.round(trendPct * 10) / 10 };
}
