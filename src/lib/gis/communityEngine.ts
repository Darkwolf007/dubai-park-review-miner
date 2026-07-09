import type { H3Feature } from './types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computePersonaAnalytics } from '../analytics/personas';

export interface CommunityAnalysisResult {
  schoolCount: number;
  hospitalCount: number;
  mosqueCount: number;
  clinicCount: number;
  communityFacilityAccessScore: number;
  familyPriorityIndex: number;
  familyPriorityNote: string;
}

export interface PoiCounts {
  schoolCount: number;
  hospitalCount: number;
  mosqueCount: number;
  clinicCount: number;
}

/**
 * Facility counts come from the actual POI layer feature counts (schools.geojson
 * etc., 43/19/69/98 respectively), NOT from summing the H3 grid's per-hex
 * school_count/hospital_count/mosque_count/clinic_count fields -- verified
 * those fields are a per-hex local-proximity indicator (837 of 860 hexes read
 * exactly "1"), so summing them across the whole grid overcounts real distinct
 * facilities by 15-45x. amenity_total is still used for the relative
 * (0-100 normalized) access score, where being a proximity signal rather than
 * a literal count doesn't misrepresent it as a fact.
 * Family Priority Index reuses the EXISTING Phase 2 persona engine
 * (src/lib/analytics/personas.ts) -- share of park reviews carrying
 * family/children language, blended with facility access.
 */
export function computeCommunityAnalysis(hexes: H3Feature[], reviews: NLPAnalyzedReview[], poiCounts: PoiCounts): CommunityAnalysisResult {
  const avgAmenityTotal = hexes.length === 0 ? 0 : hexes.reduce((s, h) => s + (h.properties.amenity_total || 0), 0) / hexes.length;
  const communityFacilityAccessScore = Math.round(Math.max(0, Math.min(100, (avgAmenityTotal / 20) * 100)));

  const personas = computePersonaAnalytics(reviews);
  const familySignalReviews = (personas.find(p => p.id === 'parents')?.reviewCount || 0) + (personas.find(p => p.id === 'children')?.reviewCount || 0);
  const familySignalShare = reviews.length === 0 ? 0 : familySignalReviews / reviews.length;
  const familyPriorityIndex = Math.round(Math.max(0, Math.min(100, familySignalShare * 100 * 0.6 + communityFacilityAccessScore * 0.4)));

  return {
    ...poiCounts,
    communityFacilityAccessScore,
    familyPriorityIndex,
    familyPriorityNote: 'Composite: 60% share of park reviews carrying family/children language + 40% surrounding community-facility density.'
  };
}
