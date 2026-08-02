import type { H3Feature, GeoJsonFeature, RoadStats, SpaceSyntaxStats, AccessibilityStats } from '../gis/types';
import type { NLPAnalyzedReview } from '../nlpPlaceholders';
import { computePopulationAnalysisReport } from '../gis/populationEngine';
import { computeUrbanAnalysisReport } from '../gis/urbanEngine';
import { computeAccessibilityAnalysisReport } from '../gis/accessibilityEngine';
import { computeEnvironmentalAnalysisReport } from '../gis/environmentalEngine';
import { computeCommunityAnalysisReport, type CommunityFacilityLayers } from '../gis/communityEngine';
import type { OpportunityResult } from '../gis/opportunityEngine';

export interface GisSummaryInput {
  hexes: H3Feature[];
  busStops: GeoJsonFeature[];
  roadStats: RoadStats | null;
  accessibilityStats: AccessibilityStats | null;
  reviews: NLPAnalyzedReview[];
  parkCenter: { lat: number; lng: number };
  facilities: CommunityFacilityLayers;
  /** Opportunity Lab's full computeAllOpportunities() output for the park's own 10m site grid --
   * the real, scored program catalog the Results matrix assigns tier_5 spaces from, rather than
   * inventing space names independently of what Opportunity Lab already shows the designer. */
  opportunities: OpportunityResult[];
}

export interface GisSummaryOpportunityAdjacency {
  preferred: string[];
  avoid: string[];
  service: string[];
  movement: string[];
}

export interface GisSummaryOpportunity {
  type: string;
  name: string;
  category: string;
  geometryType: string;
  scale: string;
  opportunityScore: number;
  demandScore: number;
  suitabilityScore: number;
  feasibilityScore: number;
  confidenceScore: number;
  grasshopperReadinessScore: number;
  priority: string;
  primaryUsers: string[];
  recommendedAreaM2: { minimum: number; target: number; maximum: number } | null;
  evidenceTop: string;
  /** Real preferred/avoid/service/movement adjacency from opportunityEngine.ts's OPPORTUNITY_DEFS --
   * the traversable edges the space-journey graph routes through. */
  adjacency: GisSummaryOpportunityAdjacency;
}

export interface GisSummaryAgeGroup {
  key: string;
  label: string;
  demandLevel: string;
  demandScore: number;
  evidence: string[];
  recommendedPrograms: string[];
}

export interface GisSummary {
  h3CatchmentAreaKm2: number;
  population: {
    populationServed: number;
    aggregateDensityKm2: number;
    primaryCommunity: string;
    highestDemandZone: string;
    overallDemandLevel: string;
    estimatedDailyUsers: number;
  };
  urban: {
    buildingCoveragePct: number;
    roadConnectivity: string;
    dominantLandUse: string;
    developmentPressure: string;
    streetDensityMPerKm2: number;
  };
  accessibility: {
    pop15MinWalkPct: number;
    transitAccessibilityLabel: string;
    mostUnderservedZone: string;
    overallAccessibilityScore: number;
  };
  environmental: {
    greenCoveragePct: number;
    imperviousSurfacePct: number;
    hotspotAreaPct: number;
    thermalComfortScore: number;
    biodiversityScore: number;
    peakHeatZone: string;
  };
  community: {
    dominantCommunityType: string;
    primaryUserGroups: string[];
    schoolsCount: number | null;
    mosquesCount: number | null;
    healthcareFacilitiesCount: number | null;
    overallCommunityScore: number;
    ageGroups: GisSummaryAgeGroup[];
  };
  /** Real Opportunity Lab program catalog for this site, sorted by opportunityScore -- the pool of
   * assignable tier_5 spaces. See GisSummaryInput.opportunities. */
  opportunities: GisSummaryOpportunity[];
}

/**
 * Condenses the existing GIS analysis engines (same computeXAnalysisReport
 * functions Playground's AnalysisEnginePanel already calls) into a compact
 * evidence bundle for the Results synthesis prompt -- GIS_SUMMARY_JSON. No
 * new spatial computation, just reuse + trim to the fields the 6-tier
 * matrix needs.
 */
