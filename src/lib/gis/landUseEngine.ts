import type { H3Feature } from './types';

export type LandUseCategory = 'Residential' | 'Commercial' | 'Institutional' | 'Parks / Open Space' | 'Undeveloped';

const LAND_USE_CATEGORIES: LandUseCategory[] = ['Residential', 'Commercial', 'Institutional', 'Parks / Open Space', 'Undeveloped'];

export interface LandUseBreakdown {
  category: LandUseCategory;
  hexCount: number;
  areaKm2: number;
  pct: number;
}

export interface LandUseAnalysisResult {
  breakdown: LandUseBreakdown[];
  dominantLandUse: LandUseCategory;
  diversityIndex: number;
  methodology: string;
}

const PARK_AREA_SHARE_THRESHOLD = 0.3;
const INSTITUTIONAL_FIELDS = ['school_count', 'hospital_count', 'clinic_count', 'mosque_count'] as const;
const COMMERCIAL_FIELDS = ['restaurant_count', 'cafe_count', 'shop_count'] as const;

interface FieldStats { mean: number; std: number }

/**
 * The H3 grid's per-hex POI-type counts (school_count, hospital_count, etc.)
 * are a smoothed "nearby presence" proxy, not literal in-hex counts --
 * verified directly against the source data: school/hospital/mosque counts
 * are nonzero in ALL 860 hexes and cluster overwhelmingly at exactly 1 (e.g.
 * hospital_count=1 in 858/860 hexes). Naively summing raw counts (4
 * institutional fields vs 3 commercial fields) would trivially bias toward
 * "Institutional" every time purely because it sums one more near-constant
 * field, regardless of what's actually nearby. Z-scoring each field against
 * its own grid-wide mean/std fixes this: a field with ~zero real variance
 * (like mosque_count) contributes ~zero signal either way, while genuinely
 * variable fields (shop_count ranges 1-17+) still carry real information.
 */
function computeFieldStats(hexes: H3Feature[], field: string): FieldStats {
  const values = hexes.map(h => Number((h.properties as any)[field]) || 0);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length || 1);
  const std = Math.sqrt(variance);
  return { mean, std };
}

function zScore(value: number, stats: FieldStats): number {
  if (stats.std === 0) return 0;
  return (value - stats.mean) / stats.std;
}

function classifyHexWithStats(
  hex: H3Feature,
  institutionalStats: Record<string, FieldStats>,
  commercialStats: Record<string, FieldStats>
): LandUseCategory {
  const props = hex.properties;
  const areaM2 = props.hex_area_m2 || 1;
  const parkShare = (props.park_area_m2 || 0) / areaM2;
  if (parkShare >= PARK_AREA_SHARE_THRESHOLD) return 'Parks / Open Space';

  if ((props.building_coverage_pct || 0) < 2) return 'Undeveloped';

  const institutionalZ = INSTITUTIONAL_FIELDS.reduce((s, f) => s + zScore(Number((props as any)[f]) || 0, institutionalStats[f]), 0) / INSTITUTIONAL_FIELDS.length;
  const commercialZ = COMMERCIAL_FIELDS.reduce((s, f) => s + zScore(Number((props as any)[f]) || 0, commercialStats[f]), 0) / COMMERCIAL_FIELDS.length;

  // Both z-scores near zero means this hex is unremarkable on either signal
  // (the common case, given how flat these fields are) -- default to
  // Residential rather than picking whichever is marginally higher by noise.
  const SIGNAL_THRESHOLD = 0.5;
  if (institutionalZ < SIGNAL_THRESHOLD && commercialZ < SIGNAL_THRESHOLD) return 'Residential';
  return institutionalZ > commercialZ ? 'Institutional' : 'Commercial';
}

/** Shannon entropy, normalized to 0-100 against the maximum possible entropy for this many categories -- a standard land-use diversity index. */
function shannonDiversity(counts: number[]): number {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return 0;
  const proportions = counts.filter(c => c > 0).map(c => c / total);
  const entropy = -proportions.reduce((s, p) => s + p * Math.log(p), 0);
  const maxEntropy = Math.log(counts.length);
  return maxEntropy === 0 ? 0 : Math.round((entropy / maxEntropy) * 100);
}

export function computeLandUseAnalysis(hexes: H3Feature[]): LandUseAnalysisResult {
  const institutionalStats = Object.fromEntries(INSTITUTIONAL_FIELDS.map(f => [f, computeFieldStats(hexes, f)]));
  const commercialStats = Object.fromEntries(COMMERCIAL_FIELDS.map(f => [f, computeFieldStats(hexes, f)]));

  const counts: Record<LandUseCategory, { hexCount: number; areaKm2: number }> = Object.fromEntries(
    LAND_USE_CATEGORIES.map(c => [c, { hexCount: 0, areaKm2: 0 }])
  ) as any;

  hexes.forEach(hex => {
    const cat = classifyHexWithStats(hex, institutionalStats, commercialStats);
    counts[cat].hexCount++;
    counts[cat].areaKm2 += hex.properties.hex_area_km2 || 0;
  });

  const totalArea = hexes.reduce((s, h) => s + (h.properties.hex_area_km2 || 0), 0) || 1;

  const breakdown: LandUseBreakdown[] = LAND_USE_CATEGORIES.map(cat => ({
    category: cat,
    hexCount: counts[cat].hexCount,
    areaKm2: Math.round(counts[cat].areaKm2 * 100) / 100,
    pct: Math.round((counts[cat].areaKm2 / totalArea) * 1000) / 10
  }));

  const dominantLandUse = breakdown.reduce((max, b) => (b.areaKm2 > max.areaKm2 ? b : max), breakdown[0]).category;
  const diversityIndex = shannonDiversity(LAND_USE_CATEGORIES.map(c => counts[c].hexCount));

  return {
    breakdown,
    dominantLandUse,
    diversityIndex,
    methodology: 'POI-density z-score classification per H3 cell (institutional vs commercial amenity signal, each normalized against its own grid-wide mean/variance so near-constant fields cannot dominate) vs park-area share vs generic building presence -- a real but approximate proxy for land use, not authoritative zoning/parcel data.'
  };
}

/** Single-hex convenience wrapper (e.g. for the map click inspector) -- recomputes grid-wide stats from the full hex set each call, cheap at this data size (~860 hexes). */
export function classifyHexLandUse(hex: H3Feature, allHexes: H3Feature[]): LandUseCategory {
  const institutionalStats = Object.fromEntries(INSTITUTIONAL_FIELDS.map(f => [f, computeFieldStats(allHexes, f)]));
  const commercialStats = Object.fromEntries(COMMERCIAL_FIELDS.map(f => [f, computeFieldStats(allHexes, f)]));
  return classifyHexWithStats(hex, institutionalStats, commercialStats);
}
