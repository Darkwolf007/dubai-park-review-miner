/**
 * Central, reusable methodology registry for every major metric shown across the app -- Opportunity
 * Lab, the suitability map, the program network graph, and the Population/Urban/Accessibility/
 * Environmental/Community/NLP Spatial report panels. Exists so the same metric is explained the same
 * way everywhere it appears, instead of scattered ad hoc strings per component.
 *
 * Content is not invented fresh -- it condenses the methodology text and formulas that already exist
 * as constants/doc comments in the engine files (populationEngine.ts, accessibilityEngine.ts,
 * environmentalEngine.ts, communityEngine.ts, reviewNlpSpatialEngine.ts, opportunityEngine.ts,
 * siteGrid.ts). Every entry is forced to declare `nature`, so a review-derived spatial score can
 * never be shown without also carrying its proxy/park-level caveat alongside it.
 */

export type SpatialScale = 'site grid' | 'H3 cell' | 'park-level' | '5km catchment';
export type MetricNature = 'measured' | 'derived' | 'proxy' | 'AI-generated' | 'designer assumption';

export interface MetricMethodology {
  key: string;
  label: string;
  shortTooltip: string;
  detailedMethodology: string;
  inputSources: string[];
  calculationSummary: string;
  confidenceCaveat: string;
  spatialScale: SpatialScale;
  nature: MetricNature;
}

