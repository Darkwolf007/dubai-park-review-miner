/**
 * Al Safa 2 design-brief constraints (site cap, budget cap, accessibility and
 * microclimate rules, cost-rate guidance). Hardcoded rather than sourced from
 * a real RAG store -- this is a fixed static ruleset for a single competition
 * brief, not a retrieval problem.
 */

export type AestheticMateriality = 'EPDM_RUBBER' | 'HIGH_ALBEDO_PAVING' | 'NATURAL_GRAVEL' | 'TURF';

export interface AlSafa2CompetitionBrief {
  siteName: string;
  totalSiteAreaM2Cap: number;
  totalBudgetCapAed: number;
  crsProjection: string;
  accessibilityRules: string[];
  microclimateModulationRules: string[];
  dayNightActivationRule: string;
  costRateGuidanceAedPerM2: Record<AestheticMateriality, number>;
}

export const AL_SAFA_2_COMPETITION_BRIEF: AlSafa2CompetitionBrief = {
  siteName: 'Al Safa 2 Neighborhood Park',
  totalSiteAreaM2Cap: 15000,
  totalBudgetCapAed: 35000000,
  crsProjection: 'UTM Zone 40N / EPSG:32640',
  accessibilityRules: [
    'Spaces assigned to the Kids or Old age groups must have 100% barrier-free access.',
    'Spaces assigned to the Kids or Old age groups must be sited close to entry gateways and public restrooms.'
  ],
  microclimateModulationRules: [
    'Long-stay active zones (playgrounds, plazas) facing UTCI > 38C must prioritize ACTIVE shade (pergolas, retractable canopies, shade sails).',
    'Circulation paths (jogging track, walking loops) must prioritize PASSIVE shade (deciduous tree spines) so winter sun access is preserved.'
  ],
  dayNightActivationRule: 'Every assigned space must define a peak usage window: MORNING, MIDDAY, EVENING, or NIGHT.',
  costRateGuidanceAedPerM2: {
    EPDM_RUBBER: 950,
    HIGH_ALBEDO_PAVING: 650,
    NATURAL_GRAVEL: 280,
    TURF: 180
  }
};
