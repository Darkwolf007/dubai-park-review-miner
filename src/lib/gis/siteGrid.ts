/**
 * Fine-grained (10m) site grid for Opportunity Lab siting, clipped to Al Safa 2 Park's own real
 * polygon (dataset/gis/parks.geojson) -- replaces the coarse ~300m H3 hex fragments (48 cells,
 * most only partially overlapping the park) with ~150-200 cells actually inside the park boundary.
 *
 * Data-honesty note: park_area_m2 (real intersection with the park polygon), building_area_m2/
 * building_coverage_pct (real intersection with nearby building footprints), and
 * real_road_density_m_per_km2 (real road length within a 20m buffer of each cell) are all
 * independently computed per cell from the actual source geometry. Every other field (population
 * density, amenity counts, distance-to-park, etc.) has no source finer than the H3 grid's ~300m
 * resolution -- the whole park in this dataset sits inside a single parent hex, so those fields
 * inherit that one hex's value uniformly across every cell, a documented proxy, not a 10m
 * measurement. (Road density specifically was NOT left as an inherited value: the park's parent
 * hex includes an adjacent arterial road, so its hex-wide average massively over-stated road
 * exposure for cells deep inside the park interior -- verified live, this was silently zeroing
 * out Quiet Garden's suitability score for the entire park before this fix.)
 */
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { H3Feature, H3HexProperties, GeoJsonFeature } from './types';

export interface SiteGridCell extends H3Feature {
  properties: H3HexProperties & { parentH3Id: string };
}

export const CELL_SIZE_M = 10;
const MIN_CELL_AREA_M2 = 5; // drop degenerate slivers from clipping at the polygon edge
const ROAD_BUFFER_M = 20; // radius searched around each cell for real nearby road length
const ROAD_SAMPLE_STEP_M = 5; // point-sampling interval used to approximate clipping a road line to the buffer

/** Approximates the length of `line` that actually falls inside `buffer` by sampling points
 * along it every ROAD_SAMPLE_STEP_M and checking each for containment, rather than attributing a
 * road segment's full length to every buffer it merely brushes (which silently inflated density
 * 5-10x for any cell near a long street -- verified live, this originally zeroed out Quiet
 * Garden's suitability across the entire park). */
function lengthWithinBuffer(line: GeoJsonFeature, buffer: Feature<Polygon | MultiPolygon>): number {
  try {
    const fullLengthM = turf.length(line as any, { units: 'kilometers' }) * 1000;
    if (fullLengthM === 0) return 0;
    const sampleCount = Math.max(2, Math.ceil(fullLengthM / ROAD_SAMPLE_STEP_M));
    let insideCount = 0;
    for (let i = 0; i <= sampleCount; i++) {
      const distanceKm = (fullLengthM * i) / sampleCount / 1000;
      const point = turf.along(line as any, distanceKm, { units: 'kilometers' });
      if (turf.booleanPointInPolygon(point, buffer as any)) insideCount++;
    }
    return fullLengthM * (insideCount / (sampleCount + 1));
  } catch {
    return 0;
  }
}

