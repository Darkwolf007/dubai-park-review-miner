import { useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import type { SiteGridCell } from '../../lib/gis/siteGrid';
import type { OpportunityResult, OpportunityCellScore } from '../../lib/gis/opportunityEngine';
import { SectionCard } from '../ui/SectionCard';

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

export function OpportunitySuitabilityMap({
  siteGrid,
  selected,
  parkCenter,
  activeCellId,
  onCellClick
}: {
  siteGrid: SiteGridCell[];
  selected: OpportunityResult;
  parkCenter: { lat: number; lng: number };
  activeCellId: string | null;
  onCellClick: (cell: OpportunityCellScore) => void;
}) {
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

  return (
    <SectionCard icon={MapPin} title={`Suitability Map -- ${selected.name}`}>
      <p className="text-[9px] text-slate-500 mb-2">
        Each cell is one of the {siteGrid.length} real 10m cells inside the park boundary, colored by opportunity score for
        the selected program. Indigo outline = top 5 candidate cells. Click any cell to inspect its scores.
      </p>
      <div className="h-[380px] rounded overflow-hidden border border-slate-200 relative z-0">
        <MapContainer center={[parkCenter.lat, parkCenter.lng]} zoom={17} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={BASEMAP_URL} attribution="&copy; OpenStreetMap contributors & CARTO" />
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
              const props = feature.properties as OpportunityCellScore;
              layer.on('click', () => onCellClick(props));
              layer.bindTooltip(
                `${props.h3Id}${props.avoided ? ' (avoided)' : ''} -- opportunity ${props.opportunityScore}/100`,
                { sticky: true }
              );
            }}
          />
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[9px] text-slate-500">
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
