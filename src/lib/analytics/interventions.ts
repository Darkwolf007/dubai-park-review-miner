import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computeIssueImpact, type PriorityLevel } from './issueMatrix';

export type CostLevel = 'Low' | 'Medium' | 'High';

export function costToNumber(level: CostLevel): number {
  return level === 'Low' ? 20 : level === 'Medium' ? 55 : 85;
}

interface InterventionDefinition {
  id: string;
  label: string;
  category: string;
  cost: CostLevel;
  maintenance: CostLevel;
  difficulty: CostLevel;
}

// Curated domain reference data -- Cost/Maintenance/Difficulty aren't derivable
// from review text at all, so these are editorial tags (same footing as the
// hardcoded designRec text in nlpPlaceholders.ts), not computed values.
const INTERVENTIONS: InterventionDefinition[] = [
  { id: 'moreTrees', label: 'More Trees', category: 'landscape / greenery', cost: 'Low', maintenance: 'Medium', difficulty: 'Low' },
  { id: 'shadeStructures', label: 'Shade Structures', category: 'shade / heat comfort', cost: 'Medium', maintenance: 'Low', difficulty: 'Medium' },
  { id: 'interactivePlayground', label: 'Interactive Playground', category: 'playground', cost: 'High', maintenance: 'High', difficulty: 'Medium' },
  { id: 'cafe', label: 'Cafe', category: 'food / cafe', cost: 'High', maintenance: 'High', difficulty: 'High' },
  { id: 'outdoorGym', label: 'Outdoor Gym', category: 'sports facilities', cost: 'Medium', maintenance: 'Medium', difficulty: 'Low' },
  { id: 'dogPark', label: 'Dog Park', category: 'pets', cost: 'Medium', maintenance: 'Medium', difficulty: 'Medium' },
  { id: 'improvedLighting', label: 'Improved Lighting', category: 'lighting', cost: 'Low', maintenance: 'Low', difficulty: 'Low' },
  { id: 'moreSeating', label: 'More Seating', category: 'seating', cost: 'Low', maintenance: 'Low', difficulty: 'Low' },
  { id: 'accessibleWalkways', label: 'Accessible Walkways', category: 'accessibility', cost: 'Medium', maintenance: 'Low', difficulty: 'Medium' },
  { id: 'waterFeature', label: 'Water Feature', category: 'water features', cost: 'High', maintenance: 'High', difficulty: 'High' },
  { id: 'cleanRestrooms', label: 'Clean Restrooms', category: 'toilets', cost: 'Medium', maintenance: 'Medium', difficulty: 'Low' },
  { id: 'parkingExpansion', label: 'Parking Expansion', category: 'parking', cost: 'High', maintenance: 'Low', difficulty: 'High' }
];

const MIN_MENTIONS_FOR_CONFIDENCE = 3;

export interface OpportunityResult {
  id: string;
  label: string;
  category: string;
  score: number;
  expectedImpact: PriorityLevel;
  cost: CostLevel;
  maintenance: CostLevel;
  difficulty: CostLevel;
  supportingMentions: number;
  insufficientData: boolean;
}

/**
 * Score and Expected Impact are real, evidence-backed values pulled straight
 * from computeIssueImpact's priorityIndex/priority for the intervention's
 * mapped category -- not invented. Cost/Maintenance/Difficulty are the
 * curated editorial tags above. Interventions whose category barely appears
 * in the reviews get a low baseline score flagged insufficientData, same
 * pattern as Health Score's low-sample flag.
 */
export function computeOpportunityScore(reviews: NLPAnalyzedReview[]): OpportunityResult[] {
  const issueRows = computeIssueImpact(reviews);
  const rowByCategory = new Map(issueRows.map(r => [r.category, r]));

  return INTERVENTIONS.map(item => {
    const row = rowByCategory.get(item.category);
    const insufficientData = !row || row.mentions < MIN_MENTIONS_FOR_CONFIDENCE;
    return {
      id: item.id,
      label: item.label,
      category: item.category,
      score: insufficientData ? 20 : row!.priorityIndex,
      expectedImpact: insufficientData ? 'Low' : row!.priority,
      cost: item.cost,
      maintenance: item.maintenance,
      difficulty: item.difficulty,
      supportingMentions: row?.mentions ?? 0,
      insufficientData
    };
  }).sort((a, b) => b.score - a.score);
}