export function buildSiteGrid(
  parkPolygon: Feature<Polygon>,
  hexes: H3Feature[],
  buildingFeatures: GeoJsonFeature[],
  roadFeatures: GeoJsonFeature[]
): SiteGridCell[] {
  const bbox = turf.bbox(parkPolygon);
  const rawGrid = turf.squareGrid(bbox, CELL_SIZE_M / 1000, { units: 'kilometers' });
  const bboxPoly = turf.bboxPolygon(bbox);

  const nearbyBuildings = buildingFeatures.filter(b => {
    try {
      return turf.booleanIntersects(b as any, bboxPoly);
    } catch {
      return false;
    }
  });
  // Excludes pedestrian-only ways: 132 of the ~150 "road" segments near this park are its own
  // internal footpaths (verified live), not traffic -- counting them as road/noise exposure would
  // flag literally every quiet interior cell as "next to a busy road" simply because the park has
  // a walking path through it, which silently zeroed out Quiet Garden's suitability everywhere.
  const PEDESTRIAN_HIGHWAY_TYPES = new Set(['footway', 'path', 'pedestrian', 'steps', 'corridor', 'living_street', 'cycleway']);
  const nearbyRoads = roadFeatures.filter(r => {
    try {
      if (PEDESTRIAN_HIGHWAY_TYPES.has(String((r.properties as any)?.highway))) return false;
      return turf.booleanIntersects(r as any, bboxPoly);
    } catch {
      return false;
    }
  });

  const cells: SiteGridCell[] = [];
  let idx = 0;

  for (const rawCell of rawGrid.features) {
    if (!turf.booleanIntersects(rawCell, parkPolygon)) continue;

    let clipped: Feature<Polygon> | null = null;
    try {
      clipped = turf.intersect(turf.featureCollection([rawCell, parkPolygon])) as Feature<Polygon> | null;
    } catch {
      continue;
    }
    if (!clipped) continue;

    const areaM2 = turf.area(clipped);
    if (areaM2 < MIN_CELL_AREA_M2) continue;

    const centroid = turf.centroid(clipped).geometry.coordinates as [number, number];
    const parentHex = hexes.find(h => {
      try {
        return turf.booleanPointInPolygon(centroid, h as any);
      } catch {
        return false;
      }
    });
    if (!parentHex) continue;

    let buildingAreaM2 = 0;
    for (const b of nearbyBuildings) {
      try {
        if (!turf.booleanIntersects(clipped, b as any)) continue;
        const inter = turf.intersect(turf.featureCollection([clipped as any, b as any]));
        if (inter) buildingAreaM2 += turf.area(inter);
      } catch {
        // malformed source geometry -- skip rather than crash the whole grid build
      }
    }
    const buildingCoveragePct = areaM2 > 0 ? Math.min(100, (buildingAreaM2 / areaM2) * 100) : 0;
    const areaKm2 = areaM2 / 1_000_000;
    const cellPopulation = (parentHex.properties.pop_density_km2 || 0) * areaKm2;

    // Real road length within a 20m buffer of this specific cell, sample-clipped to the buffer
    // (see lengthWithinBuffer) so a long street merely brushing the buffer doesn't inflate density.
    let bufferRoadLengthM = 0;
    let bufferAreaM2 = areaM2;
    try {
      const cellBuffer = turf.buffer(clipped, ROAD_BUFFER_M / 1000, { units: 'kilometers' });
      if (cellBuffer) {
        bufferAreaM2 = turf.area(cellBuffer);
        for (const r of nearbyRoads) {
          try {
            if (turf.booleanIntersects(cellBuffer, r as any)) {
              bufferRoadLengthM += lengthWithinBuffer(r, cellBuffer);
            }
          } catch {
            // malformed source geometry -- skip
          }
        }
      }
    } catch {
      // buffer failed (degenerate geometry) -- fall back to 0 road length for this cell
    }
    const cellRoadDensity = bufferAreaM2 > 0 ? (bufferRoadLengthM / bufferAreaM2) * 1_000_000 : 0;

    const properties: SiteGridCell['properties'] = {
      ...parentHex.properties,
      fid: idx,
      h3_id: `grid-${idx}`,
      parentH3Id: parentHex.properties.h3_id,
      hex_area_m2: areaM2,
      hex_area_km2: areaKm2,
      population: cellPopulation,
      park_area_m2: areaM2, // clipped to the park polygon by construction -- the whole cell is park
      building_area_m2: buildingAreaM2,
      building_coverage_pct: buildingCoveragePct,
      building_count: buildingAreaM2 > 0 ? 1 : 0,
      real_road_length_m: bufferRoadLengthM,
      real_road_density_m_per_km2: cellRoadDensity
    };

    cells.push({ type: 'Feature', geometry: clipped.geometry, properties });
    idx++;
  }

  return cells;
}
