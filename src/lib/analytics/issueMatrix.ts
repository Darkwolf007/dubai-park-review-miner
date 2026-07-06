import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { average, sentimentShare } from './shared';

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Very High';

export interface IssueImpactRow {
  category: string;
  mentions: number;
  mentionShare: number;
  avgRating: number;
  negativeSentimentShare: number;
  priorityIndex: number;
  priority: PriorityLevel;
}

function priorityLevel(index: number): PriorityLevel {
  if (index >= 75) return 'Very High';
  if (index >= 50) return 'High';
  if (index >= 25) return 'Medium';
  return 'Low';
}

/**
 * Priority = 40% how often the issue is mentioned + 40% how negative its
 * sentiment runs + 20% how far its average rating sits below 5 stars.
 */
export function computeIssueImpact(reviews: NLPAnalyzedReview[]): IssueImpactRow[] {
  if (reviews.length === 0) return [];
  const byCategory = new Map<string, NLPAnalyzedReview[]>();
  reviews.forEach(r => {
    const list = byCategory.get(r.issueCategory) || [];
    list.push(r);
    byCategory.set(r.issueCategory, list);
  });

  const rows: IssueImpactRow[] = [];
  byCategory.forEach((catReviews, category) => {
    const mentions = catReviews.length;
    const mentionShare = mentions / reviews.length;
    const avgRating = average(catReviews.map(r => r.rating));
    const negativeSentimentShare = sentimentShare(catReviews, 'NEGATIVE');
    const priorityIndex = Math.min(
      100,
      Math.round((mentionShare * 0.4 + negativeSentimentShare * 0.4 + ((5 - avgRating) / 5) * 0.2) * 100)
    );
    rows.push({
      category,
      mentions,
      mentionShare,
      avgRating: Math.round(avgRating * 10) / 10,
      negativeSentimentShare,
      priorityIndex,
      priority: priorityLevel(priorityIndex)
    });
  });

  return rows;
}

export type IssueSortMode = 'priority' | 'frequency' | 'rating' | 'sentiment';

export function sortIssueImpact(rows: IssueImpactRow[], mode: IssueSortMode): IssueImpactRow[] {
  const sorted = [...rows];
  switch (mode) {
    case 'priority': return sorted.sort((a, b) => b.priorityIndex - a.priorityIndex);
    case 'frequency': return sorted.sort((a, b) => b.mentions - a.mentions);
    case 'rating': return sorted.sort((a, b) => a.avgRating - b.avgRating);
    case 'sentiment': return sorted.sort((a, b) => b.negativeSentimentShare - a.negativeSentimentShare);
    default: return sorted;
  }
}
