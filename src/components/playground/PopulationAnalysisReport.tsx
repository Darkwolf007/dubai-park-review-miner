import { useRef } from 'react';
import {
  Download, FileSpreadsheet, FileJson, Camera, FileText, Package,
  Sparkles, MapPin
} from 'lucide-react';
import {
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import type { H3Feature } from '../../lib/gis/types';
import type { PopulationAnalysisReportData } from '../../lib/gis/populationEngine';
import { computeHexDemandScore, VISITATION_METHODOLOGY } from '../../lib/gis/populationEngine';
import type { PopulationInsightsResult } from '../../lib/gis/populationInsightsEngine';
import { downloadCsv, downloadExcel, downloadGeoJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';

const DEMAND_BADGE_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 border-slate-200 text-slate-600',
  MEDIUM: 'bg-amber-50 border-amber-200 text-amber-700',
  HIGH: 'bg-orange-50 border-orange-200 text-orange-700',
  'VERY HIGH': 'bg-rose-50 border-rose-200 text-rose-700'
};

const STATUS_COLORS: Record<string, string> = {
  good: 'text-emerald-600',
  watch: 'text-amber-600',
  critical: 'text-rose-600',
  unavailable: 'text-slate-400'
};

const DISTRIBUTION_LAYERS: { label: string; available: boolean; note?: string }[] = [
  { label: 'Population Density (H3 choropleth)', available: true, note: 'Toggle "Population Density" in the Dataset Explorer.' },
  { label: 'H3 Population (H3 choropleth)', available: true, note: 'Toggle "Population" under Demographics in the Dataset Explorer.' },
  { label: 'Residential Buildings', available: true, note: 'Toggle "Buildings" under Urban -- use-type breakdown not available (see KPIs).' },
  { label: 'Population Heatmap', available: false, note: 'No separate raster heatmap layer -- the H3 choropleth is the real per-cell density signal.' },
  { label: 'Population Clusters', available: false, note: 'Not implemented as a distinct clustering layer; use the Top 20 H3 Cells chart below instead.' },
  { label: 'Catchment Rings', available: false, note: 'Not rendered on the map yet -- see the Catchment Analysis table/chart below.' },
  { label: 'Density Contours', available: false, note: 'Would need isoline generation from the raster source; not available in this build.' },
  { label: 'Population Percentile', available: false, note: 'Not implemented as a distinct map layer; see the Population Percentiles chart below.' }
];

export function PopulationAnalysisReport({
  report,
  aiInsights,
  aiInsightsError,
  hexes
}: {
  report: PopulationAnalysisReportData;
  aiInsights: PopulationInsightsResult | null;
  aiInsightsError: string | null;
  hexes: H3Feature[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { executiveSummary, kpis, catchments, demand, topCells, densityHistogram, percentiles } = report;

  function exportCsvRows() {
    const rows: Record<string, any>[] = [];
    rows.push({ section: 'Executive Summary', metric: 'Population Served', value: executiveSummary.populationServed });
    rows.push({ section: 'Executive Summary', metric: 'Average Density (km²)', value: executiveSummary.avgDensityKm2 });
    rows.push({ section: 'Executive Summary', metric: 'Primary Community', value: executiveSummary.primaryCommunity });
    rows.push({ section: 'Executive Summary', metric: 'Highest Demand Zone', value: executiveSummary.highestDemandZone });
    rows.push({ section: 'Executive Summary', metric: 'Overall Demand', value: executiveSummary.overallDemandLevel });
    catchments.forEach(c => {
      rows.push({ section: `Catchment ${c.label}`, metric: 'Population', value: c.population });
      rows.push({ section: `Catchment ${c.label}`, metric: c.visitationLabel, value: c.visitationValue });
      rows.push({ section: `Catchment ${c.label}`, metric: 'Coverage %', value: c.pctOfTotal });
    });
    demand.metrics.forEach(m => rows.push({ section: 'Demand Assessment', metric: m.label, value: m.displayValue, status: m.status, priority: m.priority }));
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
        <button onClick={() => downloadCsv(toCsvString(exportCsvRows()), 'population_analysis.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(exportCsvRows(), 'population_analysis.xlsx', 'Population Analysis')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="w-3 h-3" /> Excel
        </button>
        <button
          onClick={() => downloadGeoJson({
            type: 'FeatureCollection',
            features: hexes.map(h => ({ ...h, properties: { ...h.properties, demand_score: computeHexDemandScore(h) } }))
          }, 'population_h3_grid.geojson')}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Download className="w-3 h-3" /> GeoJSON
        </button>
        <button onClick={() => downloadGeoJson(report as any, 'population_analysis.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileJson className="w-3 h-3" /> Analysis JSON
        </button>
        <button onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'population_analysis.png')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
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
          <span className="text-[11px] font-extrabold text-slate-800">Population Analysis Complete</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${DEMAND_BADGE_COLORS[executiveSummary.overallDemandLevel]}`}>
            {executiveSummary.overallDemandLevel} DEMAND
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Study Area" value={executiveSummary.studyArea} />
          <MetricTile label="Population Served" value={executiveSummary.populationServed.toLocaleString()} />
          <MetricTile label="Average Population Density" value={executiveSummary.avgDensityKm2.toLocaleString()} unit="/km²" />
          <MetricTile label="Primary Community" value={executiveSummary.primaryCommunity} />
          <MetricTile label="Highest Demand Zone" value={executiveSummary.highestDemandZone} />
          <MetricTile label="Overall Demand Score" value={`${executiveSummary.overallDemandScore}/100`} methodologyKey="populationDemand" />
        </div>
      </CollapsibleSection>

      {/* 2. POPULATION KPIs */}
      <CollapsibleSection title="Population KPIs">
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Total Population" value={kpis.totalPopulation.toLocaleString()} />
          <MetricTile label="Aggregate Density" value={kpis.aggregateDensityKm2.toLocaleString()} unit="/km²" />
          <MetricTile label="Average Density per H3" value={kpis.avgDensityPerH3.toLocaleString()} unit="/km²" />
          <MetricTile label="Maximum Density Cell" value={kpis.maxDensityCell ? `${kpis.maxDensityCell.density.toLocaleString()}/km²` : undefined} unavailable={!kpis.maxDensityCell} note={kpis.maxDensityCell?.h3Id} />
          <MetricTile label="Minimum Density Cell" value={kpis.minDensityCell ? `${kpis.minDensityCell.density.toLocaleString()}/km²` : undefined} unavailable={!kpis.minDensityCell} note={kpis.minDensityCell?.h3Id} />
          <MetricTile label="Number of H3 Cells" value={kpis.h3CellCount.toLocaleString()} />
          <MetricTile label="Residential Coverage" unavailable note={kpis.residentialCoverageNote} />
          <MetricTile label="Estimated Daily Users" value={kpis.estimatedDailyUsers.toLocaleString()} note={VISITATION_METHODOLOGY} />
          <MetricTile label="Estimated Weekly Users" value={kpis.estimatedWeeklyUsers.toLocaleString()} note={VISITATION_METHODOLOGY} />
          <MetricTile label="Population Growth" unavailable note="No time-series population data -- only a single snapshot exists." />
          <MetricTile label="Population Growth Rate" unavailable note="No time-series population data -- only a single snapshot exists." />
        </div>
      </CollapsibleSection>

      {/* 3. CATCHMENT ANALYSIS */}
      <CollapsibleSection title="Catchment Analysis">
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Ring</th>
                <th className="py-1.5 px-3 font-bold text-right">Population</th>
                <th className="py-1.5 px-3 font-bold text-right">Area</th>
                <th className="py-1.5 px-3 font-bold text-right">Density</th>
                <th className="py-1.5 px-3 font-bold text-right">Coverage %</th>
                <th className="py-1.5 pl-3 font-bold text-right">Visitation</th>
              </tr>
            </thead>
            <tbody>
              {catchments.map(c => (
                <tr key={c.radiusM} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{c.label}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{c.population.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.areaKm2} km²</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.densityPerKm2.toLocaleString()}/km²</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.pctOfTotal}%</td>
                  <td className="py-2 pl-3 text-right">
                    <div className="text-slate-700 font-bold font-mono">{c.visitationValue.toLocaleString()}</div>
                    <div className="text-[8px] text-slate-400">{c.visitationLabel}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={catchments.map(c => ({ subject: c.label, population: c.population }))} outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#64748b' }} />
              <PolarRadiusAxis tick={{ fontSize: 7 }} axisLine={false} />
              <Radar dataKey="population" stroke="#4a3aa7" fill="#4a3aa7" fillOpacity={0.35} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[8px] text-slate-400 mt-1 leading-relaxed">{VISITATION_METHODOLOGY}</p>
      </CollapsibleSection>

      {/* 4. POPULATION DISTRIBUTION (map layers -- pointer to Dataset Explorer) */}
      <CollapsibleSection title="Population Distribution" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><MapPin className="w-3 h-3 text-indigo-500" /> Switch these layers on in the Dataset Explorer (left panel) to visualize them on the map.</p>
        <div className="space-y-1">
          {DISTRIBUTION_LAYERS.map(l => (
            <div key={l.label} className="flex items-start justify-between gap-2 text-[10px] border-b border-slate-50 py-1">
              <span className={l.available ? 'text-slate-700 font-semibold' : 'text-slate-400'}>{l.label}</span>
              <span className={`text-[8px] shrink-0 font-bold uppercase ${l.available ? 'text-emerald-600' : 'text-slate-400'}`}>{l.available ? 'Available' : 'Not available'}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* CHARTS */}
      <CollapsibleSection title="Charts" defaultOpen={false}>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Population by Catchment</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catchments.map(c => ({ label: c.label, population: c.population }))} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={32} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="population" fill="#4a3aa7" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Population Density Histogram (H3 Cells)</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={densityHistogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 7, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="count" fill="#2a78d6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Population Percentiles</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={percentiles} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="percentile" tick={{ fontSize: 8, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={32} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="density" fill="#eb6834" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top 20 H3 Cells by Population</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCells.map(c => ({ id: c.h3Id.slice(-6), population: c.population }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="population" fill="#10b981" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <MetricTile label="Population Growth Chart" unavailable note="No time-series population data -- only a single snapshot exists." />
        </div>
      </CollapsibleSection>

      {/* 5/6. DEMAND ASSESSMENT */}
      <CollapsibleSection title="Demand Assessment">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Metric</th>
                <th className="py-1.5 px-3 font-bold text-right">Value</th>
                <th className="py-1.5 px-3 font-bold">Benchmark</th>
                <th className="py-1.5 px-3 font-bold">Status</th>
                <th className="py-1.5 pl-3 font-bold">Priority</th>
              </tr>
            </thead>
            <tbody>
              {demand.metrics.map(m => (
                <tr key={m.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{m.label}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{m.displayValue}</td>
                  <td className="py-2 px-3 text-slate-400 text-[9px]">{m.benchmark || '—'}</td>
                  <td className={`py-2 px-3 font-bold uppercase text-[9px] ${STATUS_COLORS[m.status]}`}>{m.status}</td>
                  <td className="py-2 pl-3 text-[9px] font-semibold text-slate-600">{m.priority}</td>
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
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Community Profile</p>
              <p className="text-slate-700 leading-relaxed">{aiInsights.communityProfile}</p>
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
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Key Findings</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.keyFindings.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Design Drivers</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.designDrivers.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-amber-600 mb-1">Constraints</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.constraints.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Design Opportunities</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.opportunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 8. SUPPORTING EVIDENCE */}
      <CollapsibleSection title="Supporting Evidence" defaultOpen={false}>
        {!aiInsights && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">Run the analysis to generate evidence-backed recommendations.</p>}
        {aiInsights && (
          <div className="space-y-2">
            {aiInsights.priorityRecommendations.map((rec, i) => (
              <div key={i} className="border border-slate-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-700">{rec.recommendation}</span>
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
