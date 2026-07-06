import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { average, sentimentShare, textMatchesAny } from './shared';

export interface SubscoreResult {
  key: string;
  label: string;
  score: number;
  sampleSize: number;
  lowSample: boolean;
}

export interface HealthScoreResult {
  overall: number;
  subscores: SubscoreResult[];
}

const FAMILY_KEYWORDS = ['family', 'kid', 'kids', 'child', 'children', 'toddler'];
const BIODIVERSITY_KEYWORDS = ['bird', 'birds', 'wildlife', 'butterfly', 'butterflies', 'bee', 'bees', 'nature', 'squirrel', 'duck', 'ducks'];
const WALK_KEYWORDS = ['path', 'walkway', 'trail', 'walk', 'jogging track', 'track'];
const COMMUNITY_KEYWORDS = ['event', 'events', 'gathering', 'community', 'festival', 'picnic'];

/** Below this sample size a subscore is unreliable; we show a neutral baseline and flag it. */
const MIN_SAMPLE = 5;
const NEUTRAL_BASELINE = 60;

function scoreFromReviews(reviews: NLPAnalyzedReview[]): { score: number; lowSample: boolean } {
  if (reviews.length < MIN_SAMPLE) {
    return { score: NEUTRAL_BASELINE, lowSample: true };
  }
  const posShare = sentimentShare(reviews, 'POSITIVE');
  const negShare = sentimentShare(reviews, 'NEGATIVE');
  const sentimentComponent = ((posShare - negShare) + 1) / 2; // rescale -1..1 to 0..1
  const avgRating = average(reviews.map(r => r.rating));
  const score = Math.round((sentimentComponent * 0.6 + (avgRating / 5) * 0.4) * 100);
  return { score: Math.max(0, Math.min(100, score)), lowSample: false };
}

function byCategory(reviews: NLPAnalyzedReview[], categories: string[]): NLPAnalyzedReview[] {
  const set = new Set(categories);
  return reviews.filter(r => set.has(r.issueCategory));
}

function byKeyword(pool: NLPAnalyzedReview[], keywords: string[]): NLPAnalyzedReview[] {
  return pool.filter(r => textMatchesAny(r.reviewText, keywords));
}

function dedupe(reviews: NLPAnalyzedReview[]): NLPAnalyzedReview[] {
  return Array.from(new Set(reviews));
}

/**
 * Maps the 11 required Park Health Score dimensions onto the existing
 * 16-category keyword lexicon (plus a few secondary keyword checks for
 * dimensions the lexicon doesn't directly cover, e.g. biodiversity,
 * walkability, community activity). This is a heuristic approximation,
 * not ground truth -- documented so it can be explained in the UI.
 */
export function computeHealthScore(reviews: NLPAnalyzedReview[]): HealthScoreResult {
  const greenery = byCategory(reviews, ['landscape / greenery']);
  const accessibility = byCategory(reviews, ['accessibility']);
  const crowding = byCategory(reviews, ['crowding']);

  const subDefs: { key: string; label: string; pool: NLPAnalyzedReview[] }[] = [
    { key: 'thermalComfort', label: 'Thermal Comfort', pool: byCategory(reviews, ['shade / heat comfort']) },
    { key: 'accessibility', label: 'Accessibility', pool: accessibility },
    { key: 'maintenance', label: 'Maintenance', pool: byCategory(reviews, ['maintenance', 'cleanliness']) },
    { key: 'safety', label: 'Safety', pool: byCategory(reviews, ['safety', 'lighting']) },
    { key: 'familyFriendliness', label: 'Family Friendliness', pool: byKeyword(reviews, FAMILY_KEYWORDS) },
    { key: 'playQuality', label: 'Play Quality', pool: byCategory(reviews, ['playground', 'sports facilities']) },
    { key: 'landscapeQuality', label: 'Landscape Quality', pool: byCategory(reviews, ['landscape / greenery', 'water features']) },
    { key: 'biodiversity', label: 'Biodiversity', pool: byKeyword(greenery, BIODIVERSITY_KEYWORDS) },
    { key: 'amenities', label: 'Amenities', pool: byCategory(reviews, ['toilets', 'food / cafe', 'parking']) },
    { key: 'walkability', label: 'Walkability', pool: byKeyword(accessibility, WALK_KEYWORDS) },
    {
      key: 'communityActivity',
      label: 'Community Activity',
      pool: dedupe([...crowding.filter(r => r.sentiment !== 'NEGATIVE'), ...byKeyword(reviews, COMMUNITY_KEYWORDS)])
    }
  ];

  const subscores: SubscoreResult[] = subDefs.map(def => {
    const { score, lowSample } = scoreFromReviews(def.pool);
    return { key: def.key, label: def.label, score, sampleSize: def.pool.length, lowSample };
  });

  const overall = Math.round(average(subscores.map(s => s.score)));

  return { overall, subscores };
}
