import { useMemo, useState } from 'react';
import type { Feature, Polygon } from 'geojson';
import {
  Sparkles, DoorOpen, Footprints, Baby, Dumbbell, Users, TreeDeciduous, Armchair, Cpu,
  AlertTriangle, CheckCircle2, Boxes, LayoutGrid
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  computeAllOpportunities, OPPORTUNITY_CATEGORIES, type OpportunityResult, type OpportunityType,
  type OpportunityPriority, type OpportunityCategory, type OpportunityCellScore, type EvidenceSource
} from '../../lib/gis/opportunityEngine';
import { buildSiteGrid } from '../../lib/gis/siteGrid';
import type { H3Feature, RoadStats, GeoJsonFeature } from '../../lib/gis/types';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { SectionCard } from '../ui/SectionCard';
import { InfoTooltip } from '../ui/InfoTooltip';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';
import { OpportunityAdjacencyGraph } from './OpportunityAdjacencyGraph';
import { OpportunitySuitabilityMap } from './OpportunitySuitabilityMap';
import { OpportunityProgramNetwork } from './OpportunityProgramNetwork';
import {
  OpportunitySortFilterBar, sortResults, matchesFilters, DEFAULT_FILTERS,
  type SortKey, type OpportunityFilters
} from './OpportunitySortFilterBar';

const ICON_BY_CATEGORY: Record<OpportunityCategory, LucideIcon> = {
  'Arrival / Access': DoorOpen,
  Movement: Footprints,
  Play: Baby,
  'Sports / Wellness': Dumbbell,
  'Community / Social': Users,
  'Landscape / Environment': TreeDeciduous,
  'Comfort / Amenities': Armchair,
  'Smart / Operations': Cpu
};

const PRIORITY_STYLE: Record<OpportunityPriority, string> = {
  Critical: 'bg-rose-100 text-rose-700 border-rose-200',
  High: 'bg-amber-100 text-amber-700 border-amber-200',
  Medium: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  Low: 'bg-slate-100 text-slate-500 border-slate-200'
};

const SOURCE_STYLE: Record<EvidenceSource, string> = {
  'brief-required': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'brief-optional': 'bg-indigo-50/60 text-indigo-400 border-indigo-100',
  'review-driven': 'bg-amber-50 text-amber-700 border-amber-200',
  'population-driven': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'community-driven': 'bg-emerald-50 text-emerald-600 border-emerald-100',
  'accessibility-driven': 'bg-sky-50 text-sky-700 border-sky-200',
  'environment-driven': 'bg-teal-50 text-teal-700 border-teal-200',
  'movement-driven': 'bg-violet-50 text-violet-700 border-violet-200',
  'operations-driven': 'bg-slate-100 text-slate-600 border-slate-200',
  'user-experience-driven': 'bg-pink-50 text-pink-600 border-pink-200',
  'designer-assumption': 'bg-slate-50 text-slate-400 border-slate-200 italic'
};

