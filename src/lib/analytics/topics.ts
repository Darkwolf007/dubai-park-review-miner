import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { sentimentShare, pickRepresentativeQuote } from './shared';

export interface TopicStat {
  category: string;
  reviewCount: number;
  sentiment: { positive: number; neutral: number; negative: number };
  topKeywords: string[];
  representativeQuote: string;
  representativeAuthor: string;
  designImplication: string;
}

export function computeTopicDistribution(reviews: NLPAnalyzedReview[]): TopicStat[] {
  const byCategory = new Map<string, NLPAnalyzedReview[]>();
  reviews.forEach(r => {
    const list = byCategory.get(r.issueCategory) || [];
    list.push(r);
    byCategory.set(r.issueCategory, list);
  });

  const stats: TopicStat[] = [];
  byCategory.forEach((catReviews, category) => {
    const keywordFreq = new Map<string, number>();
    catReviews.forEach(r => r.keywords.forEach(k => keywordFreq.set(k, (keywordFreq.get(k) || 0) + 1)));
    const topKeywords = [...keywordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);

    const rep = pickRepresentativeQuote(catReviews);

    stats.push({
      category,
      reviewCount: catReviews.length,
      sentiment: {
        positive: sentimentShare(catReviews, 'POSITIVE'),
        neutral: sentimentShare(catReviews, 'NEUTRAL'),
        negative: sentimentShare(catReviews, 'NEGATIVE')
      },
      topKeywords,
      representativeQuote: rep?.reviewText || '',
      representativeAuthor: rep?.authorName || '',
      designImplication: rep?.designRequirement || ''
    });
  });

  return stats.sort((a, b) => b.reviewCount - a.reviewCount);
}
