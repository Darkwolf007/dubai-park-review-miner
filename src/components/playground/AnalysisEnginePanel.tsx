import { useState } from 'react';
import { Play, Loader2, Users2, Building2, Footprints, Leaf, Users, MapPinned, Route, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { H3Feature, GeoJsonFeature, RoadStats, SpaceSyntaxFeature, SpaceSyntaxStats } from '../../lib/gis/types';
import type { PoiCounts } from '../../lib/gis/communityEngine';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computePopulationAnalysis } from '../../lib/gis/populationEngine';
import { computeUrbanAnalysis } from '../../lib/gis/urbanEngine';
import { computeAccessibilityAnalysis } from '../../lib/gis/accessibilityEngine';
import { computeEnvironmentalAnalysis } from '../../lib/gis/environmentalEngine';
import { computeCommunityAnalysis } from '../../lib/gis/communityEngine';
import { computeNlpSpatialAnalysis } from '../../lib/gis/reviewNlpSpatialEngine';
import { computeSpaceSyntaxAnalysis } from '../../lib/gis/spaceSyntaxEngine';
import { generateDesignStrategy } from '../../lib/gis/aiRecommendationEngine';
import { sortIssueImpact, computeIssueImpact } from '../../lib/analytics/issueMatrix';
import { fetchGisLayer } from '../../lib/gis/gisEngine';
import { SectionCard } from '../ui/SectionCard';
import { Pill } from '../ui/Pill';
import { MetricTile } from './MetricTile';

export interface HistoryEntry {
  id: string;
  name: string;
  timestamp: string;
  layers: string[];
  summary: string;
}

type AnalysisType = 'population' | 'urban' | 'accessibility' | 'environmental' | 'community' | 'nlpSpatial' | 'spaceSyntax' | 'aiDesign';

const ANALYSIS_OPTIONS: { id: AnalysisType; label: string; icon: LucideIcon; buttonLabel: string }[] = [
  { id: 'population', label: 'Population Analysis', icon: Users2, buttonLabel: 'Run Population Analysis' },
  { id: 'urban', label: 'Urban Analysis', icon: Building2, buttonLabel: 'Run Urban Analysis' },
  { id: 'accessibility', label: 'Accessibility Analysis', icon: Footprints, buttonLabel: 'Run Accessibility Analysis' },
  { id: 'environmental', label: 'Environmental Analysis', icon: Leaf, buttonLabel: 'Run Environmental Analysis' },
  { id: 'community', label: 'Community Analysis', icon: Users, buttonLabel: 'Run Community Analysis' },
  { id: 'nlpSpatial', label: 'NLP Spatial Analysis', icon: MapPinned, buttonLabel: 'Run NLP Spatial Analysis' },
  { id: 'spaceSyntax', label: 'Space Syntax Analysis', icon: Route, buttonLabel: 'Run Space Syntax Analysis' },
  { id: 'aiDesign', label: 'AI Design Assistant', icon: Sparkles, buttonLabel: 'Generate Design Strategy' }
];

