import { useMemo, useState } from 'react';
import { ArrowUpDown, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  OpportunityResult, OpportunityPriority, GeometryType, EvidenceSource
} from '../../lib/gis/opportunityEngine';

export type SortKey =
  | 'category' | 'opportunity' | 'demand' | 'suitability' | 'feasibility' | 'confidence'
  | 'recommendedArea' | 'priority' | 'userGroup' | 'source' | 'geometryType' | 'grasshopperReadiness';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'opportunity', label: 'Opportunity Score' },
  { key: 'category', label: 'Category' },
  { key: 'demand', label: 'Demand Score' },
  { key: 'suitability', label: 'Suitability Score' },
  { key: 'feasibility', label: 'Feasibility Score' },
  { key: 'confidence', label: 'Confidence Score' },
  { key: 'recommendedArea', label: 'Recommended Area' },
  { key: 'priority', label: 'Priority' },
  { key: 'userGroup', label: 'Primary User Group' },
  { key: 'source', label: 'Source / Evidence Type' },
  { key: 'geometryType', label: 'Geometry Type' },
  { key: 'grasshopperReadiness', label: 'Grasshopper Readiness' }
];

const PRIORITY_RANK: Record<OpportunityPriority, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
const PRIORITIES: OpportunityPriority[] = ['Critical', 'High', 'Medium', 'Low'];
const GEOMETRY_TYPES: GeometryType[] = ['point', 'area', 'linear', 'network'];
const SOURCES: EvidenceSource[] = [
  'brief-required', 'brief-optional', 'review-driven', 'population-driven', 'community-driven',
  'accessibility-driven', 'environment-driven', 'movement-driven', 'operations-driven',
  'user-experience-driven', 'designer-assumption'
];

export function sortResults(results: OpportunityResult[], key: SortKey): OpportunityResult[] {
  const sorted = [...results];
  sorted.sort((a, b) => {
    switch (key) {
      case 'category': return a.category.localeCompare(b.category) || b.opportunityScore - a.opportunityScore;
      case 'opportunity': return b.opportunityScore - a.opportunityScore;
      case 'demand': return b.demandScore - a.demandScore;
      case 'suitability': return b.suitabilityScore - a.suitabilityScore;
      case 'feasibility': return b.feasibilityScore - a.feasibilityScore;
      case 'confidence': return b.confidenceScore - a.confidenceScore;
      case 'recommendedArea': return (b.recommendedAreaM2?.target ?? -1) - (a.recommendedAreaM2?.target ?? -1);
      case 'priority': return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      case 'userGroup': return (a.primaryUsers[0] || '').localeCompare(b.primaryUsers[0] || '');
      case 'source': return (a.source[0] || '').localeCompare(b.source[0] || '');
      case 'geometryType': return a.geometryType.localeCompare(b.geometryType);
      case 'grasshopperReadiness': return b.grasshopperReadinessScore - a.grasshopperReadinessScore;
      default: return 0;
    }
  });
  return sorted;
}

export type BriefFilter = 'all' | 'required' | 'optional';

export interface OpportunityFilters {
  sources: EvidenceSource[]; // empty = all
  priorities: OpportunityPriority[]; // empty = all
  geometryTypes: GeometryType[]; // empty = all
  userGroup: string | null; // null = all
  briefFilter: BriefFilter;
  highConfidenceOnly: boolean; // confidenceScore >= 70
}

export const DEFAULT_FILTERS: OpportunityFilters = {
  sources: [],
  priorities: [],
  geometryTypes: [],
  userGroup: null,
  briefFilter: 'all',
  highConfidenceOnly: false
};

export function filtersActiveCount(f: OpportunityFilters): number {
  return (
    f.sources.length + f.priorities.length + f.geometryTypes.length +
    (f.userGroup ? 1 : 0) + (f.briefFilter !== 'all' ? 1 : 0) + (f.highConfidenceOnly ? 1 : 0)
  );
}