export function buildGisSummary(input: GisSummaryInput): GisSummary {
  const { hexes, busStops, roadStats, accessibilityStats, reviews, parkCenter, facilities, opportunities } = input;

  const population = computePopulationAnalysisReport(hexes, busStops, reviews, parkCenter, roadStats);
  const urban = computeUrbanAnalysisReport(hexes, roadStats);
  const accessibility = computeAccessibilityAnalysisReport(hexes, busStops, parkCenter, roadStats, accessibilityStats, facilities.playgrounds, facilities.schools);
  const environmental = computeEnvironmentalAnalysisReport(hexes, reviews, roadStats, parkCenter);
  const community = computeCommunityAnalysisReport(hexes, reviews, facilities, busStops, parkCenter, roadStats);

  const h3CatchmentAreaKm2 = Math.round(hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0) * 100) / 100;

  return {
    h3CatchmentAreaKm2,
    population: {
      populationServed: population.executiveSummary.populationServed,
      aggregateDensityKm2: Math.round(population.kpis.aggregateDensityKm2),
      primaryCommunity: population.executiveSummary.primaryCommunity,
      highestDemandZone: population.executiveSummary.highestDemandZone,
      overallDemandLevel: population.executiveSummary.overallDemandLevel,
      estimatedDailyUsers: population.kpis.estimatedDailyUsers
    },
    urban: {
      buildingCoveragePct: Math.round(urban.executiveSummary.buildingCoveragePct * 10) / 10,
      roadConnectivity: urban.executiveSummary.roadConnectivity,
      dominantLandUse: urban.executiveSummary.dominantLandUse,
      developmentPressure: urban.executiveSummary.developmentPressure,
      streetDensityMPerKm2: Math.round(urban.kpis.streetDensityMPerKm2)
    },
    accessibility: {
      pop15MinWalkPct: Math.round(accessibility.executiveSummary.pop15MinWalk),
      transitAccessibilityLabel: accessibility.executiveSummary.transitAccessibilityLabel,
      mostUnderservedZone: accessibility.executiveSummary.mostUnderservedZone,
      overallAccessibilityScore: accessibility.executiveSummary.overallAccessibilityScore
    },
    environmental: {
      greenCoveragePct: Math.round(environmental.kpis.greenCoveragePct * 10) / 10,
      imperviousSurfacePct: Math.round(environmental.kpis.imperviousSurfacePct * 10) / 10,
      hotspotAreaPct: Math.round(environmental.kpis.hotspotAreaPct * 10) / 10,
      thermalComfortScore: environmental.kpis.thermalComfortScore,
      biodiversityScore: environmental.kpis.biodiversityScore,
      peakHeatZone: environmental.executiveSummary.peakHeatZone
    },
    community: {
      dominantCommunityType: community.executiveSummary.dominantCommunityType,
      primaryUserGroups: community.executiveSummary.primaryUserGroups,
      schoolsCount: community.executiveSummary.schoolsCount,
      mosquesCount: community.executiveSummary.mosquesCount,
      healthcareFacilitiesCount: community.executiveSummary.healthcareFacilitiesCount,
      overallCommunityScore: community.executiveSummary.overallCommunityScore,
      ageGroups: community.ageGroups.map(g => ({
        key: g.key,
        label: g.label,
        demandLevel: g.demandLevel,
        demandScore: g.demandScore,
        evidence: g.evidence,
        recommendedPrograms: g.recommendedPrograms
      })),
    },
    opportunities: opportunities.map(o => ({
      type: o.type,
      name: o.name,
      category: o.category,
      geometryType: o.geometryType,
      scale: o.scale,
      opportunityScore: o.opportunityScore,
      demandScore: o.demandScore,
      suitabilityScore: o.suitabilityScore,
      feasibilityScore: o.feasibilityScore,
      confidenceScore: o.confidenceScore,
      grasshopperReadinessScore: o.grasshopperReadinessScore,
      priority: o.priority,
      primaryUsers: o.primaryUsers,
      recommendedAreaM2: o.recommendedAreaM2,
      evidenceTop: o.evidence?.[0] || '',
      adjacency: {
        preferred: o.grasshopperInputs.adjacencyRules.preferred,
        avoid: o.grasshopperInputs.adjacencyRules.avoid,
        service: o.grasshopperInputs.adjacencyRules.service,
        movement: o.grasshopperInputs.adjacencyRules.movement
      }
    }))
  };
}
