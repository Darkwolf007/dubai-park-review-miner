import type { H3Feature, RoadStats } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { matchAllCategories, POSITIVE_SENTIMENT_WORDS, NEGATIVE_SENTIMENT_WORDS } from '../nlpPlaceholders';
import { computeIssueImpact, sortIssueImpact, type IssueImpactRow } from '../analytics/issueMatrix';
import { computeTopicDistribution, type TopicStat } from '../analytics/topics';
import { computeTopicCooccurrence, type CooccurrenceGraph } from '../analytics/cooccurrence';
import { computePersonaAnalytics, PERSONA_KEYWORDS, type PersonaStat } from '../analytics/personas';
import { computeSeasonalBreakdown, classifyReview, type SeasonalBucket } from '../analytics/seasonal';
import { sentimentShare, sentimentScore, textMatchesAny, bucketByPeriod, computeTrend, average } from '../analytics/shared';
import { computeActivityPatterns, type ActivityPatternBucket } from './communityEngine';
import { hexHeatExposureProxy, computeAvgRoadWidthM } from './environmentalEngine';
import { hexCentroid } from './h3Engine';

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

// ---------------------------------------------------------------------------
// Sentence-level sentiment (heuristic aspect-level approximation)
// ---------------------------------------------------------------------------
// This dataset has no real NLP model access for true sentence embeddings or
// aspect-based sentiment. This is a deterministic, disclosed heuristic:
// split review text into sentences, keyword-match sentiment words and topics
// per sentence using the SAME word lists as the review-level classifier
// (POSITIVE_SENTIMENT_WORDS/NEGATIVE_SENTIMENT_WORDS/matchAllCategories) --
// giving a coarser but real per-sentence signal, not a black-box model score.

export interface SentenceSentiment {
  text: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  topics: string[];
}

