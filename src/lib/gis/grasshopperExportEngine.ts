import type { H3Feature, RoadStats } from './types';
import { hexCentroid } from './h3Engine';
import {
  hexHeatExposureProxy, hexCoolingOpportunityScore, hexBiodiversityProxy, hexWaterSensitiveSuitability,
  hexTreePlantingSuitability, hexVoidRatioPct, computeAvgRoadWidthM
} from './environmentalEngine';

// ---------------------------------------------------------------------------
// UTM Zone 40N (EPSG:32640) forward projection
// ---------------------------------------------------------------------------
// Dubai (~55.2 deg E) falls in UTM Zone 40N (54-60 deg E, central meridian 57 deg E) -- the CRS
// Grasshopper/Rhino workflows expect for metric X/Y, not raw lat/lng degrees (which would give
// wrong spacing between cells). Implemented directly with the standard WGS84 transverse Mercator
// series (the same formula every UTM library uses) rather than pulling in a projection dependency
// for one conversion -- deterministic, not an approximation of unknown accuracy.
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const UTM_ZONE_40N_CENTRAL_MERIDIAN_DEG = 57;
const UTM_K0 = 0.9996;
const UTM_FALSE_EASTING = 500000;

export function toUtm40N(lng: number, lat: number): { x: number; y: number } {
  const e2 = WGS84_F * (2 - WGS84_F);
  const ePrime2 = e2 / (1 - e2);
  const lon0 = (UTM_ZONE_40N_CENTRAL_MERIDIAN_DEG * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;

  const N = WGS84_A / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ePrime2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lambda - lon0);

  const M = WGS84_A * (
    (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
    ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
    ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
    ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi)
  );

  const x = UTM_K0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5) / 120) + UTM_FALSE_EASTING;
  const y = UTM_K0 * (M + N * Math.tan(phi) * ((A ** 2) / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6) / 720));

  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Grasshopper design-input schema
// ---------------------------------------------------------------------------

/** Threshold for the parks land-use classifier's "dominant park use" call -- reused here so the constraint flag agrees with Urban Analysis' Land Use classification instead of using an independently-chosen number. */
const PARK_AREA_SHARE_CONSTRAINT_THRESHOLD = 0.3;

export interface GrasshopperCell {
  h3_id: string;
  centroid_x: number;
  centroid_y: number;
  centroid_lng: number;
  centroid_lat: number;
  heat_score: number;
  shade_score: number;
  canopy_score: number;
  cooling_score: number;
  wind_score: null;
  biodiversity_score: number;
  water_score: number;
  environmental_constraint_score: number;
  playground_environmental_suitability: number;
  plaza_environmental_suitability: number;
  quiet_garden_suitability: number;
  fitness_environmental_suitability: number;
  jogging_route_suitability: number;
  tree_planting_suitability: number;
  constraint: boolean;
}

export interface GrasshopperExport {
  site: string;
  analysis_crs: string;
  h3_resolution: number;
  generated_at: string;
  cell_count: number;
  methodology: Record<string, string>;
  cells: GrasshopperCell[];
}

