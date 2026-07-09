import { useEffect, useMemo, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  Hand, MousePointer2, Ruler, CircleDot, MapPin, Hexagon, Square, CircleIcon as CircleGlyph,
  Download, Camera, Map as MapIcon
} from 'lucide-react';
import { distance as turfDistance, buffer as turfBuffer } from '@turf/turf';
import { DATASET_CATEGORIES, type RenderMode } from './layerConfig';
import { fetchGisLayer } from '../../lib/gis/gisEngine';
import { downloadGeoJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import type { GeoJsonFeatureCollection, GisManifest } from '../../lib/gis/types';
import type { NlpSpatialAnalysisResult } from '../../lib/gis/reviewNlpSpatialEngine';
import { SectionCard } from '../ui/SectionCard';

export type PlaygroundTool = 'pan' | 'select' | 'measure' | 'buffer' | 'draw-point' | 'draw-polygon' | 'draw-rectangle' | 'draw-circle';

const TOOLS: { id: PlaygroundTool; label: string; icon: any }[] = [
  { id: 'pan', label: 'Pan', icon: Hand },
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'measure', label: 'Measure', icon: Ruler },
  { id: 'buffer', label: 'Buffer', icon: CircleDot },
  { id: 'draw-point', label: 'Point', icon: MapPin },
  { id: 'draw-polygon', label: 'Polygon', icon: Hexagon },
  { id: 'draw-rectangle', label: 'Rectangle', icon: Square },
  { id: 'draw-circle', label: 'Circle', icon: CircleGlyph }
];

const BASEMAPS = [
  { id: 'light', label: 'Light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' },
  { id: 'dark', label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
  { id: 'voyager', label: 'Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' }
];

const CHOROPLETH_STOPS = ['#e0e7ff', '#a5b4fc', '#818cf8', '#6366f1', '#4338ca'];

function choroplethColor(value: number, min: number, max: number): string {
  if (max === min) return CHOROPLETH_STOPS[2];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = Math.min(CHOROPLETH_STOPS.length - 1, Math.floor(t * CHOROPLETH_STOPS.length));
  return CHOROPLETH_STOPS[idx];
}

const RI_CATEGORY_MAP: Record<string, string> = {
  'ri-shade': 'shade / heat comfort',
  'ri-playground': 'playground',
  'ri-maintenance': 'maintenance',
  'ri-accessibility': 'accessibility',
  'ri-toilets': 'toilets',
  'ri-water': 'water features',
  'ri-security': 'safety',
  'ri-parking': 'parking'
};

interface RenderLayer {
  key: string;
  layerKey: string;
  renderMode: RenderMode;
  color: string;
  opacity: number;
  highwayFilter?: string[];
  choroplethField?: string;
  label: string;
}

function ScaleControlWidget() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ position: 'bottomleft', imperial: false });
    control.addTo(map);
    return () => { control.remove(); };
  }, [map]);
  return null;
}

function ViewportWatcher({ onChange }: { onChange: (bbox: [number, number, number, number]) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    }
  });
  useEffect(() => {
    const b = map.getBounds();
    onChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }, [map]);
  return null;
}