export function splitSentences(text: string): string[] {
  return (text || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}

export function analyzeSentences(review: NLPAnalyzedReview): SentenceSentiment[] {
  return splitSentences(review.reviewText).map(sentence => {
    const lower = sentence.toLowerCase();
    const posHit = POSITIVE_SENTIMENT_WORDS.some(w => lower.includes(w));
    const negHit = NEGATIVE_SENTIMENT_WORDS.some(w => lower.includes(w));
    const sentiment: SentenceSentiment['sentiment'] = posHit && !negHit ? 'POSITIVE' : negHit && !posHit ? 'NEGATIVE' : 'NEUTRAL';
    return { text: sentence, sentiment, topics: matchAllCategories(sentence) };
  });
}

/** Flags reviews where the star rating and sentence-level text sentiment point in clearly opposite directions -- per the spec's fallback policy: "If review text and rating conflict: Flag for review" rather than silently pick one signal. */
export interface RatingSentimentMismatch {
  authorName: string;
  rating: number;
  reviewText: string;
  negativeSentenceShare: number;
}

export function computeRatingSentimentMismatches(reviews: NLPAnalyzedReview[]): RatingSentimentMismatch[] {
  const flagged: RatingSentimentMismatch[] = [];
  reviews.forEach(r => {
    const sentences = analyzeSentences(r);
    if (sentences.length === 0) return;
    const negShare = sentences.filter(s => s.sentiment === 'NEGATIVE').length / sentences.length;
    if (r.rating >= 4 && negShare >= 0.5) flagged.push({ authorName: r.authorName, rating: r.rating, reviewText: r.reviewText, negativeSentenceShare: Math.round(negShare * 100) / 100 });
    if (r.rating <= 2 && negShare === 0 && sentences.some(s => s.sentiment === 'POSITIVE')) flagged.push({ authorName: r.authorName, rating: r.rating, reviewText: r.reviewText, negativeSentenceShare: Math.round(negShare * 100) / 100 });
  });
  return flagged;
}

// ---------------------------------------------------------------------------
// Review cleaning summary (real deterministic checks -- no ML language/spam models)
// ---------------------------------------------------------------------------

export interface ReviewCleaningSummary {
  totalRaw: number;
  validReviews: number;
  duplicatesRemoved: number;
  veryShortReviews: number;
  flaggedForReview: number;
  languageNote: string;
}

export function computeReviewCleaningSummary(reviews: NLPAnalyzedReview[]): ReviewCleaningSummary {
  const seen = new Set<string>();
  let duplicates = 0;
  reviews.forEach(r => {
    const key = `${r.authorName}|${r.reviewText}`.toLowerCase().trim();
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  });
  const veryShort = reviews.filter(r => (r.reviewText || '').trim().length < 15).length;
  const mismatches = computeRatingSentimentMismatches(reviews);

  return {
    totalRaw: reviews.length,
    validReviews: reviews.filter(r => (r.reviewText || '').trim().length > 0).length,
    duplicatesRemoved: duplicates,
    veryShortReviews: veryShort,
    flaggedForReview: mismatches.length,
    languageNote: 'Non-English reviews in the source dataset are pre-translated to English by the upstream scraper before reaching this engine, and the per-review language tag is not reliably preserved -- language distribution is not reported as a KPI rather than showing a misleading "100% English" figure.'
  };
}

// ---------------------------------------------------------------------------
// Review KPIs
// ---------------------------------------------------------------------------

export type NlpMetricStatus = 'good' | 'watch' | 'critical' | 'unavailable';
export type NlpMetricConfidence = 'High' | 'Medium' | 'Low' | 'N/A';

export interface NlpMetric {
  key: string;
  label: string;
  value: number | null;
  displayValue: string;
  unit?: string;
  status: NlpMetricStatus;
  priority: 'Low' | 'Medium' | 'High';
  confidence: NlpMetricConfidence;
  dataSource: string;
  note?: string;
}

const MENTION_TOPICS: { key: string; label: string; category: string }[] = [
  { key: 'mentionAccessibility', label: 'Reviews Mentioning Accessibility', category: 'accessibility' },
  { key: 'mentionShade', label: 'Reviews Mentioning Shade', category: 'shade / heat comfort' },
  { key: 'mentionPlayground', label: 'Reviews Mentioning Playgrounds', category: 'playground' },
  { key: 'mentionMaintenance', label: 'Reviews Mentioning Maintenance', category: 'maintenance' },
  { key: 'mentionToilets', label: 'Reviews Mentioning Toilets', category: 'toilets' },
  { key: 'mentionParking', label: 'Reviews Mentioning Parking', category: 'parking' },
  { key: 'mentionSafety', label: 'Reviews Mentioning Safety', category: 'safety' },
  { key: 'mentionLighting', label: 'Reviews Mentioning Lighting', category: 'lighting' },
  { key: 'mentionSports', label: 'Reviews Mentioning Sports', category: 'sports facilities' },
  { key: 'mentionSeating', label: 'Reviews Mentioning Seating', category: 'seating' },
  { key: 'mentionCafe', label: 'Reviews Mentioning Cafés', category: 'food / cafe' },
  { key: 'mentionWater', label: 'Reviews Mentioning Water', category: 'water features' },
  { key: 'mentionMosquitoes', label: 'Reviews Mentioning Mosquitoes/Pests', category: 'pests / mosquitoes' },
  { key: 'mentionCleanliness', label: 'Reviews Mentioning Cleanliness', category: 'cleanliness' },
  { key: 'mentionCrowding', label: 'Reviews Mentioning Crowding', category: 'crowding' }
];

export function computeNlpKPIs(reviews: NLPAnalyzedReview[], cleaning: ReviewCleaningSummary): { metrics: NlpMetric[]; overallSentimentScore: number; actionabilityScore: number; issueDiversityScore: number } {
  const total = reviews.length || 1;
  const ratings = [...reviews.map(r => r.rating)].sort((a, b) => a - b);
  const avgRating = average(ratings);
  const medianRating = ratings.length > 0 ? ratings[Math.floor(ratings.length / 2)] : 0;

  const posShare = sentimentShare(reviews, 'POSITIVE');
  const neuShare = sentimentShare(reviews, 'NEUTRAL');
  const negShare = sentimentShare(reviews, 'NEGATIVE');
  const overallSentimentScore = Math.round(((sentimentScore(reviews) + 1) / 2) * 100);

  const actionableReviews = reviews.filter(r => r.issueCategory !== 'general landscape').length;
  const praiseReviews = reviews.filter(r => r.sentiment === 'POSITIVE').length;
  const actionabilityScore = Math.round((actionableReviews / total) * 100);

  const distinctCategoriesPresent = new Set(reviews.map(r => r.issueCategory)).size;
  const TOTAL_TOPIC_COUNT = 20; // 16 original + 4 extended categories
  const issueDiversityScore = Math.round((distinctCategoriesPresent / TOTAL_TOPIC_COUNT) * 100);

  const avgConfidence = average(reviews.map(r => r.categoryConfidence ?? 0.5));
  const topicConfidencePct = Math.round(avgConfidence * 100);

  const mentionMetrics: NlpMetric[] = MENTION_TOPICS.map(t => {
    const count = reviews.filter(r => matchAllCategories(r.reviewText).includes(t.category)).length;
    return { key: t.key, label: t.label, value: count, displayValue: count.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Review NLP (multi-label keyword match)' };
  });

  const mentionChildren = reviews.filter(r => textMatchesAny(r.reviewText, ['child', 'children', 'kid', 'kids', 'toddler'])).length;
  const mentionFamilies = reviews.filter(r => textMatchesAny(r.reviewText, ['family', 'families'])).length;
  const mentionOlderAdults = reviews.filter(r => textMatchesAny(r.reviewText, ['elderly', 'senior', 'grandparent', 'grandma', 'grandpa', 'retired'])).length;
  const mentionPOD = reviews.filter(r => textMatchesAny(r.reviewText, ['wheelchair', 'disability', 'disabled', 'special needs', 'accessible', 'people of determination'])).length;

  const metrics: NlpMetric[] = [
    { key: 'totalReviews', label: 'Total Reviews', value: cleaning.totalRaw, displayValue: cleaning.totalRaw.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Apify Google Maps Reviews Scraper' },
    { key: 'validReviews', label: 'Valid Reviews', value: cleaning.validReviews, displayValue: cleaning.validReviews.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Non-empty review text' },
    { key: 'duplicatesRemoved', label: 'Duplicate Reviews Detected', value: cleaning.duplicatesRemoved, displayValue: cleaning.duplicatesRemoved.toLocaleString(), status: cleaning.duplicatesRemoved > 0 ? 'watch' : 'good', priority: 'Low', confidence: 'High', dataSource: 'Exact author+text match', note: 'Flagged, not silently removed from analysis.' },
    { key: 'avgRating', label: 'Average Rating', value: Math.round(avgRating * 10) / 10, displayValue: `${Math.round(avgRating * 10) / 10} / 5`, status: avgRating >= 4 ? 'good' : avgRating >= 3 ? 'watch' : 'critical', priority: 'Low', confidence: 'High', dataSource: 'Google Maps star ratings' },
    { key: 'medianRating', label: 'Median Rating', value: medianRating, displayValue: `${medianRating} / 5`, status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Google Maps star ratings' },
    { key: 'positiveShare', label: 'Positive Review Share', value: Math.round(posShare * 1000) / 10, displayValue: `${Math.round(posShare * 1000) / 10}%`, unit: '%', status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Review NLP sentiment classifier' },
    { key: 'neutralShare', label: 'Neutral Review Share', value: Math.round(neuShare * 1000) / 10, displayValue: `${Math.round(neuShare * 1000) / 10}%`, unit: '%', status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Review NLP sentiment classifier' },
    { key: 'negativeShare', label: 'Negative Review Share', value: Math.round(negShare * 1000) / 10, displayValue: `${Math.round(negShare * 1000) / 10}%`, unit: '%', status: negShare > 0.3 ? 'critical' : negShare > 0.15 ? 'watch' : 'good', priority: negShare > 0.3 ? 'High' : 'Medium', confidence: 'High', dataSource: 'Review NLP sentiment classifier' },
    { key: 'actionableReviews', label: 'Reviews with Actionable Issues', value: actionableReviews, displayValue: actionableReviews.toLocaleString(), status: 'good', priority: 'Low', confidence: 'Medium', dataSource: 'Non-"general landscape" issue category' },
    { key: 'praiseReviews', label: 'Reviews with Praise', value: praiseReviews, displayValue: praiseReviews.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Review NLP sentiment classifier' },
    ...mentionMetrics,
    { key: 'mentionChildren', label: 'Reviews Mentioning Children', value: mentionChildren, displayValue: mentionChildren.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Keyword match' },
    { key: 'mentionFamilies', label: 'Reviews Mentioning Families', value: mentionFamilies, displayValue: mentionFamilies.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Keyword match' },
    { key: 'mentionOlderAdults', label: 'Reviews Mentioning Older Adults', value: mentionOlderAdults, displayValue: mentionOlderAdults.toLocaleString(), status: 'good', priority: 'Low', confidence: 'High', dataSource: 'Keyword match' },
    { key: 'mentionPOD', label: 'Reviews Mentioning People of Determination', value: mentionPOD, displayValue: mentionPOD.toLocaleString(), status: 'good', priority: 'Low', confidence: mentionPOD < 5 ? 'Low' : 'Medium', dataSource: 'Keyword match', note: mentionPOD < 5 ? 'Small sample -- directional only.' : undefined },
    { key: 'issueDiversityScore', label: 'Issue Diversity Score', value: issueDiversityScore, displayValue: `${issueDiversityScore}/100`, status: 'good', priority: 'Low', confidence: 'Medium', dataSource: 'Composite (distinct issue categories present / 20 total categories)' },
    { key: 'topicConfidence', label: 'Topic Confidence', value: topicConfidencePct, displayValue: `${topicConfidencePct}%`, status: topicConfidencePct >= 60 ? 'good' : 'watch', priority: 'Low', confidence: 'High', dataSource: 'Average keyword-match confidence across all reviews' },
    { key: 'overallSentimentScore', label: 'Overall Sentiment Score', value: overallSentimentScore, displayValue: `${overallSentimentScore}/100`, status: overallSentimentScore >= 65 ? 'good' : overallSentimentScore >= 45 ? 'watch' : 'critical', priority: overallSentimentScore >= 65 ? 'Low' : 'High', confidence: 'High', dataSource: 'Composite ((positive - negative share + 1) / 2)' },
    { key: 'actionabilityScore', label: 'Actionability Score', value: actionabilityScore, displayValue: `${actionabilityScore}/100`, status: 'good', priority: 'Low', confidence: 'Medium', dataSource: 'Share of reviews classified into a specific issue category' }
  ];

  return { metrics, overallSentimentScore, actionabilityScore, issueDiversityScore };
}

// ---------------------------------------------------------------------------
// Topic analysis (single-label distribution + multi-label mentions + trend + co-occurrence)
// ---------------------------------------------------------------------------

export interface TopicAnalysisRow {
  category: string;
  reviewCount: number;
  multiLabelMentions: number;
  positiveSharePct: number;
  negativeSharePct: number;
  avgRating: number;
  trend: 'up' | 'down' | 'flat';
  trendPct: number;
  hasDateTrend: boolean;
}

export function computeTopicAnalysis(reviews: NLPAnalyzedReview[]): { rows: TopicAnalysisRow[]; distribution: TopicStat[]; cooccurrence: CooccurrenceGraph } {
  const distribution = computeTopicDistribution(reviews);
  const cooccurrence = computeTopicCooccurrence(reviews);

  const categories = new Set<string>();
  reviews.forEach(r => matchAllCategories(r.reviewText).forEach(c => categories.add(c)));

  const rows: TopicAnalysisRow[] = [...categories].map(category => {
    const multiLabelReviews = reviews.filter(r => matchAllCategories(r.reviewText).includes(category));
    const singleLabelStat = distribution.find(d => d.category === category);

    const dated = multiLabelReviews.filter(r => r.publishedAtDate);
    const monthly = bucketByPeriod(dated, r => r.publishedAtDate, 'month');
    const hasDateTrend = monthly.length >= 2;
    const { trend, trendPct } = hasDateTrend ? computeTrend(monthly.map(m => m.items.length)) : { trend: 'flat' as const, trendPct: 0 };

    return {
      category,
      reviewCount: singleLabelStat?.reviewCount || 0,
      multiLabelMentions: multiLabelReviews.length,
      positiveSharePct: Math.round(sentimentShare(multiLabelReviews, 'POSITIVE') * 100),
      negativeSharePct: Math.round(sentimentShare(multiLabelReviews, 'NEGATIVE') * 100),
      avgRating: multiLabelReviews.length > 0 ? Math.round(average(multiLabelReviews.map(r => r.rating)) * 10) / 10 : 0,
      trend,
      trendPct,
      hasDateTrend
    };
  }).sort((a, b) => b.multiLabelMentions - a.multiLabelMentions);

  return { rows, distribution, cooccurrence };
}

// ---------------------------------------------------------------------------
// Complaint intelligence
// ---------------------------------------------------------------------------

export type ComplaintSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ComplaintCluster {
  category: string;
  severity: ComplaintSeverity;
  mentions: number;
  negativeSharePct: number;
  avgRating: number;
  affectedPersonas: string[];
  suggestedIntervention: string;
  confidence: number;
  recentTrend: 'up' | 'down' | 'flat';
}

function severityFromPriorityIndex(idx: number): ComplaintSeverity {
  if (idx >= 75) return 'Critical';
  if (idx >= 50) return 'High';
  if (idx >= 25) return 'Medium';
  return 'Low';
}

/**
 * "general landscape" is the classifier's fallback bucket for reviews that don't match any of the
 * 20 specific keyword categories -- it means "no specific issue was detected," not a real
 * identified complaint topic. Including it here would let generic unclassified praise/complaints
 * outrank genuine, specific, actionable issues purely on volume (verified: it's usually the
 * single largest category by review count, since it catches everything else).
 */
const UNCLASSIFIED_CATEGORY = 'general landscape';

export function computeComplaintIntelligence(reviews: NLPAnalyzedReview[], personas: PersonaStat[]): ComplaintCluster[] {
  const issueRows = sortIssueImpact(computeIssueImpact(reviews), 'priority');

  return issueRows.filter(r => r.negativeSentimentShare > 0 && r.category !== UNCLASSIFIED_CATEGORY).map(row => {
    const catReviews = reviews.filter(r => r.issueCategory === row.category);
    const rep = catReviews.find(r => r.sentiment === 'NEGATIVE') || catReviews[0];

    const dated = catReviews.filter(r => r.publishedAtDate);
    const monthly = bucketByPeriod(dated, r => r.publishedAtDate, 'month');
    const { trend } = monthly.length >= 2 ? computeTrend(monthly.map(m => m.items.length)) : { trend: 'flat' as const };

    const affectedPersonas = personas.filter(p => p.topComplaints.some(c => c.category === row.category)).map(p => p.label);

    return {
      category: row.category,
      severity: severityFromPriorityIndex(row.priorityIndex),
      mentions: row.mentions,
      negativeSharePct: Math.round(row.negativeSentimentShare * 100),
      avgRating: row.avgRating,
      affectedPersonas,
      suggestedIntervention: rep?.designRequirement || '',
      confidence: Math.min(95, 40 + row.mentions * 2),
      recentTrend: trend
    };
  }).sort((a, b) => {
    const order: Record<ComplaintSeverity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    return order[b.severity] - order[a.severity] || b.mentions - a.mentions;
  });
}

// ---------------------------------------------------------------------------
// Positive experience intelligence
// ---------------------------------------------------------------------------

export interface PositiveFeature {
  category: string;
  mentions: number;
  positiveSharePct: number;
  avgRating: number;
  quote: string;
  quoteAuthor: string;
}

export function computePositiveFeatures(reviews: NLPAnalyzedReview[]): PositiveFeature[] {
  const distribution = computeTopicDistribution(reviews);
  return distribution
    .filter(d => d.sentiment.positive > 0 && d.category !== UNCLASSIFIED_CATEGORY)
    .map(d => ({
      category: d.category,
      mentions: d.reviewCount,
      positiveSharePct: Math.round(d.sentiment.positive * 100),
      avgRating: 0,
      quote: d.representativeQuote,
      quoteAuthor: d.representativeAuthor
    }))
    .sort((a, b) => (b.positiveSharePct * b.mentions) - (a.positiveSharePct * a.mentions));
}

// ---------------------------------------------------------------------------
// User-group analysis (wraps personas.ts, adds visit-time + facility-demand evidence)
// ---------------------------------------------------------------------------

const VISIT_TIME_KEYWORDS: Record<string, string[]> = {
  Morning: ['morning', 'sunrise', 'early'],
  Evening: ['evening', 'sunset', 'dusk'],
  Night: ['night'],
  Weekend: ['weekend', 'saturday', 'sunday']
};

export interface UserGroupInsight extends PersonaStat {
  likelyVisitTime: string;
  visitTimeConfidence: NlpMetricConfidence;
}

const MIN_VISIT_TIME_MENTIONS = 3;

export function computeUserGroupInsights(reviews: NLPAnalyzedReview[]): UserGroupInsight[] {
  const personas = computePersonaAnalytics(reviews);

  return personas.map(p => {
    const personaKeywords = PERSONA_KEYWORDS[p.id]?.keywords || [];
    const personaReviews = reviews.filter(r => textMatchesAny(r.reviewText, personaKeywords));

    const timeCounts = Object.entries(VISIT_TIME_KEYWORDS).map(([label, keywords]) => ({
      label,
      count: personaReviews.filter(r => textMatchesAny(r.reviewText, keywords)).length
    })).sort((a, b) => b.count - a.count);

    const top = timeCounts[0];
    const likelyVisitTime = top && top.count >= MIN_VISIT_TIME_MENTIONS ? top.label : 'Not enough time-of-day evidence';
    const visitTimeConfidence: NlpMetricConfidence = top && top.count >= MIN_VISIT_TIME_MENTIONS ? (top.count >= 8 ? 'Medium' : 'Low') : 'N/A';

    return { ...p, likelyVisitTime, visitTimeConfidence };
  });
}

// ---------------------------------------------------------------------------
// Temporal analysis
// ---------------------------------------------------------------------------

export interface TemporalAnalysisResult {
  seasonal: SeasonalBucket[];
  ramadan: SeasonalBucket[];
  dayType: SeasonalBucket[];
  postingTime: SeasonalBucket[];
  activityPatterns: ActivityPatternBucket[];
  monthlyVolumeTrend: { period: string; count: number }[];
  monthlySentimentTrend: { period: string; sentimentScore: number }[];
  volumeTrend: 'up' | 'down' | 'flat';
  volumeTrendPct: number;
  datedReviewShare: number;
}

export function computeTemporalAnalysis(reviews: NLPAnalyzedReview[]): TemporalAnalysisResult {
  const dated = reviews.filter(r => r.publishedAtDate && !isNaN(Date.parse(r.publishedAtDate)));
  const monthly = bucketByPeriod(dated, r => r.publishedAtDate, 'month');

  const monthlyVolumeTrend = monthly.map(m => ({ period: m.period, count: m.items.length }));
  const monthlySentimentTrend = monthly.map(m => ({ period: m.period, sentimentScore: Math.round(((sentimentScore(m.items) + 1) / 2) * 100) }));
  const { trend: volumeTrend, trendPct: volumeTrendPct } = monthly.length >= 2 ? computeTrend(monthly.map(m => m.items.length)) : { trend: 'flat' as const, trendPct: 0 };

  return {
    seasonal: computeSeasonalBreakdown(reviews, 'summerWinter'),
    ramadan: computeSeasonalBreakdown(reviews, 'ramadan'),
    dayType: computeSeasonalBreakdown(reviews, 'dayType'),
    postingTime: computeSeasonalBreakdown(reviews, 'postingTime'),
    activityPatterns: computeActivityPatterns(reviews),
    monthlyVolumeTrend,
    monthlySentimentTrend,
    volumeTrend,
    volumeTrendPct,
    datedReviewShare: reviews.length > 0 ? Math.round((dated.length / reviews.length) * 1000) / 10 : 0
  };
}

// ---------------------------------------------------------------------------
// Spatial + H3 review intelligence (park-level signal, population-weighted H3 redistribution)
// ---------------------------------------------------------------------------
// Reviews carry NO per-review location -- confirmed authoritatively: every one of the raw
// dataset's 1000 records shares the exact same single lat/lng (the Google Maps place location).
// There is no facility reference, zone label, or reviewer-supplied coordinate anywhere in the
// source data. Any H3-level "review intelligence" below is therefore a REDISTRIBUTION of the one
// real park-level rate across hexes, weighted by each hex's real population share -- never a
// literal per-cell review count. This mirrors the same disclosed-proxy pattern already used for
// Environmental Analysis's heat/canopy composites and Community Analysis's demand scores.

export interface HexReviewSignal {
  h3Id: string;
  reviewOpportunityScore: number;
}

export function computeHexReviewOpportunity(hexes: H3Feature[], topComplaintCategory: string | null, reviews: NLPAnalyzedReview[]): HexReviewSignal[] {
  if (!topComplaintCategory) return hexes.map(h => ({ h3Id: h.properties.h3_id, reviewOpportunityScore: 0 }));
  const catReviews = reviews.filter(r => r.issueCategory === topComplaintCategory);
  const parkLevelRate = reviews.length > 0 ? catReviews.length / reviews.length : 0;

  const totalPopulation = hexes.reduce((s, h) => s + (h.properties.population || 0), 0) || 1;
  return hexes.map(h => {
    const popShare = (h.properties.population || 0) / totalPopulation;
    const score = Math.round(normalize(popShare * parkLevelRate * 100 * hexes.length, 100));
    return { h3Id: h.properties.h3_id, reviewOpportunityScore: score };
  });
}

export const SPATIAL_REVIEW_METHODOLOGY = 'Reviews are only geocoded to the single park-level coordinate -- confirmed: every raw review record shares the identical lat/lng. No per-review, per-facility, or per-zone location exists in this dataset. The "review opportunity" values shown on the H3 grid are a population-weighted REDISTRIBUTION of the one real park-level complaint rate across hexes (each hex\'s share is proportional to its real population share) -- not measured per-cell review activity. Spatial confidence for every review-derived figure in this module is "Park-Level", never "Exact" or "Facility-Level".';

// ---------------------------------------------------------------------------
// Design requirement matrix (cross-analysis fusion with other modules)
// ---------------------------------------------------------------------------

export type RequirementCategory = 'Must Have' | 'High Priority' | 'Medium Priority' | 'Optional' | 'Retain Existing Strength';

export interface DesignRequirement {
  id: string;
  requirement: string;
  topic: string;
  primaryUsers: string[];
  evidenceCount: number;
  evidenceExcerpts: string[];
  severity: ComplaintSeverity;
  priority: RequirementCategory;
  crossAnalysisEvidence: string[];
  confidence: number;
}

export interface CrossAnalysisContext {
  avgHeatExposureProxy: number | null;
  avgGreenCoveragePct: number | null;
  avgWalkingTimeToParkMinutes: number | null;
  avgFacilityAccessScore: number | null;
}

/** Computes cheap cross-module aggregates directly from the H3 grid (no need to import the full Population/Urban/Accessibility/Environmental/Community report bundles) -- real per-hex fields already carry these signals. */
export function computeCrossAnalysisContext(hexes: H3Feature[], roadStats: RoadStats | null): CrossAnalysisContext {
  if (hexes.length === 0) return { avgHeatExposureProxy: null, avgGreenCoveragePct: null, avgWalkingTimeToParkMinutes: null, avgFacilityAccessScore: null };
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);
  const avgHeatExposureProxy = Math.round(average(hexes.map(h => hexHeatExposureProxy(h, avgRoadWidthM))));
  const avgGreenCoveragePct = Math.round(average(hexes.map(h => h.properties.green_coverage_pct || 0)) * 10) / 10;
  const walkTimes = hexes.map(h => h.properties.walking_time_to_park_minutes).filter((v): v is number => v !== null && v !== undefined);
  const avgWalkingTimeToParkMinutes = walkTimes.length > 0 ? Math.round(average(walkTimes) * 10) / 10 : null;
  const avgFacilityAccessScore = Math.round(average(hexes.map(h => normalize(h.properties.amenity_total || 0, 20))));
  return { avgHeatExposureProxy, avgGreenCoveragePct, avgWalkingTimeToParkMinutes, avgFacilityAccessScore };
}

function requirementCategoryFor(severity: ComplaintSeverity, gisReinforced: boolean): RequirementCategory {
  if (severity === 'Critical') return 'Must Have';
  if (severity === 'High') return gisReinforced ? 'Must Have' : 'High Priority';
  if (severity === 'Medium') return 'Medium Priority';
  return 'Optional';
}

export function computeDesignRequirementMatrix(complaints: ComplaintCluster[], context: CrossAnalysisContext): DesignRequirement[] {
  return complaints.slice(0, 12).map((c, i) => {
    const crossAnalysisEvidence: string[] = [];
    let gisReinforced = false;

    if (c.category === 'shade / heat comfort') {
      if (context.avgHeatExposureProxy !== null) crossAnalysisEvidence.push(`Environmental Analysis: Heat Exposure Proxy averages ${context.avgHeatExposureProxy}/100 across the study area`);
      if (context.avgGreenCoveragePct !== null) crossAnalysisEvidence.push(`Environmental Analysis: Green Coverage averages only ${context.avgGreenCoveragePct}%`);
      if ((context.avgHeatExposureProxy ?? 0) >= 55 || (context.avgGreenCoveragePct ?? 100) < 10) gisReinforced = true;
    }
    if (c.category === 'playground') {
      if (context.avgFacilityAccessScore !== null) crossAnalysisEvidence.push(`Community Analysis: Facility-Access Score averages ${context.avgFacilityAccessScore}/100`);
      if ((context.avgFacilityAccessScore ?? 100) < 50) gisReinforced = true;
    }
    if (c.category === 'accessibility' || c.category === 'parking') {
      if (context.avgWalkingTimeToParkMinutes !== null) crossAnalysisEvidence.push(`Accessibility Analysis: average network walking time to park is ${context.avgWalkingTimeToParkMinutes} min`);
      if ((context.avgWalkingTimeToParkMinutes ?? 0) > 20) gisReinforced = true;
    }
    if (crossAnalysisEvidence.length === 0) crossAnalysisEvidence.push('No directly linked cross-module GIS signal for this topic in this run.');

    return {
      id: `REQ-${String(i + 1).padStart(3, '0')}`,
      requirement: `Address ${c.category}`,
      topic: c.category,
      primaryUsers: c.affectedPersonas.length > 0 ? c.affectedPersonas : ['General visitors'],
      evidenceCount: c.mentions,
      evidenceExcerpts: [`${c.mentions} reviews, ${c.negativeSharePct}% negative sentiment`, `Average rating in this topic: ${c.avgRating}/5`],
      severity: c.severity,
      priority: requirementCategoryFor(c.severity, gisReinforced),
      crossAnalysisEvidence,
      confidence: c.confidence
    };
  });
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export type NlpStatusBadge = 'VERY NEGATIVE' | 'NEGATIVE' | 'MIXED' | 'POSITIVE' | 'VERY POSITIVE';

function nlpStatusBadge(score: number): NlpStatusBadge {
  if (score >= 80) return 'VERY POSITIVE';
  if (score >= 60) return 'POSITIVE';
  if (score >= 40) return 'MIXED';
  if (score >= 20) return 'NEGATIVE';
  return 'VERY NEGATIVE';
}

export interface NlpExecutiveSummary {
  reviewsAnalyzed: number;
  averageRating: number;
  overallSentiment: NlpStatusBadge;
  topPositiveTopic: string;
  topNegativeTopic: string;
  mostRequestedImprovement: string;
  mostMentionedUserGroup: string;
  criticalIssueCluster: string;
  overallCommunitySatisfactionScore: number;
}

export function computeNlpExecutiveSummary(
  reviews: NLPAnalyzedReview[],
  topicAnalysis: TopicAnalysisRow[],
  complaints: ComplaintCluster[],
  positiveFeatures: PositiveFeature[],
  personas: PersonaStat[],
  overallSentimentScore: number
): NlpExecutiveSummary {
  const avgRating = reviews.length > 0 ? Math.round(average(reviews.map(r => r.rating)) * 10) / 10 : 0;
  const topPositive = positiveFeatures[0];
  const topComplaint = complaints[0];
  const topPersona = personas[0];
  const criticalCluster = complaints.find(c => c.severity === 'Critical') || complaints[0];

  return {
    reviewsAnalyzed: reviews.length,
    averageRating: avgRating,
    overallSentiment: nlpStatusBadge(overallSentimentScore),
    topPositiveTopic: topPositive?.category || 'Insufficient data',
    topNegativeTopic: topComplaint?.category || 'Insufficient data',
    mostRequestedImprovement: topComplaint?.suggestedIntervention || 'Insufficient data',
    mostMentionedUserGroup: topPersona?.label || 'Insufficient data',
    criticalIssueCluster: criticalCluster ? criticalCluster.category : 'None identified',
    overallCommunitySatisfactionScore: overallSentimentScore
  };
}

// ---------------------------------------------------------------------------
// Top-level report bundle
// ---------------------------------------------------------------------------

export interface NlpSpatialAnalysisReportData {
  executiveSummary: NlpExecutiveSummary;
  cleaning: ReviewCleaningSummary;
  kpis: { metrics: NlpMetric[]; overallSentimentScore: number; actionabilityScore: number; issueDiversityScore: number };
  topicAnalysis: { rows: TopicAnalysisRow[]; distribution: TopicStat[]; cooccurrence: CooccurrenceGraph };
  complaints: ComplaintCluster[];
  positiveFeatures: PositiveFeature[];
  userGroups: UserGroupInsight[];
  temporal: TemporalAnalysisResult;
  ratingSentimentMismatches: RatingSentimentMismatch[];
  hexReviewSignal: HexReviewSignal[];
  requirements: DesignRequirement[];
  crossAnalysisContext: CrossAnalysisContext;
  parkCenter: { lat: number; lng: number };
}

export function computeNlpSpatialAnalysisReport(
  reviews: NLPAnalyzedReview[],
  hexes: H3Feature[],
  parkCenter: { lat: number; lng: number },
  roadStats: RoadStats | null
): NlpSpatialAnalysisReportData {
  const cleaning = computeReviewCleaningSummary(reviews);
  const kpis = computeNlpKPIs(reviews, cleaning);
  const topicAnalysis = computeTopicAnalysis(reviews);
  const personas = computePersonaAnalytics(reviews);
  const complaints = computeComplaintIntelligence(reviews, personas);
  const positiveFeatures = computePositiveFeatures(reviews);
  const userGroups = computeUserGroupInsights(reviews);
  const temporal = computeTemporalAnalysis(reviews);
  const ratingSentimentMismatches = computeRatingSentimentMismatches(reviews);
  const hexReviewSignal = computeHexReviewOpportunity(hexes, complaints[0]?.category || null, reviews);
  const crossAnalysisContext = computeCrossAnalysisContext(hexes, roadStats);
  const requirements = computeDesignRequirementMatrix(complaints, crossAnalysisContext);
  const executiveSummary = computeNlpExecutiveSummary(reviews, topicAnalysis.rows, complaints, positiveFeatures, personas, kpis.overallSentimentScore);

  return {
    executiveSummary,
    cleaning,
    kpis,
    topicAnalysis,
    complaints,
    positiveFeatures,
    userGroups,
    temporal,
    ratingSentimentMismatches,
    hexReviewSignal,
    requirements,
    crossAnalysisContext,
    parkCenter
  };
}

// ---------------------------------------------------------------------------
// Legacy simple result (kept for any external callers expecting the old shape)
// ---------------------------------------------------------------------------

export interface NlpSpatialAnalysisResult {
  parkCenter: { lat: number; lng: number };
  overallSentimentScore: number;
  topComplaintCategories: { category: string; mentions: number; priority: IssueImpactRow['priority'] }[];
  shadeIssueMentions: number;
  playgroundDemandMentions: number;
  maintenanceIssueMentions: number;
  note: string;
}

export function computeNlpSpatialAnalysis(reviews: NLPAnalyzedReview[], parkCenter: { lat: number; lng: number }): NlpSpatialAnalysisResult {
  const issueRows = sortIssueImpact(computeIssueImpact(reviews), 'priority');
  const findMentions = (category: string) => issueRows.find(r => r.category === category)?.mentions || 0;
  const posCount = reviews.filter(r => r.sentiment === 'POSITIVE').length;
  const negCount = reviews.filter(r => r.sentiment === 'NEGATIVE').length;
  const overallSentimentScore = reviews.length === 0 ? 50 : Math.round(((posCount - negCount) / reviews.length + 1) * 50);

  return {
    parkCenter,
    overallSentimentScore,
    topComplaintCategories: issueRows.slice(0, 5).map(r => ({ category: r.category, mentions: r.mentions, priority: r.priority })),
    shadeIssueMentions: findMentions('shade / heat comfort'),
    playgroundDemandMentions: findMentions('playground'),
    maintenanceIssueMentions: findMentions('maintenance'),
    note: 'Reviews are only geocoded to the park centroid, not individual locations -- shown as a single marker with a real issue-category breakdown, not a spatial heatmap or cluster map.'
  };
}
