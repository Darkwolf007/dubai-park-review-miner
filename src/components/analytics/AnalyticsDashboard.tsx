import { useMemo, useState } from 'react';
import { LayoutDashboard, AlertTriangle, Map as MapIcon, Table2, TrendingUp, Scale, Network, Users, X, Sun, Lightbulb, GitCompare, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { ParkDetails } from '../../lib/googlePlaces';
import { KpiGrid } from './KpiGrid';
import { ParkHealthScore } from './ParkHealthScore';
import { IssueImpactMatrix } from './IssueImpactMatrix';
import { TopicDistribution } from './TopicDistribution';
import { GisLayerMap } from './GisLayerMap';
import { ReviewExplorerTable } from './ReviewExplorerTable';
import { TrendAnalysis } from './TrendAnalysis';
import { BenchmarkDashboard } from './BenchmarkDashboard';
import { TopicNetwork } from './TopicNetwork';
import { PersonaAnalytics } from './PersonaAnalytics';
import { SeasonalAnalytics } from './SeasonalAnalytics';
import { OpportunityScore } from './OpportunityScore';
import { RatingDriverAnalysis } from './RatingDriverAnalysis';
import { WordAnalytics } from './WordAnalytics';

type AnalyticsPage =
  | 'overview' | 'trends' | 'benchmark' | 'seasonal' | 'issues'
  | 'opportunities' | 'ratingDrivers' | 'wordAnalytics'
  | 'network' | 'personas' | 'map' | 'explorer';

const PAGES: { id: AnalyticsPage; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'benchmark', label: 'Benchmark', icon: Scale },
  { id: 'seasonal', label: 'Seasonal', icon: Sun },
  { id: 'issues', label: 'Issues & Topics', icon: AlertTriangle },
  { id: 'opportunities', label: 'Opportunities', icon: Lightbulb },
  { id: 'ratingDrivers', label: 'Rating Drivers', icon: GitCompare },
  { id: 'wordAnalytics', label: 'Word Analytics', icon: Type },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'map', label: 'GIS Layers', icon: MapIcon },
  { id: 'explorer', label: 'Review Explorer', icon: Table2 }
];

function groupByPark(reviews: NLPAnalyzedReview[], selectedParks: ParkDetails[]): Record<string, NLPAnalyzedReview[]> {
  const map: Record<string, NLPAnalyzedReview[]> = {};
  selectedParks.forEach(p => { map[p.placeId] = []; });
  reviews.forEach(r => {
    if (!map[r.placeId]) map[r.placeId] = [];
    map[r.placeId].push(r);
  });
  return map;
}

export function AnalyticsDashboard({
  analyzedReviews,
  selectedParks,
  allParks
}: {
  analyzedReviews: NLPAnalyzedReview[];
  selectedParks: ParkDetails[];
  allParks: ParkDetails[];
}) {
  const [page, setPage] = useState<AnalyticsPage>('overview');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [activeKeywordFilter, setActiveKeywordFilter] = useState<string | null>(null);

  const filteredReviews = useMemo(() => {
    let result = analyzedReviews;
    if (activeCategoryFilter) result = result.filter(r => r.issueCategory === activeCategoryFilter);
    if (activeKeywordFilter) result = result.filter(r => r.reviewText.toLowerCase().includes(activeKeywordFilter.toLowerCase()));
    return result;
  }, [analyzedReviews, activeCategoryFilter, activeKeywordFilter]);

  const reviewsByPark = useMemo(() => groupByPark(filteredReviews, selectedParks), [filteredReviews, selectedParks]);

  if (analyzedReviews.length === 0) {
    return (
      <div className="bg-white rounded border border-slate-200 shadow-sm p-12 text-center">
        <LayoutDashboard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-xs font-semibold text-slate-500">
          Run the NLP analysis in the Explorer tab first to populate the Analytics Dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 md:col-span-2">
        <div className="bg-white rounded border border-slate-200 shadow-sm p-1.5 flex md:flex-col gap-1 sticky top-3">
          {PAGES.map(p => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all text-left ${
                page === p.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <p.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-12 md:col-span-10 space-y-3">
        {(activeCategoryFilter || activeKeywordFilter) && (
          <div className="flex items-center gap-2 flex-wrap bg-indigo-50 border border-indigo-200 rounded px-2.5 py-1.5">
            {activeCategoryFilter && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700">
                Issue: <span className="capitalize">{activeCategoryFilter}</span>
                <button onClick={() => setActiveCategoryFilter(null)} className="text-indigo-500 hover:text-indigo-800"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeKeywordFilter && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700">
                Keyword: "{activeKeywordFilter}"
                <button onClick={() => setActiveKeywordFilter(null)} className="text-indigo-500 hover:text-indigo-800"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        {page === 'overview' && (
          <>
            <KpiGrid reviews={filteredReviews} parksSelectedCount={selectedParks.length} />
            <ParkHealthScore reviewsByPark={reviewsByPark} selectedParks={selectedParks} allReviews={filteredReviews} />
          </>
        )}
        {page === 'trends' && (
          <TrendAnalysis reviewsByPark={reviewsByPark} selectedParks={selectedParks} allParks={allParks} allReviews={filteredReviews} />
        )}
        {page === 'benchmark' && (
          <BenchmarkDashboard reviewsByPark={reviewsByPark} selectedParks={selectedParks} allParks={allParks} />
        )}
        {page === 'seasonal' && <SeasonalAnalytics reviews={filteredReviews} />}
        {page === 'issues' && (
          <>
            <IssueImpactMatrix reviews={filteredReviews} />
            <TopicDistribution reviews={filteredReviews} />
          </>
        )}
        {page === 'opportunities' && <OpportunityScore reviews={filteredReviews} />}
        {page === 'ratingDrivers' && <RatingDriverAnalysis reviews={filteredReviews} />}
        {page === 'wordAnalytics' && (
          <WordAnalytics reviews={filteredReviews} activeKeyword={activeKeywordFilter} onSelectKeyword={setActiveKeywordFilter} />
        )}
        {page === 'network' && (
          <TopicNetwork reviews={analyzedReviews} activeCategory={activeCategoryFilter} onSelectCategory={setActiveCategoryFilter} />
        )}
        {page === 'personas' && <PersonaAnalytics reviews={filteredReviews} />}
        {page === 'map' && <GisLayerMap reviewsByPark={reviewsByPark} selectedParks={selectedParks} />}
        {page === 'explorer' && <ReviewExplorerTable reviews={filteredReviews} selectedParks={selectedParks} />}
      </div>
    </div>
  );
}
