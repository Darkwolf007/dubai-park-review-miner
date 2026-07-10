export interface GeoJsonFeature<P = Record<string, any>> {
  type: 'Feature';
  geometry: { type: string; coordinates: any };
  properties: P;
}

export interface GeoJsonFeatureCollection<P = Record<string, any>> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
  truncated?: boolean;
  matchedCount?: number;
}

export interface H3HexProperties {
  fid: number;
  h3_id: string;
  population: number;
  mean_population: number;
  pixel_count: number;
  hex_area_m2: number;
  hex_area_km2: number;
  pop_density_km2: number;
  building_count: number;
  school_count: number;
  hospital_count: number;
  clinic_count: number;
  mosque_count: number;
  restaurant_count: number;
  cafe_count: number;
  playground_count: number;
  sports_count: number;
  bus_stop_count: number;
  parking_count: number;
  toilet_count: number;
  drinking_water_count: number;
  shop_count: number;
  building_area_m2: number;
  park_area_m2: number;
  road_length_m: number;
  building_coverage_pct: number;
  green_coverage_pct: number;
  road_density_m_per_km2: number;
  amenity_total: number;
  /** Real per-hex road length from a point-in-polygon spatial join (scripts/convert_gis_data.py) --
   * the original road_length_m/road_density_m_per_km2 fields above are 0 for every hex in the source
   * data and are kept only for schema compatibility. Use these two fields instead. */
  real_road_length_m: number;
  real_road_density_m_per_km2: number;
}

export type H3Feature = GeoJsonFeature<H3HexProperties>;

export interface RoadHierarchyBucket {
  count: number;
  lengthM: number;
}

export interface RoadHierarchyStats {
  primary: RoadHierarchyBucket;
  secondary: RoadHierarchyBucket;
  local: RoadHierarchyBucket;
  service: RoadHierarchyBucket;
  pedestrianCycling: RoadHierarchyBucket;
  other: RoadHierarchyBucket;
}

export interface RoadStats {
  totalGraphNodes: number;
  physicalEdgeCount: number;
  intersectionCount: number;
  deadEndCount: number;
  methodology: string;
  totalRoadLengthM: number;
  roadDensityMPerKm2: number;
  hierarchy: RoadHierarchyStats;
  blockCountEstimate?: number;
  avgBlockSizeKm2?: number;
  blockEstimateMethodology?: string;
}

export interface SpaceSyntaxNodeProperties {
  node_id: string;
  integration: number;
  choice: number;
  degree: number;
}

export type SpaceSyntaxFeature = GeoJsonFeature<SpaceSyntaxNodeProperties>;

export interface SpaceSyntaxStats {
  nodeCount: number;
  edgeCount: number;
  betweennessSampleK: number;
  methodology: string;
}

export interface GisManifestLayer {
  source: string;
  table: string;
  featureCount: number;
  bbox: [number, number, number, number] | null;
  h3Resolution?: number;
}

export interface GisManifest {
  generatedAt: string;
  layers: Record<string, GisManifestLayer>;
  roadStats: RoadStats | null;
  spaceSyntaxStats: SpaceSyntaxStats | null;
}
