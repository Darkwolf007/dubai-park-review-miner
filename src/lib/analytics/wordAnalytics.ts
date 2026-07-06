import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { bucketByPeriod, type PeriodGranularity } from './shared';

// Deliberately lighter than analyzeReviewLocally's stopword handling (which
// drops words <=3 chars) -- that would silently kill negations like "no" and
// "not", breaking meaningful bigrams like "no shade" or "not clean".
const LIGHT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'to', 'in', 'is', 'it', 'for', 'of', 'with', 'on', 'at',
  'this', 'that', 'are', 'but', 'as', 'was', 'were', 'be', 'been', 'i', 'we', 'you',
  'they', 'he', 'she', 'park', 'dubai'
]);

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()"']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !LIGHT_STOPWORDS.has(w));
}

export interface NGram {
  phrase: string;
  count: number;
}

/** Bigrams (n=2) or trigrams (n=3) by raw frequency, dropping one-off noise. */
export function computeNGrams(reviews: NLPAnalyzedReview[], n: 2 | 3, topN = 30): NGram[] {
  const freq = new Map<string, number>();
  reviews.forEach(r => {
    const words = tokenize(r.reviewText);
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      freq.set(phrase, (freq.get(phrase) || 0) + 1);
    }
  });
  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase, count]) => ({ phrase, count }));
}

export interface TfIdfTerm {
  term: string;
  score: number;
}

/**
 * Real TF-IDF: each review is a document, term frequency within the review
 * weighted by inverse document frequency across the corpus, so words that
 * are common everywhere (low signal) score lower than rare-but-salient ones.
 * Scoped to this module only -- does not replace the simple frequency-based
 * keyword extraction used elsewhere in the app.
 */
export function computeTfIdf(reviews: NLPAnalyzedReview[], topN = 40): TfIdfTerm[] {
  const docs = reviews.map(r => tokenize(r.reviewText)).filter(d => d.length > 0);
  const N = docs.length;
  if (N === 0) return [];

  const docFrequency = new Map<string, number>();
  docs.forEach(doc => {
    new Set(doc).forEach(term => docFrequency.set(term, (docFrequency.get(term) || 0) + 1));
  });

  // Mean tf-idf across the documents a term appears in -- summing raw tf-idf
  // across the whole corpus would let document COUNT dominate again (a term
  // in 300 documents accumulates a huge sum even with a tiny per-document
  // idf), defeating the point of idf discounting common words at all.
  const scoreSum = new Map<string, number>();
  docs.forEach(doc => {
    const termFreqInDoc = new Map<string, number>();
    doc.forEach(term => termFreqInDoc.set(term, (termFreqInDoc.get(term) || 0) + 1));
    termFreqInDoc.forEach((tf, term) => {
      const df = docFrequency.get(term) || 1;
      const idf = Math.log(N / df);
      scoreSum.set(term, (scoreSum.get(term) || 0) + (tf / doc.length) * idf);
    });
  });

  // A term appearing in exactly one document gets the maximum possible idf
  // regardless of whether it's meaningful -- a typo or a one-off emoji would
  // otherwise dominate the ranking. Require a small minimum document
  // frequency so only recurring terms compete for top salience.
  const MIN_DOCUMENT_FREQUENCY = 3;

  return [...scoreSum.entries()]
    .filter(([term]) => term.length > 2 && (docFrequency.get(term) || 0) >= MIN_DOCUMENT_FREQUENCY)
    .map(([term, sum]) => ({ term, score: sum / (docFrequency.get(term) || 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ term, score }) => ({ term, score: Math.round(score * 1000) / 1000 }));
}

export interface KeywordTrendPoint {
  period: string;
  count: number;
}

export function computeKeywordTrend(reviews: NLPAnalyzedReview[], keyword: string, granularity: PeriodGranularity): KeywordTrendPoint[] {
  const periods = bucketByPeriod(reviews, r => r.publishedAtDate, granularity);
  const lowerKeyword = keyword.toLowerCase();
  return periods.map(({ period, items }) => ({
    period,
    count: items.filter(r => r.reviewText.toLowerCase().includes(lowerKeyword)).length
  }));
}