export function AnalysisEnginePanel({
  hexes,
  busStops,
  reviews,
  parkCenter,
  roadStats,
  poiCounts,
  spaceSyntaxStats,
  onRunComplete
}: {
  hexes: H3Feature[];
  busStops: GeoJsonFeature[];
  reviews: NLPAnalyzedReview[];
  parkCenter: { lat: number; lng: number };
  roadStats: RoadStats | null;
  poiCounts: PoiCounts;
  spaceSyntaxStats: SpaceSyntaxStats | null;
  onRunComplete: (entry: { name: string; layers: string[]; summary: string }) => void;
}) {
  const [selected, setSelected] = useState<AnalysisType>('population');
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spaceSyntaxNodes, setSpaceSyntaxNodes] = useState<SpaceSyntaxFeature[] | null>(null);

  const option = ANALYSIS_OPTIONS.find(o => o.id === selected)!;

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      let r: any;
      let summary = '';
      let layers: string[] = [];

      switch (selected) {
        case 'population': {
          r = computePopulationAnalysis(hexes, parkCenter);
          layers = ['h3_grid'];
          summary = `${r.totalPopulation.toLocaleString()} total population, ${r.avgPopDensityKm2.toLocaleString()}/km² avg density`;
          break;
        }
        case 'urban': {
          r = computeUrbanAnalysis(hexes, roadStats);
          layers = ['h3_grid', 'roads'];
          summary = `${r.buildingCount.toLocaleString()} buildings, ${r.buildingCoveragePct}% coverage, ${r.roadDensityMPerKm2.toLocaleString()} m/km² road density`;
          break;
        }
        case 'accessibility': {
          r = computeAccessibilityAnalysis(hexes, busStops, parkCenter, roadStats);
          layers = ['h3_grid', 'bus_stops', 'roads'];
          summary = `Walkability score ${r.walkabilityScore}/100, ${r.transitAccessibility.busStopsWithin500m} bus stops within 500m`;
          break;
        }
        case 'environmental': {
          r = computeEnvironmentalAnalysis(hexes, reviews);
          layers = ['h3_grid', 'reviews'];
          summary = `${r.greenCoveragePct}% green coverage, shade opportunity ${r.shadeOpportunityScore ?? 'N/A'}`;
          break;
        }
        case 'community': {
          r = computeCommunityAnalysis(hexes, reviews, poiCounts);
          layers = ['h3_grid', 'reviews'];
          summary = `${r.schoolCount} schools, ${r.hospitalCount} hospitals, ${r.mosqueCount} mosques, family priority ${r.familyPriorityIndex}/100`;
          break;
        }
        case 'nlpSpatial': {
          r = computeNlpSpatialAnalysis(reviews, parkCenter);
          layers = ['reviews'];
          summary = `Sentiment ${r.overallSentimentScore}/100, top issue: ${r.topComplaintCategories[0]?.category || 'none'}`;
          break;
        }
        case 'spaceSyntax': {
          let nodes = spaceSyntaxNodes;
          if (!nodes) {
            const fc = await fetchGisLayer<SpaceSyntaxFeature['properties']>('space_syntax');
            nodes = (fc?.features || []) as SpaceSyntaxFeature[];
            setSpaceSyntaxNodes(nodes);
          }
          r = computeSpaceSyntaxAnalysis(nodes, spaceSyntaxStats);
          layers = ['space_syntax (roads-derived graph)'];
          summary = `${r.nodeCount.toLocaleString()} junctions analyzed, avg integration ${r.avgIntegration}, avg choice ${r.avgChoice}`;
          break;
        }
        case 'aiDesign': {
          const pop = computePopulationAnalysis(hexes, parkCenter);
          const urban = computeUrbanAnalysis(hexes, roadStats);
          const env = computeEnvironmentalAnalysis(hexes, reviews);
          const community = computeCommunityAnalysis(hexes, reviews, poiCounts);
          const issueRows = sortIssueImpact(computeIssueImpact(reviews), 'priority').slice(0, 5);
          r = await generateDesignStrategy({
            population: pop.totalPopulation,
            popDensityKm2: pop.avgPopDensityKm2,
            buildingCoveragePct: urban.buildingCoveragePct,
            greenCoveragePct: env.greenCoveragePct,
            roadDensityMPerKm2: urban.roadDensityMPerKm2,
            amenityTotal: community.schoolCount + community.hospitalCount + community.mosqueCount + community.clinicCount,
            topIssues: issueRows.map(row => ({ category: row.category, mentions: row.mentions, priorityIndex: row.priorityIndex, priority: row.priority }))
          });
          layers = ['h3_grid', 'roads', 'reviews'];
          summary = `Priority score ${r.priorityScore}/100, confidence ${r.aiConfidenceScore}% (${r.engine})`;
          break;
        }
      }

      setResult(r);
      onRunComplete({ name: option.label, layers, summary });
    } catch (e: any) {
      setError(e?.message || 'Analysis failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <SectionCard icon={option.icon} title="Analysis Engine">
      <div className="space-y-2 mb-3">
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value as AnalysisType); setResult(null); setError(null); }}
          className="w-full text-[11px] font-bold border border-slate-200 rounded px-2 py-1.5 text-slate-700 bg-white"
        >
          {ANALYSIS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button
          onClick={handleRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-60"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? 'Running...' : option.buttonLabel}
        </button>
      </div>

      {error && <p className="text-[10px] font-semibold text-rose-600 mb-2">{error}</p>}

      {result && selected === 'population' && (
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Total Population" value={result.totalPopulation.toLocaleString()} />
          <MetricTile label="Population Density" value={result.avgPopDensityKm2.toLocaleString()} unit="/km²" />
          <MetricTile label="Population Served" value={result.populationServedWithin800m.toLocaleString()} note="Within an 800m straight-line buffer of the park (not routed distance)." />
          <MetricTile label="Population Heatmap" value={`${result.heatmapPoints.length} points`} note="See Charts tab for the population histogram." />
          <MetricTile label="Population Growth" unavailable note="No time-series data -- only a single snapshot exists." />
        </div>
      )}

      {result && selected === 'urban' && (
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Building Count" value={result.buildingCount.toLocaleString()} />
          <MetricTile label="Building Density" value={result.buildingDensityPerKm2.toLocaleString()} unit="/km²" />
          <MetricTile label="Building Coverage" value={result.buildingCoveragePct} unit="%" />
          <MetricTile label="Floor Area Ratio" unavailable note={result.floorAreaRatioNote} />
          <MetricTile label="Road Density" value={result.roadDensityMPerKm2.toLocaleString()} unit="m/km²" />
          {result.connectivity ? (
            <MetricTile label="Connectivity" value={result.connectivity.intersectionCount.toLocaleString()} unit="intersections" note={result.connectivity.methodology} />
          ) : (
            <MetricTile label="Connectivity" unavailable />
          )}
        </div>
      )}

      {result && selected === 'accessibility' && (
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Walkability Score" value={`${result.walkabilityScore}/100`} note={result.walkabilityMethodology} />
          <MetricTile label="Network Distance" unavailable note={result.networkDistanceNote} />
          <MetricTile label="Transit Accessibility" value={result.transitAccessibility.busStopsWithin500m} unit="bus stops within 500m" />
          <MetricTile label="Park Service Area" value="800m radius" note="Straight-line buffer, rendered on the map when Buffer tool is used." />
        </div>
      )}

      {result && selected === 'environmental' && (
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Green Ratio" value={result.greenCoveragePct} unit="%" note="Real H3-aggregated coverage." />
          <MetricTile label="Tree Canopy" unavailable note="No remote-sensing canopy raster in this dataset." />
          <MetricTile label="Surface Temperature" unavailable />
          <MetricTile label="Urban Heat" unavailable />
          <MetricTile
            label="Shade Opportunity"
            value={result.shadeOpportunityScore !== null ? `${result.shadeOpportunityScore}/100` : undefined}
            unavailable={result.shadeOpportunityScore === null}
            note={result.shadeOpportunityNote}
          />
        </div>
      )}

      {result && selected === 'community' && (
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Schools" value={result.schoolCount} />
          <MetricTile label="Hospitals" value={result.hospitalCount} />
          <MetricTile label="Mosques" value={result.mosqueCount} />
          <MetricTile label="Community Facility Access" value={`${result.communityFacilityAccessScore}/100`} />
          <MetricTile label="Family Priority Index" value={`${result.familyPriorityIndex}/100`} note={result.familyPriorityNote} />
        </div>
      )}

      {result && selected === 'nlpSpatial' && (
        <div className="space-y-2">
          <p className="text-[9px] text-amber-600 font-semibold">{result.note}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricTile label="Review Sentiment" value={`${result.overallSentimentScore}/100`} note="Single park marker, not a spatial heatmap." />
            <MetricTile label="Shade Issue Mentions" value={result.shadeIssueMentions} />
            <MetricTile label="Playground Demand" value={result.playgroundDemandMentions} />
            <MetricTile label="Maintenance Issues" value={result.maintenanceIssueMentions} />
          </div>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Complaint Hotspot Categories</p>
            <div className="flex flex-wrap gap-1">
              {result.topComplaintCategories.map((c: any) => (
                <span key={c.category} className="flex items-center gap-1">
                  <Pill variant="category" value={c.category} />
                  <span className="text-[8px] text-slate-400">({c.mentions})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {result && selected === 'spaceSyntax' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <MetricTile label="Junctions Analyzed" value={result.nodeCount.toLocaleString()} />
            <MetricTile label="Street Segments" value={result.edgeCount.toLocaleString()} />
            <MetricTile label="Avg Integration" value={result.avgIntegration} unit="/ 100" note="Closeness centrality -- how easily a junction reaches every other junction." />
            <MetricTile label="Avg Choice" value={result.avgChoice} unit="/ 100" note={`Betweenness centrality (k=${result.betweennessSampleK} sample) -- through-movement potential.`} />
          </div>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Top Integration Junctions</p>
            <div className="space-y-0.5">
              {result.topIntegration.map((n: any) => (
                <div key={n.nodeId} className="flex items-center justify-between text-[9px] text-slate-600 font-mono">
                  <span>Node {n.nodeId}</span>
                  <span className="font-bold text-indigo-700">{n.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-rose-600 mb-1">Top Choice Junctions</p>
            <div className="space-y-0.5">
              {result.topChoice.map((n: any) => (
                <div key={n.nodeId} className="flex items-center justify-between text-[9px] text-slate-600 font-mono">
                  <span>Node {n.nodeId}</span>
                  <span className="font-bold text-rose-700">{n.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[8px] text-slate-400 leading-relaxed">{result.methodology}</p>
        </div>
      )}

      {result && selected === 'aiDesign' && (
        <div className="space-y-2 text-[10px]">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="font-mono text-[8px] text-slate-400 uppercase">{result.engine}</span>
            <span className="font-bold text-indigo-700">Priority: {result.priorityScore}/100 &middot; Confidence: {result.aiConfidenceScore}%</span>
          </div>
          <p className="text-slate-700 leading-relaxed">{result.siteSummary}</p>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-rose-500 mb-1">Key Problems</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600">{result.keyProblems.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Design Opportunities</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600">{result.designOpportunities.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Recommended Interventions</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600">{result.recommendedInterventions.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Supporting Dataset Evidence</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">{result.supportingEvidence.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
          </div>
        </div>
      )}

      {!result && !running && !error && (
        <p className="text-slate-400 text-[10px] font-semibold text-center py-6">Select an analysis above and click Run to see results here.</p>
      )}
    </SectionCard>
  );
}
