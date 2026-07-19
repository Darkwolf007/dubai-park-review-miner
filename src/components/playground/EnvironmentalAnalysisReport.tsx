import { useRef } from 'react';
import {
  Download, FileSpreadsheet, FileJson, Camera, FileText, Package,
  Sparkles, Box
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import type { H3Feature, RoadStats } from '../../lib/gis/types';
import type { EnvironmentalAnalysisReportData, EnvMetricStatus } from '../../lib/gis/environmentalEngine';
import type { EnvironmentalInsightsResult } from '../../lib/gis/environmentalInsightsEngine';
import { computeGrasshopperExport, grasshopperExportToCsv } from '../../lib/gis/grasshopperExportEngine';
import { downloadCsv, downloadExcel, downloadGeoJson, downloadJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';

const STATUS_COLORS: Record<EnvMetricStatus, string> = {
  good: 'text-emerald-600',
  watch: 'text-amber-600',
  critical: 'text-rose-600',
  unavailable: 'text-slate-400'
};

const BADGE_COLORS: Record<string, string> = {
  CRITICAL: 'bg-rose-50 border-rose-200 text-rose-700',
  POOR: 'bg-orange-50 border-orange-200 text-orange-700',
  MODERATE: 'bg-amber-50 border-amber-200 text-amber-700',
  GOOD: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  EXCELLENT: 'bg-emerald-50 border-emerald-200 text-emerald-700'
};

const LAND_COVER_COLORS: Record<string, string> = {
  'Buildings': '#e34948',
  'Estimated Paved / Road': '#94a3b8',
  'Green Cover': '#008300',
  'Void / Unclassified (bare ground, parking, other)': '#eda100'
};

export function EnvironmentalAnalysisReport({
  report,
  aiInsights,
  aiInsightsError,
  hexes,
  roadStats
}: {
  report: EnvironmentalAnalysisReportData;
  aiInsights: EnvironmentalInsightsResult | null;
  aiInsightsError: string | null;
  hexes: H3Feature[];
  roadStats: RoadStats | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { executiveSummary, kpis, landCover, topTreePlantingCells, topWaterSensitiveCells, heatScoreHistogram } = report;

  function exportCsvRows() {
    const rows: Record<string, any>[] = [];
    rows.push({ section: 'Executive Summary', metric: 'Overall Environmental Score', value: `${executiveSummary.overallEnvironmentalScore}/100 (${executiveSummary.overallStatusBadge})` });
    rows.push({ section: 'Executive Summary', metric: 'Peak Heat Zone', value: executiveSummary.peakHeatZone });
    kpis.metrics.forEach(m => rows.push({ section: 'Environmental KPIs', metric: m.label, value: m.displayValue, status: m.status, confidence: m.confidence }));
    landCover.breakdown.forEach(b => rows.push({ section: 'Land Cover', metric: b.category, value: `${b.pct}%` }));
    return rows;
  }

  function toCsvString(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '';
    const cols = Object.keys(rows[0]);
    return [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  }

  function handleGrasshopperExport(format: 'json' | 'csv' | 'geojson') {
    const gh = computeGrasshopperExport(hexes, roadStats);
    if (format === 'json') downloadJson(gh, 'grasshopper_design_inputs.json');
    if (format === 'csv') downloadCsv(grasshopperExportToCsv(gh), 'grasshopper_design_inputs.csv');
    if (format === 'geojson') {
      downloadGeoJson({
        type: 'FeatureCollection',
        features: hexes.map((h, i) => ({ type: 'Feature', geometry: h.geometry, properties: { h3_id: h.properties.h3_id, ...gh.cells[i] } }))
      }, 'grasshopper_design_inputs.geojson');
    }
  }

  const ghPreview = computeGrasshopperExport(hexes.slice(0, 8), roadStats);

  return (
    <div ref={containerRef} className="space-y-2">
      {/* EXPORT TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => downloadCsv(toCsvString(exportCsvRows()), 'environmental_analysis.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(exportCsvRows(), 'environmental_analysis.xlsx', 'Environmental Analysis')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="w-3 h-3" /> Excel
        </button>
        <button onClick={() => downloadGeoJson({ type: 'FeatureCollection', features: hexes }, 'environmental_h3_grid.geojson')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> GeoJSON
        </button>
        <button onClick={() => downloadJson(report, 'environmental_analysis.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileJson className="w-3 h-3" /> Analysis JSON
        </button>
        <button onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'environmental_analysis.png')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Camera className="w-3 h-3" /> PNG
        </button>
        <button disabled title="Not yet available -- needs a PDF report layout engine" className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-300 cursor-not-allowed">
          <FileText className="w-3 h-3" /> PDF (soon)
        </button>
        <button disabled title="Not yet available -- needs a GeoPackage/Shapefile writer" className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-300 cursor-not-allowed">
          <Package className="w-3 h-3" /> GeoPackage / Shapefile (soon)
        </button>
      </div>

      {/* 1. EXECUTIVE SUMMARY */}
      <CollapsibleSection title="Executive Summary">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold text-slate-800">Environmental Analysis Complete</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${BADGE_COLORS[executiveSummary.overallStatusBadge]}`}>
            {executiveSummary.overallStatusBadge} &middot; {executiveSummary.overallEnvironmentalScore}/100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Study Area" value={executiveSummary.studyArea} />
          <MetricTile label="Average Land Surface Temperature" unavailable note="No thermal/satellite raster in this dataset." />
          <MetricTile label="Peak Heat Zone" value={executiveSummary.peakHeatZone} note="Based on the Heat Exposure Proxy (surface composition), not measured temperature." methodologyKey="heatExposureProxy" />
          <MetricTile label="Tree Canopy Coverage" unavailable note="No canopy raster or tree survey." />
          <MetricTile label="Green Coverage" value={executiveSummary.greenCoveragePct} unit="%" />
          <MetricTile label="Thermal Comfort Status" value={executiveSummary.thermalComfortStatus} note="From review sentiment, not UTCI/PET." />
          <MetricTile label="Ecological Potential" value={executiveSummary.ecologicalPotentialStatus} note="From review sentiment (biodiversity keyword mentions)." />
        </div>
      </CollapsibleSection>

      {/* 2. ENVIRONMENTAL KPIs */}
      <CollapsibleSection title="Environmental KPIs" defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Metric</th>
                <th className="py-1.5 px-3 font-bold text-right">Value</th>
                <th className="py-1.5 px-3 font-bold">Source</th>
                <th className="py-1.5 px-3 font-bold">Confidence</th>
                <th className="py-1.5 pl-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {kpis.metrics.map(m => (
                <tr key={m.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">
                    {m.label}
                    {m.note && <p className="text-[8px] text-slate-400 font-normal mt-0.5">{m.note}</p>}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{m.displayValue}</td>
                  <td className="py-2 px-3 text-slate-500 text-[9px]">{m.dataSource}</td>
                  <td className="py-2 px-3 text-slate-500 text-[9px]">{m.confidence}</td>
                  <td className={`py-2 pl-3 font-bold uppercase text-[9px] ${STATUS_COLORS[m.status]}`}>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* 3. HEAT AND THERMAL COMFORT */}
      <CollapsibleSection title="Heat and Thermal Comfort" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">No land surface temperature, air temperature, or UTCI/PET data exists in this dataset. The scores below are a documented Heat Exposure Proxy built from real surface-composition fields (impervious estimate + green deficit) -- never presented as measured °C.</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <MetricTile label="Hotspot Area %" value={kpis.hotspotAreaPct} unit="%" note="Share of H3 cells with Heat Exposure Proxy >= 65/100." methodologyKey="heatExposureProxy" />
          <MetricTile label="Cool-Zone Area %" value={kpis.coolZoneAreaPct} unit="%" />
          <MetricTile label="Thermal Comfort Score" value={`${kpis.thermalComfortScore}/100`} note="Review-sentiment proxy (shade/heat comfort category)." />
          <MetricTile label="Cooling Opportunity Score" value={`${kpis.avgCoolingOpportunityScore}/100`} methodologyKey="coolingOpportunity" />
          <MetricTile label="UTCI / PET" unavailable note="Requires air temperature, humidity, wind, and radiant temperature data -- none present." />
          <MetricTile label="Evening Heat Retention" unavailable note="Requires a time-series thermal raster -- not present." />
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Heat Exposure Proxy Distribution (H3 Cells)</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={heatScoreHistogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 7, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" fill="#e34948" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 4. SOLAR AND SHADE ANALYSIS */}
      <CollapsibleSection title="Solar and Shade Analysis" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Shade Opportunity (Review Sentiment)" value={kpis.metrics.find(m => m.key === 'waterFeatureSatisfaction') ? undefined : `${kpis.thermalComfortScore}/100`} note="Thermal comfort score reused -- see Heat and Thermal Comfort section." />
          <MetricTile label="Hourly / Seasonal Solar Exposure" unavailable note="Requires DEM + building-height data for shadow-casting -- only ~2.3% of buildings carry a height tag." />
          <MetricTile label="Shaded Path / Seating / Play Coverage" unavailable note="No shade-structure or tree-canopy geometry in this dataset." />
          <MetricTile label="Shade-Hours Map" unavailable note="Same DEM/building-height limitation as above." />
        </div>
      </CollapsibleSection>

      {/* 5. VEGETATION AND TREE CANOPY */}
      <CollapsibleSection title="Vegetation and Tree Canopy" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Green Coverage" value={kpis.greenCoveragePct} unit="%" note="H3-aggregated OSM landuse tagging -- sparse (site-wide average under 1%), not a canopy measurement." />
          <MetricTile label="Tree Count" unavailable note="No tree survey or point layer in this dataset." />
          <MetricTile label="Canopy Coverage %" unavailable note="No canopy raster." />
          <MetricTile label="NDVI Mean / Max" unavailable note="No satellite imagery." />
          <MetricTile label="Vegetation Health" unavailable />
          <MetricTile label="Tree Retention / Planting Classification" unavailable note="Requires individual tree records (species, age, condition) -- not present." />
        </div>
      </CollapsibleSection>

      {/* 6. LAND COVER AND SURFACE MATERIALS */}
      <CollapsibleSection title="Land Cover and Surface Materials" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">{landCover.methodology}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={landCover.breakdown} dataKey="pct" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={(entry: any) => `${entry.pct}%`}>
                  {landCover.breakdown.map(b => <Cell key={b.category} fill={LAND_COVER_COLORS[b.category] || '#94a3b8'} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '7px' }} />
                <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 content-start">
            <MetricTile label="Impervious Surface %" value={kpis.imperviousSurfacePct} unit="%" />
            <MetricTile label="Permeable Surface %" value={kpis.permeableSurfacePct} unit="%" />
            <MetricTile label="Runoff Potential" unavailable note="Requires slope/soil data -- not present." />
            <MetricTile label="Cool-Material Opportunity" unavailable note="Requires material-albedo tagging -- not present." />
          </div>
        </div>
      </CollapsibleSection>

      {/* 7. WATER AND IRRIGATION */}
      <CollapsibleSection title="Water and Irrigation" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Water Body Area" value="0 m²" note="Zero natural=water features exist in this OSM extract -- a confirmed real finding, not a data gap." />
          <MetricTile label="Water Feature Satisfaction" value={kpis.metrics.find(m => m.key === 'waterFeatureSatisfaction')?.displayValue} unavailable={kpis.metrics.find(m => m.key === 'waterFeatureSatisfaction')?.status === 'unavailable'} note="Review-sentiment concern index, not a hydrology measurement." />
          <MetricTile label="Estimated Irrigated Landscape Area" value={kpis.metrics.find(m => m.key === 'irrigatedAreaProxyM2')?.displayValue} note="Assumes managed green space in this arid climate requires irrigation." />
          <MetricTile label="Estimated Irrigation Demand" unavailable note="Requires evapotranspiration/climate data." />
          <MetricTile label="Stormwater / Bioswale / Rain-Garden Suitability" note="See Environmental Opportunity Maps -- Water-Sensitive Suitability below." />
          <MetricTile label="Infiltration Potential" unavailable note="Requires soil permeability data -- not present." />
        </div>
      </CollapsibleSection>

      {/* 8. WIND AND VENTILATION */}
      <CollapsibleSection title="Wind and Ventilation" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">No wind, weather, or CFD data exists anywhere in this dataset -- confirmed absent from every source file. Per the fallback policy: rather than showing even a general prevailing-wind direction (which would need a real station or regional climate dataset this build doesn't have access to), every metric below is explicitly marked unavailable.</p>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Prevailing Wind Direction" unavailable />
          <MetricTile label="Ventilation Corridors" unavailable />
          <MetricTile label="Wind-Shadow Zones" unavailable />
          <MetricTile label="Wind-Assisted Cooling Zones" unavailable note="Future: CFD / Ladybug Tools / OpenFOAM / Rhino Compute integration, per the architecture this module is built to accommodate." />
        </div>
      </CollapsibleSection>

      {/* 9. BIODIVERSITY AND ECOLOGY */}
      <CollapsibleSection title="Biodiversity and Ecology" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Biodiversity Score" value={`${kpis.biodiversityScore}/100`} note="Review-sentiment proxy (wildlife/nature keyword mentions), not a species survey." />
          <MetricTile label="Habitat Connectivity" unavailable note="Requires mapped habitat patches/corridors -- not present." />
          <MetricTile label="Native Planting Ratio" unavailable note="No planting-species data in this dataset." />
          <MetricTile label="Pollinator / Bird Habitat Opportunity" unavailable note="See Environmental Opportunity Maps for a per-cell habitat-presence proxy instead." />
        </div>
      </CollapsibleSection>

      {/* 10. H3 ENVIRONMENTAL ANALYSIS */}
      <CollapsibleSection title="H3 Environmental Analysis" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2">Every H3 cell carries a real Heat Exposure Proxy, Cooling Opportunity, Biodiversity Proxy, Water-Sensitive Suitability, and Tree Planting Suitability score -- all derived from real surface-cover and road-network fields (see each metric's methodology note). Switch map modes in the Dataset Explorer to visualize them.</p>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top 20 H3 Cells by Tree Planting Suitability</p>
        <div className="h-56 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topTreePlantingCells.map(c => ({ id: c.h3Id.slice(-6), score: c.score }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="score" fill="#008300" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 11. ENVIRONMENTAL OPPORTUNITY MAPS */}
      <CollapsibleSection title="Environmental Opportunity Maps" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">Suitability = weighted composite of real surface-cover and road-network fields (heat exposure, green deficit, available land, pedestrian exposure). See the Grasshopper Design Inputs section for the exact per-field formula.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top 20 -- Tree Planting Suitability</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTreePlantingCells.map(c => ({ id: c.h3Id.slice(-6), score: c.score }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="score" fill="#eb6834" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top 20 -- Water-Sensitive Design Suitability</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topWaterSensitiveCells.map(c => ({ id: c.h3Id.slice(-6), score: c.score }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="score" fill="#2a78d6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 12. GRASSHOPPER DESIGN INPUTS */}
      <CollapsibleSection title="Grasshopper Design Inputs" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><Box className="w-3 h-3 text-indigo-500" /> Structured, normalized (0-1) per-cell scores in EPSG:32640 (UTM Zone 40N) coordinates -- directly usable as Grasshopper attractors, repellers, suitability fields, and optimization objectives.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => handleGrasshopperExport('json')} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700">
            <FileJson className="w-3 h-3" /> Export to Grasshopper (JSON)
          </button>
          <button onClick={() => handleGrasshopperExport('csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> CSV with Coordinates
          </button>
          <button onClick={() => handleGrasshopperExport('geojson')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> GeoJSON
          </button>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Preview (first 8 cells)</p>
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-left text-[9px] font-mono">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                <th className="py-1 pr-2 font-bold">h3_id</th>
                <th className="py-1 px-2 font-bold text-right">heat</th>
                <th className="py-1 px-2 font-bold text-right">shade</th>
                <th className="py-1 px-2 font-bold text-right">canopy</th>
                <th className="py-1 px-2 font-bold text-right">cooling</th>
                <th className="py-1 px-2 font-bold text-right">biodiv.</th>
                <th className="py-1 px-2 font-bold text-right">water</th>
                <th className="py-1 px-2 font-bold text-right">tree_plant</th>
                <th className="py-1 pl-2 font-bold text-right">constraint</th>
              </tr>
            </thead>
            <tbody>
              {ghPreview.cells.map(c => (
                <tr key={c.h3_id} className="border-b border-slate-100 last:border-0 text-slate-600">
                  <td className="py-1 pr-2">{c.h3_id.slice(-8)}</td>
                  <td className="py-1 px-2 text-right">{c.heat_score}</td>
                  <td className="py-1 px-2 text-right">{c.shade_score}</td>
                  <td className="py-1 px-2 text-right">{c.canopy_score}</td>
                  <td className="py-1 px-2 text-right">{c.cooling_score}</td>
                  <td className="py-1 px-2 text-right">{c.biodiversity_score}</td>
                  <td className="py-1 px-2 text-right">{c.water_score}</td>
                  <td className="py-1 px-2 text-right">{c.tree_planting_suitability}</td>
                  <td className={`py-1 pl-2 text-right font-bold ${c.constraint ? 'text-rose-600' : 'text-slate-400'}`}>{String(c.constraint)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1">
          {Object.entries(ghPreview.methodology).map(([key, note]) => (
            <p key={key} className="text-[8px] text-slate-400 leading-relaxed"><span className="font-bold text-slate-500">{key}:</span> {note}</p>
          ))}
        </div>
      </CollapsibleSection>

      {/* 13. AI INTERPRETATION */}
      <CollapsibleSection title="AI Interpretation">
        {aiInsightsError && <p className="text-[10px] font-semibold text-rose-600">{aiInsightsError}</p>}
        {!aiInsights && !aiInsightsError && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">AI interpretation unavailable for this run.</p>}
        {aiInsights && (
          <div className="space-y-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[8px] text-slate-400 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> {aiInsights.engine}</span>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Environmental Profile</p>
              <p className="text-slate-700 leading-relaxed">{aiInsights.environmentalProfile}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Strengths</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-rose-500 mb-1">Weaknesses</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-amber-600 mb-1">Constraints</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.constraints.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Design Drivers</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.designDrivers.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Ecological Opportunities</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.ecologicalOpportunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 14. SUPPORTING EVIDENCE */}
      <CollapsibleSection title="Supporting Evidence" defaultOpen={false}>
        {!aiInsights && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">Run the analysis to generate evidence-backed recommendations.</p>}
        {aiInsights && (
          <div className="space-y-2">
            {aiInsights.priorityInterventions.map((rec, i) => (
              <div key={i} className="border border-slate-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-700">{rec.intervention}</span>
                  <span className="text-[9px] font-extrabold text-indigo-700">{rec.confidence}% confidence</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {rec.evidence.map((e, j) => (
                    <span key={j} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{e}</span>
                  ))}
                </div>
                <span className={`text-[8px] font-bold uppercase tracking-wider ${rec.priority === 'High' ? 'text-rose-600' : rec.priority === 'Medium' ? 'text-amber-600' : 'text-slate-400'}`}>
                  Priority: {rec.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
