import { useMemo, useState } from 'react';
import { Sun } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeSeasonalBreakdown, SEASONAL_DIMENSIONS, type SeasonalDimension } from '../../lib/analytics/seasonal';
import { SectionCard } from '../ui/SectionCard';

const METRIC_CHARTS: { key: 'reviewCount' | 'avgRating' | 'sentimentScore' | 'heatComplaintsPct' | 'crowdingPct' | 'eventMentionsPct'; label: string; color: string; unit?: string }[] = [
  { key: 'reviewCount', label: 'Review Volume (Usage)', color: '#6366f1' },
  { key: 'heatComplaintsPct', label: 'Heat / Shade Complaints', color: '#f97316', unit: '%' },
  { key: 'crowdingPct', label: 'Crowding Complaints', color: '#a855f7', unit: '%' },
  { key: 'eventMentionsPct', label: 'Event Mentions', color: '#10b981', unit: '%' }
];

export function SeasonalAnalytics({ reviews }: { reviews: NLPAnalyzedReview[] }) {
  const [dimension, setDimension] = useState<SeasonalDimension>('summerWinter');

  const data = useMemo(() => computeSeasonalBreakdown(reviews, dimension), [reviews, dimension]);

  return (
    <SectionCard
      icon={Sun}
      title="Seasonal Analytics"
      action={
        <div className="flex gap-1 bg-slate-100 rounded p-0.5">
          {SEASONAL_DIMENSIONS.map(d => (
            <button
              key={d.id}
              onClick={() => setDimension(d.id)}
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${
                dimension === d.id ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      }
    >
      {dimension === 'postingTime' && (
        <p className="text-[9px] text-amber-600 font-semibold mb-2">
          Reflects when reviews were posted, not necessarily when the visit happened -- reviewers often post well after visiting.
        </p>
      )}
      {data.length === 0 ? (
        <p className="text-slate-400 text-xs font-semibold text-center py-10">No reviews with a usable date yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {METRIC_CHARTS.map(metric => (
            <div key={metric.key} className="border border-slate-200 rounded p-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{metric.label}</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={28} unit={metric.unit} />
                    <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                    <Bar dataKey={metric.key} fill={metric.color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
