export type DataStatus = 'real' | 'statOnly' | 'unavailable';
export type RenderMode = 'choropleth' | 'pointChoropleth' | 'points' | 'lines' | 'polygons' | 'marker';

export interface DatasetLayerConfig {
  id: string;
  label: string;
  dataStatus: DataStatus;
  layerKey?: string;
  renderMode?: RenderMode;
  choroplethField?: string;
  highwayFilter?: string[];
  color: string;
  note?: string;
}

export interface DatasetCategory {
  id: string;
  label: string;
  layers: DatasetLayerConfig[];
}

// Maps the full spec taxonomy onto what's real in the two Al Safa 2 Park
// GeoPackages. Categories/layers without underlying data are kept in the
// list (dataStatus: 'unavailable') rather than hidden, so the taxonomy the
// spec asked for stays visible -- they're just honestly inert.
export const DATASET_CATEGORIES: DatasetCategory[] = [
  {
    id: 'population',
    label: 'Population',
    layers: [
      { id: 'pop-density', label: 'Population Density', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'pop_density_km2', color: '#4a3aa7' },
      { id: 'ghsl-population', label: 'GHSL Population', dataStatus: 'unavailable', color: '#94a3b8', note: 'No GHSL raster in this dataset.' },
      { id: 'worldpop-population', label: 'WorldPop Population', dataStatus: 'unavailable', color: '#94a3b8', note: 'No WorldPop raster in this dataset -- population is already baked into the H3 grid from a prior aggregation.' },
      { id: 'pop-growth', label: 'Population Growth', dataStatus: 'unavailable', color: '#94a3b8', note: 'No time-series population data -- only a single snapshot exists.' }
    ]
  },
  {
    id: 'urban',
    label: 'Urban',
    layers: [
      { id: 'buildings', label: 'Buildings', dataStatus: 'real', layerKey: 'buildings', renderMode: 'polygons', color: '#e34948' },
      { id: 'building-footprints', label: 'Building Footprints', dataStatus: 'real', layerKey: 'buildings', renderMode: 'polygons', color: '#e34948', note: 'Same source as the Buildings layer.' },
      { id: 'building-density', label: 'Building Density', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'building_coverage_pct', color: '#eb6834' },
      { id: 'roads', label: 'Roads', dataStatus: 'real', layerKey: 'roads', renderMode: 'lines', color: '#334155' },
      { id: 'intersections', label: 'Intersections', dataStatus: 'statOnly', color: '#94a3b8', note: 'Available as a count in Urban Analysis -- individual intersection coordinates aren\'t in this OSM extract.' },
      { id: 'walkability', label: 'Walkability', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'walking_time_to_park_minutes', color: '#94a3b8', note: 'See Accessibility category for the full set of accessibility map modes.' }
    ]
  },
  {
    id: 'mobility',
    label: 'Mobility',
    layers: [
      { id: 'bus-stops', label: 'Bus Stops', dataStatus: 'real', layerKey: 'bus_stops', renderMode: 'points', color: '#1baf7a' },
      { id: 'parking', label: 'Parking', dataStatus: 'real', layerKey: 'parking', renderMode: 'points', color: '#eda100' },
      { id: 'pedestrian-network', label: 'Pedestrian Network', dataStatus: 'real', layerKey: 'roads', renderMode: 'lines', highwayFilter: ['footway', 'path', 'pedestrian', 'steps', 'corridor', 'living_street'], color: '#2a78d6' },
      { id: 'cycling-routes', label: 'Cycling Routes', dataStatus: 'real', layerKey: 'roads', renderMode: 'lines', highwayFilter: ['cycleway'], color: '#10b981' },
      { id: 'metro-stations', label: 'Metro Stations', dataStatus: 'unavailable', color: '#94a3b8', note: 'Not captured in this OSM extract.' }
    ]
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    layers: [
      { id: 'acc-walking-time', label: 'Walking Time to Park', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'walking_time_to_park_minutes', color: '#2a78d6', note: 'Network-routed minutes from the park entrance (single-source Dijkstra on the drivable circulation graph). Cells with no value have no routable node inside them.' },
      { id: 'acc-park-access', label: 'Park Access Score', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'network_distance_to_park_m', color: '#4a3aa7', note: 'Colored by raw network distance (m) -- darker means closer. The 0-100 decayed score shown in the report is derived from this same field.' },
      { id: 'acc-walkability', label: 'Walkability Score', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'real_road_density_m_per_km2', color: '#10b981', note: 'Colored by real road density as a proxy -- the full Walkability Score is a multi-factor composite (see Accessibility Analysis -- Pedestrian Network Quality) not stored as a single map-ready field.' },
      { id: 'acc-transit', label: 'Transit Accessibility', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'nearest_bus_stop_distance_m', color: '#1baf7a', note: 'Straight-line distance (m) to the nearest of 162 bus stops -- lower is better.' },
      { id: 'acc-barrier', label: 'Barrier Severity', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'barrier_score_hex', color: '#e34948', note: 'Weighted exposure to primary/secondary road segments (primary=2, secondary=1) inside each cell.' },
      { id: 'acc-underserved', label: 'Underserved Population', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'population', color: '#eb6834', note: 'Colored by population -- cross-reference with Walking Time to spot high-population, long-walking-time cells. See Accessibility Analysis -- H3 Accessibility Analysis for the ranked composite deficit score.' }
    ]
  },
  {
    id: 'community',
    label: 'Community',
    layers: [
      { id: 'schools', label: 'Schools', dataStatus: 'real', layerKey: 'schools', renderMode: 'points', color: '#4a3aa7' },
      { id: 'mosques', label: 'Mosques', dataStatus: 'real', layerKey: 'mosques', renderMode: 'points', color: '#eda100' },
      { id: 'hospitals', label: 'Hospitals', dataStatus: 'real', layerKey: 'hospitals', renderMode: 'points', color: '#e34948' },
      { id: 'clinics', label: 'Clinics', dataStatus: 'real', layerKey: 'clinics', renderMode: 'points', color: '#e87ba4' },
      { id: 'universities', label: 'Universities', dataStatus: 'unavailable', color: '#94a3b8', note: 'Not distinguished from Schools in this OSM extract.' },
      { id: 'community-centers', label: 'Community Centers', dataStatus: 'unavailable', color: '#94a3b8', note: 'Not captured in this OSM extract.' },
      { id: 'comm-facility-access', label: 'Facility Access', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'amenity_total', color: '#4a3aa7', note: 'Colored by real H3 amenity-presence density -- the basis of the Facility-Access Score in Community Analysis.' },
      { id: 'comm-family-demand', label: 'Family Demand', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'pop_density_km2', color: '#eb6834', note: 'Colored by population density, the dominant real component of the Family Demand composite (see Community Analysis -- H3 Community Analysis for the full school/playground/density formula).' },
      { id: 'comm-vulnerability', label: 'Community Vulnerability', dataStatus: 'statOnly', color: '#e34948', note: 'Computed composite score -- see Community Analysis -- Equity and Underserved Areas.' }
    ]
  },
  {
    id: 'environment',
    label: 'Environment',
    layers: [
      { id: 'parks', label: 'Parks', dataStatus: 'real', layerKey: 'parks', renderMode: 'polygons', color: '#008300' },
      { id: 'env-green-coverage', label: 'Green Coverage', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'green_coverage_pct', color: '#008300', note: 'Real H3-aggregated OSM landuse tagging -- sparse (site-wide average under 1%), not a canopy/NDVI measurement.' },
      { id: 'env-heat-proxy', label: 'Heat Exposure Proxy', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'building_coverage_pct', color: '#e34948', note: 'Colored by building coverage as the dominant proxy component -- the full Heat Exposure Proxy also factors in estimated road area and green deficit (see Environmental Analysis -- Heat and Thermal Comfort). Not a measured temperature.' },
      { id: 'tree-canopy', label: 'Tree Canopy', dataStatus: 'unavailable', color: '#94a3b8', note: 'No remote-sensing canopy raster in this dataset.' },
      { id: 'water-bodies', label: 'Water Bodies', dataStatus: 'unavailable', color: '#94a3b8', note: 'Confirmed zero natural=water features in this OSM extract.' },
      { id: 'land-cover', label: 'Land Cover', dataStatus: 'statOnly', color: '#94a3b8', note: 'Buildings/Paved/Green/Void breakdown -- see Environmental Analysis -- Land Cover and Surface Materials for the chart.' },
      { id: 'surface-temperature', label: 'Surface Temperature', dataStatus: 'unavailable', color: '#94a3b8', note: 'No thermal raster in this dataset.' },
      { id: 'urban-heat-island', label: 'Urban Heat Island', dataStatus: 'unavailable', color: '#94a3b8' }
    ]
  },
  {
    id: 'review-intelligence',
    label: 'Review Intelligence',
    layers: [
      { id: 'ri-sentiment', label: 'Sentiment', dataStatus: 'real', renderMode: 'marker', color: '#6366f1', note: 'Reviews are only geocoded to the park centroid -- shown as a single marker, not a spatial heatmap.' },
      { id: 'ri-shade', label: 'Shade Issues', dataStatus: 'real', renderMode: 'marker', color: '#f97316' },
      { id: 'ri-playground', label: 'Playground Requests', dataStatus: 'real', renderMode: 'marker', color: '#ec4899' },
      { id: 'ri-maintenance', label: 'Maintenance Issues', dataStatus: 'real', renderMode: 'marker', color: '#ef4444' },
      { id: 'ri-accessibility', label: 'Accessibility', dataStatus: 'real', renderMode: 'marker', color: '#14b8a6' },
      { id: 'ri-toilets', label: 'Toilets', dataStatus: 'real', renderMode: 'marker', color: '#f43f5e' },
      { id: 'ri-water', label: 'Water Features', dataStatus: 'real', renderMode: 'marker', color: '#06b6d4' },
      { id: 'ri-security', label: 'Security', dataStatus: 'real', renderMode: 'marker', color: '#a855f7' },
      { id: 'ri-parking', label: 'Parking Complaints', dataStatus: 'real', renderMode: 'marker', color: '#3b82f6' }
    ]
  },
  {
    id: 'demographics',
    label: 'Demographics',
    layers: [
      { id: 'demo-population', label: 'Population', dataStatus: 'real', layerKey: 'h3_grid', renderMode: 'choropleth', choroplethField: 'population', color: '#4a3aa7', note: 'Same H3 grid as the Population category.' },
      { id: 'household-density', label: 'Household Density', dataStatus: 'unavailable', color: '#94a3b8' },
      { id: 'community-type', label: 'Community Type', dataStatus: 'unavailable', color: '#94a3b8' },
      { id: 'age-distribution', label: 'Age Distribution', dataStatus: 'unavailable', color: '#94a3b8' },
      { id: 'residential-typology', label: 'Residential Typology', dataStatus: 'unavailable', color: '#94a3b8' }
    ]
  },
  {
    id: 'space-syntax',
    label: 'Space Syntax',
    layers: [
      { id: 'ss-integration', label: 'Integration (Closeness)', dataStatus: 'real', layerKey: 'space_syntax', renderMode: 'pointChoropleth', choroplethField: 'integration', color: '#2a78d6', note: 'Closeness centrality on the drivable circulation network, networkx-computed, min-max normalized 0-100.' },
      { id: 'ss-choice', label: 'Choice (Betweenness)', dataStatus: 'real', layerKey: 'space_syntax', renderMode: 'pointChoropleth', choroplethField: 'choice', color: '#e34948', note: 'Betweenness centrality (k=500 sample), networkx-computed, min-max normalized 0-100.' }
    ]
  }
];

export function findLayerConfig(id: string): DatasetLayerConfig | undefined {
  for (const cat of DATASET_CATEGORIES) {
    const found = cat.layers.find(l => l.id === id);
    if (found) return found;
  }
  return undefined;
}
