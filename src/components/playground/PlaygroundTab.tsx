import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Hexagon, BarChart3, History as HistoryIcon, Info, X } from 'lucide-react';
import { PRESEEDED_PARKS, fetchParkDetails } from '../../lib/googlePlaces';
import { analyzeReviewsLocally, type NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { fetchGisManifest, fetchGisLayer } from '../../lib/gis/gisEngine';
import { downloadGeoJson } from '../../lib/gis/exportEngine';
import {
  computePedestrianNetworkQuality, computeHexWalkabilityScore, computeHexParkAccessScore,
  computeHexTransitAccessibilityScore, accessibilityStatusLabel
} from '../../lib/gis/accessibilityEngine';
import {
  hexHeatExposureProxy, hexCoolingOpportunityScore, hexBiodiversityProxy, hexTreePlantingSuitability,
  computeAvgRoadWidthM
} from '../../lib/gis/environmentalEngine';
import { computeNlpSpatialAnalysis } from '../../lib/gis/reviewNlpSpatialEngine';
import { computeHexDemandScore } from '../../lib/gis/populationEngine';
import { computeHexUrbanScore } from '../../lib/gis/urbanEngine';
import { classifyHexLandUse } from '../../lib/gis/landUseEngine';
import type { GisManifest, H3Feature, GeoJsonFeature } from '../../lib/gis/types';
import type { DatasetLayerConfig } from './layerConfig';
import { DatasetExplorerPanel } from './DatasetExplorerPanel';
import { PlaygroundMap, type PlaygroundTool } from './PlaygroundMap';
import { AnalysisEnginePanel, type HistoryEntry } from './AnalysisEnginePanel';
import { H3AnalysisPanel } from './H3AnalysisPanel';
import { PlaygroundCharts } from './PlaygroundCharts';
import { AnalysisHistoryPanel } from './AnalysisHistoryPanel';

const AL_SAFA_2_PLACE_ID = 'ChIJW2n2fB9tXz4R3Gqf-661oQE';
const HISTORY_STORAGE_KEY = 'dprm_playground_history';
const DEFAULT_ACTIVE_LAYERS = ['buildings', 'roads', 'parks', 'schools'];

type PlaygroundSection = 'workspace' | 'h3' | 'charts' | 'history';

const SECTIONS: { id: PlaygroundSection; label: string; icon: any }[] = [
  { id: 'workspace', label: 'Map Workspace', icon: LayoutGrid },
  { id: 'h3', label: 'H3 Analysis', icon: Hexagon },
  { id: 'charts', label: 'Charts', icon: BarChart3 },
  { id: 'history', label: 'History', icon: HistoryIcon }
];

function InspectorRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
      <span className="text-slate-400 font-semibold">{label}</span>
      <span className="text-slate-700 font-bold">{value}</span>
    </div>
  );
}

