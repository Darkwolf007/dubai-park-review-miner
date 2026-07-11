import { useRef } from 'react';
import {
  Download, FileSpreadsheet, FileJson, Camera, FileText, Package,
  Sparkles, Users2, Box
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import type { H3Feature, RoadStats } from '../../lib/gis/types';
import type { CommunityAnalysisReportData, CommMetricStatus } from '../../lib/gis/communityEngine';
import {
  hexCommunityVulnerabilityScore, hexCommunityOpportunityScore, hexFamilyDemandScore, hexYouthDemandScore,
  hexOlderAdultDemandScore, hexFacilityAccessScore, hexPlaygroundDeficitScore, hexSportsDeficitScore,
  hexGreenSpaceDeficitScore, hexCommunityDiversityScore, PROGRAM_DEFS
} from '../../lib/gis/communityEngine';
import type { CommunityInsightsResult } from '../../lib/gis/communityInsightsEngine';
import { computeCommunityGrasshopperExport, communityGrasshopperExportToCsv } from '../../lib/gis/grasshopperExportEngine';
import { downloadCsv, downloadExcel, downloadGeoJson, downloadJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';

const STATUS_COLORS: Record<CommMetricStatus, string> = {
  good: 'text-emerald-600',
  watch: 'text-amber-600',
  critical: 'text-rose-600',
  unavailable: 'text-slate-400'
};

const BADGE_COLORS: Record<string, string> = {
  CRITICAL: 'bg-rose-50 border-rose-200 text-rose-700',
  LOW: 'bg-slate-50 border-slate-200 text-slate-600',
  MODERATE: 'bg-amber-50 border-amber-200 text-amber-700',
  HIGH: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  'VERY HIGH': 'bg-emerald-50 border-emerald-200 text-emerald-700'
};

export function CommunityAnalysisReport({
  report,
  aiInsights,
  aiInsightsError,
  hexes,
  roadStats
}: {
  report: CommunityAnalysisReportData;
  aiInsights: CommunityInsightsResult | null;
  aiInsightsError: string | null;
  hexes: H3Feature[];
  roadStats: RoadStats | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { executiveSummary, kpis, facilityStats, supermarketCount, catchments, walkingCatchments, ageGroups, activityPatterns, underservedZones, personas, programDemand, topOpportunityCells } = report;

  function exportCsvRows() {
    const rows: Record<string, any>[] = [];
    rows.push({ section: 'Executive Summary', metric: 'Overall Community Score', value: `${executiveSummary.overallCommunityScore}/100 (${executiveSummary.overallStatusBadge})` });
    rows.push({ section: 'Executive Summary', metric: 'Dominant Community Type', value: executiveSummary.dominantCommunityType });
    kpis.metrics.forEach(m => rows.push({ section: 'Community KPIs', metric: m.label, value: m.displayValue, status: m.status }));
    facilityStats.forEach(f => rows.push({ section: 'Social Infrastructure', metric: f.label, value: f.count ?? 'Not loaded' }));
    programDemand.forEach(p => rows.push({ section: 'Program Demand', metric: p.name, value: `${p.demandScore}/100 (${p.priority})` }));
    return rows;
  }

  function toCsvString(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '';
    const cols = Object.keys(rows[0]);
    return [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  }

  function handleGrasshopperExport(format: 'json' | 'csv' | 'geojson') {
    const gh = computeCommunityGrasshopperExport(
      hexes,
      {
        familyDemand: hexFamilyDemandScore, youthDemand: hexYouthDemandScore, olderAdultDemand: hexOlderAdultDemandScore,
        facilityAccess: hexFacilityAccessScore, playgroundDeficit: hexPlaygroundDeficitScore, sportsDeficit: hexSportsDeficitScore,
        greenSpaceDeficit: hexGreenSpaceDeficitScore, vulnerability: hexCommunityVulnerabilityScore, opportunity: hexCommunityOpportunityScore,
        diversity: hexCommunityDiversityScore
      },
      programDemand,
      PROGRAM_DEFS
    );
    if (format === 'json') downloadJson(gh, 'community_program_inputs.json');
    if (format === 'csv') downloadCsv(communityGrasshopperExportToCsv(gh), 'community_program_inputs.csv');
    if (format === 'geojson') {
      downloadGeoJson({
        type: 'FeatureCollection',
        features: hexes.map((h, i) => ({ type: 'Feature', geometry: h.geometry, properties: { h3_id: h.properties.h3_id, ...gh.cells[i] } }))
      }, 'community_program_inputs.geojson');
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {/* EXPORT TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => downloadCsv(toCsvString(exportCsvRows()), 'community_analysis.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(exportCsvRows(), 'community_analysis.xlsx', 'Community Analysis')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="w-3 h-3" /> Excel
        </button>
        <button onClick={() => downloadGeoJson({ type: 'FeatureCollection', features: hexes }, 'community_h3_grid.geojson')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> GeoJSON
        </button>
        <button onClick={() => downloadJson(report, 'community_analysis.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileJson className="w-3 h-3" /> Analysis JSON
        </button>
        <button onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'community_analysis.png')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
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
          <span className="text-[11px] font-extrabold text-slate-800">Community Analysis Complete</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${BADGE_COLORS[executiveSummary.overallStatusBadge]}`}>
            {executiveSummary.overallStatusBadge} &middot; {executiveSummary.overallCommunityScore}/100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Study Area" value={executiveSummary.studyArea} />
          <MetricTile label="Population Served" value={executiveSummary.populationServed.toLocaleString()} />
          <MetricTile label="Dominant Community Type" value={executiveSummary.dominantCommunityType} />
          <MetricTile label="Primary User Groups" value={executiveSummary.primaryUserGroups.join(', ')} />
          <MetricTile label="Schools Within Study Area" value={executiveSummary.schoolsCount ?? undefined} unavailable={executiveSummary.schoolsCount === null} />
          <MetricTile label="Mosques Within Study Area" value={executiveSummary.mosquesCount ?? undefined} unavailable={executiveSummary.mosquesCount === null} />
          <MetricTile label="Healthcare Facilities" value={executiveSummary.healthcareFacilitiesCount ?? undefined} unavailable={executiveSummary.healthcareFacilitiesCount === null} note="Clinics + hospitals." />
          <MetricTile label="Community Facility Access" value={executiveSummary.communityFacilityAccessStatus} />
          <MetricTile label="Family Recreation Demand" value={executiveSummary.familyRecreationDemandStatus} />
        </div>
      </CollapsibleSection>

      {/* 2. COMMUNITY KPIs */}
      <CollapsibleSection title="Community KPIs" defaultOpen={false}>
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

      {/* 3. DEMOGRAPHIC PROFILE */}
      <CollapsibleSection title="Demographic Profile" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">No official census/demographic dataset (age, household, nationality, income, residential typology) exists for this site or is legally available at this scale. Every figure below is either a real proxy (disclosed) or explicitly unavailable -- never an invented percentage.</p>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Age Distribution" unavailable note="No census data. See Family and Age-Group Analysis for a proxy-based demand estimate." />
          <MetricTile label="Gender Distribution" unavailable />
          <MetricTile label="Household Size" unavailable />
          <MetricTile label="Nationality Mix" unavailable />
          <MetricTile label="Income Band" unavailable note="Not legally available at this scale even if it existed." />
          <MetricTile label="Villa vs. Apartment Buildings (Partial Sample)" value="1,110 of 40,482 buildings" note="Only 2.74% of buildings carry a real villa/apartment/house OSM subtype tag -- too small a sample to characterize area-wide residential typology, shown as a labeled partial statistic only." />
          <MetricTile label="Population Growth" unavailable note="No time-series population data -- single snapshot only." />
          <MetricTile label="Daytime vs. Nighttime Population" unavailable />
        </div>
      </CollapsibleSection>

      {/* 4. COMMUNITY CATCHMENTS */}
      <CollapsibleSection title="Community Catchments" defaultOpen={false}>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Euclidean Rings (Population + Real Facility Counts)</p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-left text-[9px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                <th className="py-1.5 pr-2 font-bold">Ring</th>
                <th className="py-1.5 px-2 font-bold text-right">Population</th>
                <th className="py-1.5 px-2 font-bold text-right">Schools</th>
                <th className="py-1.5 px-2 font-bold text-right">Mosques</th>
                <th className="py-1.5 px-2 font-bold text-right">Clinics</th>
                <th className="py-1.5 px-2 font-bold text-right">Sports</th>
                <th className="py-1.5 px-2 font-bold text-right">Playgrounds</th>
                <th className="py-1.5 px-2 font-bold text-right">Retail</th>
                <th className="py-1.5 pl-2 font-bold text-right">Bus Stops</th>
              </tr>
            </thead>
            <tbody>
              {catchments.map(c => (
                <tr key={c.radiusM} className="border-b border-slate-100 last:border-0 text-slate-600">
                  <td className="py-1.5 pr-2 font-semibold text-slate-700">{c.label}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.population.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.schools}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.mosques}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.clinics}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.sportsFacilities}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.playgrounds}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{c.retail}</td>
                  <td className="py-1.5 pl-2 text-right font-mono">{c.busStops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[8px] text-slate-400 mb-3">Facility counts require facility layers to be loaded for this run (schools/mosques/clinics/sports/playgrounds/shops/parks) -- 0 may mean "not loaded" rather than "none present"; see Social Infrastructure below for load status.</p>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Network-Based Walking Bands (reused from Accessibility Analysis)</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={walkingCatchments.map(c => ({ label: `${c.minutes} min`, population: c.population }))} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={40} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="population" fill="#4a3aa7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 5. SOCIAL INFRASTRUCTURE */}
      <CollapsibleSection title="Social Infrastructure" defaultOpen={false}>
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-left text-[9px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                <th className="py-1.5 pr-2 font-bold">Facility Type</th>
                <th className="py-1.5 px-2 font-bold text-right">Count</th>
                <th className="py-1.5 px-2 font-bold text-right">Density</th>
                <th className="py-1.5 px-2 font-bold text-right">Avg Distance to Park</th>
                <th className="py-1.5 pl-2 font-bold text-right">Population per Facility</th>
              </tr>
            </thead>
            <tbody>
              {facilityStats.map(f => (
                <tr key={f.key} className="border-b border-slate-100 last:border-0 text-slate-600">
                  <td className="py-1.5 pr-2 font-semibold text-slate-700">{f.label}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{f.loaded ? f.count?.toLocaleString() : <span className="text-slate-400">not loaded</span>}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{f.densityPerKm2 !== null ? `${f.densityPerKm2}/km²` : '—'}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{f.avgDistanceToParkM !== null ? `${f.avgDistanceToParkM.toLocaleString()} m` : '—'}</td>
                  <td className="py-1.5 pl-2 text-right font-mono">{f.populationPerFacility !== null ? f.populationPerFacility.toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Supermarkets" value={supermarketCount ?? undefined} unavailable={supermarketCount === null} note="Filtered from the Retail (Shops) layer via shop=supermarket." />
          <MetricTile label="Nurseries / Universities / Libraries / Community Centers" unavailable note="No dedicated layer -- confirmed near-zero or zero OSM tags for these categories in this extract." />
        </div>
        <p className="text-[8px] text-slate-400 mt-2">Distances are straight-line (Euclidean) from the verified park center to each facility's centroid, not network-routed.</p>
      </CollapsibleSection>

      {/* 6. FAMILY AND AGE-GROUP ANALYSIS */}
      <CollapsibleSection title="Family and Age-Group Analysis" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">No official age-band population data exists for this site. Every demand level below is a proxy estimate from review-sentiment personas, nearby facility presence, and related Park Health Score subscores.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ageGroups.map(g => (
            <div key={g.key} className="border border-slate-200 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-700">{g.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider border ${BADGE_COLORS[g.demandLevel === 'Very High' ? 'VERY HIGH' : g.demandLevel.toUpperCase()]}`}>{g.demandLevel} &middot; {g.demandScore}/100</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                {g.evidence.map((e, i) => <span key={i} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{e}</span>)}
              </div>
              <p className="text-[8px] text-slate-500"><span className="font-bold">Recommended:</span> {g.recommendedPrograms.join(', ')}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 7. COMMUNITY ACTIVITY PATTERNS */}
      <CollapsibleSection title="Community Activity Patterns" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">{`Estimated activity pattern -- derived from real review-text time-of-day mentions, not measured foot traffic or verified visit timestamps.`}</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityPatterns.map(a => ({ label: a.label, mentions: a.mentionCount }))} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#64748b' }} angle={-25} textAnchor="end" interval={0} height={50} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="mentions" fill="#2a78d6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 8. EQUITY AND UNDERSERVED AREAS */}
      <CollapsibleSection title="Equity and Underserved Areas" defaultOpen={false}>
        {underservedZones.length === 0 && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">No underserved zone identified for this run.</p>}
        {underservedZones.map(z => (
          <div key={z.compassZone} className="border border-rose-200 bg-rose-50/40 rounded p-2 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-rose-700">{z.compassZone}</span>
              <span className="text-[9px] font-extrabold text-rose-600">Vulnerability {z.avgVulnerabilityScore}/100</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[9px] text-slate-600">
              <span><span className="font-bold">Population:</span> {z.population.toLocaleString()}</span>
              <span><span className="font-bold">Avg Walking Time to Park:</span> {z.avgWalkingTimeMinutes !== null ? `${z.avgWalkingTimeMinutes} min` : 'No route'}</span>
              <span className="col-span-2"><span className="font-bold">Facilities Missing:</span> {z.facilitiesMissing.length > 0 ? z.facilitiesMissing.join(', ') : 'None flagged'}</span>
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {/* 9. H3 COMMUNITY ANALYSIS */}
      <CollapsibleSection title="H3 Community Analysis" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2">Every H3 cell carries real Family/Youth/Older-Adult Demand, Facility Access, Playground/Sports Deficit, Community Vulnerability, and Community Opportunity scores -- composites of real facility-presence signals and population density (see each metric's methodology). Switch map modes in the Dataset Explorer to visualize them.</p>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top 20 H3 Cells by Community Opportunity</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOpportunityCells.map(c => ({ id: c.h3Id.slice(-6), score: c.score }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="score" fill="#eb6834" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleSection>

      {/* 10. USER PERSONAS */}
      <CollapsibleSection title="User Personas" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><Users2 className="w-3 h-3 text-indigo-500" /> Evidence-based personas from real review-text keyword matching (multi-label -- a review can match more than one persona). Personas with zero matches for this park's reviews are omitted rather than shown empty.</p>
        {personas.length === 0 && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">No persona matches found in the available reviews.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {personas.map(p => (
            <div key={p.id} className="border border-slate-200 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-700">{p.label}</span>
                <span className="text-[9px] font-extrabold text-indigo-700">{p.reviewCount} review{p.reviewCount !== 1 ? 's' : ''}</span>
              </div>
              {p.primaryNeeds.length > 0 && <p className="text-[8px] text-slate-500 mb-1"><span className="font-bold">Primary Needs:</span> {p.primaryNeeds.join(', ')}</p>}
              {p.suggestedIntervention && <p className="text-[8px] text-indigo-600 mb-1"><span className="font-bold">Suggested:</span> {p.suggestedIntervention}</p>}
              {p.positiveQuote && <p className="text-[8px] text-slate-400 italic">&ldquo;{p.positiveQuote}&rdquo; &mdash; {p.positiveQuoteAuthor || 'Anonymous'}</p>}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 11. PROGRAM DEMAND ANALYSIS */}
      <CollapsibleSection title="Program Demand Analysis" defaultOpen={false}>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Program Demand Ranking</p>
        <div className="h-72 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={programDemand.map(p => ({ name: p.name, score: p.demandScore }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="score" fill="#4a3aa7" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5">
          {programDemand.slice(0, 8).map(p => (
            <div key={p.key} className="border border-slate-200 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-700">{p.name}</span>
                <span className="text-[9px] font-extrabold text-indigo-700">{p.demandScore}/100 &middot; {p.confidence}% confidence</span>
              </div>
              <p className="text-[8px] text-slate-500 mb-1"><span className="font-bold">Primary Users:</span> {p.primaryUsers.join(', ')}</p>
              <div className="flex flex-wrap gap-1 mb-1">{p.evidence.map((e, i) => <span key={i} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{e}</span>)}</div>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${p.priority === 'Very High' || p.priority === 'High' ? 'text-rose-600' : p.priority === 'Medium' ? 'text-amber-600' : 'text-slate-400'}`}>Priority: {p.priority}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 12. AI INTERPRETATION */}
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
              <p className="text-[8px] font-bold uppercase tracking-wider text-amber-600 mb-1">Equity Concerns</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.equityConcerns.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Design Drivers</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.designDrivers.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Program Priorities</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.programPriorities.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 13. SUPPORTING EVIDENCE */}
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

      {/* 14. GRASSHOPPER PROGRAM INPUTS */}
      <CollapsibleSection title="Grasshopper Program Inputs" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><Box className="w-3 h-3 text-indigo-500" /> Per-hex normalized (0-1) demand/deficit scores in EPSG:32640 coordinates, plus a structured program list (target/min/max area, priority, requirements, adjacencies) -- directly usable as Grasshopper zoning and optimization inputs.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button onClick={() => handleGrasshopperExport('json')} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700">
            <FileJson className="w-3 h-3" /> Export Community Program to Grasshopper
          </button>
          <button onClick={() => handleGrasshopperExport('csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> CSV with Coordinates
          </button>
          <button onClick={() => handleGrasshopperExport('geojson')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> GeoJSON
          </button>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Program List Preview</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[9px] font-mono">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                <th className="py-1 pr-2 font-bold">name</th>
                <th className="py-1 px-2 font-bold text-right">target_m2</th>
                <th className="py-1 px-2 font-bold text-right">min_count</th>
                <th className="py-1 px-2 font-bold text-right">max_count</th>
                <th className="py-1 pl-2 font-bold text-right">priority</th>
              </tr>
            </thead>
            <tbody>
              {PROGRAM_DEFS.slice(0, 10).map(def => {
                const demand = programDemand.find(p => p.key === def.key);
                return (
                  <tr key={def.key} className="border-b border-slate-100 last:border-0 text-slate-600">
                    <td className="py-1 pr-2">{def.name}</td>
                    <td className="py-1 px-2 text-right">{def.targetAreaM2}</td>
                    <td className="py-1 px-2 text-right">{def.minCount}</td>
                    <td className="py-1 px-2 text-right">{def.maxCount}</td>
                    <td className="py-1 pl-2 text-right">{Math.round(((demand?.demandScore ?? 50) / 100) * 100) / 100}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
}
