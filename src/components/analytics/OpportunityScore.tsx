import { useMemo, useState } from 'react';
import { Lightbulb, List, ScatterChart } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeOpportunityScore } from '../../lib/analytics/interventions';
import { SectionCard } from '../ui/SectionCard';
import { Pill } from '../ui/Pill';
import { DesignPriorityMatrix } from './DesignPriorityMatrix';

export function OpportunityScore({ reviews }: { reviews: NLPAnalyzedReview[] }) {
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const results = useMemo(() => computeOpportunityScore(reviews), [reviews]);

  return (
    <SectionCard
      icon={Lightbulb}
      title="Opportunity Score"
      action={
        <div className="flex gap-1 bg-slate-100 rounded p-0.5">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${view === 'list' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <List className="w-3 h-3" /> List
          </button>
          <button
            onClick={() => setView('matrix')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${view === 'matrix' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ScatterChart className="w-3 h-3" /> Priority Matrix
          </button>
        </div>
      }
    >
      {view === 'list' ? (
        <div className="space-y-2">
          {results.map(r => (
            <div key={r.id} className="border border-slate-200 rounded p-2.5 flex items-center gap-3">
              <div className="w-14 shrink-0 text-center">
                <span className="text-lg font-extrabold text-indigo-700">{r.score}%</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-700">{r.label}</span>
                  <Pill variant="priority" value={r.expectedImpact} />
                  {r.insufficientData && <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wider">Insufficient data</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[9px] text-slate-500">
                  <span>Cost: <strong className="text-slate-700">{r.cost}</strong></span>
                  <span>Maintenance: <strong className="text-slate-700">{r.maintenance}</strong></span>
                  <span>Difficulty: <strong className="text-slate-700">{r.difficulty}</strong></span>
                  <span>{r.supportingMentions} supporting reviews</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DesignPriorityMatrix results={results} />
      )}
    </SectionCard>
  );
}