export function computeGrasshopperExport(hexes: H3Feature[], roadStats: RoadStats | null, siteName = 'Al Safa 2 Park'): GrasshopperExport {
  const avgRoadWidthM = computeAvgRoadWidthM(roadStats);

  const cells: GrasshopperCell[] = hexes.map(h => {
    const [lng, lat] = hexCentroid(h);
    const { x, y } = toUtm40N(lng, lat);
    const areaM2 = h.properties.hex_area_m2 || 1;

    const heat100 = hexHeatExposureProxy(h, avgRoadWidthM);
    const cooling100 = hexCoolingOpportunityScore(h, avgRoadWidthM);
    const biodiversity100 = hexBiodiversityProxy(h);
    const water100 = hexWaterSensitiveSuitability(h, avgRoadWidthM);
    const treePlanting100 = hexTreePlantingSuitability(h, avgRoadWidthM);
    const voidRatio100 = hexVoidRatioPct(h);
    const green = h.properties.green_coverage_pct || 0;
    const roadDensityScore = Math.max(0, Math.min(100, ((h.properties.real_road_density_m_per_km2 || 0) / 40000) * 100));
    const parkSharePct = ((h.properties.park_area_m2 || 0) / areaM2) * 100;

    // Shade proxy: no real per-cell shade-hours data exists -- blends inverse heat exposure with
    // green coverage (existing vegetation is the only real proxy for existing shade in this dataset).
    const shade100 = Math.round((100 - heat100) * 0.6 + Math.min(100, (green / 30) * 100) * 0.4);
    const canopy100 = Math.min(100, (green / 30) * 100); // green_coverage_pct rarely exceeds ~30% in this dataset; scaled so the sparse real signal isn't compressed near 0

    const environmentalConstraint100 = Math.round(Math.min(100, (parkSharePct / 50) * 100));
    const constraint = (h.properties.park_area_m2 || 0) / areaM2 >= PARK_AREA_SHARE_CONSTRAINT_THRESHOLD;

    const playground100 = Math.round((100 - heat100) * 0.4 + Math.min(100, (green / 30) * 100) * 0.3 + (100 - Math.min(100, roadDensityScore)) * 0.3);
    const plaza100 = Math.round(roadDensityScore * 0.4 + (100 - heat100) * 0.3 + voidRatio100 * 0.3);
    const quietGarden100 = Math.round(Math.min(100, (green / 30) * 100) * 0.4 + (100 - roadDensityScore) * 0.35 + (100 - heat100) * 0.25);
    const fitness100 = Math.round(roadDensityScore * 0.4 + (100 - heat100) * 0.3 + voidRatio100 * 0.3);
    const jogging100 = Math.round(roadDensityScore * 0.5 + (100 - heat100) * 0.5);

    return {
      h3_id: h.properties.h3_id,
      centroid_x: x,
      centroid_y: y,
      centroid_lng: Math.round(lng * 1e6) / 1e6,
      centroid_lat: Math.round(lat * 1e6) / 1e6,
      heat_score: Math.round((heat100 / 100) * 1000) / 1000,
      shade_score: Math.round((shade100 / 100) * 1000) / 1000,
      canopy_score: Math.round((canopy100 / 100) * 1000) / 1000,
      cooling_score: Math.round((cooling100 / 100) * 1000) / 1000,
      wind_score: null,
      biodiversity_score: Math.round((biodiversity100 / 100) * 1000) / 1000,
      water_score: Math.round((water100 / 100) * 1000) / 1000,
      environmental_constraint_score: Math.round((environmentalConstraint100 / 100) * 1000) / 1000,
      playground_environmental_suitability: Math.round((Math.max(0, playground100) / 100) * 1000) / 1000,
      plaza_environmental_suitability: Math.round((Math.max(0, plaza100) / 100) * 1000) / 1000,
      quiet_garden_suitability: Math.round((Math.max(0, quietGarden100) / 100) * 1000) / 1000,
      fitness_environmental_suitability: Math.round((Math.max(0, fitness100) / 100) * 1000) / 1000,
      jogging_route_suitability: Math.round((Math.max(0, jogging100) / 100) * 1000) / 1000,
      tree_planting_suitability: Math.round((treePlanting100 / 100) * 1000) / 1000,
      constraint
    };
  });

  return {
    site: siteName,
    analysis_crs: 'EPSG:32640',
    h3_resolution: 9,
    generated_at: new Date().toISOString(),
    cell_count: cells.length,
    methodology: {
      coordinates: 'centroid_x/centroid_y are real WGS84->UTM Zone 40N (EPSG:32640) forward-projected coordinates in meters, computed directly (standard transverse Mercator series, no external projection library). centroid_lng/centroid_lat are the source WGS84 degrees, included for reference.',
      heat_score: 'Heat Exposure Proxy (0-1): 70% estimated impervious surface (real building footprint + road-length-derived paved area) + 30% green deficit. NOT a measured or modeled temperature -- this dataset has no thermal/satellite raster.',
      shade_score: '60% inverse heat exposure + 40% green coverage (existing vegetation as the only real shade proxy). No per-cell shade-hours data exists -- do not treat as measured shade duration.',
      canopy_score: 'green_coverage_pct scaled against a 30% reference ceiling (this field is sparse OSM landuse tagging, averaging under 1% site-wide -- NOT a tree-canopy raster measurement).',
      cooling_score: '60% heat exposure + 40% available land (void ratio) -- where a cooling intervention would have the most real estate to work with.',
      wind_score: 'Always null -- no wind, weather, or CFD data exists anywhere in this dataset. Included in the schema for structural completeness, not populated.',
      biodiversity_score: '60% park-area share of the cell (real, spatially varying) + 40% green coverage -- a habitat-presence proxy, not a measured species-diversity or connectivity index.',
      water_score: '50% estimated impervious surface (runoff generator) + 50% available land (void ratio) -- a bioswale/rain-garden siting proxy, not a hydrology model.',
      environmental_constraint_score: 'Scaled park-area share of the cell. constraint=true when park-area share >= 30% (the same threshold Land Use Analysis uses to classify a cell as "Parks / Open Space") -- intended as a no-build/protect flag for generative-design constraints.',
      program_suitability: 'playground/plaza/quiet_garden/fitness/jogging_route suitability are composites of heat exposure, green coverage, void ratio, and real road density (as a pedestrian-activity/path-availability proxy). The reference spec weighting also calls for future-shade-potential and wind-comfort inputs, which have no data source here -- their weight is folded into the remaining real components rather than fabricated, and every suitability figure should be read as directional, not precise.',
      tree_planting_suitability: '30% heat exposure + 25% green deficit + 25% available land (void ratio) + 15% pedestrian exposure (real road density) + 5% biodiversity opportunity. Weights are adjustable in the Environmental Opportunity Maps section.'
    },
    cells
  };
}

export function grasshopperExportToCsv(exportData: GrasshopperExport): string {
  if (exportData.cells.length === 0) return '';
  const cols = Object.keys(exportData.cells[0]) as (keyof GrasshopperCell)[];
  const header = cols.join(',');
  const rows = exportData.cells.map(c => cols.map(col => String(c[col] ?? '')).join(','));
  return [header, ...rows].join('\n');
}
