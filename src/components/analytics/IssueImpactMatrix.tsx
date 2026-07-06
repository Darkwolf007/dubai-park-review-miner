import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeIssueImpact, sortIssueImpact, type IssueSortMode } from '../../lib/analytics/issueMatrix';
import { SectionCard } from '../ui/SectionCard';
import { Pill } from '../ui/Pill';

const SORT_MODES: { id: IssueSortMode; label: string }[] = [
  { id: 'priority', label: 'Priority' },
  { id: 'frequency', label: 'Frequency' },
  { id: 'rating', label: 'Rating' },
  { id: 'sentiment', label: 'Sentiment' }
];

export function IssueImpactMatrix({ reviews }: { reviews: NLPAnalyzedReview[] }) {
  const [sortMode, setSortMode] = useState<IssueSortMode>('priority');

  const rows = useMemo(() => {
    const impact = computeIssueImpact(reviews);
    return sortIssueImpact(impact, sortMode);
  }, [reviews, sortMode]);

  return (
    <SectionCard
      icon={AlertTriangle}
      title="Issue Impact Matrix"
      action={
        <div className="flex gap-1 bg-slate-100 rounded p-0.5">
          {SORT_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setSortMode(m.id)}
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${
                sortMode === m.id ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
              <th className="py-1.5 pr-3 font-bold">Issue</th>
              <th className="py-1.5 px-3 font-bold text-right">Mentions</th>
              <th className="py-1.5 px-3 font-bold text-right">Avg Rating</th>
              <th className="py-1.5 px-3 font-bold text-right">Negative Sentiment</th>
              <th className="py-1.5 pl-3 font-bold text-right">Priority</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.category} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-semibold text-slate-700 capitalize">{row.category}</td>
                <td className="py-2 px-3 text-right text-slate-600 font-mono">{row.mentions}</td>
                <td className="py-2 px-3 text-right text-slate-600 font-mono">{row.avgRating.toFixed(1)}</td>
                <td className="py-2 px-3 text-right text-slate-600 font-mono">{Math.round(row.negativeSentimentShare * 100)}%</td>
                <td className="py-2 pl-3 text-right">
                  <Pill variant="priority" value={row.priority} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400 font-semibold">No categorized reviews yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