/** A short, deterministic, per-cell insight derived from that cell's own real metrics -- not a live AI call per click (too slow/costly to fire on every map click). */
function buildHexRecommendation(props: H3Feature['properties']): string {
  const notes: string[] = [];
  if ((props.green_coverage_pct || 0) < 10 && (props.building_coverage_pct || 0) > 25) {
    notes.push('Low green coverage relative to built density -- candidate for planting/shade intervention.');
  }
  if ((props.pop_density_km2 || 0) > 10000 && (props.playground_count || 0) === 0) {
    notes.push('High population density with no playground counted nearby -- candidate for play equipment.');
  }
  if ((props.amenity_total || 0) < 3 && (props.population || 0) > 200) {
    notes.push('Populated cell with low amenity density -- candidate for community facility investment.');
  }
  if ((props.building_coverage_pct || 0) > 25 && (props.real_road_density_m_per_km2 || 0) < 5000) {
    notes.push('High building coverage with low measured road access in this cell -- verify pedestrian/vehicle access before intervention.');
  }
  if (notes.length === 0) {
    notes.push('No standout deficits detected for this cell against the metrics available.');
  }
  return notes.join(' ');
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function PlaygroundTab() {
  const parkCenter = useMemo(() => {
    const park = PRESEEDED_PARKS.find(p => p.placeId === AL_SAFA_2_PLACE_ID);
    return park ? { lat: park.lat, lng: park.lng } : { lat: 25.1706, lng: 55.2289 };
  }, []);

  const [section, setSection] = useState<PlaygroundSection>('workspace');
  const [manifest, setManifest] = useState<GisManifest | null>(null);
  const [hexes, setHexes] = useState<H3Feature[]>([]);
  const [busStops, setBusStops] = useState<GeoJsonFeature[]>([]);
  const [reviews, setReviews] = useState<NLPAnalyzedReview[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(DEFAULT_ACTIVE_LAYERS));
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>({});
  const [activeTool, setActiveTool] = useState<PlaygroundTool>('pan');
  const [drawnFeatures, setDrawnFeatures] = useState<GeoJSON.Feature[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<Record<string, any> | null>(null);
  const [walkabilityScore, setWalkabilityScore] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const mapContainerRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [manifestRes, h3Res, busRes, parkRes] = await Promise.all([
        fetchGisManifest(),
        fetchGisLayer<H3Feature['properties']>('h3_grid'),
        fetchGisLayer('bus_stops'),
        fetchParkDetails(AL_SAFA_2_PLACE_ID)
      ]);
      if (cancelled) return;
      setManifest(manifestRes);
      if (h3Res) setHexes(h3Res.features as H3Feature[]);
      if (busRes) setBusStops(busRes.features);
      setReviews(analyzeReviewsLocally(parkRes.reviews));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const nlpSpatial = useMemo(() => reviews.length > 0 ? computeNlpSpatialAnalysis(reviews, parkCenter) : null, [reviews, parkCenter]);

  function toggleLayer(id: string) {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDownloadLayer(layer: DatasetLayerConfig) {
    if (!layer.layerKey) return;
    const fc = await fetchGisLayer(layer.layerKey);
    if (fc) downloadGeoJson(fc, `${layer.layerKey}.geojson`);
  }

  const poiCounts = useMemo(() => ({
    schoolCount: manifest?.layers.schools?.featureCount || 0,
    hospitalCount: manifest?.layers.hospitals?.featureCount || 0,
    mosqueCount: manifest?.layers.mosques?.featureCount || 0,
    clinicCount: manifest?.layers.clinics?.featureCount || 0
  }), [manifest]);

  function handleRunComplete(entry: { name: string; layers: string[]; summary: string }) {
    setHistory(prev => [{ id: `${Date.now()}`, timestamp: new Date().toISOString(), ...entry }, ...prev].slice(0, 50));
    if (entry.name === 'Accessibility Analysis') {
      const result = computePedestrianNetworkQuality(hexes, manifest?.roadStats || null);
      setWalkabilityScore(result.walkabilityScore);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded border border-slate-200 shadow-sm p-12 text-center">
        <Hexagon className="w-8 h-8 mx-auto mb-2 text-slate-300 animate-pulse" />
        <p className="text-xs font-semibold text-slate-500">Loading GIS datasets for Al Safa 2 Park...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="bg-white rounded border border-slate-200 shadow-sm p-1 flex gap-1">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                section === s.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-600 font-mono">
          <Info className="w-3 h-3 text-indigo-600" />
          <span>Site: <strong className="text-indigo-700 font-bold">Al Safa 2 Park, Dubai</strong> (5km OSM extract + H3 res-9 grid)</span>
        </div>
      </div>

      {section === 'workspace' && (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 xl:col-span-3">
            <DatasetExplorerPanel
              activeLayers={activeLayers}
              onToggleLayer={toggleLayer}
              layerOpacity={layerOpacity}
              onOpacityChange={(id, v) => setLayerOpacity(prev => ({ ...prev, [id]: v }))}
              manifest={manifest}
              onDownload={handleDownloadLayer}
            />
          </div>

          <div className="col-span-12 xl:col-span-6 space-y-3">
            <PlaygroundMap
              activeLayers={activeLayers}
              layerOpacity={layerOpacity}
              parkCenter={parkCenter}
              manifest={manifest}
              nlpSpatial={nlpSpatial}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              drawnFeatures={drawnFeatures}
              onDrawnFeaturesChange={setDrawnFeatures}
              onFeatureSelect={setSelectedFeature}
              containerRef={mapContainerRef}
            />
            {selectedFeature && (
              <div className="bg-white rounded border border-slate-200 shadow-sm p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {selectedFeature.h3_id ? 'H3 Cell Inspector' : 'Feature Inspector'}
                  </span>
                  <button onClick={() => setSelectedFeature(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                </div>

                {selectedFeature.h3_id ? (() => {
                  const matchedHex = hexes.find(h => h.properties.h3_id === selectedFeature.h3_id);
                  const demandScore = matchedHex ? computeHexDemandScore(matchedHex) : null;
                  const urbanScore = matchedHex ? computeHexUrbanScore(matchedHex) : null;
                  const landUseLabel = matchedHex ? classifyHexLandUse(matchedHex, hexes) : null;
                  const cellWalkability = matchedHex ? computeHexWalkabilityScore(matchedHex) : null;
                  const cellParkAccess = matchedHex ? computeHexParkAccessScore(matchedHex) : null;
                  const cellTransitAccess = matchedHex ? computeHexTransitAccessibilityScore(matchedHex) : null;
                  const cellAccessibilityStatus = cellParkAccess !== null ? accessibilityStatusLabel(cellParkAccess) : null;
                  const networkConnectivity = manifest?.roadStats && manifest.roadStats.totalGraphNodes > 0
                    ? Math.round((manifest.roadStats.intersectionCount / manifest.roadStats.totalGraphNodes) * 100)
                    : null;
                  const avgBuildingSizeM2 = (selectedFeature.building_count || 0) > 0
                    ? Math.round((selectedFeature.building_area_m2 || 0) / selectedFeature.building_count)
                    : 0;
                  const avgRoadWidthM = computeAvgRoadWidthM(manifest?.roadStats || null);
                  const cellHeatProxy = matchedHex ? hexHeatExposureProxy(matchedHex, avgRoadWidthM) : null;
                  const cellCoolingOpportunity = matchedHex ? hexCoolingOpportunityScore(matchedHex, avgRoadWidthM) : null;
                  const cellBiodiversityProxy = matchedHex ? hexBiodiversityProxy(matchedHex) : null;
                  const cellTreePlantingSuitability = matchedHex ? hexTreePlantingSuitability(matchedHex, avgRoadWidthM) : null;
                  const recommendation = buildHexRecommendation(selectedFeature as H3Feature['properties']);
                  return (
                    <div className="space-y-2">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Population</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <InspectorRow label="Population" value={Math.round(selectedFeature.population || 0).toLocaleString()} />
                        <InspectorRow label="Density" value={`${Math.round(selectedFeature.pop_density_km2 || 0).toLocaleString()}/km²`} />
                        <InspectorRow label="Schools" value={selectedFeature.school_count ?? 0} />
                        <InspectorRow label="Bus Stops" value={selectedFeature.bus_stop_count ?? 0} />
                        <InspectorRow label="Park Area" value={`${Math.round(selectedFeature.park_area_m2 || 0).toLocaleString()} m²`} />
                        <InspectorRow label="Demand Score" value={demandScore !== null ? `${demandScore}/100` : 'N/A'} />
                        <InspectorRow label="Population Growth" value="No data" />
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 pt-1">Urban</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <InspectorRow label="Buildings" value={selectedFeature.building_count ?? 0} />
                        <InspectorRow label="Building Coverage" value={`${(selectedFeature.building_coverage_pct || 0).toFixed(1)}%`} />
                        <InspectorRow label="Avg Building Size" value={`${avgBuildingSizeM2.toLocaleString()} m²`} />
                        <InspectorRow label="Road Length" value={`${Math.round(selectedFeature.real_road_length_m || 0).toLocaleString()} m`} />
                        <InspectorRow label="Road Density" value={`${Math.round(selectedFeature.real_road_density_m_per_km2 || 0).toLocaleString()}/km²`} />
                        <InspectorRow label="Dominant Land Use" value={landUseLabel || 'N/A'} />
                        <InspectorRow label="Urban Compactness" value={urbanScore !== null ? `${urbanScore}/100` : 'N/A'} />
                        <InspectorRow label="Connectivity Score" value={networkConnectivity !== null ? `${networkConnectivity}/100*` : 'N/A'} />
                      </div>
                      <p className="text-[7px] text-slate-400">* Connectivity Score is a network-wide value (not yet computed per-cell).</p>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 pt-1">Accessibility</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <InspectorRow label="Walking Time to Park" value={selectedFeature.walking_time_to_park_minutes != null ? `${selectedFeature.walking_time_to_park_minutes} min` : 'No route'} />
                        <InspectorRow label="Nearest Entrance" value={selectedFeature.network_distance_to_park_m != null ? `${Math.round(selectedFeature.network_distance_to_park_m).toLocaleString()} m` : 'No route'} />
                        <InspectorRow label="Nearest Bus Stop" value={selectedFeature.nearest_bus_stop_distance_m != null ? `${Math.round(selectedFeature.nearest_bus_stop_distance_m).toLocaleString()} m` : 'N/A'} />
                        <InspectorRow label="Barrier Count" value={selectedFeature.barrier_score_hex ?? 0} />
                        <InspectorRow label="Walkability Score" value={cellWalkability !== null ? `${cellWalkability}/100` : 'N/A'} />
                        <InspectorRow label="Transit Accessibility" value={cellTransitAccess !== null ? `${cellTransitAccess}/100` : 'N/A'} />
                        <InspectorRow label="Park Access Score" value={cellParkAccess !== null ? `${cellParkAccess}/100` : 'N/A'} />
                        <InspectorRow label="Accessibility Status" value={cellAccessibilityStatus || 'N/A'} />
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 pt-1">Environmental</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <InspectorRow label="Green Coverage" value={`${(selectedFeature.green_coverage_pct || 0).toFixed(1)}%`} />
                        <InspectorRow label="Heat Exposure Proxy" value={cellHeatProxy !== null ? `${cellHeatProxy}/100` : 'N/A'} />
                        <InspectorRow label="Cooling Opportunity" value={cellCoolingOpportunity !== null ? `${cellCoolingOpportunity}/100` : 'N/A'} />
                        <InspectorRow label="Biodiversity Proxy" value={cellBiodiversityProxy !== null ? `${cellBiodiversityProxy}/100` : 'N/A'} />
                        <InspectorRow label="Tree Planting Suitability" value={cellTreePlantingSuitability !== null ? `${cellTreePlantingSuitability}/100` : 'N/A'} />
                        <InspectorRow label="Surface Temperature" value="No dataset" />
                      </div>
                      <p className="text-[7px] text-slate-400">Heat/Cooling/Biodiversity/Tree Planting are documented surface-composition proxies (no satellite/thermal data exists in this dataset) -- see Environmental Analysis for full methodology.</p>
                      <div className="bg-indigo-50/60 border border-indigo-100 rounded p-1.5 text-[9px] text-indigo-900 leading-relaxed">
                        <span className="font-bold uppercase tracking-wider text-[7px] block mb-0.5">AI Recommendation</span>
                        {recommendation}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                    {Object.entries(selectedFeature).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
                        <span className="text-slate-400 font-mono truncate">{k}</span>
                        <span className="text-slate-700 font-semibold truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="col-span-12 xl:col-span-3">
            <AnalysisEnginePanel
              hexes={hexes}
              busStops={busStops}
              reviews={reviews}
              parkCenter={parkCenter}
              roadStats={manifest?.roadStats || null}
              poiCounts={poiCounts}
              spaceSyntaxStats={manifest?.spaceSyntaxStats || null}
              accessibilityStats={manifest?.accessibilityStats || null}
              onRunComplete={handleRunComplete}
            />
          </div>
        </div>
      )}

      {section === 'h3' && <H3AnalysisPanel hexes={hexes} />}
      {section === 'charts' && <PlaygroundCharts hexes={hexes} reviews={reviews} walkabilityScore={walkabilityScore} />}
      {section === 'history' && <AnalysisHistoryPanel history={history} onClearAll={() => setHistory([])} />}
    </div>
  );
}
