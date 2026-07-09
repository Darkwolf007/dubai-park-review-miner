import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Hexagon, BarChart3, History as HistoryIcon, Info, X } from 'lucide-react';
import { PRESEEDED_PARKS, fetchParkDetails } from '../../lib/googlePlaces';
import { analyzeReviewsLocally, type NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { fetchGisManifest, fetchGisLayer } from '../../lib/gis/gisEngine';
import { downloadGeoJson } from '../../lib/gis/exportEngine';
import { computeAccessibilityAnalysis } from '../../lib/gis/accessibilityEngine';
import { computeNlpSpatialAnalysis } from '../../lib/gis/reviewNlpSpatialEngine';
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
      const result = computeAccessibilityAnalysis(hexes, busStops, parkCenter, manifest?.roadStats || null);
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Feature Inspector</span>
                  <button onClick={() => setSelectedFeature(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                  {Object.entries(selectedFeature).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
                      <span className="text-slate-400 font-mono truncate">{k}</span>
                      <span className="text-slate-700 font-semibold truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
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
