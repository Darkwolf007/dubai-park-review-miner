import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { matchAllCategories } from '../nlpPlaceholders';

export interface RatingDriverRow {
  category: string;
  shareIn5Star: number;
  shareIn1Star: number;
  differential: number;
}

/**
 * Uses matchAllCategories (multi-label) rather than each review's single
 * winning issueCategory -- a rating-driver analysis needs every issue a
 * review touches, not just the one the primary classifier picked.
 */
export function computeRatingDrivers(reviews: NLPAnalyzedReview[]): RatingDriverRow[] {
  const fiveStar = reviews.filter(r => r.rating === 5);
  const oneStar = reviews.filter(r => r.rating === 1);

  const categoryShare = (group: NLPAnalyzedReview[], category: string): number => {
    if (group.length === 0) return 0;
    const matches = group.filter(r => matchAllCategories(r.reviewText).includes(category)).length;
    return matches / group.length;
  };

  const allCategories = new Set<string>();
  reviews.forEach(r => matchAllCategories(r.reviewText).forEach(c => allCategories.add(c)));

  return [...allCategories].map(category => {
    const shareIn5Star = categoryShare(fiveStar, category);
    const shareIn1Star = categoryShare(oneStar, category);
    return {
      category,
      shareIn5Star,
      shareIn1Star,
      differential: shareIn5Star - shareIn1Star
    };
  }).sort((a, b) => b.differential - a.differential);
}
