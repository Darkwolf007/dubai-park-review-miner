import { useMemo } from 'react';
import { GitCompare } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeRatingDrivers } from '../../lib/analytics/ratingDrivers';
import { SectionCard } from '../ui/SectionCard';

export function RatingDriverAnalysis({ reviews }: { reviews: NLPAnalyzedReview[] }) {
  const drivers = useMemo(() => computeRatingDrivers(reviews), [reviews]);
  const data = useMemo(() => drivers.map(d => ({
    category: d.category,
    differentialPct: Math.round(d.differential * 1000) / 10
  })), [drivers]);

  return (
    <SectionCard icon={GitCompare} title="Rating Driver Analysis">
      <p className="text-[9px] text-slate-500 mb-2">
        Positive (green, right) = topic mentioned more often in 5-star reviews. Negative (red, left) = mentioned more often in 1-star reviews.
      </p>
      {data.length === 0 ? (
        <p className="text-slate-400 text-xs font-semibold text-center py-10">Not enough 5-star/1-star reviews yet.</p>
      ) : (
        <div style={{ height: Math.max(300, data.length * 28) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} unit="%" />
              <YAxis type="category" dataKey="category" width={130} tick={{ fontSize: 9, fill: '#334155' }} />
              <ReferenceLine x={0} stroke="#94a3b8" />
              <RechartsTooltip
                contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}
                formatter={(value: number) => [`${value}%`, 'Differential']}
              />
              <Bar dataKey="differentialPct" radius={[2, 2, 2, 2]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.differentialPct >= 0 ? '#10b981' : '#f43f5e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
