import { distance as turfDistance } from '@turf/turf';
import type { H3Feature } from './types';
import { hexCentroid } from './h3Engine';

export interface PopulationAnalysisResult {
  totalPopulation: number;
  avgPopDensityKm2: number;
  populationServedWithin800m: number;
  hexCount: number;
  heatmapPoints: { lat: number; lng: number; weight: number }[];
}

const SERVICE_RADIUS_M = 800; // ~10 minute walk, standard park-planning service radius

/**
 * "Population Served" is a straight-line (Euclidean) buffer around the park
 * center, not a routed-network service area -- consistent with the same
 * proxy methodology used by the Accessibility engine. "Population Growth"
 * is not implemented: there's no time-series population data in this
 * dataset, only a single snapshot.
 */
export function computePopulationAnalysis(hexes: H3Feature[], parkCenter: { lat: number; lng: number }): PopulationAnalysisResult {
  const totalPopulation = hexes.reduce((sum, h) => sum + (h.properties.population || 0), 0);
  const avgPopDensityKm2 = hexes.length === 0
    ? 0
    : hexes.reduce((sum, h) => sum + (h.properties.pop_density_km2 || 0), 0) / hexes.length;

  let populationServedWithin800m = 0;
  const heatmapPoints = hexes.map(h => {
    const [lng, lat] = hexCentroid(h);
    const distMeters = turfDistance([parkCenter.lng, parkCenter.lat], [lng, lat], { units: 'meters' });
    if (distMeters <= SERVICE_RADIUS_M) populationServedWithin800m += h.properties.population || 0;
    return { lat, lng, weight: h.properties.population || 0 };
  });

  return {
    totalPopulation: Math.round(totalPopulation),
    avgPopDensityKm2: Math.round(avgPopDensityKm2),
    populationServedWithin800m: Math.round(populationServedWithin800m),
    hexCount: hexes.length,
    heatmapPoints
  };
}
