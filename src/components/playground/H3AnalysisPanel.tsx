import { useMemo, useState } from 'react';
import { Hexagon, Download } from 'lucide-react';
import type { H3Feature } from '../../lib/gis/types';
import { H3_RESOLUTION, H3_METRIC_OPTIONS, sortH3Hexes, h3ToCsv, type H3MetricKey } from '../../lib/gis/h3Engine';
import { downloadCsv, downloadGeoJson } from '../../lib/gis/exportEngine';
import { SectionCard } from '../ui/SectionCard';

export function H3AnalysisPanel({ hexes }: { hexes: H3Feature[] }) {
  const [metric, setMetric] = useState<H3MetricKey>('population');
  const [selected, setSelected] = useState<H3Feature | null>(null);

  const sorted = useMemo(() => sortH3Hexes(hexes, metric, 'desc').slice(0, 30), [hexes, metric]);
  const metricLabel = H3_METRIC_OPTIONS.find(m => m.key === metric)?.label;

  return (
    <SectionCard
      icon={Hexagon}
      title="H3 Analysis Module"
      action={
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Resolution {H3_RESOLUTION} (fixed)</span>
          <select value={metric} onChange={e => setMetric(e.target.value as H3MetricKey)} className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white">
            {H3_METRIC_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      }
    >
      <p className="text-[9px] text-slate-500 mb-2">
        {hexes.length} pre-computed hexagons, already aggregated from population, buildings, roads, and amenity datasets.
        Other resolutions would need the raw point data this build doesn't have -- not a live parameter here.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => downloadCsv(h3ToCsv(sorted), 'h3_grid_top30.csv')}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Download className="w-3 h-3" /> CSV (top 30)
        </button>
        <button
          onClick={() => downloadGeoJson({ type: 'FeatureCollection', features: hexes as any }, 'h3_grid_full.geojson')}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Download className="w-3 h-3" /> GeoJSON (full grid)
        </button>
      </div>

      <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 rounded">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
              <th className="py-1.5 px-2 font-bold">H3 ID</th>
              <th className="py-1.5 px-2 font-bold text-right">{metricLabel}</th>
              <th className="py-1.5 px-2 font-bold text-right">Population</th>
              <th className="py-1.5 px-2 font-bold text-right">Buildings</th>
              <th className="py-1.5 px-2 font-bold text-right">Amenities</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(hex => (
              <tr
                key={hex.properties.h3_id}
                onClick={() => setSelected(hex)}
                className={`border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 ${selected?.properties.h3_id === hex.properties.h3_id ? 'bg-indigo-50' : ''}`}
              >
                <td className="py-1.5 px-2 font-mono text-slate-500">{hex.properties.h3_id}</td>
                <td className="py-1.5 px-2 text-right font-mono text-slate-700">{Math.round((Number(hex.properties[metric]) || 0) * 100) / 100}</td>
                <td className="py-1.5 px-2 text-right font-mono text-slate-500">{Math.round(hex.properties.population)}</td>
                <td className="py-1.5 px-2 text-right font-mono text-slate-500">{hex.properties.building_count}</td>
                <td className="py-1.5 px-2 text-right font-mono text-slate-500">{hex.properties.amenity_total}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-slate-400 font-semibold">No H3 data loaded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="mt-2 text-[9px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
          <p className="font-bold text-slate-700 mb-1">{selected.properties.h3_id}</p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
            <span>Population: {Math.round(selected.properties.population)}</span>
            <span>Density: {Math.round(selected.properties.pop_density_km2)}/km²</span>
            <span>Buildings: {selected.properties.building_count}</span>
            <span>Building coverage: {selected.properties.building_coverage_pct.toFixed(1)}%</span>
            <span>Green coverage: {selected.properties.green_coverage_pct.toFixed(1)}%</span>
            <span>Road density: {Math.round(selected.properties.road_density_m_per_km2)} m/km²</span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