function DrawController({
  activeTool,
  bufferRadiusM,
  onFeatureCreated,
  onMeasureUpdate
}: {
  activeTool: PlaygroundTool;
  bufferRadiusM: number;
  onFeatureCreated: (feature: GeoJSON.Feature) => void;
  onMeasureUpdate: (distanceM: number | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    let handler: any = null;
    const measurePoints: L.LatLng[] = [];
    let measureLine: L.Polyline | null = null;

    function stopAll() {
      if (handler && handler.disable) handler.disable();
      if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
      measurePoints.length = 0;
      onMeasureUpdate(null);
    }

    function onDrawCreated(e: any) {
      const layer = e.layer;
      const geojson = layer.toGeoJSON();
      onFeatureCreated(geojson);
    }

    function onMapClickForMeasure(e: L.LeafletMouseEvent) {
      measurePoints.push(e.latlng);
      if (measureLine) map.removeLayer(measureLine);
      measureLine = L.polyline(measurePoints, { color: '#6366f1', dashArray: '4 4' }).addTo(map);
      if (measurePoints.length >= 2) {
        let total = 0;
        for (let i = 1; i < measurePoints.length; i++) {
          total += turfDistance(
            [measurePoints[i - 1].lng, measurePoints[i - 1].lat],
            [measurePoints[i].lng, measurePoints[i].lat],
            { units: 'meters' }
          );
        }
        onMeasureUpdate(total);
      }
    }

    function onMapClickForBuffer(e: L.LeafletMouseEvent) {
      const point = { type: 'Point' as const, coordinates: [e.latlng.lng, e.latlng.lat] };
      const buffered = turfBuffer({ type: 'Feature', geometry: point, properties: {} }, bufferRadiusM / 1000, { units: 'kilometers' });
      if (buffered) onFeatureCreated(buffered as GeoJSON.Feature);
    }

    map.on('draw:created', onDrawCreated);

    if (activeTool === 'draw-point') {
      handler = new (L as any).Draw.Marker(map);
      handler.enable();
    } else if (activeTool === 'draw-polygon') {
      handler = new (L as any).Draw.Polygon(map, { showArea: true });
      handler.enable();
    } else if (activeTool === 'draw-rectangle') {
      handler = new (L as any).Draw.Rectangle(map);
      handler.enable();
    } else if (activeTool === 'draw-circle') {
      handler = new (L as any).Draw.Circle(map);
      handler.enable();
    } else if (activeTool === 'measure') {
      map.on('click', onMapClickForMeasure);
    } else if (activeTool === 'buffer') {
      map.on('click', onMapClickForBuffer);
    }

    return () => {
      map.off('draw:created', onDrawCreated);
      map.off('click', onMapClickForMeasure);
      map.off('click', onMapClickForBuffer);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, map, bufferRadiusM]);

  return null;
}

export function PlaygroundMap({
  activeLayers,
  layerOpacity,
  parkCenter,
  manifest,
  nlpSpatial,
  activeTool,
  onToolChange,
  drawnFeatures,
  onDrawnFeaturesChange,
  onFeatureSelect,
  containerRef
}: {
  activeLayers: Set<string>;
  layerOpacity: Record<string, number>;
  parkCenter: { lat: number; lng: number };
  manifest: GisManifest | null;
  nlpSpatial: NlpSpatialAnalysisResult | null;
  activeTool: PlaygroundTool;
  onToolChange: (tool: PlaygroundTool) => void;
  drawnFeatures: GeoJSON.Feature[];
  onDrawnFeaturesChange: (features: GeoJSON.Feature[]) => void;
  onFeatureSelect: (props: Record<string, any> | null) => void;
  containerRef: RefObject<HTMLDivElement>;
}) {
  const [layerData, setLayerData] = useState<Record<string, GeoJsonFeatureCollection>>({});
  const [viewportBbox, setViewportBbox] = useState<[number, number, number, number] | null>(null);
  const [viewportTruncated, setViewportTruncated] = useState(false);
  const [basemap, setBasemap] = useState(BASEMAPS[0].id);
  const [bufferRadius, setBufferRadius] = useState(200);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);

  const renderLayers = useMemo(() => {
    const map = new Map<string, RenderLayer>();
    DATASET_CATEGORIES.forEach(cat => cat.layers.forEach(l => {
      if (l.dataStatus !== 'real' || !l.layerKey || !l.renderMode || l.renderMode === 'marker') return;
      if (!activeLayers.has(l.id)) return;
      const key = `${l.layerKey}-${l.renderMode}-${(l.highwayFilter || []).join('|')}-${l.choroplethField || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key, layerKey: l.layerKey, renderMode: l.renderMode,
          color: l.color, opacity: layerOpacity[l.id] ?? 0.8,
          highwayFilter: l.highwayFilter, choroplethField: l.choroplethField, label: l.label
        });
      }
    }));
    return [...map.values()];
  }, [activeLayers, layerOpacity]);

  const activeRiRows = useMemo(
    () => DATASET_CATEGORIES.find(c => c.id === 'review-intelligence')!.layers.filter(l => activeLayers.has(l.id)),
    [activeLayers]
  );

  const eagerKeys = useMemo(() => [...new Set(renderLayers.map(r => r.layerKey))].filter(k => k !== 'buildings' && k !== 'roads'), [renderLayers]);
  const gatedKeys = useMemo(() => [...new Set(renderLayers.map(r => r.layerKey))].filter(k => k === 'buildings' || k === 'roads'), [renderLayers]);

  useEffect(() => {
    eagerKeys.forEach(key => {
      if (!layerData[key]) {
        fetchGisLayer(key).then(fc => { if (fc) setLayerData(prev => ({ ...prev, [key]: fc })); });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eagerKeys.join(',')]);

  useEffect(() => {
    if (!viewportBbox || gatedKeys.length === 0) return;
    let cancelled = false;
    Promise.all(gatedKeys.map(key => fetchGisLayer(key, viewportBbox))).then(results => {
      if (cancelled) return;
      let anyTruncated = false;
      setLayerData(prev => {
        const next = { ...prev };
        results.forEach((fc, i) => {
          if (fc) {
            if (fc.truncated) anyTruncated = true;
            next[gatedKeys[i]] = fc;
          }
        });
        return next;
      });
      setViewportTruncated(anyTruncated);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportBbox?.join(','), gatedKeys.join(',')]);

  const choroplethRange = useCallback((layerKey: string, field: string): [number, number] => {
    const fc = layerData[layerKey];
    if (!fc || fc.features.length === 0) return [0, 1];
    const values = fc.features.map(f => Number(f.properties[field]) || 0);
    return [Math.min(...values), Math.max(...values)];
  }, [layerData]);

  const handleFeatureCreated = useCallback((feature: GeoJSON.Feature) => {
    onDrawnFeaturesChange([...drawnFeatures, feature]);
    onToolChange('pan');
  }, [drawnFeatures, onDrawnFeaturesChange, onToolChange]);

  function filterByHighway(fc: GeoJsonFeatureCollection, highwayFilter?: string[]): GeoJsonFeatureCollection {
    if (!highwayFilter) return fc;
    return {
      ...fc,
      features: fc.features.filter(f => {
        const hw = f.properties.highway;
        return highwayFilter.some(h => String(hw).includes(h));
      })
    };
  }

  return (
    <SectionCard
      icon={MapIcon}
      title="Interactive GIS Map"
      action={
        <select value={basemap} onChange={e => setBasemap(e.target.value)} className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white">
          {BASEMAPS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      }
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
            className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${
              activeTool === tool.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <tool.icon className="w-3 h-3" />
            <span className="hidden lg:inline">{tool.label}</span>
          </button>
        ))}
        {activeTool === 'buffer' && (
          <input
            type="number"
            value={bufferRadius}
            onChange={e => setBufferRadius(Number(e.target.value))}
            className="w-16 text-[9px] border border-slate-200 rounded px-1 py-1"
            title="Buffer radius (m)"
          />
        )}
        <div className="flex-1" />
        <button
          onClick={() => downloadGeoJson({ type: 'FeatureCollection', features: drawnFeatures as any }, 'playground_drawn_features.geojson')}
          disabled={drawnFeatures.length === 0}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <Download className="w-3 h-3" /> Export
        </button>
        <button
          onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'playground_map.png')}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Camera className="w-3 h-3" /> Screenshot
        </button>
      </div>

      {measureDistance !== null && (
        <div className="mb-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 inline-block">
          Distance: {measureDistance >= 1000 ? `${(measureDistance / 1000).toFixed(2)} km` : `${Math.round(measureDistance)} m`}
        </div>
      )}
      {viewportTruncated && (
        <div className="mb-1.5 text-[9px] font-bold text-amber-600">Too many features in view -- zoom in to see individual buildings/roads.</div>
      )}

      <div ref={containerRef} className="h-[560px] rounded overflow-hidden border border-slate-200 relative z-0">
        <MapContainer center={[parkCenter.lat, parkCenter.lng]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={BASEMAPS.find(b => b.id === basemap)!.url} attribution="&copy; OpenStreetMap contributors & CARTO" />
          <ScaleControlWidget />
          <ViewportWatcher onChange={setViewportBbox} />
          <DrawController
            activeTool={activeTool}
            bufferRadiusM={bufferRadius}
            onFeatureCreated={handleFeatureCreated}
            onMeasureUpdate={setMeasureDistance}
          />

          {renderLayers.map(layer => {
            const fc = layerData[layer.layerKey];
            if (!fc) return null;

            if (layer.renderMode === 'choropleth' && layer.choroplethField) {
              const [min, max] = choroplethRange(layer.layerKey, layer.choroplethField);
              return (
                <LeafletGeoJSON
                  key={`${layer.key}-${fc.features.length}`}
                  data={fc as any}
                  style={(feature: any) => ({
                    color: '#4338ca',
                    weight: 1,
                    fillColor: choroplethColor(Number(feature.properties[layer.choroplethField!]) || 0, min, max),
                    fillOpacity: layer.opacity
                  })}
                  onEachFeature={(feature, leafletLayer) => {
                    leafletLayer.on('click', () => onFeatureSelect(feature.properties));
                  }}
                />
              );
            }

            if (layer.renderMode === 'pointChoropleth' && layer.choroplethField) {
              const [min, max] = choroplethRange(layer.layerKey, layer.choroplethField);
              return (
                <div key={layer.key}>
                  {fc.features.map((f, i) => {
                    if (f.geometry.type !== 'Point') return null;
                    const coords = f.geometry.coordinates as [number, number];
                    const value = Number(f.properties[layer.choroplethField!]) || 0;
                    const color = choroplethColor(value, min, max);
                    return (
                      <CircleMarker
                        key={i}
                        center={[coords[1], coords[0]]}
                        radius={3}
                        pathOptions={{ color, fillColor: color, fillOpacity: layer.opacity, weight: 0.5 }}
                        eventHandlers={{ click: () => onFeatureSelect(f.properties) }}
                      />
                    );
                  })}
                </div>
              );
            }

            if (layer.renderMode === 'polygons') {
              return (
                <LeafletGeoJSON
                  key={`${layer.key}-${fc.features.length}`}
                  data={fc as any}
                  style={{ color: layer.color, weight: 1, fillColor: layer.color, fillOpacity: layer.opacity * 0.5 }}
                  onEachFeature={(feature, leafletLayer) => {
                    leafletLayer.on('click', () => onFeatureSelect(feature.properties));
                  }}
                />
              );
            }

            if (layer.renderMode === 'lines') {
              const filtered = filterByHighway(fc, layer.highwayFilter);
              return (
                <LeafletGeoJSON
                  key={`${layer.key}-${filtered.features.length}`}
                  data={filtered as any}
                  style={{ color: layer.color, weight: layer.highwayFilter ? 2.5 : 1.2, opacity: layer.opacity }}
                  onEachFeature={(feature, leafletLayer) => {
                    leafletLayer.on('click', () => onFeatureSelect(feature.properties));
                  }}
                />
              );
            }

            if (layer.renderMode === 'points') {
              return (
                <div key={layer.key}>
                  {fc.features.map((f, i) => {
                    const coords = f.geometry.coordinates as [number, number];
                    if (f.geometry.type !== 'Point') return null;
                    return (
                      <CircleMarker
                        key={i}
                        center={[coords[1], coords[0]]}
                        radius={4}
                        pathOptions={{ color: layer.color, fillColor: layer.color, fillOpacity: layer.opacity, weight: 1 }}
                        eventHandlers={{ click: () => onFeatureSelect(f.properties) }}
                      >
                        {f.properties.name && <Tooltip>{f.properties.name}</Tooltip>}
                      </CircleMarker>
                    );
                  })}
                </div>
              );
            }
            return null;
          })}

          {activeRiRows.length > 0 && nlpSpatial && (
            <Marker position={[parkCenter.lat, parkCenter.lng]}>
              <Popup>
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">Review Intelligence</p>
                  <p className="text-[10px] text-slate-500 mb-1">{nlpSpatial.note}</p>
                  {activeRiRows.map(row => {
                    if (row.id === 'ri-sentiment') return <div key={row.id}>Sentiment score: {nlpSpatial.overallSentimentScore}/100</div>;
                    const category = RI_CATEGORY_MAP[row.id];
                    const match = nlpSpatial.topComplaintCategories.find(c => c.category === category);
                    return <div key={row.id}>{row.label}: {match ? `${match.mentions} mentions (${match.priority})` : '0 mentions'}</div>;
                  })}
                </div>
              </Popup>
            </Marker>
          )}

          {drawnFeatures.map((f, i) => (
            <LeafletGeoJSON key={`drawn-${i}`} data={f as any} style={{ color: '#4338ca', weight: 2, dashArray: '4 4', fillOpacity: 0.1 }} />
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      {(renderLayers.length > 0 || activeRiRows.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-2 text-[9px] text-slate-500">
          {renderLayers.map(l => (
            <span key={l.key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
          {activeRiRows.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block bg-indigo-600" />
              Review Intelligence (park marker)
            </span>
          )}
        </div>
      )}
    </SectionCard>
  );
}
