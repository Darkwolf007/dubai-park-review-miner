import { useEffect, useMemo, useState } from 'react';
import * as turf from '@turf/turf';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { MapPin, Maximize2, Minimize2 } from 'lucide-react';
import type { SiteGridCell } from '../../lib/gis/siteGrid';
import type { OpportunityResult, OpportunityCellScore } from '../../lib/gis/opportunityEngine';
import type { H3Feature } from '../../lib/gis/types';
import { SectionCard } from '../ui/SectionCard';
import { InfoTooltip } from '../ui/InfoTooltip';

const BASEMAP_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const SCORE_COLORS = {
  low: '#e2e8f0', // slate-200
  medium: '#fde68a', // amber-200
  high: '#fb923c', // orange-400
  critical: '#e11d48' // rose-600
};
const AVOIDED_COLOR = '#94a3b8'; // slate-400, muted/hatched treatment
const TOP_RANK_STROKE = '#4338ca'; // indigo-700

function colorForScore(score: number): string {
  if (score >= 75) return SCORE_COLORS.critical;
  if (score >= 55) return SCORE_COLORS.high;
  if (score >= 30) return SCORE_COLORS.medium;
  return SCORE_COLORS.low;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Synthesizes 2-3 "why this cell" lines from raw site-grid fields already on the merged feature,
 * picked by matching the selected program's own attractor/repeller labels -- a presentation-layer
 * join of two things that already exist per cell, not a new engine output. */
function buildSignalLines(props: Record<string, any>, selected: OpportunityResult): string[] {
  const lines: string[] = [];
  const roadDensity = props.real_road_density_m_per_km2 ?? 0;
  const green = props.green_coverage_pct ?? 0;
  const building = props.building_coverage_pct ?? 0;
  const attractors = selected.grasshopperInputs.attractors;
  const repellers = selected.grasshopperInputs.repellers;
  if ([...attractors, ...repellers].some(a => /road|route|path|connectivity|boundary|edge|perimeter/i.test(a))) {
    lines.push(`Road/path density ${Math.round(roadDensity).toLocaleString()} m/km²`);
  }
  if ([...attractors, ...repellers].some(a => /green|biodivers|shade|tree|canopy/i.test(a))) {
    lines.push(`Green coverage ${Math.round(green)}%`);
  }
  if ([...attractors, ...repellers].some(a => /building|develop|activity|facility/i.test(a))) {
    lines.push(`Building coverage ${Math.round(building)}%`);
  }
  if (lines.length === 0) {
    lines.push(`Road density ${Math.round(roadDensity).toLocaleString()} m/km² · Green ${Math.round(green)}% · Building ${Math.round(building)}%`);
  }
  return lines.slice(0, 3);
}

function buildTooltipHtml(props: Record<string, any>, selected: OpportunityResult): string {
  const signals = buildSignalLines(props, selected);
  const avoidLine = props.avoided
    ? `<div style="color:#e11d48;font-weight:700;margin-top:3px;">Avoided / constrained${props.avoidReason ? `: ${escapeHtml(props.avoidReason)}` : ''}</div>`
    : '';
  return `
    <div style="font-size:10px;line-height:1.5;min-width:190px;max-width:240px;">
      <div style="font-weight:700;font-family:monospace;color:#1e1b4b;">${escapeHtml(props.h3Id)}</div>
      <div style="font-weight:700;color:#4338ca;">${escapeHtml(selected.name)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 8px;margin-top:4px;color:#334155;">
        <span>Opportunity <b>${props.opportunityScore}</b></span>
        <span>Demand <b>${props.demandScore}</b></span>
        <span>Suitability <b>${props.suitabilityScore}</b></span>
        <span>Feasibility <b>${props.feasibilityScore}</b></span>
      </div>
      <div style="margin-top:3px;color:#64748b;">Confidence (program-level) <b>${selected.confidenceScore}</b>/100</div>
      ${avoidLine}
      <div style="margin-top:4px;padding-top:3px;border-top:1px solid #e2e8f0;color:#475569;">
        ${signals.map(s => `&bull; ${escapeHtml(s)}`).join('<br/>')}
      </div>
    </div>
  `;
}

function boundsFromFeatures(features: { type: 'Feature'; geometry: any; properties: any }[]): LatLngBoundsExpression | null {
  if (features.length === 0) return null;
  try {
    const [minX, minY, maxX, maxY] = turf.bbox({ type: 'FeatureCollection', features } as any);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return [
      [minY, minX],
      [maxY, maxX]
    ];
  } catch {
    return null;
  }
}

/** Drives the map's viewport imperatively whenever `bounds` changes (e.g. the wide-context toggle),
 * since react-leaflet's MapContainer `bounds` prop only applies on initial mount. */
function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
  }, [bounds, map]);
  return null;
}

