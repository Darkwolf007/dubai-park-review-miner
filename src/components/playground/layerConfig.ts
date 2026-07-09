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
      { id: 'walkability', label: 'Walkability', dataStatus: 'statOnly', color: '#94a3b8', note: 'Computed score -- see Accessibility Analysis.' }
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
    id: 'community',
    label: 'Community',
    layers: [
      { id: 'schools', label: 'Schools', dataStatus: 'real', layerKey: 'schools', renderMode: 'points', color: '#4a3aa7' },
      { id: 'mosques', label: 'Mosques', dataStatus: 'real', layerKey: 'mosques', renderMode: 'points', color: '#eda100' },
      { id: 'hospitals', label: 'Hospitals', dataStatus: 'real', layerKey: 'hospitals', renderMode: 'points', color: '#e34948' },
      { id: 'clinics', label: 'Clinics', dataStatus: 'real', layerKey: 'clinics', renderMode: 'points', color: '#e87ba4' },
      { id: 'universities', label: 'Universities', dataStatus: 'unavailable', color: '#94a3b8', note: 'Not distinguished from Schools in this OSM extract.' },
      { id: 'community-centers', label: 'Community Centers', dataStatus: 'unavailable', color: '#94a3b8', note: 'Not captured in this OSM extract.' }
    ]
  },
  {
    id: 'environment',
    label: 'Environment',
    layers: [
      { id: 'parks', label: 'Parks', dataStatus: 'real', layerKey: 'parks', renderMode: 'polygons', color: '#008300' },
      { id: 'tree-canopy', label: 'Tree Canopy', dataStatus: 'unavailable', color: '#94a3b8', note: 'No remote-sensing canopy raster in this dataset.' },
      { id: 'water-bodies', label: 'Water Bodies', dataStatus: 'unavailable', color: '#94a3b8' },
      { id: 'land-cover', label: 'Land Cover', dataStatus: 'unavailable', color: '#94a3b8' },
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
