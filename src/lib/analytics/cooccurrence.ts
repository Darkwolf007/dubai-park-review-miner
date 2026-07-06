import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { matchAllCategories } from '../nlpPlaceholders';

export interface CooccurrenceNode {
  id: string;
  count: number;
}

export interface CooccurrenceEdge {
  source: string;
  target: string;
  weight: number;
}

export interface CooccurrenceGraph {
  nodes: CooccurrenceNode[];
  edges: CooccurrenceEdge[];
}

const MAX_EDGES = 40;

/**
 * Unlike the primary classifier (one winning category per review), this
 * loosely matches every category a review touches, then counts how often
 * pairs of categories appear together in the same review -- e.g. Heat and
 * Shade and Trees tend to co-occur. Capped to the strongest ~40 edges so the
 * graph stays readable.
 */
export function computeTopicCooccurrence(reviews: NLPAnalyzedReview[]): CooccurrenceGraph {
  const nodeCounts = new Map<string, number>();
  const edgeCounts = new Map<string, number>();

  reviews.forEach(r => {
    const categories = Array.from(new Set(matchAllCategories(r.reviewText)));
    categories.forEach(c => nodeCounts.set(c, (nodeCounts.get(c) || 0) + 1));

    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const [a, b] = [categories[i], categories[j]].sort();
        const key = `${a}|${b}`;
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      }
    }
  });

  const nodes: CooccurrenceNode[] = [...nodeCounts.entries()].map(([id, count]) => ({ id, count }));

  const edges: CooccurrenceEdge[] = [...edgeCounts.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('|');
      return { source, target, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_EDGES);

  return { nodes, edges };
}
