import { useEffect, useMemo, useState } from 'react';
import { GeoJSON as LeafletGeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { bbox as turfBbox, centroid as turfCentroid, featureCollection } from '@turf/turf';
import { Layers } from 'lucide-react';
import type { Feature, Polygon } from 'geojson';
import type { SiteGridCell } from '../../lib/gis/siteGrid';
import type { OpportunityResult, OpportunityType } from '../../lib/gis/opportunityEngine';
import { SectionCard } from '../ui/SectionCard';

const BASEMAP_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

type MovementTopology = 'program_network' | 'closed_loop' | 'network_attribute' | 'service_spur';

const MOVEMENT_LAYERS: Array<{ id: OpportunityType; label: string; color: string; rhinoLayer: string; radialBand: number; topology: MovementTopology; requirement: string; sampleCount: number }> = [
  { id: 'walkingPromenade', label: 'Walking promenade', color: '#10b981', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Walking Promenade', radialBand: 0.45, topology: 'program_network', requirement: '1 weighted network', sampleCount: 12 },
  { id: 'joggingLoop', label: 'Jogging loop', color: '#f43f5e', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Jogging Loop', radialBand: 0.76, topology: 'closed_loop', requirement: '1 loop · ≈1 km', sampleCount: 14 },
  { id: 'exerciseCyclingLoop', label: 'Exercise cycling loop', color: '#0ea5e9', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Exercise Cycling Loop', radialBand: 0.96, topology: 'closed_loop', requirement: '1 distinct loop', sampleCount: 16 },
  { id: 'accessibleRoutes', label: 'Accessible coverage', color: '#22c55e', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Accessible Routes', radialBand: 0.4, topology: 'network_attribute', requirement: 'walking segments', sampleCount: 10 },
  { id: 'shadedCirculation', label: 'Shade priority', color: '#8b5cf6', rhinoLayer: 'PARK_DESIGN_GIS::Movement::Shaded Circulation', radialBand: 0.48, topology: 'network_attribute', requirement: 'weighted segments', sampleCount: 10 },
  { id: 'serviceAccess', label: 'Service access', color: '#f59e0b', rhinoLayer: 'PARK_DESIGN_GIS::Service::Service Access', radialBand: 1, topology: 'service_spur', requirement: '1–2 spurs', sampleCount: 2 }
];

function distributedMovementCells(
  opportunity: OpportunityResult | undefined,
  cellById: Map<string, SiteGridCell>,
  parkCenter: { lat: number; lng: number },
  radialBand: number,
  topology: MovementTopology,
  count = 15
) {
  const candidates = (opportunity?.allCells ?? [])
    .filter(score => !score.avoided)
    .map(score => {
      const cell = cellById.get(score.h3Id);
      if (!cell) return null;
      const [lng, lat] = turfCentroid(cell as any).geometry.coordinates as [number, number];
      return { score, cell, lng, lat };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  if (candidates.length <= count) return candidates;

  const maximumRadius = Math.max(...candidates.map(candidate => Math.hypot(candidate.lng - parkCenter.lng, candidate.lat - parkCenter.lat)), 1e-9);
  const minimumOpportunity = Math.min(...candidates.map(candidate => candidate.score.opportunityScore));
  const maximumOpportunity = Math.max(...candidates.map(candidate => candidate.score.opportunityScore));
  const opportunityRange = Math.max(1, maximumOpportunity - minimumOpportunity);
  const selected: typeof candidates = [];
  const remaining = [...candidates];
  if (topology === 'closed_loop') {
    for (let sector = 0; sector < count; sector++) {
      const sectorCandidates = remaining.filter(candidate => {
        const angle = (Math.atan2(candidate.lat - parkCenter.lat, candidate.lng - parkCenter.lng) + Math.PI * 2) % (Math.PI * 2);
        return Math.floor(angle / (Math.PI * 2) * count) === sector;
      });
      if (!sectorCandidates.length) continue;
      const best = sectorCandidates.map(candidate => {
        const normalizedOpportunity = (candidate.score.opportunityScore - minimumOpportunity) / opportunityRange;
        const normalizedRadius = Math.hypot(candidate.lng - parkCenter.lng, candidate.lat - parkCenter.lat) / maximumRadius;
        const bandFit = 1 - Math.min(1, Math.abs(normalizedRadius - radialBand) / 0.3);
        return { candidate, rank: 0.55 * normalizedOpportunity + 0.45 * bandFit };
      }).sort((a, b) => b.rank - a.rank || a.candidate.score.h3Id.localeCompare(b.candidate.score.h3Id))[0].candidate;
      selected.push(best);
      remaining.splice(remaining.findIndex(candidate => candidate.score.h3Id === best.score.h3Id), 1);
    }
  }
  while (selected.length < count && remaining.length > 0) {
    const ranked = remaining.map(candidate => {
      const normalizedOpportunity = (candidate.score.opportunityScore - minimumOpportunity) / opportunityRange;
      const normalizedRadius = Math.hypot(candidate.lng - parkCenter.lng, candidate.lat - parkCenter.lat) / maximumRadius;
      const bandFit = 1 - Math.min(1, Math.abs(normalizedRadius - radialBand) / 0.45);
      const spread = selected.length === 0 ? 0.5 : Math.min(1, Math.min(...selected.map(other =>
        Math.hypot(candidate.lng - other.lng, candidate.lat - other.lat))) / (maximumRadius * 0.55));
      return { candidate, rank: 0.5 * normalizedOpportunity + 0.25 * bandFit + 0.25 * spread };
    }).sort((a, b) => b.rank - a.rank || a.candidate.score.h3Id.localeCompare(b.candidate.score.h3Id));
    const best = ranked[0].candidate;
    selected.push(best);
    remaining.splice(remaining.findIndex(candidate => candidate.score.h3Id === best.score.h3Id), 1);
  }
  return selected;
}

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
  const routeCenter = useMemo(() => {
    const [lng, lat] = turfCentroid(parkBoundary).geometry.coordinates as [number, number];
    return { lng, lat };
  }, [parkBoundary]);

  const rendered = useMemo(() => MOVEMENT_LAYERS.map(definition => {
    const opportunity = opportunityById.get(definition.id);
    const features = distributedMovementCells(opportunity, cellById, routeCenter, definition.radialBand, definition.topology, definition.sampleCount)
      .map(({ cell, score }) => ({ ...cell, properties: { ...cell.properties, ...score, movement_layer: definition.label, movement_color: definition.color, rhino_layer: definition.rhinoLayer } }));
    return { ...definition, opportunity, data: featureCollection(features as any) };
  }), [cellById, opportunityById, routeCenter]);
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
        These are topology-aware suitability samples—not final centerlines. Walking forms an interior network between program spaces; jogging and cycling form distinct closed loops.
        Accessibility and shade modify eligible walking segments, while service access is a dedicated entrance-to-operations spur.
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
            <span className="font-normal normal-case text-slate-400">{layer.requirement}</span>
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
