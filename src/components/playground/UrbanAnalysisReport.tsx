import { useRef } from 'react';
import {
  Download, FileSpreadsheet, FileJson, Camera, FileText, Package,
  Sparkles, MapPin
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import type { H3Feature } from '../../lib/gis/types';
import type { UrbanAnalysisReportData } from '../../lib/gis/urbanEngine';
import { computeHexUrbanScore } from '../../lib/gis/urbanEngine';
import type { UrbanInsightsResult } from '../../lib/gis/urbanInsightsEngine';
import { downloadCsv, downloadExcel, downloadGeoJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';

const LAND_USE_COLORS: Record<string, string> = {
  'Residential': '#4a3aa7',
  'Commercial': '#eb6834',
  'Institutional': '#2a78d6',
  'Parks / Open Space': '#008300',
  'Undeveloped': '#94a3b8'
};

const STATUS_COLORS: Record<string, string> = {
  good: 'text-emerald-600',
  watch: 'text-amber-600',
  critical: 'text-rose-600',
  unavailable: 'text-slate-400'
};

const BUILT_FORM_LAYERS: { label: string; available: boolean; note?: string }[] = [
  { label: 'Building Footprints', available: true, note: 'Toggle "Buildings" under Urban in the Dataset Explorer.' },
  { label: 'Building Density (H3 choropleth)', available: true, note: 'Toggle "Building Density" under Urban in the Dataset Explorer.' },
  { label: 'Building Coverage (H3 choropleth)', available: true },
  { label: 'Building Height', available: false, note: 'Only ~2.3% of buildings carry a height/level tag -- not enough to render a layer.' },
  { label: 'Floor Area Ratio', available: false, note: 'Same sparse-tagging limitation as Building Height.' },
  { label: 'Building Cluster Map', available: false, note: 'Not implemented as a distinct clustering layer; use the Top H3 Cells by Building Density chart below instead.' },
  { label: 'Vacant Parcels', available: false, note: 'No parcel/cadastral data in this dataset.' },
  { label: 'Redevelopment Opportunities', available: false, note: 'Would need parcel ownership + zoning data not present in this dataset.' }
];

export function UrbanAnalysisReport({
  report,
  aiInsights,
  aiInsightsError,
  hexes
}: {
  report: UrbanAnalysisReportData;
  aiInsights: UrbanInsightsResult | null;
  aiInsightsError: string | null;
  hexes: H3Feature[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { executiveSummary, kpis, roadNetwork, landUse, morphology, topCellsByBuildingDensity, topCellsByRoadDensity, buildingCoverageHistogram } = report;

  function exportCsvRows() {
    const rows: Record<string, any>[] = [];
    rows.push({ section: 'Executive Summary', metric: 'Urban Character', value: executiveSummary.urbanCharacter });
    rows.push({ section: 'Executive Summary', metric: 'Building Coverage', value: `${executiveSummary.buildingCoveragePct}%` });
    rows.push({ section: 'Executive Summary', metric: 'Road Connectivity', value: executiveSummary.roadConnectivity });
    rows.push({ section: 'Executive Summary', metric: 'Dominant Land Use', value: executiveSummary.dominantLandUse });
    rows.push({ section: 'Executive Summary', metric: 'Development Pressure', value: executiveSummary.developmentPressure });
    rows.push({ section: 'Executive Summary', metric: 'Overall Urban Score', value: `${executiveSummary.overallUrbanScore}/100` });
    roadNetwork.hierarchy.forEach(h => rows.push({ section: 'Road Hierarchy', metric: h.label, value: `${h.lengthKm} km (${h.pctOfTotal}%)` }));
    landUse.breakdown.forEach(b => rows.push({ section: 'Land Use', metric: b.category, value: `${b.pct}% (${b.areaKm2} km²)` }));
    morphology.metrics.forEach(m => rows.push({ section: 'Urban Morphology', metric: m.label, value: m.displayValue, status: m.status }));
    return rows;
  }

  function toCsvString(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '';
    const cols = Object.keys(rows[0]);
    return [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {/* EXPORT TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => downloadCsv(toCsvString(exportCsvRows()), 'urban_analysis.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(exportCsvRows(), 'urban_analysis.xlsx', 'Urban Analysis')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="w-3 h-3" /> Excel
        </button>
        <button
          onClick={() => downloadGeoJson({
            type: 'FeatureCollection',
            features: hexes.map(h => ({ ...h, properties: { ...h.properties, urban_score: computeHexUrbanScore(h) } }))
          }, 'urban_h3_grid.geojson')}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Download className="w-3 h-3" /> GeoJSON
        </button>
        <button onClick={() => downloadGeoJson(report as any, 'urban_analysis.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileJson className="w-3 h-3" /> Analysis JSON
        </button>
        <button onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'urban_analysis.png')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Camera className="w-3 h-3" /> PNG
        </button>
        <button disabled title="Not yet available -- needs a PDF report layout engine" className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-300 cursor-not-allowed">
          <FileText className="w-3 h-3" /> PDF (soon)
        </button>
        <button disabled title="Not yet available -- needs a GeoPackage writer" className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-300 cursor-not-allowed">
          <Package className="w-3 h-3" /> GeoPackage (soon)
        </button>
      </div>

      {/* 1. EXECUTIVE SUMMARY */}
      <CollapsibleSection title="Executive Summary">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold text-slate-800">Urban Analysis Complete</span>
          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border bg-indigo-50 border-indigo-200 text-indigo-700">
            {executiveSummary.overallUrbanScore}/100 URBAN SCORE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Study Area" value={executiveSummary.studyArea} />
          <MetricTile label="Urban Character" value={executiveSummary.urbanCharacter} />
          <MetricTile label="Building Coverage" value={executiveSummary.buildingCoveragePct} unit="%" />
          <MetricTile label="Road Connectivity" value={executiveSummary.roadConnectivity} />
          <MetricTile label="Dominant Land Use" value={executiveSummary.dominantLandUse} />
          <MetricTile label="Development Pressure" value={executiveSummary.developmentPressure} />
        </div>
      </CollapsibleSection>

      {/* 2. URBAN KPIs */}
      <CollapsibleSection title="Urban KPIs">
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Building Count" value={kpis.buildingCount.toLocaleString()} />
          <MetricTile label="Total Building Footprint" value={kpis.totalBuildingFootprintM2.toLocaleString()} unit="m²" />
          <MetricTile label="Average Building Size" value={kpis.avgBuildingSizeM2.toLocaleString()} unit="m²" />
          <MetricTile label="Building Coverage" value={kpis.buildingCoveragePct} unit="%" />
          <MetricTile label="Road Length" value={kpis.roadLengthKm.toLocaleString()} unit="km" />
          <MetricTile label="Intersection Count" value={kpis.intersectionCount.toLocaleString()} />
          <MetricTile label="Intersection Density" value={kpis.intersectionDensityPerKm2.toLocaleString()} unit="/km²" />
          <MetricTile label="Street Density" value={kpis.streetDensityMPerKm2.toLocaleString()} unit="m/km²" />
          <MetricTile label="Land Use Diversity" value={`${kpis.landUseDiversityIndex}/100`} />
          <MetricTile label="Residential %" value={kpis.residentialPct} unit="%" />
          <MetricTile label="Commercial %" value={kpis.commercialPct} unit="%" />
          <MetricTile label="Institutional %" value={kpis.institutionalPct} unit="%" />
          <MetricTile label="Mixed Use %" unavailable note={kpis.mixedUseNote} />
          <MetricTile label="Impervious Surface %" value={kpis.imperviousSurfacePct} unit="%" note={kpis.imperviousSurfaceNote} />
          <MetricTile label="Open Space %" value={kpis.openSpacePct} unit="%" />
          <MetricTile label="Development Intensity" value={`${kpis.developmentIntensity}/100`} />
          <MetricTile label="Urban Compactness" value={`${kpis.urbanCompactness}/100`} />
          <MetricTile label="Connectivity Score" value={`${kpis.connectivityScore}/100`} />
        </div>
      </CollapsibleSection>

      {/* 3. BUILT FORM ANALYSIS */}
      <CollapsibleSection title="Built Form Analysis" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><MapPin className="w-3 h-3 text-indigo-500" /> Switch these layers on in the Dataset Explorer (left panel) to visualize them on the map.</p>
        <div className="space-y-1 mb-3">
          {BUILT_FORM_LAYERS.map(l => (
            <div key={l.label} className="flex items-start justify-between gap-2 text-[10px] border-b border-slate-50 py-1">
              <div>
                <span className={l.available ? 'text-slate-700 font-semibold' : 'text-slate-400'}>{l.label}</span>
                {l.note && <p className="text-[8px] text-slate-400 mt-0.5">{l.note}</p>}
              </div>
              <span className={`text-[8px] shrink-0 font-bold uppercase ${l.available ? 'text-emerald-600' : 'text-slate-400'}`}>{l.available ? 'Available' : 'Not available'}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Building Coverage Histogram (H3 Cells)</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buildingCoverageHistogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 7, fill: '#64748b' }} unit="%" />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" fill="#e34948" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">Top 20 H3 Cells by Building Density</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCellsByBuildingDensity.map(c => ({ id: c.h3Id.slice(-6), count: c.buildingCount }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" fill="#eb6834" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 4. ROAD NETWORK ANALYSIS */}
      <CollapsibleSection title="Road Network Analysis">
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <MetricTile label="Intersection Density" value={roadNetwork.intersectionDensityPerKm2.toLocaleString()} unit="/km²" />
          <MetricTile label="Dead Ends" value={roadNetwork.deadEndCount.toLocaleString()} note="Degree-1 nodes on the full road graph." />
          <MetricTile
            label="Average Block Size"
            value={roadNetwork.avgBlockSizeM2 !== null ? `${roadNetwork.avgBlockSizeM2.toLocaleString()} m²` : undefined}
            unavailable={roadNetwork.avgBlockSizeM2 === null}
            note={roadNetwork.blockEstimateMethodology || undefined}
          />
          <MetricTile label="Street Connectivity" value={`${roadNetwork.streetConnectivityScore}/100`} />
          <MetricTile label="Road Density" value={roadNetwork.roadDensityMPerKm2.toLocaleString()} unit="m/km²" />
          <MetricTile label="Block Count (Estimate)" value={roadNetwork.blockCountEstimate?.toLocaleString()} unavailable={roadNetwork.blockCountEstimate === null} />
        </div>

        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Road Hierarchy</p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Tier</th>
                <th className="py-1.5 px-3 font-bold text-right">Segments</th>
                <th className="py-1.5 px-3 font-bold text-right">Length</th>
                <th className="py-1.5 pl-3 font-bold text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {roadNetwork.hierarchy.map(h => (
                <tr key={h.tier} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{h.label}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{h.count.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{h.lengthKm} km</td>
                  <td className="py-2 pl-3 text-right font-mono text-slate-500">{h.pctOfTotal}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={roadNetwork.hierarchy.map(h => ({ label: h.label, km: h.lengthKm }))} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#64748b' }} angle={-25} textAnchor="end" interval={0} height={50} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={32} unit="km" />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="km" fill="#2a78d6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">Top 20 H3 Cells by Road Density</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCellsByRoadDensity.map(c => ({ id: c.h3Id.slice(-6), density: c.densityMPerKm2 }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="density" fill="#10b981" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[8px] text-slate-400 mt-2 leading-relaxed">{roadNetwork.methodology}</p>
      </CollapsibleSection>

      {/* 5. LAND USE ANALYSIS */}
      <CollapsibleSection title="Land Use Analysis">
        <p className="text-[9px] text-amber-600 font-semibold mb-2">{landUse.methodology}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={landUse.breakdown} dataKey="pct" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={(entry: any) => `${entry.pct}%`}>
                  {landUse.breakdown.map(b => <Cell key={b.category} fill={LAND_USE_COLORS[b.category] || '#94a3b8'} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                  <th className="py-1.5 pr-3 font-bold">Category</th>
                  <th className="py-1.5 px-3 font-bold text-right">Area</th>
                  <th className="py-1.5 pl-3 font-bold text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {landUse.breakdown.map(b => (
                  <tr key={b.category} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: LAND_USE_COLORS[b.category] || '#94a3b8' }} />
                      {b.category}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">{b.areaKm2} km²</td>
                    <td className="py-2 pl-3 text-right font-mono text-slate-500">{b.pct}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-bold">
                  <td className="py-2 pr-3 text-slate-800">Diversity Index</td>
                  <td className="py-2 px-3" colSpan={2}></td>
                  <td className="py-2 pl-3 text-right font-mono text-slate-800">{landUse.diversityIndex}/100</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleSection>

      {/* 6. URBAN MORPHOLOGY */}
      <CollapsibleSection title="Urban Morphology">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Metric</th>
                <th className="py-1.5 px-3 font-bold text-right">Value</th>
                <th className="py-1.5 pl-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {morphology.metrics.map(m => (
                <tr key={m.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">
                    {m.label}
                    {m.note && <p className="text-[8px] text-slate-400 font-normal mt-0.5">{m.note}</p>}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{m.displayValue}</td>
                  <td className={`py-2 pl-3 font-bold uppercase text-[9px] ${STATUS_COLORS[m.status]}`}>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* 7. AI INTERPRETATION */}
      <CollapsibleSection title="AI Interpretation">
        {aiInsightsError && <p className="text-[10px] font-semibold text-rose-600">{aiInsightsError}</p>}
        {!aiInsights && !aiInsightsError && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">AI interpretation unavailable for this run.</p>}
        {aiInsights && (
          <div className="space-y-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[8px] text-slate-400 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> {aiInsights.engine}</span>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Urban Character</p>
              <p className="text-slate-700 leading-relaxed">{aiInsights.urbanCharacter}</p>
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
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Development Opportunities</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.developmentOpportunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 8. SUPPORTING EVIDENCE */}
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