export const METRIC_METHODOLOGY: Record<string, MetricMethodology> = {
  opportunityScore: {
    key: 'opportunityScore',
    label: 'Opportunity Score',
    shortTooltip: 'Combined demand + site suitability + feasibility for one program, 0-100.',
    detailedMethodology: 'opportunityScore = demandScore*0.4 + suitabilityScore*0.35 + feasibilityScore*0.25, computed per cell then population-weighted across eligible (non-avoided) cells only, so a hard constraint excluding a populated area never silently crushes the aggregate.',
    inputSources: ['Population Analysis', 'Accessibility Analysis', 'Environmental Analysis', 'Community Analysis', 'Google Reviews (NLP)'],
    calculationSummary: 'Weighted blend of demand, suitability, feasibility; demand and suitability are computed from disjoint input sets by design.',
    confidenceCaveat: 'A composite score, not a measurement -- see confidenceScore for how much real evidence backs it for this program.',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  demandScore: {
    key: 'demandScore',
    label: 'Demand Score',
    shortTooltip: 'How much a program is needed here, from population/persona/review signals only.',
    detailedMethodology: 'Built only from need-side signals (population density, family/youth/older-adult demand, facility deficits, park-level review-topic redistribution) -- deliberately excludes site-condition data (heat, road density, barriers) so demand and suitability never double-count the same input.',
    inputSources: ['Population Analysis', 'Community Analysis', 'Google Reviews (NLP)'],
    calculationSummary: 'Program-specific weighted blend of population/persona demand functions plus a review-topic redistribution term where a review category applies.',
    confidenceCaveat: 'Review-derived demand is a park-level rate redistributed by population share across cells, not measured per-cell activity.',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  suitabilityScore: {
    key: 'suitabilityScore',
    label: 'Suitability Score',
    shortTooltip: 'How fit a cell is for a program, from site-condition signals only.',
    detailedMethodology: 'Built only from site-condition signals (heat exposure, walkability, barrier severity, road density, biodiversity, boundary/edge position) -- excludes demand-side population/review data by design.',
    inputSources: ['Environmental Analysis', 'Accessibility Analysis', 'Urban Analysis'],
    calculationSummary: 'Program-specific weighted blend of hex-level site-condition functions.',
    confidenceCaveat: 'Several inputs (heat, biodiversity) are proxies, not sensor measurements -- see their own entries.',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  feasibilityScore: {
    key: 'feasibilityScore',
    label: 'Feasibility Score',
    shortTooltip: 'Whether a cell has enough usable land/access for this program\'s footprint.',
    detailedMethodology: 'Mostly driven by void ratio (unbuilt land share) or real road density, depending on geometry type; forced to 0 wherever the program\'s hard avoid-condition is triggered for that cell.',
    inputSources: ['Urban Analysis', 'GIS site grid (buildings, roads)'],
    calculationSummary: 'Normalized void-ratio or road-density reading against a program-specific footprint threshold.',
    confidenceCaveat: 'A land-availability proxy, not a construction feasibility study (utilities, grading, ownership are not modeled).',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  confidenceScore: {
    key: 'confidenceScore',
    label: 'Confidence Score',
    shortTooltip: 'How much real evidence backs this program\'s numbers -- not how desirable it is.',
    detailedMethodology: 'Base 45 + up to 55 from: site grid present (+15), road/network stats loaded (+10), review mentions of the program\'s topic (+2/mention, capped +20), share of eligible (non-avoided) cells (+10).',
    inputSources: ['GIS site grid', 'Road network stats', 'Google Reviews (NLP)'],
    calculationSummary: 'Additive evidence-availability score, independent of the opportunity score itself.',
    confidenceCaveat: 'A high opportunity score with low confidence means the recommendation rests on thin evidence, not that the program is unimportant.',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  populationDemand: {
    key: 'populationDemand',
    label: 'Population Demand',
    shortTooltip: 'Density + green-space deficit + building coverage, blended per cell.',
    detailedMethodology: 'densityScore*0.45 + greenDeficitScore*0.35 + buildingCoverageScore*0.2, each normalized against a planning-scale ceiling (20,000/km² density, 80% building coverage).',
    inputSources: ['Population Analysis (GIS population layer)'],
    calculationSummary: 'Weighted normalization of population density, green deficit, and building coverage.',
    confidenceCaveat: 'Population figures are dataset-level estimates, not a live census.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  familyDemand: {
    key: 'familyDemand',
    label: 'Family Demand',
    shortTooltip: 'School + playground counts + population density, blended per cell.',
    detailedMethodology: 'schoolScore*0.3 + playgroundScore*0.3 + populationScore*0.4, each normalized against a small local ceiling (2 facilities, 20,000/km²).',
    inputSources: ['Community Analysis (facility counts)', 'Population Analysis'],
    confidenceCaveat: 'A facility-presence proxy for family demand, not a survey of household composition.',
    calculationSummary: 'Weighted blend of nearby school/playground counts and population density.',
    spatialScale: 'H3 cell',
    nature: 'proxy'
  },
  youthDemand: {
    key: 'youthDemand',
    label: 'Youth Demand',
    shortTooltip: 'Sports + school facility counts, blended per cell.',
    detailedMethodology: 'sportsScore*0.55 + schoolScore*0.45, each normalized against a small local ceiling (2 facilities).',
    inputSources: ['Community Analysis (facility counts)'],
    calculationSummary: 'Weighted blend of nearby sports/school facility counts.',
    confidenceCaveat: 'A facility-presence proxy, not age-segmented population or activity data.',
    spatialScale: 'H3 cell',
    nature: 'proxy'
  },
  olderAdultDemand: {
    key: 'olderAdultDemand',
    label: 'Older Adult Demand',
    shortTooltip: 'Mosque + clinic counts + population density, blended per cell.',
    detailedMethodology: 'mosqueScore*0.3 + clinicScore*0.3 + populationScore*0.4, each normalized against a small local ceiling (2 facilities, 20,000/km²).',
    inputSources: ['Community Analysis (facility counts)', 'Population Analysis'],
    calculationSummary: 'Weighted blend of nearby mosque/clinic counts and population density.',
    confidenceCaveat: 'A facility-presence proxy for older-adult demand, not age-segmented population data.',
    spatialScale: 'H3 cell',
    nature: 'proxy'
  },
  accessibilityScore: {
    key: 'accessibilityScore',
    label: 'Accessibility / Park Access Score',
    shortTooltip: 'Inverted, decayed network walking time to the park, per cell.',
    detailedMethodology: 'Shortest-path network walking time (Dijkstra on the drivable circulation graph, park center snapped to its nearest graph node) converted to a 0-100 decayed score over a 30-minute ceiling; cells with no routing-graph node score 0 rather than being estimated.',
    inputSources: ['Accessibility Analysis (road/circulation network)'],
    calculationSummary: 'normalize(30 - min(30, walking_minutes), 30).',
    confidenceCaveat: 'Cells reached only by service/pedestrian ways outside the routing graph are excluded from every catchment band, not Euclidean-estimated.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  walkabilityScore: {
    key: 'walkabilityScore',
    label: 'Walkability Score',
    shortTooltip: 'Intersection density + road density + amenity density + transit proximity.',
    detailedMethodology: 'Composite of real intersection density, real road density, nearby amenity count, and distance to the nearest bus stop, each normalized and weighted.',
    inputSources: ['Accessibility Analysis', 'Urban Analysis (road network)', 'GIS amenity layer'],
    calculationSummary: 'Weighted normalization of four real, per-cell network/amenity signals.',
    confidenceCaveat: 'A network-structure proxy for walkability, not observed pedestrian counts.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  entranceOpportunity: {
    key: 'entranceOpportunity',
    label: 'Entrance Opportunity',
    shortTooltip: 'Boundary/edge position + street connectivity + low barrier severity + population demand.',
    detailedMethodology: 'Blends population demand and access deficit (demand side) with walkability, barrier severity, and real road density (suitability side); hard-avoided for cells that are not boundary/edge cells (boundary ratio >= 0.98).',
    inputSources: ['Population Analysis', 'Accessibility Analysis', 'GIS site grid (park polygon boundary)'],
    calculationSummary: 'Program-specific opportunity formula in opportunityEngine.ts (mainEntrancePlaza / secondaryEntrances).',
    confidenceCaveat: 'Boundary detection is geometric (site-grid cell vs. park polygon), not a survey of actual pedestrian desire lines.',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  heatExposureProxy: {
    key: 'heatExposureProxy',
    label: 'Heat Exposure Proxy',
    shortTooltip: 'Impervious surface share + green-coverage deficit, 70/30 weighted.',
    detailedMethodology: 'normalize(imperviousPct,100)*0.7 + normalize(100-greenCoveragePct,100)*0.3 -- 70/30 weighting toward impervious share reflects its dominance in the urban-heat-island literature this proxy is modeled after.',
    inputSources: ['Environmental Analysis (land cover, green coverage)'],
    calculationSummary: 'Weighted normalization of impervious surface and green-coverage deficit.',
    confidenceCaveat: 'A land-cover proxy, not a measured land-surface-temperature or sensor reading.',
    spatialScale: 'H3 cell',
    nature: 'proxy'
  },
  coolingOpportunity: {
    key: 'coolingOpportunity',
    label: 'Cooling Opportunity',
    shortTooltip: 'High where heat exposure is high AND there is available land to act on it.',
    detailedMethodology: 'normalize(heatExposureProxy,100)*0.6 + normalize(voidRatioPct,100)*0.4.',
    inputSources: ['Environmental Analysis'],
    calculationSummary: 'Weighted blend of the heat exposure proxy and available (unbuilt) land share.',
    confidenceCaveat: 'Inherits the heat exposure proxy\'s limitations -- not a measured thermal-comfort study.',
    spatialScale: 'H3 cell',
    nature: 'proxy'
  },
  treePlantingSuitability: {
    key: 'treePlantingSuitability',
    label: 'Tree Planting Suitability',
    shortTooltip: 'Heat exposure + green deficit + available land + pedestrian exposure + biodiversity opportunity.',
    detailedMethodology: 'Five-factor weighted composite (heat, green deficit, void ratio, pedestrian/road exposure, biodiversity headroom); every input is real or derived per-hex, with adjustable weights.',
    inputSources: ['Environmental Analysis', 'Urban Analysis (road width)'],
    calculationSummary: 'Weighted sum of five normalized site-condition factors.',
    confidenceCaveat: '"Biodiversity opportunity" means room to improve (low current proxy value), not a habitat survey.',
    spatialScale: 'site grid',
    nature: 'derived'
  },
  greenSpaceDeficit: {
    key: 'greenSpaceDeficit',
    label: 'Green-Space Deficit',
    shortTooltip: '100 minus green coverage percentage, normalized.',
    detailedMethodology: 'normalize(100 - greenCoveragePct, 100).',
    inputSources: ['Environmental Analysis (green coverage layer)'],
    calculationSummary: 'Direct inverse of measured green coverage percentage.',
    confidenceCaveat: 'Green coverage itself is a remote-sensing/land-cover derived figure, not a field survey.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  facilityAccess: {
    key: 'facilityAccess',
    label: 'Facility Access',
    shortTooltip: 'Total nearby amenity count, normalized against a local ceiling.',
    detailedMethodology: 'normalize(amenity_total, 20).',
    inputSources: ['GIS amenity layer'],
    calculationSummary: 'Direct normalization of a counted amenity total.',
    confidenceCaveat: 'Counts what exists in the sourced amenity dataset, which may undercount informal/unmapped facilities.',
    spatialScale: 'H3 cell',
    nature: 'measured'
  },
  communityOpportunity: {
    key: 'communityOpportunity',
    label: 'Community Opportunity',
    shortTooltip: 'High where community vulnerability is high AND there is available land to act on it.',
    detailedMethodology: 'normalize(communityVulnerabilityScore,100)*0.6 + normalize(voidRatioPct,100)*0.4; vulnerability itself blends population pressure, green deficit, access deficit, and facility deficit.',
    inputSources: ['Community Analysis', 'Population Analysis', 'Accessibility Analysis', 'Environmental Analysis'],
    calculationSummary: 'Weighted blend of a four-factor vulnerability composite and available land.',
    confidenceCaveat: 'A planning-priority composite, not a resident needs survey.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  reviewOpportunity: {
    key: 'reviewOpportunity',
    label: 'Review / NLP Opportunity',
    shortTooltip: 'A park-level review-topic rate redistributed across cells by population share.',
    detailedMethodology: 'parkLevelRate = mentions of topic / total reviews (one single park-wide number); each cell then gets normalize(populationShare * parkLevelRate * cellCount * 100, 100) -- population-weighted REDISTRIBUTION of one park-level rate, never independently measured per cell.',
    inputSources: ['Google Reviews (NLP topic classification)', 'Population Analysis (for redistribution weights)'],
    calculationSummary: 'Park-level mention rate redistributed proportionally to each cell\'s population share.',
    confidenceCaveat: 'Never presents review data as exact spatial measurement -- it is a proxy redistribution of one aggregate rate, and near-zero with few review mentions.',
    spatialScale: 'park-level',
    nature: 'proxy'
  },
  sentimentScore: {
    key: 'sentimentScore',
    label: 'Sentiment Score',
    shortTooltip: 'AI-classified positive/neutral/negative tone per review, aggregated.',
    detailedMethodology: 'Each review is classified by an LLM-based NLP pass into a sentiment label and issue category; scores shown are aggregates (e.g. negative-sentiment share) over the review set, not per-cell.',
    inputSources: ['Google Reviews (AI/NLP classification)'],
    calculationSummary: 'Share of reviews classified negative/neutral/positive within a topic or overall.',
    confidenceCaveat: 'AI-generated classification, not human-verified sentiment; accuracy depends on review text quality/length.',
    spatialScale: 'park-level',
    nature: 'AI-generated'
  },
  reviewTopicDemand: {
    key: 'reviewTopicDemand',
    label: 'Review Topic Demand',
    shortTooltip: 'Mention count and negative-sentiment share for one review topic, park-wide.',
    detailedMethodology: 'Counts reviews classified under a given issue category (e.g. "playground", "shade / heat comfort") and computes their negative-sentiment share -- a single park-level figure, fed into reviewOpportunity for spatial redistribution.',
    inputSources: ['Google Reviews (AI/NLP classification)'],
    calculationSummary: 'Mention count + negative-sentiment share per topic category.',
    confidenceCaveat: 'Topic categories do not map 1:1 onto every program type -- several programs use the closest available proxy category (disclosed per-program in Opportunity Lab).',
    spatialScale: 'park-level',
    nature: 'AI-generated'
  },
  urbanScore: {
    key: 'urbanScore',
    label: 'Urban Score',
    shortTooltip: 'Building density + building coverage, blended per cell.',
    detailedMethodology: 'normalize(buildingDensityPerKm2,3000)*0.5 + normalize(buildingCoveragePct,80)*0.5.',
    inputSources: ['Urban Analysis (GIS building footprints)'],
    calculationSummary: 'Weighted normalization of building count density and building footprint coverage.',
    confidenceCaveat: 'Reflects the sourced building-footprint dataset\'s completeness, not a field survey.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  roadDensity: {
    key: 'roadDensity',
    label: 'Road Density',
    shortTooltip: 'Real road length within a buffer of the cell, per km².',
    detailedMethodology: 'On the 10m site grid: real road length sample-clipped to a 20m buffer around each cell (excluding pedestrian-only ways: footway/path/pedestrian/steps/corridor/living_street/cycleway), divided by buffer area.',
    inputSources: ['GIS road network layer'],
    calculationSummary: 'Buffered, sample-clipped real road length divided by buffer area.',
    confidenceCaveat: 'Site-grid cells compute this independently per cell (real); coarser H3-only contexts inherit one parent-hex-wide average (a documented ~300m-resolution proxy).',
    spatialScale: 'site grid',
    nature: 'measured'
  },
  landUseDiversity: {
    key: 'landUseDiversity',
    label: 'Land-Use Diversity',
    shortTooltip: 'Share of tracked facility types present in a cell (school, mosque, clinic, shop, ...).',
    detailedMethodology: 'Count of distinct facility-type fields with a nonzero count, divided by the total tracked field count (9 categories).',
    inputSources: ['GIS amenity/facility layer'],
    calculationSummary: 'Presence-count ratio across 9 tracked facility categories.',
    confidenceCaveat: 'Measures mix of what is in the sourced dataset, not a full land-use zoning classification.',
    spatialScale: 'H3 cell',
    nature: 'derived'
  },
  spaceSyntaxIntegration: {
    key: 'spaceSyntaxIntegration',
    label: 'Space Syntax Integration',
    shortTooltip: 'How central a circulation node is within the whole network (topological closeness).',
    detailedMethodology: 'Standard space-syntax integration value computed over the road/path network graph; ranked and averaged across sampled nodes.',
    inputSources: ['Urban Analysis (road/circulation network graph)'],
    calculationSummary: 'Graph-theoretic integration value per network node, from the space-syntax analysis pipeline.',
    confidenceCaveat: 'Depends on the completeness of the sourced road/path network graph -- missing internal paths understate integration.',
    spatialScale: '5km catchment',
    nature: 'derived'
  },
  spaceSyntaxChoice: {
    key: 'spaceSyntaxChoice',
    label: 'Space Syntax Choice',
    shortTooltip: 'How often a circulation node lies on shortest paths between other nodes (through-movement potential).',
    detailedMethodology: 'Standard space-syntax choice (betweenness-style) value computed over the road/path network graph; ranked and averaged across sampled nodes.',
    inputSources: ['Urban Analysis (road/circulation network graph)'],
    calculationSummary: 'Graph-theoretic choice value per network node, from the space-syntax analysis pipeline.',
    confidenceCaveat: 'Sampled for performance on large graphs (betweennessSampleK) -- an estimate, not an exhaustive path enumeration.',
    spatialScale: '5km catchment',
    nature: 'derived'
  },
  grasshopperReadiness: {
    key: 'grasshopperReadiness',
    label: 'Grasshopper Readiness',
    shortTooltip: 'Data completeness (0-100) for exporting this program into the generative-design pipeline.',
    detailedMethodology: '25 points each for: attractors present, repellers present, adjacency rules present (preferred or avoid), recommended area present.',
    inputSources: ['Opportunity Lab program definitions'],
    calculationSummary: 'Additive 0/25/50/75/100 completeness score over four required Grasshopper input fields.',
    confidenceCaveat: 'A data-completeness signal, not a design-quality or feasibility judgment.',
    spatialScale: 'site grid',
    nature: 'derived'
  }
};

export function getMethodology(key: string): MetricMethodology | undefined {
  return METRIC_METHODOLOGY[key];
}
