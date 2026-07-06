import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { sentimentShare, textMatchesAny, pickRepresentativeQuote } from './shared';

export type PersonaId = 'parents' | 'children' | 'joggers' | 'cyclists' | 'seniors' | 'petOwners' | 'tourists' | 'residents';

const PERSONA_KEYWORDS: Record<PersonaId, { label: string; keywords: string[] }> = {
  parents: { label: 'Parents', keywords: ['family', 'kids', 'kid', 'children', 'toddler', 'son', 'daughter'] },
  children: { label: 'Children', keywords: ['playground', 'slide', 'swing', 'fun for kids', 'loved playing', 'enjoyed playing', 'play area'] },
  joggers: { label: 'Joggers', keywords: ['jog', 'jogging', 'run', 'running', 'track', 'marathon'] },
  cyclists: { label: 'Cyclists', keywords: ['bike', 'bicycle', 'cycle', 'cycling', 'bike lane'] },
  seniors: { label: 'Senior Citizens', keywords: ['elderly', 'senior', 'grandparent', 'grandma', 'grandpa', 'retired'] },
  petOwners: { label: 'Pet Owners', keywords: ['dog', 'pet', 'cat', 'leash', 'puppy'] },
  tourists: { label: 'Tourists', keywords: ['visiting', 'tourist', 'vacation', 'holiday', 'trip', 'first time here', 'visited from'] },
  residents: { label: 'Residents', keywords: ['every week', 'regularly', 'live nearby', 'my neighborhood', 'daily walk', 'come here often', 'local'] }
};

export interface PersonaStat {
  id: PersonaId;
  label: string;
  reviewCount: number;
  primaryNeeds: string[];
  topComplaints: { category: string; negativeShare: number }[];
  positiveQuote: string;
  positiveQuoteAuthor: string;
  suggestedIntervention: string;
}

function topCategoriesByCount(reviews: NLPAnalyzedReview[], n: number): string[] {
  const counts = new Map<string, number>();
  reviews.forEach(r => counts.set(r.issueCategory, (counts.get(r.issueCategory) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);
}

function topComplaintsByNegativeShare(reviews: NLPAnalyzedReview[], n: number): { category: string; negativeShare: number }[] {
  const byCategory = new Map<string, NLPAnalyzedReview[]>();
  reviews.forEach(r => {
    const list = byCategory.get(r.issueCategory) || [];
    list.push(r);
    byCategory.set(r.issueCategory, list);
  });
  return [...byCategory.entries()]
    .map(([category, catReviews]) => ({ category, negativeShare: sentimentShare(catReviews, 'NEGATIVE'), mentions: catReviews.length }))
    .filter(r => r.mentions >= 2)
    .sort((a, b) => b.negativeShare - a.negativeShare)
    .slice(0, n)
    .map(r => ({ category: r.category, negativeShare: r.negativeShare }));
}

/**
 * Multi-label persona inference from review text -- a review can match 0+
 * personas (e.g. "brought my kids for a jog" matches both parents and
 * joggers). Since reviews are adult-authored, "Children" is approximated via
 * language about kids actively enjoying play equipment, distinct from the
 * general caretaking language used for "Parents".
 */
export function computePersonaAnalytics(reviews: NLPAnalyzedReview[]): PersonaStat[] {
  const stats: PersonaStat[] = [];

  (Object.entries(PERSONA_KEYWORDS) as [PersonaId, { label: string; keywords: string[] }][]).forEach(([id, def]) => {
    const pool = reviews.filter(r => textMatchesAny(r.reviewText, def.keywords));
    if (pool.length === 0) return;

    const primaryNeeds = topCategoriesByCount(pool, 3);
    const topComplaints = topComplaintsByNegativeShare(pool, 3);
    const positiveReviews = pool.filter(r => r.sentiment === 'POSITIVE');
    const rep = pickRepresentativeQuote(positiveReviews.length > 0 ? positiveReviews : pool);
    const topComplaintCategory = topComplaints[0]?.category;
    const interventionSource = pool.find(r => r.issueCategory === topComplaintCategory) || pool[0];

    stats.push({
      id,
      label: def.label,
      reviewCount: pool.length,
      primaryNeeds,
      topComplaints,
      positiveQuote: rep?.reviewText || '',
      positiveQuoteAuthor: rep?.authorName || '',
      suggestedIntervention: interventionSource?.designRequirement || ''
    });
  });

  return stats.sort((a, b) => b.reviewCount - a.reviewCount);
}
