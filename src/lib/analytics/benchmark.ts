import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeHealthScore } from './healthScore';

export interface BenchmarkSubscoreRow {
  key: string;
  label: string;
  scoresByPark: Record<string, number>;
}

export interface BenchmarkResult {
  placeIds: string[];
  overallByPark: Record<string, number>;
  subscoreRows: BenchmarkSubscoreRow[];
}

/**
 * Deliberately not a new scoring formula -- reuses computeHealthScore per
 * park and pivots its 11 subscores into a park-comparison shape, so the
 * benchmark view and the Overview health score never drift apart.
 */
export function computeParkBenchmark(reviewsByPark: Record<string, NLPAnalyzedReview[]>): BenchmarkResult {
  const placeIds = Object.keys(reviewsByPark);
  const perPark = placeIds.map(placeId => ({ placeId, result: computeHealthScore(reviewsByPark[placeId] || []) }));

  const overallByPark: Record<string, number> = {};
  perPark.forEach(({ placeId, result }) => { overallByPark[placeId] = result.overall; });

  const subscoreKeys = perPark[0]?.result.subscores.map(s => ({ key: s.key, label: s.label })) || [];
  const subscoreRows: BenchmarkSubscoreRow[] = subscoreKeys.map(({ key, label }) => {
    const scoresByPark: Record<string, number> = {};
    perPark.forEach(({ placeId, result }) => {
      const match = result.subscores.find(s => s.key === key);
      scoresByPark[placeId] = match ? match.score : 0;
    });
    return { key, label, scoresByPark };
  });

  return { placeIds, overallByPark, subscoreRows };
}