function sourceLabel(s: EvidenceSource): string {
  return s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Evidence badges (Part 7): shows every program's traceable source tags -- e.g. brief-required +
 * population-driven + review-driven -- so no recommendation reads as authoritative on its own. */
function SourceBadges({ source }: { source: EvidenceSource[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {source.map(s => (
        <span key={s} className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${SOURCE_STYLE[s]}`}>
          {sourceLabel(s)}
        </span>
      ))}
    </div>
  );
}

function OpportunityChip({ result, active, onClick }: { result: OpportunityResult; active: boolean; onClick: () => void }) {
  const Icon = ICON_BY_CATEGORY[result.category];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-left transition-colors ${
        active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-indigo-600'}`} />
      <div className="min-w-0">
        <p className={`text-[10px] font-bold truncate ${active ? 'text-white' : 'text-slate-700'}`}>{result.name}</p>
        <p className={`text-[8px] font-mono ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{result.opportunityScore}/100 · {result.priority}</p>
      </div>
    </button>
  );
}

export function OpportunityLabPanel({
  hexes,
  reviews,
  roadStats,
  parkPolygon,
  parkCenter,
  buildingFeatures,
  roadFeatures
}: {
  hexes: H3Feature[];
  reviews: NLPAnalyzedReview[];
  roadStats: RoadStats | null;
  parkPolygon: Feature<Polygon> | null;
  parkCenter: { lat: number; lng: number };
  buildingFeatures: GeoJsonFeature[];
  roadFeatures: GeoJsonFeature[];
}) {
  const [selectedType, setSelectedType] = useState<OpportunityType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<OpportunityCategory | 'All'>('All');
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('opportunity');
  const [filters, setFilters] = useState<OpportunityFilters>(DEFAULT_FILTERS);

  const siteGrid = useMemo(() => {
    if (!parkPolygon || hexes.length === 0) return [];
    return buildSiteGrid(parkPolygon, hexes, buildingFeatures, roadFeatures);
  }, [parkPolygon, hexes, buildingFeatures, roadFeatures]);

  const results = useMemo(() => {
    if (siteGrid.length === 0) return [];
    return computeAllOpportunities(siteGrid, reviews, roadStats);
  }, [siteGrid, reviews, roadStats]);

  const filteredResults = useMemo(() => {
    const byCategory = categoryFilter === 'All' ? results : results.filter(r => r.category === categoryFilter);
    const byFacets = byCategory.filter(r => matchesFilters(r, filters));
    return sortResults(byFacets, sortKey);
  }, [results, categoryFilter, filters, sortKey]);

  const selected = filteredResults.find(r => r.type === selectedType) ?? filteredResults[0] ?? null;
  const activeCell = selected?.allCells.find(c => c.h3Id === activeCellId) ?? null;

  function selectProgram(type: OpportunityType) {
    setSelectedType(type);
    setActiveCellId(null);
  }

  if (!parkPolygon) {
    return (
      <SectionCard icon={Sparkles} title="Opportunity Lab">
        <p className="text-[10px] text-slate-500">Loading the park boundary...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-3">
      <SectionCard icon={Sparkles} title="Opportunity Lab">
        <p className="text-[9px] text-slate-500 mb-2.5">
          {results.length} AI Park program elements, ranked on a {siteGrid.length}-cell, 10m site grid clipped to the park's
          real boundary -- combines Population, Urban, Accessibility, Environmental, Community, and NLP Spatial signals.
          Demand and site suitability are scored separately, then combined with feasibility.
        </p>

        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          <button
            onClick={() => setCategoryFilter('All')}
            className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${
              categoryFilter === 'All' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutGrid className="w-3 h-3" /> All ({results.length})
          </button>
          {OPPORTUNITY_CATEGORIES.map(cat => {
            const Icon = ICON_BY_CATEGORY[cat];
            const count = results.filter(r => r.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${
                  categoryFilter === cat ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3 h-3" /> {cat} ({count})
              </button>
            );
          })}
        </div>

        <OpportunitySortFilterBar
          results={results}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 max-h-[320px] overflow-y-auto pr-1">
          {filteredResults.map(r => (
            <OpportunityChip key={r.type} result={r} active={selected?.type === r.type} onClick={() => selectProgram(r.type)} />
          ))}
          {filteredResults.length === 0 && (
            <p className="col-span-full text-[9px] text-slate-400 py-2">No programs match the current filters.</p>
          )}
        </div>
      </SectionCard>

      {results.length > 0 && (
        <OpportunityProgramNetwork allResults={results} selectedType={selected?.type ?? null} onSelectProgram={selectProgram} />
      )}

      {selected && (
        <>
          <SectionCard
            icon={ICON_BY_CATEGORY[selected.category]}
            title={selected.name}
            action={
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${PRIORITY_STYLE[selected.priority]}`}>
                {selected.priority}
              </span>
            }
          >
            <p className="text-[8px] font-mono uppercase tracking-wider text-slate-400 mb-2">
              {selected.category} · {selected.geometryType} · {selected.scale}
            </p>
            <div className="mb-2.5">
              <SourceBadges source={selected.source} />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2.5">
              <MetricTile label="Demand" value={selected.demandScore} unit="/100" methodologyKey="demandScore" />
              <MetricTile label="Suitability" value={selected.suitabilityScore} unit="/100" methodologyKey="suitabilityScore" />
              <MetricTile label="Feasibility" value={selected.feasibilityScore} unit="/100" methodologyKey="feasibilityScore" />
              <MetricTile label="Confidence" value={selected.confidenceScore} unit="/100" methodologyKey="confidenceScore" />
            </div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Opportunity Score</span>
              <span className="text-lg font-extrabold text-indigo-700">{selected.opportunityScore}</span>
              <span className="text-[10px] text-slate-400">/ 100</span>
              <InfoTooltip methodologyKey="opportunityScore" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="bg-slate-50 border border-slate-200 rounded p-2">
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Recommended Area</p>
                <p className="font-semibold text-slate-700 mt-0.5">
                  {selected.recommendedAreaM2 ? `${selected.recommendedAreaM2.target.toLocaleString()} m²` : `N/A (${selected.geometryType})`}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-2">
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Primary Users</p>
                <p className="font-semibold text-slate-700 mt-0.5 truncate">{selected.primaryUsers.slice(0, 2).join(', ')}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-2">
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Candidate Cells</p>
                <p className="font-semibold text-slate-700 mt-0.5">{selected.allCells.filter(c => !c.avoided).length} of {siteGrid.length}</p>
              </div>
            </div>
          </SectionCard>

          <OpportunitySuitabilityMap
            siteGrid={siteGrid}
            selected={selected}
            parkCenter={parkCenter}
            activeCellId={activeCellId}
            onCellClick={cell => setActiveCellId(cell.h3Id)}
            hexes={hexes}
          />

          {activeCell && (
            <div className="bg-indigo-50 border border-indigo-200 rounded p-2.5 text-[10px]">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-indigo-800">{activeCell.h3Id}</span>
                {activeCell.avoided && <span className="text-[8px] font-bold uppercase text-rose-600">Avoided / Constrained</span>}
              </div>
              <div className="grid grid-cols-4 gap-2 text-slate-700">
                <div>Opportunity: <strong>{activeCell.opportunityScore}</strong></div>
                <div>Demand: <strong>{activeCell.demandScore}</strong></div>
                <div>Suitability: <strong>{activeCell.suitabilityScore}</strong></div>
                <div>Feasibility: <strong>{activeCell.feasibilityScore}</strong></div>
              </div>
            </div>
          )}

          <OpportunityAdjacencyGraph selected={selected} allResults={results} />

          <SectionCard icon={CheckCircle2} title="Top Site Cells">
            <p className="text-[8px] text-slate-400 mb-1.5">Click a row to highlight that cell on the suitability map above.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-left text-[8px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-1 pr-2">Cell</th>
                    <th className="pb-1 pr-2">Opportunity</th>
                    <th className="pb-1 pr-2">Demand</th>
                    <th className="pb-1 pr-2">Suitability</th>
                    <th className="pb-1">Feasibility</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.topCells.slice(0, 8).map((c: OpportunityCellScore) => (
                    <tr
                      key={c.h3Id}
                      onClick={() => setActiveCellId(c.h3Id)}
                      className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${activeCellId === c.h3Id ? 'bg-indigo-50' : ''}`}
                    >
                      <td className="py-1 pr-2 font-mono text-slate-400">{c.h3Id}</td>
                      <td className="py-1 pr-2 font-bold text-slate-700">{c.opportunityScore}</td>
                      <td className="py-1 pr-2 text-slate-500">{c.demandScore}</td>
                      <td className="py-1 pr-2 text-slate-500">{c.suitabilityScore}</td>
                      <td className="py-1 text-slate-500">{c.feasibilityScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <CollapsibleSection title="Evidence & Constraints" defaultOpen={false}>
            <div className="space-y-2">
              <div>
                <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Evidence
                </p>
                <ul className="space-y-1">
                  {selected.evidence.map((e, i) => (
                    <li key={i} className="text-[9px] text-slate-600 leading-relaxed pl-2 border-l-2 border-slate-200">{e}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" /> Avoid Conditions
                </p>
                <ul className="space-y-0.5">
                  {selected.avoidConditions.map((a, i) => (
                    <li key={i} className="text-[9px] text-slate-600">{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Grasshopper Readiness" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div className="flex items-start gap-1.5">
                <Boxes className="w-3 h-3 text-indigo-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Suitability Field</p>
                  <p className="font-mono text-slate-700">{selected.grasshopperInputs.suitabilityField}</p>
                </div>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Geometry / Scale</p>
                <p className="text-slate-700">{selected.grasshopperInputs.geometryType} · {selected.grasshopperInputs.scale}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Recommended Area</p>
                <p className="text-slate-700">{selected.grasshopperInputs.recommendedAreaM2 ? `${selected.grasshopperInputs.recommendedAreaM2.target.toLocaleString()} m² target` : 'N/A'}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Attractors</p>
                <p className="text-slate-700 leading-relaxed">{selected.grasshopperInputs.attractors.join(', ') || 'None'}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Repellers</p>
                <p className="text-slate-700 leading-relaxed">{selected.grasshopperInputs.repellers.join(', ') || 'None'}</p>
              </div>
              <div className="col-span-2">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Constraints</p>
                <p className="text-slate-700 leading-relaxed">{selected.grasshopperInputs.constraints.join('; ') || 'None triggered'}</p>
              </div>
              <div className="col-span-2">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Adjacency Rules</p>
                <p className="text-slate-700 leading-relaxed">
                  Prefer: {selected.grasshopperInputs.adjacencyRules.preferred.join(', ') || 'none'} · Avoid: {selected.grasshopperInputs.adjacencyRules.avoid.join(', ') || 'none'}
                </p>
                {(selected.grasshopperInputs.adjacencyRules.service.length > 0 || selected.grasshopperInputs.adjacencyRules.movement.length > 0) && (
                  <p className="text-slate-700 leading-relaxed mt-1">
                    Service: {selected.grasshopperInputs.adjacencyRules.service.join(', ') || 'none'} · Movement: {selected.grasshopperInputs.adjacencyRules.movement.join(', ') || 'none'}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[8px]">Grasshopper Readiness Score</p>
                <p className="text-slate-700">{selected.grasshopperReadinessScore}/100 (attractors, repellers, adjacency, recommended area each contribute 25)</p>
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
