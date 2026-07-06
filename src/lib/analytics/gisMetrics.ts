import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { sentimentScore, sentimentShare } from './shared';

export type GisLayerId =
  | 'reviewDensity'
  | 'sentimentDensity'
  | 'heatComplaints'
  | 'playgroundIssues'
  | 'parkingIssues'
  | 'accessibilityIssues'
  | 'lightingIssues'
  | 'maintenanceIssues'
  | 'greeneryMentions';

export interface GisLayerDefinition {
  id: GisLayerId;
  label: string;
  description: string;
}

// No per-review geo exists in this dataset (only park-level lat/lng), so these
// layers are per-park aggregates rendered on the existing map markers -- not
// fabricated point-level heatmaps. "Tree Density" is relabeled to "Greenery
// Mentions" since actual tree counts aren't derivable from review text.
export const GIS_LAYERS: GisLayerDefinition[] = [
  { id: 'reviewDensity', label: 'Review Density', description: 'Total number of reviews collected per park.' },
  { id: 'sentimentDensity', label: 'Sentiment Density', description: 'Average sentiment score per park, from -100 (all negative) to 100 (all positive).' },
  { id: 'heatComplaints', label: 'Heat / Shade Complaints', description: 'Share of shade/heat-comfort reviews at this park that are negative.' },
  { id: 'playgroundIssues', label: 'Playground Issues', description: 'Share of playground-category reviews at this park that are negative.' },
  { id: 'parkingIssues', label: 'Parking Issues', description: 'Share of parking-category reviews at this park that are negative.' },
  { id: 'accessibilityIssues', label: 'Accessibility Issues', description: 'Share of accessibility-category reviews at this park that are negative.' },
  { id: 'lightingIssues', label: 'Lighting Issues', description: 'Share of lighting-category reviews at this park that are negative.' },
  { id: 'maintenanceIssues', label: 'Maintenance Issues', description: 'Share of maintenance-category reviews at this park that are negative.' },
  { id: 'greeneryMentions', label: 'Greenery Mentions', description: 'Share of all reviews at this park mentioning landscape/greenery (proxy for tree density).' }
];

export interface ParkGisValue {
  placeId: string;
  value: number;
  normalized: number;
}

function categoryNegativeShare(reviews: NLPAnalyzedReview[], category: string): number {
  const catReviews = reviews.filter(r => r.issueCategory === category);
  if (catReviews.length === 0) return 0;
  return sentimentShare(catReviews, 'NEGATIVE') * 100;
}

function metricForPark(layer: GisLayerId, reviews: NLPAnalyzedReview[]): number {
  switch (layer) {
    case 'reviewDensity': return reviews.length;
    case 'sentimentDensity': return sentimentScore(reviews) * 100;
    case 'heatComplaints': return categoryNegativeShare(reviews, 'shade / heat comfort');
    case 'playgroundIssues': return categoryNegativeShare(reviews, 'playground');
    case 'parkingIssues': return categoryNegativeShare(reviews, 'parking');
    case 'accessibilityIssues': return categoryNegativeShare(reviews, 'accessibility');
    case 'lightingIssues': return categoryNegativeShare(reviews, 'lighting');
    case 'maintenanceIssues': return categoryNegativeShare(reviews, 'maintenance');
    case 'greeneryMentions': {
      if (reviews.length === 0) return 0;
      const matches = reviews.filter(r => r.issueCategory === 'landscape / greenery');
      return (matches.length / reviews.length) * 100;
    }
    default: return 0;
  }
}

export function computePerParkLayerMetrics(
  reviewsByPark: Record<string, NLPAnalyzedReview[]>,
  layer: GisLayerId
): Record<string, ParkGisValue> {
  const raw: Record<string, number> = {};
  Object.entries(reviewsByPark).forEach(([placeId, reviews]) => {
    raw[placeId] = metricForPark(layer, reviews);
  });

  const values = Object.values(raw);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;

  const result: Record<string, ParkGisValue> = {};
  Object.entries(raw).forEach(([placeId, value]) => {
    result[placeId] = { placeId, value, normalized: (value - min) / range };
  });
  return result;
}
