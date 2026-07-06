import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { ParkDetails } from '../../lib/googlePlaces';
import { GIS_LAYERS, computePerParkLayerMetrics, type GisLayerId } from '../../lib/analytics/gisMetrics';
import { SectionCard } from '../ui/SectionCard';

function hexToRgb(hex: string) {
  const v = hex.replace('#', '');
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

function interpolateColor(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function colorForNormalized(n: number): string {
  if (n < 0.5) return interpolateColor('#94a3b8', '#6366f1', n / 0.5);
  return interpolateColor('#6366f1', '#f43f5e', (n - 0.5) / 0.5);
}

export function GisLayerMap({
  reviewsByPark,
  selectedParks
}: {
  reviewsByPark: Record<string, NLPAnalyzedReview[]>;
  selectedParks: ParkDetails[];
}) {
  const [layer, setLayer] = useState<GisLayerId>('reviewDensity');
  const layerDef = GIS_LAYERS.find(l => l.id === layer)!;

  const metrics = useMemo(() => computePerParkLayerMetrics(reviewsByPark, layer), [reviewsByPark, layer]);

  return (
    <SectionCard
      icon={Layers}
      title="GIS Analytics Layers"
      action={
        <select
          value={layer}
          onChange={e => setLayer(e.target.value as GisLayerId)}
          className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white"
        >
          {GIS_LAYERS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      }
    >
      <p className="text-[9px] text-slate-500 mb-2">{layerDef.description}</p>
      <div className="h-[380px] rounded overflow-hidden border border-slate-200 relative z-0">
        <MapContainer center={[25.18, 55.26]} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors & CARTO'
          />
          {selectedParks.map(park => {
            const m = metrics[park.placeId];
            const normalized = m?.normalized ?? 0;
            const color = colorForNormalized(normalized);
            const radius = 8 + normalized * 14;
            return (
              <CircleMarker
                key={park.placeId}
                center={[park.lat, park.lng]}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}
                radius={radius}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                  <div className="font-bold text-xs">{park.name}</div>
                  <div className="text-[10px]">{layerDef.label}: {m ? m.value.toFixed(1) : '0'}</div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="flex items-center justify-end gap-2 mt-2 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
        <span>Low</span>
        <div className="w-24 h-1.5 rounded-full" style={{ background: 'linear-gradient(to right, #94a3b8, #6366f1, #f43f5e)' }} />
        <span>High</span>
      </div>
    </SectionCard>
  );
}
