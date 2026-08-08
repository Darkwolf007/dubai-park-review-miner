import { useEffect, useMemo, useState } from 'react';
import { GeoJSON as LeafletGeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { bbox as turfBbox, featureCollection } from '@turf/turf';
import { Layers } from 'lucide-react';
import type { Feature, Polygon } from 'geojson';
import type { SiteGridCell } from '../../lib/gis/siteGrid';
import type { OpportunityResult, OpportunityType } from '../../lib/gis/opportunityEngine';
import { SectionCard } from '../ui/SectionCard';

const BASEMAP_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const MOVEMENT_LAYERS: Array<{ id: OpportunityType; label: string; color: string; rhinoLayer: string }> = [
  { id: 'walkingPromenade', label: 'Walking promenade', color: '#10b981', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Walking Promenade' },
  { id: 'joggingLoop', label: 'Jogging loop', color: '#f43f5e', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Jogging Loop' },
  { id: 'exerciseCyclingLoop', label: 'Exercise cycling loop', color: '#0ea5e9', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Exercise Cycling Loop' },
  { id: 'accessibleRoutes', label: 'Accessible routes', color: '#22c55e', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Accessible Routes' },
  { id: 'shadedCirculation', label: 'Shaded circulation', color: '#8b5cf6', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Shaded Circulation' },
  { id: 'serviceAccess', label: 'Service access', color: '#f59e0b', rhinoLayer: 'PARK_DESIGN_GIS::Service::Service Access' }
];

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 }); }, [bounds, map]);
  return null;
}

export function MovementGisOverlay({
  siteGrid,
  opportunities,
  parkBoundary,
  parkCenter
}: {
  siteGrid: SiteGridCell[];
  opportunities: OpportunityResult[];
  parkBoundary: Feature<Polygon>;
  parkCenter: { lat: number; lng: number };
}) {
  const [active, setActive] = useState<Set<OpportunityType>>(new Set(['joggingLoop', 'exerciseCyclingLoop']));
  const cellById = useMemo(() => new Map(siteGrid.map(cell => [cell.properties.h3_id, cell])), [siteGrid]);
  const opportunityById = useMemo(() => new Map(opportunities.map(item => [item.type, item])), [opportunities]);
  const bounds = useMemo(() => {
    const [minX, minY, maxX, maxY] = turfBbox(parkBoundary);
    return [[minY, minX], [maxY, maxX]] as LatLngBoundsExpression;
  }, [parkBoundary]);

  const rendered = useMemo(() => MOVEMENT_LAYERS.map(definition => {
    const opportunity = opportunityById.get(definition.id);
    const features = opportunity?.topCells
      .filter(score => !score.avoided)
      .map(score => {
        const cell = cellById.get(score.h3Id);
        return cell ? { ...cell, properties: { ...cell.properties, ...score, movement_layer: definition.label, movement_color: definition.color, rhino_layer: definition.rhinoLayer } } : null;
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null) ?? [];
    return { ...definition, opportunity, data: featureCollection(features as any) };
  }), [cellById, opportunityById]);
  const activeData = useMemo(() => featureCollection(
    rendered.filter(layer => active.has(layer.id)).flatMap(layer => layer.data.features) as any
  ), [active, rendered]);

  function toggle(id: OpportunityType) {
    setActive(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <SectionCard icon={Layers} title="Movement GIS Overlay Layers">
      <p className="text-[9px] text-slate-500 leading-relaxed mb-2">
        These colored cells are GIS suitability corridors exported to Grasshopper—not final loop centerlines.
        Rhino generates the conceptual centerlines, then terrain and Wallacei optimization resolve their geometry.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {rendered.map(layer => (
          <button
            key={layer.id}
            onClick={() => toggle(layer.id)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[8px] font-bold uppercase tracking-wide ${active.has(layer.id) ? 'border-slate-500 bg-slate-50 text-slate-700' : 'border-slate-200 bg-white text-slate-400'}`}
            title={layer.rhinoLayer}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: layer.color, opacity: active.has(layer.id) ? 1 : 0.25 }} />
            {layer.label}
            <span className="font-mono font-normal">{layer.data.features.length}</span>
          </button>
        ))}
      </div>
      <div className="h-[380px] overflow-hidden rounded border border-slate-200 relative z-0">
        <MapContainer center={[parkCenter.lat, parkCenter.lng]} zoom={18} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={BASEMAP_URL} attribution="&copy; OpenStreetMap contributors & CARTO" />
          <FitBounds bounds={bounds} />
          <LeafletGeoJSON
            data={parkBoundary as any}
            style={{ color: '#0f172a', weight: 2, fillOpacity: 0.02 }}
          />
          <LeafletGeoJSON
            key={[...active].sort().join('-')}
            data={activeData as any}
            style={(feature: any) => ({
              color: feature?.properties?.movement_color ?? '#64748b',
              weight: 1.5,
              fillColor: feature?.properties?.movement_color ?? '#64748b',
              fillOpacity: 0.35 + 0.4 * ((feature?.properties?.opportunityScore ?? 0) / 100)
            })}
            onEachFeature={(feature: any, leafletLayer) => {
              const properties = feature.properties;
              leafletLayer.bindTooltip(
                `<div style="font-size:10px"><b>${properties.movement_layer}</b><br/>Opportunity ${properties.opportunityScore}/100<br/>Suitability ${properties.suitabilityScore}/100<br/><span style="font-family:monospace">${properties.rhino_layer}</span></div>`,
                { sticky: true }
              );
            }}
          />
        </MapContainer>
      </div>
      <div className="mt-2 grid gap-1 text-[8px] text-slate-500 md:grid-cols-2">
        {rendered.map(layer => (
          <div key={layer.id} className="truncate font-mono" title={layer.rhinoLayer}>
            <span style={{ color: layer.color }}>■</span> {layer.rhinoLayer}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
