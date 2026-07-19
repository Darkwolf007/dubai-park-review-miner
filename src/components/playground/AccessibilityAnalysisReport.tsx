import { useRef } from 'react';
import {
  Download, FileSpreadsheet, FileJson, Camera, FileText, Package,
  Sparkles, MapPin
} from 'lucide-react';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import type { H3Feature } from '../../lib/gis/types';
import type { AccessibilityAnalysisReportData } from '../../lib/gis/accessibilityEngine';
import { computeHexAccessibilityDeficitScore } from '../../lib/gis/accessibilityEngine';
import type { AccessibilityInsightsResult } from '../../lib/gis/accessibilityInsightsEngine';
import { downloadCsv, downloadExcel, downloadGeoJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';

const STATUS_BADGE_COLORS: Record<string, string> = {
  Poor: 'bg-rose-50 border-rose-200 text-rose-700',
  Fair: 'bg-amber-50 border-amber-200 text-amber-700',
  Good: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  'Very Good': 'bg-emerald-50 border-emerald-200 text-emerald-700',
  Excellent: 'bg-emerald-50 border-emerald-200 text-emerald-700'
};

const SEVERITY_COLORS: Record<string, string> = {
  High: 'text-rose-600',
  Medium: 'text-amber-600',
  Low: 'text-slate-400'
};

export function AccessibilityAnalysisReport({
  report,
  aiInsights,
  aiInsightsError,
  hexes
}: {
  report: AccessibilityAnalysisReportData;
  aiInsights: AccessibilityInsightsResult | null;
  aiInsightsError: string | null;
  hexes: H3Feature[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { executiveSummary, kpis, catchments, entrance, transit, pedestrianQuality, barriers, topUnderservedCells, walkingTimeHistogram, reachabilityNote } = report;

  function exportCsvRows() {
    const rows: Record<string, any>[] = [];
    rows.push({ section: 'Executive Summary', metric: 'Overall Accessibility Score', value: `${executiveSummary.overallAccessibilityScore}/100 (${executiveSummary.overallAccessibilityStatus})` });
    rows.push({ section: 'Executive Summary', metric: 'Transit Accessibility', value: executiveSummary.transitAccessibilityLabel });
    rows.push({ section: 'Executive Summary', metric: 'Most Underserved Zone', value: executiveSummary.mostUnderservedZone });
    catchments.forEach(c => rows.push({ section: 'Walking Catchments', metric: c.label, value: `${c.population.toLocaleString()} residents (${c.pctOfTotalPopulation}%)` }));
    rows.push({ section: 'Transit', metric: 'Bus Stops within 500m', value: kpis.busStopsWithin500m });
    rows.push({ section: 'Transit', metric: 'Transit Accessibility Score', value: `${transit.transitAccessibilityScore}/100` });
    rows.push({ section: 'Pedestrian Network', metric: 'Walkability Score', value: `${pedestrianQuality.walkabilityScore}/100` });
    barriers.barriers.forEach(b => rows.push({ section: 'Barriers', metric: b.type, value: b.count }));
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
        <button onClick={() => downloadCsv(toCsvString(exportCsvRows()), 'accessibility_analysis.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(exportCsvRows(), 'accessibility_analysis.xlsx', 'Accessibility Analysis')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="w-3 h-3" /> Excel
        </button>
        <button
          onClick={() => downloadGeoJson({
            type: 'FeatureCollection',
            features: hexes.map(h => ({ ...h, properties: { ...h.properties, accessibility_deficit_score: computeHexAccessibilityDeficitScore(h) } }))
          }, 'accessibility_h3_grid.geojson')}
          className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Download className="w-3 h-3" /> GeoJSON
        </button>
        <button onClick={() => downloadGeoJson(report as any, 'accessibility_analysis.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileJson className="w-3 h-3" /> Analysis JSON
        </button>
        <button onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'accessibility_analysis.png')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
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
          <span className="text-[11px] font-extrabold text-slate-800">Accessibility Analysis Complete</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${STATUS_BADGE_COLORS[executiveSummary.overallAccessibilityStatus] || ''}`}>
            {executiveSummary.overallAccessibilityStatus.toUpperCase()} &middot; {executiveSummary.overallAccessibilityScore}/100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Study Area" value={executiveSummary.studyArea} />
          <MetricTile label="Residents within 5-Min Walk" value={executiveSummary.pop5MinWalk.toLocaleString()} />
          <MetricTile label="Residents within 10-Min Walk" value={executiveSummary.pop10MinWalk.toLocaleString()} />
          <MetricTile label="Residents within 15-Min Walk" value={executiveSummary.pop15MinWalk.toLocaleString()} />
          <MetricTile label="Transit Accessibility" value={executiveSummary.transitAccessibilityLabel} />
          <MetricTile label="Best Performing Entrance" value={executiveSummary.bestPerformingEntrance} note="Only one derivable entrance exists for this site -- see Park Entrance Analysis." />
          <MetricTile label="Most Underserved Zone" value={executiveSummary.mostUnderservedZone} />
        </div>
      </CollapsibleSection>

      {/* 2. ACCESSIBILITY KPIs */}
      <CollapsibleSection title="Accessibility KPIs">
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Residents within 5-Min Walk" value={kpis.pop5MinWalk.toLocaleString()} />
          <MetricTile label="Residents within 10-Min Walk" value={kpis.pop10MinWalk.toLocaleString()} />
          <MetricTile label="Residents within 15-Min Walk" value={kpis.pop15MinWalk.toLocaleString()} />
          <MetricTile label="Population Outside 15-Min Walk" value={kpis.popOutside15MinWalk.toLocaleString()} />
          <MetricTile label="Avg Walking Distance" value={kpis.avgWalkingDistanceM ?? undefined} unavailable={kpis.avgWalkingDistanceM === null} unit="m" />
          <MetricTile label="Median Walking Distance" value={kpis.medianWalkingDistanceM ?? undefined} unavailable={kpis.medianWalkingDistanceM === null} unit="m" />
          <MetricTile label="Max Walking Distance" value={kpis.maxWalkingDistanceM ?? undefined} unavailable={kpis.maxWalkingDistanceM === null} unit="m" />
          <MetricTile label="Population-Weighted Walking Distance" value={kpis.populationWeightedWalkingDistanceM ?? undefined} unavailable={kpis.populationWeightedWalkingDistanceM === null} unit="m" />
          <MetricTile label="Park Entrances" value={kpis.entranceCount} note={kpis.entranceCountNote} />
          <MetricTile label="Population Served per Entrance" value={kpis.popServedPerEntrance.toLocaleString()} />
          <MetricTile label="Nearest Bus Stop Distance" value={kpis.nearestBusStopDistanceM ?? undefined} unavailable={kpis.nearestBusStopDistanceM === null} unit="m" />
          <MetricTile label="Bus Stops within 500m" value={kpis.busStopsWithin500m} />
          <MetricTile label="Metro Stations within 2km" unavailable note={kpis.metroNote} />
          <MetricTile label="Parking Facilities within 500m" value={kpis.parkingFacilitiesWithin500m ?? undefined} unavailable={kpis.parkingFacilitiesWithin500m === null} note={kpis.parkingNote} />
          <MetricTile label="Pedestrian Crossing Count" unavailable note={kpis.pedestrianCrossingNote} />
          <MetricTile label="Road Barrier Count" value={kpis.roadBarrierCount.toLocaleString()} note="Primary + Secondary road segments." />
          <MetricTile label="Dead-End Street Count" value={kpis.deadEndStreetCount.toLocaleString()} />
          <MetricTile label="Accessible Route Coverage" unavailable note={kpis.accessibleRouteNote} />
          <MetricTile label="Universal Accessibility Score" unavailable note={kpis.universalAccessibilityNote} />
          <MetricTile label="Overall Accessibility Score" value={`${kpis.overallAccessibilityScore}/100`} methodologyKey="accessibilityScore" />
        </div>
      </CollapsibleSection>

      {/* 3. WALKING CATCHMENTS */}
      <CollapsibleSection title="Walking Catchments" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">{report.catchmentMethodology}</p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Band</th>
                <th className="py-1.5 px-3 font-bold text-right">Population</th>
                <th className="py-1.5 px-3 font-bold text-right">Area</th>
                <th className="py-1.5 px-3 font-bold text-right">Density</th>
                <th className="py-1.5 px-3 font-bold text-right">% of Total</th>
                <th className="py-1.5 px-3 font-bold text-right">Avg Route Dist.</th>
                <th className="py-1.5 pl-3 font-bold text-right">Directness</th>
              </tr>
            </thead>
            <tbody>
              {catchments.map(c => (
                <tr key={c.minutes} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{c.label}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{c.population.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.areaKm2} km²</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.densityPerKm2.toLocaleString()}/km²</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.pctOfTotalPopulation}%</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500">{c.avgRouteDistanceM !== null ? `${c.avgRouteDistanceM} m` : 'N/A'}</td>
                  <td className="py-2 pl-3 text-right font-mono text-slate-500">{c.avgRouteDirectness !== null ? c.avgRouteDirectness.toFixed(2) : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Population by Walking-Time Band</p>
        <div className="h-40 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={catchments.map(c => ({ label: c.label.replace('-Minute Walk', ' min'), population: c.population }))} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={40} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="population" fill="#4a3aa7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Radial Accessibility (Amenities per Band)</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={catchments.map(c => ({
              band: `${c.minutes} min`, Schools: c.schoolCount, 'Bus Stops': c.busStopCount, Clinics: c.clinicCount, Mosques: c.mosqueCount, Commercial: c.commercialAmenityCount
            }))}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="band" tick={{ fontSize: 8, fill: '#64748b' }} />
              <PolarRadiusAxis tick={{ fontSize: 7, fill: '#94a3b8' }} />
              <Radar name="Schools" dataKey="Schools" stroke="#4a3aa7" fill="#4a3aa7" fillOpacity={0.15} />
              <Radar name="Bus Stops" dataKey="Bus Stops" stroke="#1baf7a" fill="#1baf7a" fillOpacity={0.15} />
              <Radar name="Commercial" dataKey="Commercial" stroke="#eb6834" fill="#eb6834" fillOpacity={0.15} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 4. PARK ENTRANCE ANALYSIS */}
      <CollapsibleSection title="Park Entrance Analysis" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">{entrance.note}</p>
        {entrance.entrance ? (
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <MetricTile label="Entrance" value={entrance.entrance.label} note={`Snapped ${entrance.entrance.snapDistanceM}m from the verified park center.`} />
            <MetricTile label="Entrance Accessibility Score" value={`${entrance.entrance.entranceAccessibilityScore}/100`} methodologyKey="entranceOpportunity" />
            <MetricTile label="Population Served (15-Min Catchment)" value={entrance.entrance.populationServedWithin15Min.toLocaleString()} />
            <MetricTile label="15-Min Catchment Share" value={entrance.entrance.catchment15MinPct} unit="%" />
            <MetricTile label="Avg Walking Distance" value={entrance.entrance.avgWalkingDistanceM ?? undefined} unavailable={entrance.entrance.avgWalkingDistanceM === null} unit="m" />
            <MetricTile label="Bus Stops within 300m" value={entrance.entrance.nearbyBusStopsWithin300m} />
            <MetricTile label="Schools within 1km" value={entrance.entrance.nearbySchoolsWithin1km} />
            <MetricTile label="Barrier-Free Access" unavailable note="No wheelchair/ramp tagging at this location in the source data." />
          </div>
        ) : (
          <p className="text-slate-400 text-[10px] font-semibold text-center py-4">Entrance analysis unavailable for this run.</p>
        )}
        <p className="text-[8px] text-slate-400 leading-relaxed">{entrance.scopeNote}</p>
      </CollapsibleSection>

      {/* 5. PUBLIC TRANSPORT ACCESSIBILITY */}
      <CollapsibleSection title="Public Transport Accessibility" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Bus Stop Density" value={transit.busStopDensityPerKm2} unit="/km²" />
          <MetricTile label="Population within 400m of Bus Stop" value={transit.popWithin400mOfBusStop.toLocaleString()} note={`${transit.popWithin400mPct}% of total population.`} />
          <MetricTile label="Avg Nearest Bus Stop Distance" value={transit.avgNearestBusStopDistanceM ?? undefined} unavailable={transit.avgNearestBusStopDistanceM === null} unit="m" />
          <MetricTile label="Transit Accessibility Score" value={`${transit.transitAccessibilityScore}/100`} note={transit.transitAccessibilityLabel} />
          <MetricTile label="Metro Stations within 2km" unavailable note={transit.metroNote} />
          <MetricTile label="Population within 800m of Metro" unavailable note={transit.metroNote} />
          <MetricTile label="Parking within 500m" value={transit.parkingWithin500mCount ?? undefined} unavailable={transit.parkingWithin500mCount === null} />
          <MetricTile label="Multimodal Accessibility Score" value={`${Math.round((transit.transitAccessibilityScore + (transit.parkingWithin500mCount !== null ? Math.min(100, transit.parkingWithin500mCount * 10) : 0)) / (transit.parkingWithin500mCount !== null ? 2 : 1))}/100`} note="Composite of transit + parking proximity." />
        </div>
      </CollapsibleSection>

      {/* 6. PEDESTRIAN NETWORK QUALITY */}
      <CollapsibleSection title="Pedestrian Network Quality" defaultOpen={false}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold text-slate-800">Walkability Score</span>
          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border bg-indigo-50 border-indigo-200 text-indigo-700">
            {pedestrianQuality.walkabilityScore}/100
          </span>
        </div>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Component</th>
                <th className="py-1.5 px-3 font-bold text-right">Score</th>
                <th className="py-1.5 pl-3 font-bold text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {pedestrianQuality.components.map(c => (
                <tr key={c.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{c.label}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{c.score}/100</td>
                  <td className="py-2 pl-3 text-right font-mono text-slate-500">{c.weightPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-amber-600 font-semibold mb-3">{pedestrianQuality.shadeCoverageNote}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Street Connectivity" value={`${pedestrianQuality.connectivityScore}/100`} />
          <MetricTile label="Intersection Density" value={pedestrianQuality.intersectionDensityPerKm2} unit="/km²" />
          <MetricTile label="Average Block Length" value={pedestrianQuality.avgBlockLengthM ?? undefined} unavailable={pedestrianQuality.avgBlockLengthM === null} unit="m" note="Estimated as √(avg block area) -- a real graph-theoretic block estimate, not a measured block outline." />
          <MetricTile label="Average Block Size" value={pedestrianQuality.avgBlockSizeM2 !== null ? pedestrianQuality.avgBlockSizeM2.toLocaleString() : undefined} unavailable={pedestrianQuality.avgBlockSizeM2 === null} unit="m²" />
          <MetricTile label="Dead-End Ratio" value={pedestrianQuality.deadEndRatioPct} unit="%" />
          <MetricTile label="Route Directness" value={pedestrianQuality.routeDirectnessAvg ?? undefined} unavailable={pedestrianQuality.routeDirectnessAvg === null} />
          <MetricTile label="Sidewalk / Pedestrian-Way Coverage" value={pedestrianQuality.sidewalkCoveragePct} unit="%" note="Share of total road length tagged footway/path/pedestrian/cycleway/steps." />
          <MetricTile label="Shaded Route Coverage" unavailable note={pedestrianQuality.shadeCoverageNote} />
        </div>
        <p className="text-[8px] text-slate-400 mt-2 leading-relaxed">{pedestrianQuality.methodology}</p>
      </CollapsibleSection>

      {/* 7. BARRIER AND SAFETY ANALYSIS */}
      <CollapsibleSection title="Barrier and Safety Analysis" defaultOpen={false}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold text-slate-800">Barrier Exposure</span>
          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border bg-amber-50 border-amber-200 text-amber-700">
            {barriers.barrierExposureLabel.toUpperCase()} &middot; {barriers.totalBarrierExposureScore}/100
          </span>
        </div>
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Barrier Type</th>
                <th className="py-1.5 px-3 font-bold text-right">Count</th>
                <th className="py-1.5 pl-3 font-bold">Severity</th>
              </tr>
            </thead>
            <tbody>
              {barriers.barriers.map(b => (
                <tr key={b.type} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">
                    {b.type}
                    <p className="text-[8px] text-slate-400 font-normal mt-0.5">{b.note}</p>
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{b.count.toLocaleString()}</td>
                  <td className={`py-2 pl-3 font-bold uppercase text-[9px] ${SEVERITY_COLORS[b.severity]}`}>{b.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[8px] text-slate-400 leading-relaxed">{barriers.crossingDeficiencyNote} {barriers.methodology}</p>
      </CollapsibleSection>

      {/* 8. H3 ACCESSIBILITY ANALYSIS */}
      <CollapsibleSection title="H3 Accessibility Analysis" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><MapPin className="w-3 h-3 text-indigo-500" /> Switch map modes (Walking Time, Park Access Score, Walkability, Transit Accessibility, Barrier Severity, Underserved Population) on in the Dataset Explorer to visualize these fields.</p>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">{reachabilityNote}</p>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Walking Time Distribution (Reachable Cells)</p>
        <div className="h-40 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={walkingTimeHistogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 7, fill: '#64748b' }} unit=" min" />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" fill="#2a78d6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top 20 Underserved H3 Cells (Population-Weighted Deficit)</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topUnderservedCells.map(c => ({ id: c.h3Id.slice(-6), deficit: c.deficitScore }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="deficit" fill="#e34948" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 9. AI INTERPRETATION */}
      <CollapsibleSection title="AI Interpretation">
        {aiInsightsError && <p className="text-[10px] font-semibold text-rose-600">{aiInsightsError}</p>}
        {!aiInsights && !aiInsightsError && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">AI interpretation unavailable for this run.</p>}
        {aiInsights && (
          <div className="space-y-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[8px] text-slate-400 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> {aiInsights.engine}</span>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Accessibility Profile</p>
              <p className="text-slate-700 leading-relaxed">{aiInsights.accessibilityProfile}</p>
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
              <p className="text-[8px] font-bold uppercase tracking-wider text-amber-600 mb-1">Critical Barriers</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.criticalBarriers.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Underserved Communities</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.underservedCommunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Pedestrian Design Drivers</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.pedestrianDesignDrivers.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 10. SUPPORTING EVIDENCE */}
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
