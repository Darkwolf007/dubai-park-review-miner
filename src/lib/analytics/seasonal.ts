import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { sentimentScore, sentimentShare, textMatchesAny } from './shared';
import { COMMUNITY_KEYWORDS } from './healthScore';

// Hardcoded Gregorian Ramadan date ranges -- a small, bounded, knowable table
// covering the plausible span of this dataset, not a lunar calendar algorithm.
// Dates are approximate (moon-sighting can shift the actual start by a day).
const RAMADAN_RANGES: { start: string; end: string }[] = [
  { start: '2023-03-23', end: '2023-04-20' },
  { start: '2024-03-11', end: '2024-04-09' },
  { start: '2025-03-01', end: '2025-03-29' },
  { start: '2026-02-18', end: '2026-03-19' },
  { start: '2027-02-08', end: '2027-03-08' }
];

export type SummerWinter = 'Summer' | 'Winter' | 'Transitional';
export type DayType = 'Weekday' | 'Weekend';
export type PostingTime = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export interface ReviewClassification {
  summerWinter: SummerWinter;
  isRamadan: boolean;
  dayType: DayType;
  postingTime: PostingTime;
}

function classifySummerWinter(month: number): SummerWinter {
  if (month >= 6 && month <= 9) return 'Summer';
  if (month === 11 || month === 12 || month <= 3) return 'Winter';
  return 'Transitional';
}

function isRamadanDate(d: Date): boolean {
  const iso = d.toISOString().slice(0, 10);
  return RAMADAN_RANGES.some(range => iso >= range.start && iso <= range.end);
}

function classifyPostingTime(hour: number): PostingTime {
  if (hour >= 5 && hour <= 11) return 'Morning';
  if (hour >= 12 && hour <= 16) return 'Afternoon';
  if (hour >= 17 && hour <= 20) return 'Evening';
  return 'Night';
}

/**
 * Classifies a review by real publishedAtDate. Note: postingTime reflects
 * when the review was POSTED, not when the visit happened -- reviewers
 * commonly post well after visiting, often at whatever hour suits them, so
 * this is a "Review Posting Time" signal, not a proxy for visit time.
 */
export function classifyReview(publishedAtDate: string | undefined): ReviewClassification | null {
  if (!publishedAtDate) return null;
  const d = new Date(publishedAtDate);
  if (isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  return {
    summerWinter: classifySummerWinter(d.getUTCMonth() + 1),
    isRamadan: isRamadanDate(d),
    dayType: day === 0 || day === 6 ? 'Weekend' : 'Weekday',
    postingTime: classifyPostingTime(d.getUTCHours())
  };
}

export type SeasonalDimension = 'summerWinter' | 'ramadan' | 'dayType' | 'postingTime';

export const SEASONAL_DIMENSIONS: { id: SeasonalDimension; label: string }[] = [
  { id: 'summerWinter', label: 'Season' },
  { id: 'ramadan', label: 'Ramadan' },
  { id: 'dayType', label: 'Day Type' },
  { id: 'postingTime', label: 'Review Posting Time' }
];

export interface SeasonalBucket {
  bucket: string;
  reviewCount: number;
  avgRating: number;
  sentimentScore: number;
  heatComplaintsPct: number;
  crowdingPct: number;
  eventMentionsPct: number;
}

function categoryNegativeShare(reviews: NLPAnalyzedReview[], category: string): number {
  const catReviews = reviews.filter(r => r.issueCategory === category);
  if (catReviews.length === 0) return 0;
  return sentimentShare(catReviews, 'NEGATIVE') * 100;
}

function bucketKey(classification: ReviewClassification, dimension: SeasonalDimension): string {
  switch (dimension) {
    case 'summerWinter': return classification.summerWinter;
    case 'ramadan': return classification.isRamadan ? 'Ramadan' : 'Non-Ramadan';
    case 'dayType': return classification.dayType;
    case 'postingTime': return classification.postingTime;
    default: return 'Unknown';
  }
}

/** Groups reviews by one seasonal dimension and computes the requested comparison metrics per bucket. */
export function computeSeasonalBreakdown(reviews: NLPAnalyzedReview[], dimension: SeasonalDimension): SeasonalBucket[] {
  const byBucket = new Map<string, NLPAnalyzedReview[]>();
  reviews.forEach(r => {
    const classification = classifyReview(r.publishedAtDate);
    if (!classification) return;
    const key = bucketKey(classification, dimension);
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key)!.push(r);
  });

  return [...byBucket.entries()].map(([bucket, bucketReviews]) => ({
    bucket,
    reviewCount: bucketReviews.length,
    avgRating: Math.round((bucketReviews.reduce((a, r) => a + r.rating, 0) / bucketReviews.length) * 10) / 10,
    sentimentScore: Math.round(((sentimentScore(bucketReviews) + 1) / 2) * 100),
    heatComplaintsPct: Math.round(categoryNegativeShare(bucketReviews, 'shade / heat comfort')),
    crowdingPct: Math.round(categoryNegativeShare(bucketReviews, 'crowding')),
    eventMentionsPct: Math.round((bucketReviews.filter(r => textMatchesAny(r.reviewText, COMMUNITY_KEYWORDS)).length / bucketReviews.length) * 100)
  }));
}