export function matchesFilters(r: OpportunityResult, f: OpportunityFilters): boolean {
  if (f.sources.length > 0 && !f.sources.some(s => r.source.includes(s))) return false;
  if (f.priorities.length > 0 && !f.priorities.includes(r.priority)) return false;
  if (f.geometryTypes.length > 0 && !f.geometryTypes.includes(r.geometryType)) return false;
  if (f.userGroup && !r.primaryUsers.includes(f.userGroup)) return false;
  if (f.briefFilter === 'required' && !r.source.includes('brief-required')) return false;
  if (f.briefFilter === 'optional' && !r.source.includes('brief-optional')) return false;
  if (f.highConfidenceOnly && r.confidenceScore < 70) return false;
  return true;
}

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

function readableSource(s: EvidenceSource): string {
  return s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function OpportunitySortFilterBar({
  results,
  sortKey,
  onSortKeyChange,
  filters,
  onFiltersChange
}: {
  results: OpportunityResult[];
  sortKey: SortKey;
  onSortKeyChange: (k: SortKey) => void;
  filters: OpportunityFilters;
  onFiltersChange: (f: OpportunityFilters) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = filtersActiveCount(filters);

  const userGroups = useMemo(
    () => [...new Set(results.flatMap(r => r.primaryUsers))].sort((a, b) => a.localeCompare(b)),
    [results]
  );

  return (
    <div className="border border-slate-200 rounded bg-slate-50/60 mb-2.5">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3 h-3 text-slate-400" />
          <label className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Sort by</label>
          <select
            value={sortKey}
            onChange={e => onSortKeyChange(e.target.value as SortKey)}
            className="text-[9px] font-semibold border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${
            activeCount > 0 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" /> Filters {activeCount > 0 ? `(${activeCount})` : ''}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {activeCount > 0 && (
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-200 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Priority</span>
              <div className="flex gap-1">
                {PRIORITIES.map(p => (
                  <button
                    key={p}
                    onClick={() => onFiltersChange({ ...filters, priorities: toggleInList(filters.priorities, p) })}
                    className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${
                      filters.priorities.includes(p) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Geometry</span>
              <div className="flex gap-1">
                {GEOMETRY_TYPES.map(g => (
                  <button
                    key={g}
                    onClick={() => onFiltersChange({ ...filters, geometryTypes: toggleInList(filters.geometryTypes, g) })}
                    className={`px-1.5 py-0.5 text-[8px] font-bold rounded border capitalize ${
                      filters.geometryTypes.includes(g) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              <input
                type="checkbox"
                checked={filters.highConfidenceOnly}
                onChange={e => onFiltersChange({ ...filters, highConfidenceOnly: e.target.checked })}
              />
              High-confidence only (&ge;70)
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Source / evidence</span>
              <select
                value=""
                onChange={e => {
                  const v = e.target.value as EvidenceSource;
                  if (v) onFiltersChange({ ...filters, sources: toggleInList(filters.sources, v) });
                }}
                className="text-[9px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700"
              >
                <option value="">Add source filter...</option>
                {SOURCES.map(s => (
                  <option key={s} value={s}>{readableSource(s)}</option>
                ))}
              </select>
              {filters.sources.map(s => (
                <span key={s} className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold rounded border bg-indigo-600 border-indigo-600 text-white">
                  {readableSource(s)}
                  <button onClick={() => onFiltersChange({ ...filters, sources: toggleInList(filters.sources, s) })}>&times;</button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">User group</span>
              <select
                value={filters.userGroup ?? ''}
                onChange={e => onFiltersChange({ ...filters, userGroup: e.target.value || null })}
                className="text-[9px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700"
              >
                <option value="">All user groups</option>
                {userGroups.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Brief status</span>
              <div className="flex gap-1">
                {(['all', 'required', 'optional'] as BriefFilter[]).map(b => (
                  <button
                    key={b}
                    onClick={() => onFiltersChange({ ...filters, briefFilter: b })}
                    className={`px-1.5 py-0.5 text-[8px] font-bold rounded border capitalize ${
                      filters.briefFilter === b ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {b === 'all' ? 'All' : b === 'required' ? 'Brief-required' : 'Brief-optional / Inferred'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