export function OpportunitySuitabilityMap({
  siteGrid,
  selected,
  parkCenter,
  activeCellId,
  onCellClick,
  hexes
}: {
  siteGrid: SiteGridCell[];
  selected: OpportunityResult;
  parkCenter: { lat: number; lng: number };
  activeCellId: string | null;
  onCellClick: (cell: OpportunityCellScore) => void;
  /** Full 5km study-area hex set -- optional, only needed to power the explicit "wider view" toggle.
   * The map defaults to (and always returns to) the park-only view without it. */
  hexes?: H3Feature[];
}) {
  const [wideView, setWideView] = useState(false);
  const scoreByCell = useMemo(() => new Map(selected.allCells.map(c => [c.h3Id, c])), [selected]);
  const topRankIds = useMemo(() => new Set(selected.topCells.slice(0, 5).map(c => c.h3Id)), [selected]);

  const featureCollection = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: siteGrid
      .map(cell => {
        const score = scoreByCell.get(cell.properties.h3_id);
        if (!score) return null;
        return { ...cell, properties: { ...cell.properties, ...score } };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
  }), [siteGrid, scoreByCell]);

  const parkBounds = useMemo(() => boundsFromFeatures(featureCollection.features as any), [featureCollection]);
  const wideBounds = useMemo(() => (hexes && hexes.length > 0 ? boundsFromFeatures(hexes as any) : null), [hexes]);
  const activeBounds = wideView && wideBounds ? wideBounds : parkBounds;

  return (
    <SectionCard
      icon={MapPin}
      title={`Suitability Map -- ${selected.name}`}
      action={
        hexes && hexes.length > 0 ? (
          <button
            onClick={() => setWideView(v => !v)}
            className="flex items-center gap-1 px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded border bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
            title={wideView ? 'Return to the Al Safa 2 Park view' : 'Show the wider 5km study-area context'}
          >
            {wideView ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {wideView ? 'Park view' : '5km context'}
          </button>
        ) : undefined
      }
    >
      <p className="text-[9px] text-slate-500 mb-2">
        Each cell is one of the {siteGrid.length} real 10m cells inside the park boundary, colored by opportunity score for
        the selected program. Indigo outline = top 5 candidate cells. The map is fit to Al Safa 2 Park's own boundary by
        default -- click "5km context" to see the wider study area. Click any cell to inspect its scores.
      </p>
      <div className="h-[380px] rounded overflow-hidden border border-slate-200 relative z-0">
        <MapContainer
          bounds={parkBounds ?? undefined}
          center={[parkCenter.lat, parkCenter.lng]}
          zoom={17}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={BASEMAP_URL} attribution="&copy; OpenStreetMap contributors & CARTO" />
          <FitToBounds bounds={activeBounds} />
          <LeafletGeoJSON
            key={`${selected.type}-${featureCollection.features.length}`}
            data={featureCollection as any}
            style={(feature: any) => {
              const props = feature.properties as OpportunityCellScore;
              const isTop = topRankIds.has(props.h3Id);
              const isActive = activeCellId === props.h3Id;
              return {
                color: isActive ? '#0f172a' : isTop ? TOP_RANK_STROKE : '#94a3b8',
                weight: isActive ? 2.5 : isTop ? 2 : 0.5,
                fillColor: props.avoided ? AVOIDED_COLOR : colorForScore(props.opportunityScore),
                fillOpacity: props.avoided ? 0.35 : 0.75,
                dashArray: props.avoided ? '3 2' : undefined
              };
            }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as OpportunityCellScore & Record<string, any>;
              layer.on('click', () => onCellClick(props));
              layer.bindTooltip(buildTooltipHtml(props, selected), { sticky: true, direction: 'top', opacity: 0.97 });
            }}
          />
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[9px] text-slate-500">
        <span className="flex items-center gap-1 font-bold uppercase tracking-wider text-[8px] text-slate-400">
          Opportunity score <InfoTooltip methodologyKey="opportunityScore" />
        </span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ backgroundColor: SCORE_COLORS.low }} /> Low</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ backgroundColor: SCORE_COLORS.medium }} /> Medium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ backgroundColor: SCORE_COLORS.high }} /> High</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ backgroundColor: SCORE_COLORS.critical }} /> Critical</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm border border-dashed border-slate-400" style={{ backgroundColor: AVOIDED_COLOR, opacity: 0.35 }} /> Avoided / constrained</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm border-2" style={{ borderColor: TOP_RANK_STROKE }} /> Top 5 candidate</span>
      </div>
    </SectionCard>
  );
}
