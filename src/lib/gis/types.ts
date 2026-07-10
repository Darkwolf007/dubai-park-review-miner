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
  /** Accessibility fields (scripts/convert_gis_data.py compute_accessibility_analysis) -- real
   * single-source Dijkstra network routing from the park center (snapped to its nearest
   * drivable-circulation-graph node, since no entrance point data exists) to every H3 cell that
   * contains a circulation-graph node. null when a cell has no such node (interior blocks only
   * reached by service/pedestrian ways outside the routing graph) -- never backfilled with an
   * estimate. See AccessibilityStats.methodology for the full disclosure. */
  network_distance_to_park_m: number | null;
  walking_time_to_park_minutes: number | null;
  /** Straight-line distance to the park center -- always available, used as the numerator of route_directness_ratio. */
  euclidean_distance_to_park_m: number;
  /** euclidean / network, <=1 (1 = perfectly direct route); null wherever network_distance_to_park_m is null. */
  route_directness_ratio: number | null;
  /** Count of degree>=3 road-graph nodes (from ALL road segments, not just circulation) inside this hex. */
  intersection_count_hex: number;
  /** Weighted count of primary/secondary road segment midpoints inside this hex (primary=2, secondary=1) -- a barrier-exposure proxy, not a crossing-deficiency count (no crossing-point data exists). */
  barrier_score_hex: number;
  /** Straight-line distance to the nearest of the 162 bus stop points; null only if the bus stop layer is empty. */
  nearest_bus_stop_distance_m: number | null;
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

export interface AccessibilityCatchmentBand {
  minutes: number;
  radiusApproxM: number;
  population: number;
  areaKm2: number;
  densityPerKm2: number;
  hexCount: number;
  pctOfTotalPopulation: number;
  schoolCount: number;
  busStopCount: number;
  clinicCount: number;
  mosqueCount: number;
  commercialAmenityCount: number;
  avgRouteDirectness: number | null;
}

export interface AccessibilityEntranceNode {
  nodeId: string;
  lng: number;
  lat: number;
  snapDistanceM: number;
}

export interface AccessibilityStats {
  entranceNode: AccessibilityEntranceNode;
  walkingSpeedMPerMin: number;
  catchments: AccessibilityCatchmentBand[];
  reachableHexCount: number;
  totalHexCount: number;
  unreachableHexNote: string;
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
  accessibilityStats: AccessibilityStats | null;
}
