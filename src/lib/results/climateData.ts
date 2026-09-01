/**
 * Al Safa 2 microclimate evidence, extracted from three infrared.city CFD/UTCI
 * slide decks (25.1559N, 55.2219E, 1579x1568m site, dated 2026-07-26):
 *   - heat-island-extreme-conditions-slides.pdf (peak 4-hr heat-wave window, June 6 15:00-19:00)
 *   - natural-ventilation-potential-slides.pdf (8-direction wind, July noon)
 *   - year-round-public-space-design-slides.pdf (4 representative seasonal days)
 *
 * All figures are CFD/UTCI *simulation* output, not field measurement -- the
 * source decks themselves disclose no validated EPW wind rose and static
 * meteorological assumptions. evidenceNature follows PROJECT_ARCHITECTURE.md
 * section 5.4 (Proxy/Derived, never claimed as "measured").
 */

export type ZonePriority = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'OPPORTUNITY';

export interface ClimateZoneRisk {
  zone: string;
  priority: ZonePriority;
  risk: string;
  intervention: string;
}

export interface SeasonalComfort {
  season: 'SUMMER' | 'WINTER' | 'SPRING' | 'AUTUMN';
  meanUtciC: number;
  comfortAreaPct: number;
}

export interface AlSafa2ClimateSummary {
  source: string;
  siteAreaKm2: number;
  evidenceNature: 'proxy';
  regionalEpw: {
    station: string;
    source: string;
    evidenceNature: 'weather-file';
    hours: number;
    hoursAtOrAbove35C: number;
    hoursAtOrAbove40C: number;
    eveningHoursAtOrAbove35C: number;
    hottestHour: { month: number; day: number; hour: number; dryBulbC: number; relativeHumidityPct: number; windDirectionDeg: number; windSpeedMs: number };
    windSectorHours: Record<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW', number>;
    dominantWindSectors: Array<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'>;
  };
  heatIslandExtreme: {
    window: string;
    meanUtciC: number;
    areaUtciOver38PctC: number;
    outdoorComfortAreaPct: number;
    meanSkyViewFactorPct: number;
    meanDirectSunHours: number;
    zoneRisks: ClimateZoneRisk[];
  };
  naturalVentilation: {
    window: string;
    calmAreaFractionPct: number;
    ventilationIndexPct: number;
    meanWindSpeedByDirectionMs: Record<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW', number>;
    highStagnationZone: string;
    zoneRisks: ClimateZoneRisk[];
  };
  yearRoundComfort: {
    seasons: SeasonalComfort[];
    note: string;
  };
}

export const AL_SAFA_2_CLIMATE_SUMMARY: AlSafa2ClimateSummary = {
  source: 'Dubai Intl Airport TMYx EPW + infrared.city Environmental Climate Analysis, 2026-07-26 (regional weather file and site CFD/UTCI simulation)',
  siteAreaKm2: 2.48,
  evidenceNature: 'proxy',
  regionalEpw: {
    station: 'Dubai.Intl.AP 411940',
    source: 'ARE_DU_Dubai.Intl.AP.411940_TMYx.epw (8,760-hour regional typical meteorological year)',
    evidenceNature: 'weather-file',
    hours: 8760,
    hoursAtOrAbove35C: 1673,
    hoursAtOrAbove40C: 285,
    eveningHoursAtOrAbove35C: 559,
    hottestHour: { month: 6, day: 9, hour: 12, dryBulbC: 46, relativeHumidityPct: 28, windDirectionDeg: 220, windSpeedMs: 2.5 },
    windSectorHours: { N: 673, NE: 600, E: 986, SE: 754, S: 1657, SW: 665, W: 1590, NW: 1509 },
    dominantWindSectors: ['S', 'W', 'NW']
  },
  heatIslandExtreme: {
    window: 'Peak 4-hour heat-wave window, June 6, 15:00-19:00',
    meanUtciC: 49.94,
    areaUtciOver38PctC: 100,
    outdoorComfortAreaPct: 0,
    meanSkyViewFactorPct: 79.65,
    meanDirectSunHours: 2.94,
    zoneRisks: [
      { zone: 'Central spine / wide street corridor', priority: 'CRITICAL', risk: 'UTCI 48-51C with >3hrs direct sun and SVF>0.8 -- unsafe pedestrian conditions.', intervention: 'Continuous shade canopy with tree pits and cool pavement.' },
      { zone: 'Southern frontage / arterial edge', priority: 'HIGH', risk: 'UTCI>38C with long sun exposure and high sky view factor.', intervention: 'Large-canopy trees, shade structures, protected crossings.' },
      { zone: 'Open intersections and plazas', priority: 'MODERATE', risk: 'Extreme heat stress with exposed sky conditions.', intervention: 'Shade sails/pergolas, seating refuges, high-albedo paving.' },
      { zone: 'Parking and service yards', priority: 'MODERATE', risk: 'Prolonged sun exposure on hardscape amplifying heat retention.', intervention: 'Temporary canopies, cool pavement coatings, perimeter trees.' }
    ]
  },
  naturalVentilation: {
    window: '8-direction wind simulation, July noon',
    calmAreaFractionPct: 62,
    ventilationIndexPct: 38,
    meanWindSpeedByDirectionMs: { N: 1.83, NE: 1.92, E: 1.82, SE: 1.88, S: 1.96, SW: 1.92, W: 1.77, NW: 1.75 },
    highStagnationZone: 'Central enclosed courtyards and interior blocks (high stagnation under N, NE, E, SE, S, NW winds).',
    zoneRisks: [
      { zone: 'Central enclosed courtyards and interior blocks', priority: 'CRITICAL', risk: '~62% calm-wind coverage limiting passive cooling and pollutant dispersion.', intervention: '8-12m mid-block passages and porous courtyard edges aligned to the dominant corridor.' },
      { zone: 'Southern/southwestern interior blocks', priority: 'HIGH', risk: 'Stagnation and weak cross-flow under NE, N, S winds.', intervention: 'Diagonal permeability and wind-access courts (+10-18pp cross-flow).' },
      { zone: 'Northern/northwestern interior blocks', priority: 'HIGH', risk: 'Wind shadows from continuous frontages under SW, E, NW winds.', intervention: '6-10m frontage breaks and shaded pedestrian air paths (+10-20pp).' }
    ]
  },
  yearRoundComfort: {
    seasons: [
      { season: 'SUMMER', meanUtciC: 39.1, comfortAreaPct: 0 },
      { season: 'WINTER', meanUtciC: 20.48, comfortAreaPct: 100 },
      { season: 'SPRING', meanUtciC: 30.4, comfortAreaPct: 0 },
      { season: 'AUTUMN', meanUtciC: 30.84, comfortAreaPct: 0 }
    ],
    note: 'Winter-comfortable but critical heat stress in summer/spring/autumn -- design must use adaptive/deciduous shade that preserves winter sun access rather than permanent fixed shade.'
  }
};
